from pathlib import Path


PROVIDER_HEADINGS = (
    "### OpenAI (currently selected production provider)",
    "### NVIDIA NIM (optional alternative provider)",
    "### Gemini Interactions API (optional alternative provider)",
    "### Anthropic Claude Messages API (optional alternative provider)",
)


def _section(document: str, heading: str) -> str:
    lines = document.splitlines()
    try:
        start = lines.index(heading)
    except ValueError as exc:
        raise AssertionError(f"Missing provider section: {heading}") from exc
    end = next(
        (index for index in range(start + 1, len(lines)) if lines[index].startswith("### ")),
        len(lines),
    )
    return "\n".join(lines[start:end])


def test_every_provider_task_recipe_requires_explicit_paid_inference_authorization():
    repository_root = Path(__file__).resolve().parents[1]
    document = (repository_root / "docs" / "PRODUCTION_READINESS.md").read_text(
        encoding="utf-8"
    )

    for heading in PROVIDER_HEADINGS:
        provider_section = _section(document, heading)
        assert "`GLORIFIER_ENABLE_INFERENCE=true`" in provider_section, heading
        assert "`GLORIFIER_PAID_INFERENCE_AUTHORIZED=true`" in provider_section, heading
        assert "owner" in provider_section.casefold() or "authoriz" in provider_section.casefold(), heading
