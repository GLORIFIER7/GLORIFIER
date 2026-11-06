import pytest

from app.providers.base import InferenceResult, ProviderAdapter
from app.providers.registry import ProviderRegistry


class FakeProvider(ProviderAdapter):
    name = "fake"

    def __init__(self, configured: bool = True) -> None:
        self.configured = configured

    def is_configured(self) -> bool:
        return self.configured

    def infer(self, prompt: str, *, timeout_seconds: float = 30.0) -> InferenceResult:
        return InferenceResult(provider=self.name, text=prompt)


def test_registry_returns_only_explicitly_registered_configured_provider():
    registry = ProviderRegistry()
    provider = FakeProvider()
    registry.register(provider)

    assert registry.get("FAKE") is provider
    assert registry.configured_names() == ("fake",)


def test_registry_does_not_return_unconfigured_provider():
    registry = ProviderRegistry()
    registry.register(FakeProvider(configured=False))

    assert registry.get("fake") is None
    assert registry.configured_names() == ()


def test_registry_rejects_duplicate_provider_names_case_insensitively():
    registry = ProviderRegistry()
    registry.register(FakeProvider())

    duplicate = FakeProvider()
    duplicate.name = "FAKE"
    with pytest.raises(ValueError, match="already registered"):
        registry.register(duplicate)


def test_registry_rejects_blank_provider_names():
    registry = ProviderRegistry()
    provider = FakeProvider()
    provider.name = "  "

    with pytest.raises(ValueError, match="non-empty"):
        registry.register(provider)


def test_registry_does_not_discover_unknown_providers():
    registry = ProviderRegistry()

    assert registry.get("unknown") is None
    assert registry.configured_names() == ()
