from pathlib import Path


PROVIDER_HEADINGS = (
    "### OpenAI (optional provider; current production selection NOT VERIFIED)",
    "### NVIDIA NIM (optional alternative provider)",
    "### Gemini Interactions API (optional alternative provider)",
    "### Anthropic Claude Messages API (optional alternative provider)",
)


def _section(document: str, heading: str) -> str:
    lines = document.splitlines()
    start = next(
        (index for index, line in enumerate(lines) if line.strip() == heading),
        None,
    )
    if start is None:
        raise AssertionError(f"Missing provider section: {heading}")

    end = next(
        (
            index
            for index in range(start + 1, len(lines))
            if lines[index].lstrip().startswith("### ")
            and not lines[index].lstrip().startswith("#### ")
        ),
        len(lines),
    )
    return "\n".join(lines[start:end])


def test_every_provider_task_recipe_requires_explicit_paid_inference_authorization():
    service_root = Path(__file__).resolve().parents[1]
    document = (service_root / "docs" / "PRODUCTION_READINESS.md").read_text(
        encoding="utf-8"
    )

    for heading in PROVIDER_HEADINGS:
        provider_section = _section(document, heading)
        assert "`GLORIFIER_ENABLE_INFERENCE=true`" in provider_section, heading
        assert "`GLORIFIER_PAID_INFERENCE_AUTHORIZED=true`" in provider_section, heading
        authorization_prose = provider_section.replace(
            "GLORIFIER_PAID_INFERENCE_AUTHORIZED", ""
        ).casefold()
        assert "owner" in authorization_prose or "authoriz" in authorization_prose, heading


def test_historical_production_readbacks_are_not_described_as_current_state():
    service_root = Path(__file__).resolve().parents[1]
    document = (service_root / "docs" / "PRODUCTION_READINESS.md").read_text(
        encoding="utf-8"
    )

    assert "production inference flag is currently configured `true`" not in document
    assert "Current production observation — 2026-11-05" not in document
    assert "latest production smoke on 2026-11-05 followed branch (a)" not in document


def test_dynamo_runbook_attributes_implementation_and_regression_tests_to_their_actual_commits():
    service_root = Path(__file__).resolve().parents[1]
    document = (service_root / "docs" / "NVIDIA-DYNAMO.md").read_text(
        encoding="utf-8"
    )
    evidence_section = document.split(
        "## Upstream implementation evidence — 2026-11-11", 1
    )[1].split("## Configuration contract", 1)[0]

    assert "commit [70b6354]" in evidence_section
    assert "test commit [4c0f0ef]" in evidence_section
    assert "expanded in [54f555d]" in evidence_section
    implementation_evidence, test_evidence = evidence_section.split(
        "Regression tests were added", 1
    )
    assert "[70b6354]" in implementation_evidence
    assert "[4c0f0ef]" in test_evidence
    assert "[54f555d]" in test_evidence
    assert "[70b6354]" not in test_evidence


def test_openai_provider_docs_distinguish_source_default_from_current_deployment():
    service_root = Path(__file__).resolve().parents[1]
    text = (service_root / "docs" / "PRODUCTION_READINESS.md").read_text(encoding="utf-8")
    openai_section = _section(
        text,
        "### OpenAI (optional provider; current production selection NOT VERIFIED)",
    )
    lower = openai_section.casefold()
    # Source-code default must be documented.
    assert "source defaults" in lower or "source-code default" in lower
    # Current selection must remain NOT VERIFIED.
    assert "not verified" in lower
    # Reject a positive current-deployment claim without matching its negated explanation.
    assert "openai is currently deployed" not in lower
    assert "current deployed provider selection is **not verified**" in lower


def test_readme_historical_cloudflare_evidence_is_coherent_and_not_current():
    service_root = Path(__file__).resolve().parents[1]
    readme = (service_root / "README.md").read_text(encoding="utf-8")
    normalized_readme = " ".join(readme.split())

    assert (
        "An earlier Cloudflare deployment inventory at `2026-11-05T03:58:11Z` "
        "observed version `733211d1-6931-4fdb-a4b9-5c7482bcf9b8`;"
    ) in normalized_readme
    assert normalized_readme.count("Deployment success is not itself a readiness result.") == 1
    assert (
        "The task endpoint reads `GLORIFIER_API_TOKEN` from the Cloudflare "
        "request-scoped `env` binding."
    ) in normalized_readme
    assert (
        "The documented access-control model uses Cloudflare Access and "
        "bearer-token validation; current production enforcement is **NOT VERIFIED**."
    ) in normalized_readme
    assert "Historical deployment inventory — observed 2026-11-05 (UTC+07:00)" in normalized_readme
    assert "Current deployed state — observed 2026-11-05" not in normalized_readme
    assert "The production inference flag was recorded as `true` in that historical configuration." in readme
