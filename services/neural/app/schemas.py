from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Status = Literal[
    "FULLY VERIFIED",
    "VERIFIED",
    "PARTIALLY VERIFIED",
    "NOT VERIFIED",
    "DEGRADED",
    "NOT OBSERVABLE",
]


class HealthResponse(BaseModel):
    status: Status
    service: str
    checks: dict[str, Status | str]


class TaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    task: str = Field(min_length=1, max_length=20_000)
    purpose: str = Field(default="general", min_length=1, max_length=100)
    require_approval: bool = True
    action_class: str = Field(default="read_only", min_length=1, max_length=64)

    @field_validator("task", "purpose", "action_class")
    @classmethod
    def reject_blank_values(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value


class TaskResponse(BaseModel):
    status: Status
    provider: str | None = None
    result: str | None = None
    evidence: list[str] = Field(default_factory=list)
    message: str
