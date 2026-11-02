BEGIN;

-- Remove direct API-role privileges from these tables until access policies
-- and required client access paths have been explicitly reviewed.
REVOKE ALL PRIVILEGES ON TABLE
  public.intelligence_reports,
  public.intelligence_evidence,
  public.intelligence_analyses,
  public.connection_registry,
  public.connection_events,
  public.connection_approvals
FROM anon, authenticated;

-- Preserve RLS as the row-level enforcement boundary.
ALTER TABLE public.intelligence_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_approvals ENABLE ROW LEVEL SECURITY;

-- Index foreign-key columns identified by the Supabase performance advisor.
CREATE INDEX IF NOT EXISTS connection_approvals_connection_id_idx
  ON public.connection_approvals (connection_id);
CREATE INDEX IF NOT EXISTS connection_events_connection_id_idx
  ON public.connection_events (connection_id);
CREATE INDEX IF NOT EXISTS intelligence_analyses_report_id_idx
  ON public.intelligence_analyses (report_id);

COMMIT;