from dataclasses import dataclass

BLOCKED_ACTIONS = frozenset({"financial", "wallet_signing", "minting", "destructive", "production_write"})

@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    requires_human_approval: bool
    reason: str

def evaluate_task(*, require_approval: bool, action_class: str = "read_only") -> PolicyDecision:
    if action_class in BLOCKED_ACTIONS:
        return PolicyDecision(False, True, f"{action_class} is blocked by default")
    if action_class != "read_only":
        return PolicyDecision(False, True, f"Unknown action class {action_class!r} is denied by default")
    if require_approval:
        return PolicyDecision(True, True, "Human approval required before execution")
    return PolicyDecision(True, False, "Read-only action permitted; provider execution still requires configuration")
