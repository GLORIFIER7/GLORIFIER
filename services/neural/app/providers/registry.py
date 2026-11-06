from __future__ import annotations

from app.providers.base import ProviderAdapter


class ProviderRegistry:
    """Explicit registry for provider adapters; never discovers or enables providers implicitly."""

    def __init__(self) -> None:
        self._adapters: dict[str, ProviderAdapter] = {}

    def register(self, adapter: ProviderAdapter) -> None:
        name = getattr(adapter, "name", None)
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Provider adapter name must be a non-empty string")
        key = name.strip().casefold()
        if key in self._adapters:
            raise ValueError(f"Provider adapter already registered: {key}")
        self._adapters[key] = adapter

    def get(self, name: str) -> ProviderAdapter | None:
        """Return a registered adapter only when it explicitly reports configured."""
        adapter = self._adapters.get(name.strip().casefold())
        if adapter is None or not adapter.is_configured():
            return None
        return adapter

    def configured_names(self) -> tuple[str, ...]:
        """List configured providers without exposing credentials or configuration values."""
        return tuple(
            name for name, adapter in sorted(self._adapters.items())
            if adapter.is_configured()
        )
