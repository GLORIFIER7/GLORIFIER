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
