from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class InferenceResult:
    provider: str
    text: str
    request_id: str | None = None
    evidence: list[str] = field(default_factory=list)


class ProviderAdapter(ABC):
    name: str

    @abstractmethod
    def is_configured(self) -> bool:
        """Return true only when required configuration is present."""

    @abstractmethod
    def infer(self, prompt: str, *, timeout_seconds: float = 30.0) -> InferenceResult:
        """Run bounded inference and return traceable output."""
