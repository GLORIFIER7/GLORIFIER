"""Regression tests for Octopus deployment workflow timeout budgeting."""

from pathlib import Path
import re


WORKFLOW = (
    Path(__file__).resolve().parents[1]
    / ".github"
    / "workflows"
    / "octopus-deploy.yml"
).read_text(encoding="utf-8")

CI_WORKFLOW = (
    Path(__file__).resolve().parents[1]
    / ".github"
    / "workflows"
    / "ci.yml"
).read_text(encoding="utf-8")


def test_octopus_job_timeout_leaves_headroom_after_await_action_timeout():
    deploy = re.search(
        r"(?ms)^  deploy:\n(.*?)(?=^  [a-z0-9_-]+:\n|\Z)",
        WORKFLOW,
    )
    assert deploy, "The Octopus deploy job must exist"

    job = deploy.group(1)
    job_timeout = re.search(r"(?m)^    timeout-minutes: (\d+)$", job)
    assert job_timeout, "The Octopus deploy job must have an explicit timeout"

    await_step = re.search(
        r"(?ms)^      - name: Wait for the Octopus deployment to finish\n"
        r"(.*?)(?=^      - name:|\Z)",
        job,
    )
    assert await_step, "The Octopus await-task step must exist"

    await_timeout = re.search(
        r"(?m)^\s+timeout_after: ['\"]?(\d+)['\"]?$",
        await_step.group(1),
    )
    assert await_timeout, "The Octopus await-task timeout must be explicit"

    job_seconds = int(job_timeout.group(1)) * 60
    await_seconds = int(await_timeout.group(1))
    required_headroom_seconds = 30 * 60

    assert job_seconds >= await_seconds + required_headroom_seconds, (
        "The GitHub job timeout must leave at least 30 minutes beyond the "
        "Octopus task wait timeout so setup and teardown cannot cut off the wait."
    )


def test_octopus_concurrency_is_job_scoped_and_normalized():
    assert not re.search(r"(?m)^concurrency:$", WORKFLOW), (
        "Skipped workflow_run events must not acquire the deployment concurrency group"
    )
    deploy = re.search(r"(?ms)^  deploy:\n(.*)\Z", WORKFLOW)
    assert deploy, "Octopus deploy job must exist"
    expected_group = (
        "    concurrency:\n"
        "      group: octopus-deploy-${{ github.workflow }}-"
        "${{ github.event.workflow_run.head_branch || github.ref_name }}"
    )
    assert expected_group in deploy.group(0), (
        "Manual and automatic main deployments must share a job-level concurrency group"
    )


def test_octopus_preflight_rejects_stale_source_commit_before_oidc():
    preflight = re.search(
        r"(?ms)^      - name: Validate Octopus deployment configuration\n"
        r"(.*?)(?=^      - name: Authenticate to Octopus Deploy using GitHub OIDC|\Z)",
        WORKFLOW,
    )
    assert preflight, "Octopus deployment configuration preflight must exist"
    source = preflight.group(1)

    assert "GH_TOKEN: ${{ github.token }}" in source
    assert 'gh api "repos/${GITHUB_REPOSITORY}/commits/main" --jq .sha' in source
    assert 'if [[ "$current_main_sha" != "$SOURCE_COMMIT" ]]; then' in source




def test_neural_octopus_only_deploys_a_successful_main_push():
    assert "github.event.workflow_run.event == 'push'" in WORKFLOW
    assert "github.event.workflow_run.head_branch == 'main'" in WORKFLOW
    assert "github.event.workflow_run.head_sha == github.sha" not in WORKFLOW
    assert 'if [[ "$current_main_sha" != "$SOURCE_COMMIT" ]]; then' in WORKFLOW


def test_both_octopus_release_paths_pin_package_version_to_ci_tested_source_commit():
    assert WORKFLOW.count("package_version: ${{ steps.verify-image.outputs.package_version }}") == 2


def test_neural_main_ci_publishes_the_exact_image_that_passed_the_test_matrix():
    publish_start = CI_WORKFLOW.index("  publish-container:")
    job = CI_WORKFLOW[publish_start:]

    assert "if: github.event_name == 'push' && github.ref == 'refs/heads/main'" in job
    assert "needs: [test]" in job
    assert "packages: write" in job
    assert "Download the exact image exported by the passing CI matrix" in job
    assert "docker load --input /tmp/glorifier-neural-image/glorifier-neural-ci.tar" in job
    assert "ghcr.io/glorifier7/glorifier-neural:0.0.0-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}" in job
    assert "docker build" not in job, "The publisher must publish the tested artifact, not rebuild it"

    assert "Upload the CI-tested container image" in CI_WORKFLOW
    assert "matrix.python-version == '3.12'" in CI_WORKFLOW


def test_neural_octopus_requires_the_ci_image_publisher_to_succeed():
    assert "actions: read" in WORKFLOW
    assert 'job.get("name") == "Publish the CI-tested NEURAL image to GHCR"' in WORKFLOW
    assert 'step.get("name") == "Publish the CI-tested run-attempt image"' in WORKFLOW

def test_manual_dispatch_requires_a_successful_image_publish_for_the_current_commit():
    assert 'elif event_name == "workflow_dispatch":' in WORKFLOW
    assert "actions/workflows/ci.yml/runs?" in WORKFLOW
    assert 'upstream.get("head_sha") != source_commit' in WORKFLOW
    assert "No successful main-branch CI push exists for this exact source commit" in WORKFLOW
    assert 'event_name == "workflow_run"' in WORKFLOW



def test_octopus_release_uses_the_exact_verified_ci_run_attempt_image():
    assert 'run_attempt = upstream.get("run_attempt")' in WORKFLOW
    assert "isinstance(run_attempt, bool)" in WORKFLOW
    assert "isinstance(run_attempt, int)" in WORKFLOW
    assert 'package_version = f"0.0.0-{source_commit}-{run_id}-{run_attempt}"' in WORKFLOW
    assert 'output.write("package_version=" + package_version + chr(10))' in WORKFLOW
    assert WORKFLOW.count("steps.verify-image.outputs.package_version") == 2


def test_octopus_preflight_rejects_multiple_deployment_environments():
    preflight_start = WORKFLOW.index("      - name: Validate Octopus deployment configuration")
    verify_start = WORKFLOW.index("      - name: Verify the CI-tested NEURAL image publication succeeded for this commit")
    assert preflight_start >= 0 and verify_start > preflight_start
    preflight = WORKFLOW[preflight_start:verify_start]

    assert "== *','*" in preflight
    assert "exactly one environment name (no commas, CR, or LF)" in preflight


def test_octopus_workflow_contains_exactly_one_release_and_deployment_sequence():
    for step in (
        "      - name: Validate Octopus deployment configuration",
        "      - name: Authenticate to Octopus Deploy using GitHub OIDC",
        "      - name: Wait for the Octopus deployment to finish",
    ):
        assert WORKFLOW.count(step) == 1


def test_octopus_service_account_secret_is_scoped_to_the_oidc_login_step():
    deploy = WORKFLOW[WORKFLOW.index("  deploy:"):]
    job_env = re.search(r"(?ms)^    env:\n(.*?)(?=^    steps:)", deploy)
    assert job_env, "The deploy job environment must be explicit"
    assert "OCTOPUS_SERVICE_ACCOUNT_ID" not in job_env.group(1)

    preflight = re.search(
        r"(?ms)^      - name: Validate Octopus deployment configuration\n"
        r"(.*?)(?=^      - name: Verify the CI-tested NEURAL image publication succeeded)",
        deploy,
    )
    assert preflight, "The deployment preflight must exist"
    assert "OCTOPUS_SERVICE_ACCOUNT_ID" not in preflight.group(1)

    login = re.search(
        r"(?ms)^      - name: Authenticate to Octopus Deploy using GitHub OIDC\n"
        r"(.*?)(?=^      - name:)",
        deploy,
    )
    assert login, "The Octopus OIDC login step must exist"
    assert "service_account_id: " + "${{ secrets.OCTOPUS_SERVICE_ACCOUNT_ID }}" in login.group(1)


def test_octopus_service_account_secret_has_a_step_scoped_presence_check():
    lines = WORKFLOW.splitlines()
    validation_start = lines.index(
        "      - name: Validate Octopus service account secret is configured"
    )
    validation_end = next(
        (index for index in range(validation_start + 1, len(lines)) if lines[index].startswith("      - name:")),
        len(lines),
    )
    step = "\n".join(lines[validation_start:validation_end])
    secret_reference = "$" + "{{ secrets.OCTOPUS_SERVICE_ACCOUNT_ID }}"
    assert "OCTOPUS_SERVICE_ACCOUNT_ID: " + secret_reference in step
    assert 'test -n "${OCTOPUS_SERVICE_ACCOUNT_ID:-}"' in step
    assert 'echo "::error::Missing environment secret OCTOPUS_SERVICE_ACCOUNT_ID."' in step

def test_octopus_jobs_api_fetches_every_page_and_validates_total_count():
    assert "total_count" in WORKFLOW
    assert "page += 1" in WORKFLOW
    assert "per_page" in WORKFLOW and "page" in WORKFLOW
    assert "len(jobs) >= total_count" in WORKFLOW


def test_octopus_workflow_embedded_python_is_syntactically_valid():
    import ast
    import textwrap

    match = re.search(r"(?ms)^[ \t]*python3 - <<'PY'\n(.*?)^[ \t]*PY$", WORKFLOW)
    assert match, "The workflow must contain the CI verification Python heredoc"
    ast.parse(textwrap.dedent(match.group(1)))

