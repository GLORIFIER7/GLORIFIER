from app.providers.anthropic import AnthropicMessagesAdapter
from app.providers.gemini import GeminiInteractionsAdapter
from app.runtime import build_orchestrator_from_environment


def test_runtime_registers_gemini_only_with_explicit_egress_and_credentials():
    environment = {
        "GLORIFIER_PROVIDER": "gemini",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "GLORIFIER_ENABLE_INFERENCE": "false",
        "GEMINI_API_KEY": "test-gemini-key",
        "GEMINI_MODEL": "gemini-3.8-flash",
    }

    orchestrator = build_orchestrator_from_environment(environment)

    adapter = orchestrator._providers.get("gemini")
    assert isinstance(adapter, GeminiInteractionsAdapter)
    assert orchestrator._provider_name == "gemini"
    assert orchestrator._allow_inference is False


def test_runtime_does_not_register_gemini_with_blank_api_key():
    environment = {
        "GLORIFIER_PROVIDER": "gemini",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "GEMINI_API_KEY": "",
        "GEMINI_MODEL": "gemini-3.8-flash",
    }

    orchestrator = build_orchestrator_from_environment(environment)

    assert orchestrator._providers.get("gemini") is None
    assert orchestrator._providers.configured_names() == ()


def test_runtime_does_not_register_gemini_without_egress_consent():
    environment = {
        "GLORIFIER_PROVIDER": "gemini",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "false",
        "GEMINI_API_KEY": "test-gemini-key",
        "GEMINI_MODEL": "gemini-3.8-flash",
    }

    orchestrator = build_orchestrator_from_environment(environment)

    assert orchestrator._providers.get("gemini") is None


def test_runtime_does_not_register_gemini_without_credentials():
    environment = {
        "GLORIFIER_PROVIDER": "gemini",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "GEMINI_MODEL": "gemini-3.8-flash",
    }

    orchestrator = build_orchestrator_from_environment(environment)

    assert orchestrator._providers.get("gemini") is None

def test_runtime_does_not_register_gemini_without_explicit_model():
    environment = {
        "GLORIFIER_PROVIDER": "gemini",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "GEMINI_API_KEY": "test-gemini-key",
        "GEMINI_MODEL": "",
    }

    orchestrator = build_orchestrator_from_environment(environment)

    assert orchestrator._providers.get("gemini") is None


def test_runtime_registers_anthropic_only_with_explicit_egress_and_credentials():
    environment = {
        "GLORIFIER_PROVIDER": "anthropic",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "GLORIFIER_ENABLE_INFERENCE": "false",
        "ANTHROPIC_API_KEY": "test-anthropic-key",
        "ANTHROPIC_MODEL": "claude-sonnet-5",
    }

    orchestrator = build_orchestrator_from_environment(environment)

    adapter = orchestrator._providers.get("anthropic")
    assert isinstance(adapter, AnthropicMessagesAdapter)
    assert orchestrator._provider_name == "anthropic"
    assert orchestrator._allow_inference is False


def test_runtime_does_not_register_anthropic_with_blank_api_key():
    environment = {
        "GLORIFIER_PROVIDER": "anthropic",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "ANTHROPIC_API_KEY": "",
        "ANTHROPIC_MODEL": "claude-sonnet-5",
    }

    orchestrator = build_orchestrator_from_environment(environment)

    assert orchestrator._providers.get("anthropic") is None
    assert orchestrator._providers.configured_names() == ()


def test_runtime_does_not_register_anthropic_without_egress_consent():
    environment = {
        "GLORIFIER_PROVIDER": "anthropic",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "false",
        "ANTHROPIC_API_KEY": "test-anthropic-key",
        "ANTHROPIC_MODEL": "claude-sonnet-5",
    }

    orchestrator = build_orchestrator_from_environment(environment)

    assert orchestrator._providers.get("anthropic") is None


def test_runtime_does_not_register_anthropic_without_credentials():
    environment = {
        "GLORIFIER_PROVIDER": "anthropic",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "ANTHROPIC_MODEL": "claude-sonnet-5",
    }

    orchestrator = build_orchestrator_from_environment(environment)

    assert orchestrator._providers.get("anthropic") is None

def test_runtime_does_not_register_anthropic_without_explicit_model():
    environment = {
        "GLORIFIER_PROVIDER": "anthropic",
        "GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS": "true",
        "ANTHROPIC_API_KEY": "test-anthropic-key",
        "ANTHROPIC_MODEL": "",
    }

    orchestrator = build_orchestrator_from_environment(environment)

    assert orchestrator._providers.get("anthropic") is None
