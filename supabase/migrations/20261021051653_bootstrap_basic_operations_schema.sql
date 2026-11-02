
CREATE TABLE IF NOT EXISTS public.intelligence_reports (
  id TEXT PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL,
  window_hours INTEGER NOT NULL,
  source_count INTEGER NOT NULL,
  evidence_count INTEGER NOT NULL,
  executive_summary TEXT NOT NULL,
  themes JSONB NOT NULL,
  disagreements JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS public.intelligence_evidence (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES public.intelligence_reports(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TIMESTAMPTZ NULL,
  summary TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS public.intelligence_analyses (
  id BIGSERIAL PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES public.intelligence_reports(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  output TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS intelligence_evidence_report_idx ON public.intelligence_evidence(report_id);
CREATE INDEX IF NOT EXISTS intelligence_evidence_published_idx ON public.intelligence_evidence(published_at DESC);
CREATE TABLE IF NOT EXISTS public.connection_registry (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  auth_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'discovered',
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk TEXT NOT NULL DEFAULT 'medium',
  account_ref TEXT,
  expires_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.connection_events (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES public.connection_registry(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.connection_approvals (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES public.connection_registry(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.intelligence_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_approvals ENABLE ROW LEVEL SECURITY;
