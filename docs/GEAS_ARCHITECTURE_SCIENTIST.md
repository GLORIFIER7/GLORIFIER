# GEAS Enterprise Architecture Scientist

GEAS continuously evaluates GLORIFIER against a curated set of authoritative public architecture sources.

## Operating rule
GEAS may observe, compare, explain, prioritize, and recommend. It must not autonomously apply irreversible production changes.

## Evidence model
- Observed fact: source-backed architectural pattern or runtime observation.
- Analysis: comparison between the source pattern and GLORIFIER.
- Recommendation: proposed improvement requiring appropriate authorization.
Unavailable or missing evidence remains UNKNOWN.

## Implemented capabilities
- Architecture Pattern Registry
- Authoritative Source Registry with URL health and SHA-256 content observation
- Architecture Control Registry
- Four-state drift model: aligned, partial, drift, unknown
- Architecture Evidence Graph integration points
- Agent reliability contract
- Sovereignty boundary model
- AI lifecycle impact-assessment model
- Architecture-aware FinOps decision model
- Read-only continuous architecture scanner
- GEAS architecture API
- GEAS Architecture dashboard
- Human-approval boundary for irreversible actions

## Initial authoritative source families
The registry currently includes NIST AI RMF and critical-infrastructure AI work, OpenTelemetry semantic conventions, FinOps architecture/workload-placement guidance, CNCF Kyverno, ETSI federated network/edge/cloud/AI work, AWS Well-Architected, Microsoft Azure Architecture, and Google Cloud Architecture.
The registry records source URLs and health observations; it does not treat source availability as proof of compliance.

## Runtime
The backend starts a read-only scanner when GEAS_ARCHITECTURE_SCAN_ENABLED is not set to false.
Optional environment variables:
- GEAS_ARCHITECTURE_SCAN_ENABLED=true|false
- GEAS_ARCHITECTURE_SCAN_INTERVAL_HOURS=24
Scans persist to PostgreSQL when DATABASE_URL is available and fall back to in-process state when persistence is unavailable.

## API
- GET /api/governance/geas/architecture
- GET /api/governance/geas/architecture/sources
- GET /api/governance/geas/architecture/patterns
- GET /api/governance/geas/architecture/controls
- POST /api/governance/geas/architecture/scan — owner/internal authorization required
- POST /api/governance/geas/architecture/ai-impact — owner authorization required
- POST /api/governance/geas/architecture/finops-decision — owner authorization required

## Safety boundary
The scanner performs public-source reads and persistence of architecture evidence. It does not deploy, merge, delete, purchase, transfer funds, change credentials, alter production infrastructure, or bypass authorization.