"""Security regression tests for the autonomous NEURAL maintenance workflow."""

from pathlib import Path
import os
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "ai-maintenance.yml"
CI_WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
TRUSTED_REVIEW_WORKFLOW = ROOT / ".github" / "workflows" / "trusted-ai-review-policy.yml"
TRUSTED_POLICY_WORKFLOW = ROOT / ".github" / "workflows" / "trusted-ai-review-policy.yml"
VALIDATOR = ROOT / "scripts" / "validate_ai_maintenance_scope.py"


def _git(repository: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args],
        cwd=repository,
        check=True,
        capture_output=True,
        text=True,
    )


def _repository(tmp_path: Path) -> Path:
    repository = tmp_path / "repository"
    repository.mkdir()
    (repository / "app").mkdir()
    (repository / "tests").mkdir()
    (repository / ".github" / "workflows").mkdir(parents=True)
    (repository / "app" / "service.py").write_text(
        "value = 1\n", encoding="utf-8"
    )
    (repository / "tests" / "test_service.py").write_text(
        "def test_ok():\n    assert True\n", encoding="utf-8"
    )
    (repository / "README.md").write_text("fixture\n", encoding="utf-8")
    _git(repository, "init", "-q")
    _git(repository, "config", "user.name", "Test")
    _git(repository, "config", "user.email", "test@example.invalid")
    _git(repository, "add", ".")
    _git(repository, "commit", "-m", "initial")
    return repository


def _validate(
    repository: Path, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(VALIDATOR), "--repo", str(repository)],
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )


def test_scope_validator_accepts_only_app_and_tests_changes(tmp_path: Path):
    repository = _repository(tmp_path)
    (repository / "app" / "service.py").write_text(
        "value = 2\n", encoding="utf-8"
    )
    (repository / "tests" / "test_new.py").write_text(
        "def test_new():\n    assert True\n", encoding="utf-8"
    )

    result = _validate(repository)

    assert result.returncode == 0, result.stderr


def test_scope_validator_rejects_untracked_workflow_files(tmp_path: Path):
    repository = _repository(tmp_path)
    unexpected = repository / ".github" / "workflows" / "unexpected.yml"
    unexpected.write_text("name: unexpected\n", encoding="utf-8")

    result = _validate(repository)

    assert result.returncode != 0
    assert ".github/workflows/unexpected.yml" in result.stderr


def test_scope_validator_rejects_rename_from_app_into_workflow_directory(
    tmp_path: Path,
):
    repository = _repository(tmp_path)
    _git(repository, "mv", "app/service.py", ".github/workflows/evil.yml")

    result = _validate(repository)

    assert result.returncode != 0
    assert ".github/workflows/evil.yml" in result.stderr


def test_scope_validator_rejects_symlinks_even_when_inside_app(tmp_path: Path):
    repository = _repository(tmp_path)
    (repository / "app" / "escape").symlink_to("../../README.md")

    result = _validate(repository)

    assert result.returncode != 0
    assert "symlink" in result.stderr.casefold()


def test_codex_runs_in_an_isolated_app_and_tests_workspace():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "Prepare isolated agent workspace" in workflow
    assert "working-directory: ${{ steps.agent_workspace.outputs.path }}" in workflow
    assert "Copy validated app and tests changes back" in workflow
    assert "find app tests -type l" in workflow


def test_workflow_validates_scope_and_uses_credential_helper():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "validate_ai_maintenance_scope.py" in workflow
    assert "gh auth setup-git" in workflow
    assert "x-access-token:$GH_TOKEN@" not in workflow
    assert "push --set-upstream origin" in workflow


def test_publish_job_only_runs_when_a_validated_patch_artifact_exists():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    codex_section = workflow[workflow.index("  codex:"):workflow.index("  publish:")]
    publish_section = workflow[workflow.index("  publish:"):]

    assert "patch_ready:" in codex_section
    assert "steps.upload_patch.outputs.artifact-id" in codex_section
    assert "needs: codex" in publish_section
    assert "needs.codex.outputs.patch_ready == 'true'" in publish_section
    upload_start = codex_section.index("- name: Upload validated patch for publish job")
    upload_end = codex_section.find("\n      - name:", upload_start + 1)
    upload_step = codex_section[upload_start:] if upload_end < 0 else codex_section[upload_start:upload_end]
    assert "steps.stage.outputs.changed == 'true' && steps.validation.outcome == 'success'" in upload_step


def test_publish_job_holds_all_publication_until_after_0831_laos_time():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    publish_section = workflow[workflow.index("  publish:"):]
    gate = publish_section.index("- name: Enforce PR publication window (Laos)")
    branch = publish_section.index("- name: Create isolated maintenance branch and push")
    pull_request = publish_section.index("- name: Open draft pull request")

    assert gate < branch < pull_request
    branch_step = publish_section[branch:pull_request]
    assert "steps.time_window.outputs.allowed == 'true'" in branch_step
    assert "gh pr create --draft --base main" in publish_section
    assert 'gh workflow run ci.yml --ref main' in publish_section
    assert '--field pull_request_number="$pr_number"' in publish_section
    assert "--field pull_request_head_sha" in publish_section
    assert "gh pr merge" not in publish_section
    assert "--auto" not in publish_section


def test_time_window_uses_decimal_hhmm_and_blocks_before_0831():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert workflow.count('current_hhmm_decimal=$((10#$current_hhmm))') == 1
    assert workflow.count("current_hhmm_decimal < 831") == 1
    assert workflow.count('[[ ! "$current_hhmm" =~ ^[0-9]{4}$ ]]') == 1


def test_codex_engineering_cycle_is_not_gated_by_the_publication_window():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    codex_section = workflow[workflow.index("  codex:"):workflow.index("  publish:")]
    for step_name in [
        "Verify trusted dependency lock before agent execution",
        "Prepare isolated agent workspace",
        "Run Codex maintenance agent",
        "Copy validated app and tests changes back",
        "Validate generated patch with locked project checks",
    ]:
        start = codex_section.index(f"- name: {step_name}")
        end = codex_section.find("\n      - name:", start + 1)
        step = codex_section[start:] if end < 0 else codex_section[start:end]
        assert "steps.time_window.outputs.allowed" not in step

def test_workflow_uses_shallow_checkout_and_env_safe_run_id():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "fetch-depth: 1" in workflow
    assert "RUN_ID: ${{ github.run_id }}" in workflow
    assert 'BRANCH="ai/maintenance/$RUN_ID"' in workflow
    assert 'BRANCH="ai/maintenance/${{ github.run_id }}"' not in workflow


def test_copy_back_does_not_preserve_hard_links():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert 'rsync -rlptD --delete "$AGENT_WORKSPACE/app/"' in workflow
    assert 'rsync -rlptD --delete "$AGENT_WORKSPACE/tests/"' in workflow
    assert 'rsync -a --delete' not in workflow


def test_generated_pr_is_draft_and_never_auto_merges():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    publish_section = workflow[workflow.index("  publish:"):]

    assert "- name: Open draft pull request" in publish_section
    assert "gh pr create --draft --base main" in publish_section
    assert "gh pr create --base main" not in publish_section
    assert 'gh workflow run ci.yml --ref main' in publish_section
    assert '--field pull_request_number="$pr_number"' in publish_section
    assert "--field pull_request_head_sha" in publish_section
    assert "gh pr merge" not in publish_section
    assert "--auto" not in publish_section


def test_scope_validator_validates_both_rename_source_and_destination(
    tmp_path: Path,
):
    """--no-renames exposes both the deleted source and the added destination
    as independent changed paths.  A rename entirely outside app/ and tests/
    must be rejected on both sides."""
    repository = _repository(tmp_path)
    # README.md (root-level, outside allowed roots) → .github/workflows/evil.yml
    # git mv stages both a deletion of README.md and an addition of evil.yml;
    # with --no-renames the validator sees both paths independently.
    _git(repository, "mv", "README.md", ".github/workflows/evil.yml")

    result = _validate(repository)

    assert result.returncode != 0
    # Destination must be rejected
    assert ".github/workflows/evil.yml" in result.stderr
    # Source (README.md at repository root) must also be rejected
    assert "README.md" in result.stderr


def test_workflow_uses_hourly_schedule_and_never_auto_merges():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert 'cron: "0 * * * *"' in workflow
    assert 'cron: "41 2 * * 1"' not in workflow
    assert "gh pr merge" not in workflow
    assert "--auto" not in workflow


def test_workflow_publication_is_after_0830_in_laos_timezone():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "TZ=Asia/Vientiane" in workflow
    assert "current_hhmm_decimal=$((10#$current_hhmm))" in workflow
    assert "current_hhmm_decimal < 831" in workflow
    assert '[[ ! "$current_hhmm" =~ ^[0-9]{4}$ ]]' in workflow
    publish_job = workflow[workflow.index("  publish:"):]
    assert "needs.codex.outputs.patch_ready == 'true'" in publish_job


def test_publish_job_receives_only_a_validated_patch_artifact():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    codex_section = workflow[workflow.index("  codex:"):workflow.index("  publish:")]
    publish_section = workflow[workflow.index("  publish:"):]

    assert "steps.validation.outcome == 'success'" in workflow
    assert "id: upload_patch" in workflow
    assert "artifact-id" in workflow
    assert "outputs.patch_ready" in workflow
    assert 'git diff --cached --binary --no-ext-diff > "$patch_file"' in workflow
    assert 'git apply --index --binary "$PATCH_FILE"' in workflow
    assert "ai-maintenance-patch-${{ github.run_id }}" in workflow
    assert 'git diff --cached --binary --no-ext-diff > "$patch_file"' in codex_section
    assert "path: ${{ runner.temp }}/ai-maintenance.patch" in codex_section
    assert "path: ${{ runner.temp }}/ai-maintenance-artifact" in publish_section
    assert 'git apply --index --binary "$PATCH_FILE"' in publish_section
    assert "            app/\n            tests/" not in codex_section


def test_validated_git_patch_artifact_preserves_deleted_tracked_files(tmp_path: Path):
    source_root = tmp_path / "source"
    publish_root = tmp_path / "publish"
    source_root.mkdir()
    publish_root.mkdir()
    source = _repository(source_root)
    publish = _repository(publish_root)

    (source / "app" / "service.py").unlink()
    _git(source, "add", "-u", "--", "app/service.py")
    patch = subprocess.run(
        ["git", "diff", "--cached", "--binary"],
        cwd=source,
        check=True,
        capture_output=True,
    ).stdout
    assert patch

    subprocess.run(
        ["git", "apply", "--index", "--binary", "-"],
        cwd=publish,
        input=patch,
        check=True,
        capture_output=True,
    )

    assert not (publish / "app" / "service.py").exists()
    status = subprocess.run(
        ["git", "diff", "--cached", "--name-status"],
        cwd=publish,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    assert status.startswith("D") and "app/service.py" in status


def test_workflow_cost_control_uses_single_variable():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "AI_MAINTENANCE_AUTORUN" in workflow
    assert "authorize_pull_request" not in workflow


def test_workflow_codex_job_has_read_only_permissions():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    codex_start = workflow.index("  codex:")
    publish_start = workflow.index("  publish:")
    codex_section = workflow[codex_start:publish_start]

    assert "contents: read" in codex_section
    assert "contents: write" not in codex_section
    assert "pull-requests: write" not in codex_section
    assert "actions: write" not in codex_section


def test_workflow_publish_job_has_minimal_write_permissions():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    publish_start = workflow.index("  publish:")
    publish_section = workflow[publish_start:]

    assert "contents: write" in publish_section
    assert "pull-requests: write" in publish_section
    assert "actions: write" in publish_section


def test_ci_workflow_dispatch_tests_exact_head_and_trusted_review_is_event_driven():
    workflow = CI_WORKFLOW.read_text(encoding="utf-8")
    trusted_review = TRUSTED_REVIEW_WORKFLOW.read_text(encoding="utf-8")

    assert "pull_request_head_sha:" in workflow
    assert "inputs.pull_request_head_sha" in workflow
    assert "github.event_name == 'workflow_dispatch'" in workflow
    assert "ref: ${{ github.event_name == 'workflow_dispatch' && inputs.pull_request_head_sha != '' && inputs.pull_request_head_sha || github.sha }}" in workflow

    # Draft PR creation emits pull_request_target(opened); review events re-run
    # the trusted policy. No untrusted CI workflow should execute reviewer policy.
    assert "pull_request_target:" in trusted_review
    assert "pull_request_review:" in trusted_review
    assert "ai-review-policy:" in trusted_review
    assert "github.event.pull_request.base.sha" in trusted_review
    assert "Enforce both AI reviewer findings on the exact current PR head" in trusted_review
def test_ci_dispatch_uses_the_exact_current_pr_head_and_trusted_policy_runs_on_pr_events():
    ci_workflow = CI_WORKFLOW.read_text(encoding="utf-8")
    policy_workflow = TRUSTED_POLICY_WORKFLOW.read_text(encoding="utf-8")
    maintenance_workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "pull_request_number:" in ci_workflow
    assert "pull_request_head_sha:" in ci_workflow
    assert "inputs.pull_request_head_sha" in ci_workflow
    assert "inputs.pull_request_number" in ci_workflow
    assert "workflow_dispatch" in ci_workflow
    assert "pull_request_target:" in policy_workflow
    assert "pull_request_review:" in policy_workflow
    assert "github.event.pull_request.number" in policy_workflow
    assert "steps.current-pr.outputs.head_sha" in policy_workflow

    dispatch_start = maintenance_workflow.index(
        "- name: Dispatch trusted CI and AI review for the exact PR head"
    )
    dispatch_end = maintenance_workflow.find("\n      - name:", dispatch_start + 1)
    dispatch_step = (
        maintenance_workflow[dispatch_start:]
        if dispatch_end < 0
        else maintenance_workflow[dispatch_start:dispatch_end]
    )
    assert 'pr_head_sha="$(gh pr view "$PR_BRANCH" --json headRefOid --jq \'.headRefOid\')"' in dispatch_step
    assert '[[ "$pr_head_sha" =~ ^[0-9a-fA-F]{40}$ ]]' in dispatch_step
    assert 'gh workflow run ci.yml --ref main \\' in dispatch_step
    assert '--ref "$PR_BRANCH"' not in dispatch_step
    assert dispatch_step.count('--field pull_request_head_sha="$pr_head_sha"') == 1
    assert 'pr_number="$(gh pr view "$PR_BRANCH" --json number --jq \'.number\')"' in dispatch_step
    assert dispatch_step.count('--field pull_request_number="$pr_number"') == 1


def test_publish_job_dispatches_trusted_ci_after_creating_a_draft_pr():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    publish_section = workflow[workflow.index("  publish:"):]

    assert "actions: write" in publish_section
    assert "gh pr create --draft --base main" in publish_section
    assert 'gh workflow run ci.yml --ref main' in publish_section
    assert "pull_request_head_sha" in publish_section
    assert "GH_REPO: ${{ github.repository }}" in publish_section
    assert "gh pr merge" not in publish_section
    assert "--auto" not in publish_section


def test_scope_validator_rejects_rename_from_outside_into_allowed_root(tmp_path: Path):
    repository = _repository(tmp_path)
    _git(repository, "mv", "README.md", "app/evil.py")

    result = _validate(repository)

    assert result.returncode != 0
    assert "README.md" in result.stderr


def test_scope_validator_rejects_drive_qualified_paths_inside_allowed_roots(tmp_path: Path):
    repository = _repository(tmp_path)
    drive_path = repository / "app" / "C:" / "evil.py"
    drive_path.parent.mkdir()
    drive_path.write_text("outside = True\n", encoding="utf-8")

    result = _validate(repository)

    assert result.returncode != 0
    assert "app/C:/evil.py" in result.stderr


def test_scope_validator_rejects_out_of_scope_patch_in_an_alternate_index(tmp_path: Path):
    source_root = tmp_path / "source"
    publish_root = tmp_path / "publish"
    source_root.mkdir()
    publish_root.mkdir()
    source = _repository(source_root)
    publish = _repository(publish_root)

    (source / "README.md").write_text("changed outside allowed roots\n", encoding="utf-8")
    _git(source, "add", "README.md")
    patch = subprocess.run(
        ["git", "diff", "--cached", "--binary"],
        cwd=source,
        check=True,
        capture_output=True,
    ).stdout
    assert patch

    validation_index = tmp_path / "validation-index"
    shutil.copy2(publish / ".git" / "index", validation_index)
    environment = os.environ.copy()
    environment["GIT_INDEX_FILE"] = str(validation_index)
    subprocess.run(
        ["git", "apply", "--cached", "--binary", "-"],
        cwd=publish,
        input=patch,
        check=True,
        capture_output=True,
        env=environment,
    )

    result = _validate(publish, env=environment)

    assert result.returncode != 0
    assert "README.md" in result.stderr
    assert (publish / "README.md").read_text(encoding="utf-8") == "fixture\n"

def test_scope_validator_rejects_nested_git_repository_gitlinks(tmp_path: Path):
    repository = _repository(tmp_path)
    nested = repository / "app" / "vendor"
    nested.mkdir()
    (nested / "library.py").write_text("value = 1\\n", encoding="utf-8")
    _git(nested, "init", "-q")
    _git(nested, "config", "user.name", "Nested")
    _git(nested, "config", "user.email", "nested@example.invalid")
    _git(nested, "add", ".")
    _git(nested, "commit", "-m", "nested repository")
    _git(repository, "add", "app/vendor")

    result = _validate(repository)

    assert result.returncode != 0
    assert "gitlink" in result.stderr.casefold()
    assert "app/vendor" in result.stderr


def test_scope_validator_rejects_nested_git_metadata_files(tmp_path: Path):
    repository = _repository(tmp_path)
    nested = repository / "tests" / "fixture"
    nested.mkdir()
    (nested / ".git").write_text("gitdir: ../.git/modules/fixture\\n", encoding="utf-8")

    result = _validate(repository)

    assert result.returncode != 0
    assert "nested Git metadata" in result.stderr
    assert "tests/fixture/.git" in result.stderr


def test_scope_validator_rejects_gitlinks_in_an_alternate_index(tmp_path: Path):
    publish_root = tmp_path / "publish"
    publish_root.mkdir()
    publish = _repository(publish_root)
    nested = tmp_path / "nested"
    nested.mkdir()
    _git(nested, "init", "-q")
    _git(nested, "config", "user.name", "Nested")
    _git(nested, "config", "user.email", "nested@example.invalid")
    (nested / "library.py").write_text("value = 1\\n", encoding="utf-8")
    _git(nested, "add", ".")
    _git(nested, "commit", "-m", "nested repository")
    nested_sha = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=nested,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    validation_index = tmp_path / "validation-index"
    shutil.copy2(publish / ".git" / "index", validation_index)
    environment = os.environ.copy()
    environment["GIT_INDEX_FILE"] = str(validation_index)
    subprocess.run(
        ["git", "update-index", "--add", "--cacheinfo", f"160000,{nested_sha},app/vendor"],
        cwd=publish,
        check=True,
        capture_output=True,
        text=True,
        env=environment,
    )

    result = _validate(publish, env=environment)

    assert result.returncode != 0
    assert "gitlink" in result.stderr.casefold()
    assert "app/vendor" in result.stderr

def test_workflow_top_level_permissions_are_minimal():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    permissions_start = workflow.index("permissions:")
    permissions_end = workflow.index("\nconcurrency:", permissions_start)
    top_level_permissions = workflow[permissions_start:permissions_end]

    assert "contents: read" in top_level_permissions
    assert "pull-requests:" not in top_level_permissions



def test_manual_ci_dispatch_validates_pr_number_and_exact_head_before_checkout():
    ci_workflow = CI_WORKFLOW.read_text(encoding="utf-8")
    policy_start = ci_workflow.index("  ai-review-policy:")
    policy_section = ci_workflow[policy_start:]
    validation = ci_workflow.index("Validate manual dispatch PR identity")
    checkout = ci_workflow.index("uses: actions/checkout")

    assert validation < checkout
    assert "pull_request_number:" in ci_workflow
    assert "inputs.pull_request_number" in policy_section
    assert "inputs.pull_request_head_sha" in policy_section
    assert "An exact PR head SHA is required for a dispatched policy run." in policy_section
    assert "The current PR head SHA does not match the dispatched commit." in policy_section
