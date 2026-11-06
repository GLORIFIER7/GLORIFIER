"""Static contract checks for proposed database migrations.

These tests catch accidental contract drift without connecting to any database.
They do not replace execution against a disposable PostgreSQL instance.
"""
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
NEON_SQL = ROOT / "db" / "neon" / "migrations" / "0001_task_runs.sql"
SUPABASE_SQL = ROOT / "db" / "supabase" / "migrations" / "0001_audit_events.sql"


def _sql(path: Path) -> str:
    return re.sub(r"--[^\n]*", "", path.read_text(encoding="utf-8")).lower()


def test_neon_task_run_migration_keeps_explicit_retention_bounds():
    sql = _sql(NEON_SQL)
    assert "create table glorifier.task_runs" in sql
    assert "expires_at > created_at" in sql
    assert "expires_at <= created_at + interval '30 days'" in sql
    assert "jsonb_typeof(evidence) = 'array'" in sql
    assert "jsonb_array_length(evidence) <= 20" in sql
    assert "create index task_runs_expires_at_idx" in sql


def test_neon_task_run_migration_has_bounded_status_and_codes():
    sql = _sql(NEON_SQL)
    for status in (
        "fully verified",
        "verified",
        "partially verified",
        "not verified",
        "degraded",
        "not observable",
    ):
        assert f"'{status}'" in sql
    assert "action_class ~" in sql
    assert "provider is null or provider ~" in sql


def test_supabase_audit_migration_enables_rls_and_limits_grants():
    sql = _sql(SUPABASE_SQL)
    assert "alter table glorifier.audit_events enable row level security" in sql
    assert "grant usage on schema glorifier to service_role" in sql
    assert "grant insert on table glorifier.audit_events to service_role" in sql
    assert "grant all" not in sql
    assert "to anon" not in sql
    assert "to authenticated" not in sql


def test_supabase_audit_contract_restricts_event_types_and_json_shapes():
    sql = _sql(SUPABASE_SQL)
    for event_type in (
        "task_received",
        "policy_denied",
        "approval_required",
        "inference_started",
        "inference_completed",
        "inference_failed",
        "task_not_executed",
    ):
        assert f"'{event_type}'" in sql
    assert "jsonb_typeof(evidence) = 'array'" in sql
    assert "jsonb_typeof(details) = 'object'" in sql


def test_migrations_are_transaction_wrapped_and_do_not_enable_startup_automation():
    neon = _sql(NEON_SQL)
    supabase = _sql(SUPABASE_SQL)
    assert neon.strip().startswith("begin;")
    assert neon.strip().endswith("commit;")
    assert supabase.strip().startswith("begin;")
    assert supabase.strip().endswith("commit;")
    assert "create extension" not in neon
    assert "create extension" not in supabase
