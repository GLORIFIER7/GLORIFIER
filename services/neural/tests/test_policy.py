from app.policy import evaluate_task


def test_sensitive_actions_are_denied_by_default():
    for action in (
        "financial",
        "wallet_signing",
        "minting",
        "destructive",
        "production_write",
    ):
        decision = evaluate_task(require_approval=False, action_class=action)
        assert not decision.allowed
        assert decision.requires_human_approval


def test_unknown_actions_are_denied():
    assert not evaluate_task(require_approval=False, action_class="unknown").allowed


def test_approval_is_preserved():
    decision = evaluate_task(require_approval=True)
    assert decision.allowed and decision.requires_human_approval
