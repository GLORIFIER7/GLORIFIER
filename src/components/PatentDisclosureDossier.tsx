import React, { useState } from 'react';
import {
  FileText,
  Scale,
  ShieldCheck,
  CheckCircle2,
  Download,
  Copy,
  Layers,
  Bot,
  Cpu,
  GitCommit,
  AlertTriangle,
  Printer,
  Sparkles,
  ChevronRight,
  Info,
  Send,
  Database,
  Lock,
  Globe,
  Coins,
  Maximize2,
  Calculator,
  BookOpen,
  Zap,
  Check,
  Trash2,
  RefreshCw
} from 'lucide-react';

interface PatentDisclosureDossierProps {
  onOpenBrokerTab?: () => void;
  onOpenSentinelTab?: () => void;
  onOpenGptCoWorkTab?: () => void;
}

export type PatentSpecialtyMode = 
  | 'claim_prosecution' 
  | 'alice_101_defense' 
  | 'scientific_enablement' 
  | 'prior_art_differentiation' 
  | 'office_action_response';

export const PatentDisclosureDossier: React.FC<PatentDisclosureDossierProps> = ({
  onOpenBrokerTab,
  onOpenSentinelTab,
  onOpenGptCoWorkTab
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'spec' | 'claims' | 'diagrams' | 'alice101' | 'attorney_ai'>('diagrams');
  const [selectedFigure, setSelectedFigure] = useState<number>(1);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [selectedClaimFilter, setSelectedClaimFilter] = useState<'all' | 'independent' | 'dependent'>('all');
  
  // AI Patent Research Assistant (not a lawyer) State
  const [specialtyMode, setSpecialtyMode] = useState<PatentSpecialtyMode>('claim_prosecution');
  const [aiModel, setAiModel] = useState<'gemini-3.8-flash' | 'gpt-4o' | 'consensus'>('gemini-3.8-flash');
  const [includeFigContext, setIncludeFigContext] = useState(true);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiHistory, setAiHistory] = useState<Array<{ 
    role: 'user' | 'assistant'; 
    text: string;
    mode?: PatentSpecialtyMode;
    modelUsed?: string;
    timestamp?: string;
  }>>([
    {
      role: 'assistant',
      text: `### AI Patent Research Assistant · Draft Session Briefing\n\n**Notice:** This is AI-generated informational assistance, not a registered patent attorney or a credentialed research scientist. Verify legal advice and credentials independently.\n**Jurisdiction:** United States Patent and Trademark Office (USPTO) & Patent Trial and Appeal Board (PTAB)\n**Proposed technical concepts for possible patent review:**\n1. **Autonomous Multi-Provider AI Orchestrator:** Dynamic capability scoring $C(M_i)$, exponential moving latency dampening, and automated 503 failover.\n2. **Mathematical Differential Privacy Engine:** Calibrated Laplacian noise $Y \\sim \\text{Lap}(\\Delta f / \\varepsilon)$ and zk-SNARK attribute attestation for sovereign data monetization.\n3. **24/7 Autonomous Code Sentinel:** Watchdog diagnostic probe synthesizing unified diffs with protected-path security gating.\n4. **Cryptographic Proof & Settlement:** SHA-256 evidence chain with multi-rail settlement.\n\nSelect a Specialty Prosecution Mode below or ask any question regarding claim scope, 35 U.S.C. § 101 Alice defenses, § 112 mathematical enablement, or prior art differentiation.`,
      mode: 'claim_prosecution',
      modelUsed: 'No provider request has been made',
      timestamp: 'SAMPLE · NOT VERIFIED'
    }
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Copy to clipboard helper
  const handleCopyText = (text: string, sectionKey: string) => {
    void navigator.clipboard.writeText(text).catch((error) => console.warn('Clipboard write failed:', error));
    setCopiedSection(sectionKey);
  };

  // Download raw spec file
  const handleDownloadSpec = () => {
    const element = document.createElement('a');
    element.href = '/PATENT_DISCLOSURE_SPECIFICATION.md';
    element.download = 'GLORIFIER_AI_PATENT_SPECIFICATION_DRAFT_NOT_FILED.md';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Export consultation brief as markdown
  const handleExportConsultation = () => {
    const threadContent = `# GLORIFIER AI — PATENT RESEARCH ASSISTANT CONSULTATION BRIEF
**Generated:** ${new Date().toISOString()}
**Important:** AI-generated research assistance only; not a lawyer, patent attorney, or credentialed research scientist. Obtain review from qualified patent counsel.
**Specialty Mode:** ${specialtyMode}
**Underlying Engine:** ${aiModel}

---

${aiHistory.map((m, idx) => `### [${m.role.toUpperCase()}] ${m.timestamp ? `(${m.timestamp})` : ''}
${m.text}
`).join('\n---\n')}
`;
    const blob = new Blob([threadContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    element.href = url;
    element.download = `PATENT_RESEARCH_ASSISTANT_DRAFT_${Date.now()}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  };

  // Clear conversation history
  const handleClearHistory = () => {
    setAiHistory([
      {
        role: 'assistant',
        text: `### AI Patent Research Assistant &bull; Session Reset\n\nReady for new patent consultation. Current active specialty: **${specialtyMode.replace(/_/g, ' ').toUpperCase()}** on engine **${aiModel}**.`,
        mode: specialtyMode,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  // Attorney AI Query Handler
  const handleAskAttorneyAi = async (customPrompt?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const promptToSend = (customPrompt || aiQuestion).trim();
    if (!promptToSend || isAiLoading) return;

    if (!customPrompt) setAiQuestion('');
    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setAiHistory(prev => [...prev, { role: 'user', text: promptToSend, timestamp: userTimestamp }]);
    setIsAiLoading(true);

    try {
      const res = await fetch('/api/ai/patent-attorney-scientist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'patent_attorney_scientist',
          specialtyMode,
          model: aiModel,
          figureNumber: includeFigContext ? selectedFigure : undefined,
          prompt: promptToSend
        })
      });

      const data = await res.json();
      const asstTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (data.success && data.content) {
        setAiHistory(prev => [
          ...prev, 
          { 
            role: 'assistant', 
            text: data.content,
            mode: specialtyMode,
            modelUsed: data.modelUsed || aiModel,
            timestamp: asstTimestamp
          }
        ]);
      } else {
        setAiHistory(prev => [
          ...prev,
          {
            role: 'assistant',
            text: 'NOT VERIFIED — the provider returned no usable content. No legal analysis or patentability recommendation was generated. Retry with an authorized provider and consult qualified patent counsel.',
            mode: specialtyMode,
            modelUsed: 'No usable provider response',
            timestamp: asstTimestamp
          }
        ]);
      }
    } catch {
      setAiHistory(prev => [
        ...prev,
        {
          role: 'assistant',
          text: 'NOT VERIFIED — the provider request failed. No fallback legal opinion was fabricated. Retry when an authorized provider is available and obtain qualified patent-counsel review.',
          mode: specialtyMode,
          modelUsed: 'Provider request failed',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const claimsList = [
    {
      num: 1,
      type: 'Independent System Claim',
      category: 'System',
      text: `A system for autonomous artificial intelligence orchestration and privacy-preserving data governance, the system comprising:
one or more hardware processors;
a network interface communicatively coupled to a plurality of disparate artificial intelligence provider endpoints and a federated plurality of user internet accounts; and
one or more non-transitory computer-readable storage media storing executable instructions that, when executed by the one or more hardware processors, cause the system to:
  (a) ingest a plurality of digital footprint records associated with a user across the federated user internet accounts;
  (b) determine a user-configured privacy policy specifying an allowable privacy budget parameter (ε) and one or more permitted secondary utilization constraints;
  (c) transform the ingested digital footprint records into a privacy-preserved data release by executing at least one of:
      (i) injecting statistical noise sampled from a calibrated distribution scaled inversely to the privacy budget parameter (ε);
      (ii) grouping quasi-identifiers into equivalence partitions satisfying k-anonymity; and
      (iii) generating a cryptographic zero-knowledge proof asserting an attribute qualification without disclosing underlying raw data values;
  (d) license the privacy-preserved data release to an external buyer in exchange for a verified compensation amount;
  (e) maintain a provider registry identifying the plurality of disparate artificial intelligence provider endpoints;
  (f) compute a dynamic capability score and historical reliability index for each provider in the provider registry;
  (g) autonomously elect a leader provider based on the capability scores and reliability indices to process user tasks; and
  (h) upon detecting a transient service failure from the elected leader provider, automatically reroute the task to a designated secondary provider without interrupting execution state.`
    },
    {
      num: 2,
      type: 'Dependent System Claim',
      category: 'Noise Calibration',
      parent: 1,
      text: `The system of claim 1, wherein the statistical noise injected into the digital footprint records is drawn from a Laplace distribution having a scale parameter b = Δf / ε, wherein Δf represents a global L1 sensitivity of a queried data function, thereby mathematically guaranteeing ε-differential privacy against linkage and reconstruction attacks.`
    },
    {
      num: 3,
      type: 'Dependent System Claim',
      category: 'Self-Healing Code Sentinel',
      parent: 1,
      text: `The system of claim 1, wherein the executable instructions further cause the system to execute an autonomous self-healing software cycle comprising:
(i) monitoring internal application logs and execution probes to detect runtime errors;
(ii) invoking one or more of the artificial intelligence provider endpoints to synthesize a minimal unified diff formatted to resolve the detected runtime error;
(iii) evaluating the synthesized unified diff against a predetermined safety policy that rejects modifications to a designated list of protected security paths;
(iv) applying the synthesized unified diff in an isolated sandbox and executing an automated compilation test; and
(v) committing the applied diff to a production runtime only upon determining that the compilation test executed with zero errors, and automatically rolling back the applied diff if the compilation test fails.`
    },
    {
      num: 4,
      type: 'Dependent System Claim',
      category: 'Multi-Model Consensus',
      parent: 3,
      text: `The system of claim 3, wherein invoking the one or more artificial intelligence provider endpoints comprises dispatching diagnostic prompts concurrently to at least two architecturally distinct artificial intelligence models, and synthesizing the unified diff based on a consensus proposal evaluated for regression safety.`
    },
    {
      num: 5,
      type: 'Dependent System Claim',
      category: 'Protected Security Paths',
      parent: 3,
      text: `The system of claim 3, wherein the designated list of protected security paths comprises environment configuration files, cryptographic signing keystores, continuous integration workflow definitions, and dependency lockfiles.`
    },
    {
      num: 6,
      type: 'Dependent System Claim',
      category: 'Multi-Sig Approval Gate',
      parent: 1,
      text: `The system of claim 1, wherein each federated user internet account is assigned an approval weight, and wherein high-value data licensing grants and payout disbursements require multi-signature cryptographic authorization satisfying a threshold cumulative weight.`
    },
    {
      num: 7,
      type: 'Dependent System Claim',
      category: 'Cryptographic Evidence Preservation',
      parent: 1,
      text: `The system of claim 1, wherein the instructions further cause the system to:
periodically scan public network sources for brand and phrase references;
generate a cryptographic hash over each detected observation comprising an observation timestamp, source uniform resource locator, matched text, and contextual snippet; and
store the cryptographic hash in a tamper-evident audit ledger accessible to legal and compliance review interfaces.`
    },
    {
      num: 8,
      type: 'Dependent System Claim',
      category: 'Multi-Rail Settlement',
      parent: 1,
      text: `The system of claim 1, wherein the verified compensation amount is credited to an internal immutable revenue ledger, and wherein the instructions further cause the system to disburse funds upon request to an external recipient address selected from a decentralized blockchain stablecoin contract address and a regulated fiat automated clearing house routing number.`
    },
    {
      num: 9,
      type: 'Dependent System Claim',
      category: 'Epsilon Depletion Tracking',
      parent: 1,
      text: `The system of claim 1, wherein the system continuously tracks cumulative differential privacy budget consumption across consecutive queries, and automatically halts data releases when cumulative consumed epsilon reaches a maximum allowable threshold.`
    },
    {
      num: 10,
      type: 'Dependent System Claim',
      category: 'Dynamic Pacing & Yield Optimization',
      parent: 1,
      text: `The system of claim 1, wherein the system calculates a dynamic monthly pacing projection based on active monetized data streams, buyer demand bids, and the user-configured privacy policy, and dynamically adjusts bid counter-offers to maximize yield within user-prescribed privacy boundaries.`
    },
    {
      num: 11,
      type: 'Independent Method Claim',
      category: 'Method',
      text: `A computer-implemented method for autonomous software self-healing and privacy-preserving data monetization, the method comprising:
ingesting, by one or more processors, digital footprint records from a plurality of connected user data sources;
applying, by the one or more processors, a differential privacy transformation to the ingested digital footprint records by injecting calibrated Laplacian noise proportional to a user-defined privacy budget parameter (ε);
executing, by the one or more processors, an autonomous multi-provider artificial intelligence orchestrator that elects an executive artificial intelligence model based on capability ratings and continuously monitored moving average latency;
transmitting data queries to the elected executive artificial intelligence model, and upon receiving an HTTP 503 service unavailable or HTTP 429 quota exhaustion code, immediately transferring execution to a fallback artificial intelligence model without terminating the active session;
monitoring internal software execution with an autonomous diagnostic probe;
synthesizing, via multi-model artificial intelligence collaboration, a unified diff repair patch in response to a detected runtime exception;
verifying that the repair patch does not modify protected authentication credentials or system deployment workflows; and
applying and verifying the repair patch in a build test gate prior to deploying the repair patch to a live production environment.`
    },
    {
      num: 12,
      type: 'Dependent Method Claim',
      category: 'Privacy Boundary',
      parent: 11,
      text: `The method of claim 11, wherein the differential privacy transformation guarantees that an attacker cannot determine the presence or absence of any single individual in the digital footprint records with a probability ratio exceeding e^ε.`
    },
    {
      num: 13,
      type: 'Dependent Method Claim',
      category: 'Zero-Knowledge Argument',
      parent: 11,
      text: `The method of claim 11, further comprising:
receiving a query from a data buyer specifying target consumer criteria;
generating a zero-knowledge succinct non-interactive argument of knowledge (zk-SNARK) verifying compliance with the target consumer criteria; and
transmitting the zero-knowledge argument to the data buyer without exposing unencrypted identifying data fields.`
    },
    {
      num: 14,
      type: 'Dependent Method Claim',
      category: 'Executive Election Matrix',
      parent: 11,
      text: `The method of claim 11, wherein electing the executive artificial intelligence model comprises computing an ordinal rank combining model reasoning capability, historical uptime percentage, and round-trip token generation latency.`
    },
    {
      num: 15,
      type: 'Dependent Method Claim',
      category: 'Automated Test Compilation',
      parent: 11,
      text: `The method of claim 11, wherein verifying the repair patch comprises executing an automated type check and compilation command within a containerized environment and confirming that zero compile-time errors or missing export references were produced.`
    },
    {
      num: 16,
      type: 'Dependent Method Claim',
      category: 'Error CRUD & Audit Logs',
      parent: 11,
      text: `The method of claim 11, further comprising:
recording every applied repair patch, detected error, and rollback event into an append-only audit log; and
exposing a graphical user interface enabling a user to perform create, read, update, and delete operations on detected error alerts.`
    },
    {
      num: 17,
      type: 'Dependent Method Claim',
      category: 'Statutory Erasure (CCPA/GDPR)',
      parent: 11,
      text: `The method of claim 11, further comprising:
receiving statutory data erasure commands; and
broadcasting automated cryptographic purge signals across all federated internet accounts connected to the user.`
    },
    {
      num: 18,
      type: 'Dependent Method Claim',
      category: 'HMAC Webhook Accounting',
      parent: 11,
      text: `The method of claim 11, further comprising:
validating webhook signatures from commercial payment processors using keyed hash message authentication codes (HMAC-SHA256); and
recording verified gross receipts into a double-entry accounting ledger partitioned by customer reference identifier.`
    },
    {
      num: 19,
      type: 'Independent Computer-Readable Medium Claim',
      category: 'Medium',
      text: `One or more non-transitory computer-readable storage media comprising stored instructions that, when executed by one or more processors of a distributed computing system, cause the computing system to:
maintain an authenticated connection to a plurality of user internet data repositories;
transform private user transaction and browsing data into differentially private datasets characterized by privacy loss parameter (ε);
license access to the differentially private datasets to verified commercial buyers;
orchestrate requests across a plurality of third-party large language model APIs using a dynamic capability scoring matrix and automated 503 failover routing;
monitor internal code stability via an autonomous continuous sentinel;
generate targeted unified diff patches to repair detected code errors;
gate application of the unified diff patches using a security filter and automated compilation test; and
disburse earned licensing revenue to the user via programmable crypto stablecoin transfers or automated banking clearing rails.`
    },
    {
      num: 20,
      type: 'Dependent CRM Claim',
      category: 'Interactive Legal Defense GUI',
      parent: 19,
      text: `The computer-readable storage media of claim 19, wherein the instructions further cause the system to:
generate an interactive patent and legal defense interface displaying system architectural diagrams, technical claim mappings, and statutory subject-matter eligibility briefs under 35 U.S.C. § 101 for review by legal counsel.`
    }
  ];

  const filteredClaims = claimsList.filter(c => {
    if (selectedClaimFilter === 'independent') return c.type.startsWith('Independent');
    if (selectedClaimFilter === 'dependent') return c.type.startsWith('Dependent');
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner / Dossier Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" /> Draft Patent Disclosure
              </span>
              <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
                Draft legal references · patentability and filing readiness NOT VERIFIED
              </span>
              <span className="px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-mono">
                20 Claims Drafted
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Patent Disclosure, Claims & Architecture Diagrams
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Draft technical specification for qualified patent-counsel review. The described capabilities are proposed concepts, not proof of deployed functionality. Provider orchestration, differential-privacy transformation, continuous self-healing, and settlement evidence are NOT VERIFIED.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleDownloadSpec}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-emerald-950/40"
              title="Download full specification in Markdown format"
            >
              <Download className="w-4 h-4" /> Download Specification (.MD)
            </button>
            <button
              onClick={() => handleCopyText(claimsList.map(c => `[CLAIM ${c.num} - ${c.type}]\n${c.text}\n`).join('\n'), 'all_claims')}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copiedSection === 'all_claims' ? 'Claims Copied!' : 'Copy All Claims'}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs transition-colors"
              title="Print Dossier"
            >
              <Printer className="w-4 h-4" /> Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'diagrams', label: 'Architecture Diagrams (FIG. 1 - 5)', icon: Layers, count: '5 Figures' },
          { id: 'claims', label: 'Proposed Claims (1 - 20)', icon: Scale, count: '20 Claims' },
          { id: 'spec', label: 'Draft Specification · Not Filed', icon: FileText, count: '12 Sections' },
          { id: 'alice101', label: '35 U.S.C. § 101 Defense Brief', icon: ShieldCheck, count: 'Step 2B' },
          { id: 'attorney_ai', label: 'AI Patent Research Assistant (not a lawyer)', icon: Sparkles, count: 'AI research assistance · credentials NOT VERIFIED' },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40 border border-emerald-500/30'
                  : 'bg-slate-900/90 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isActive ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-800 text-slate-400'}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: ARCHITECTURE DIAGRAMS (FIG. 1 - 5)                             */}
      {/* ========================================================================= */}
      {activeSubTab === 'diagrams' && (
        <div className="space-y-6">
          {/* Figure Selector Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {[
              { num: 1, title: 'FIG. 1: Network Topology & System Architecture', subtitle: 'Global System Topology (100-152)' },
              { num: 2, title: 'FIG. 2: Sovereign Privacy Monetization Pipeline', subtitle: 'Laplace Noise & zk-Proofs (200-240)' },
              { num: 3, title: 'FIG. 3: Multi-Provider AI Orchestration', subtitle: 'Dynamic Executive Election (300-350)' },
              { num: 4, title: 'FIG. 4: Proposed Code Sentinel · NOT VERIFIED', subtitle: 'Closed-Loop Self-Healing (400-450)' },
              { num: 5, title: 'FIG. 5: Evidence & Multi-Rail Settlement', subtitle: 'Cryptographic Ledger (500-550)' }
            ].map((fig) => (
              <button
                key={fig.num}
                onClick={() => setSelectedFigure(fig.num)}
                className={`p-3.5 rounded-xl text-left border transition-all ${
                  selectedFigure === fig.num
                    ? 'bg-slate-850 border-emerald-500 shadow-md shadow-emerald-950/30'
                    : 'bg-slate-900/60 border-slate-800 hover:bg-slate-850/80 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold font-mono">
                  <span className={selectedFigure === fig.num ? 'text-emerald-400' : 'text-slate-400'}>
                    FIG. {fig.num}
                  </span>
                  {selectedFigure === fig.num && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <div className="text-xs font-semibold text-slate-200 mt-1 line-clamp-1">{fig.title.split(': ')[1]}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{fig.subtitle}</div>
              </button>
            ))}
          </div>

          {/* Diagram Canvas Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  {selectedFigure === 1 && 'FIG. 1 — End-to-End Distributed System Architecture & Network Topology'}
                  {selectedFigure === 2 && 'FIG. 2 — Multi-Tier Sovereign Data Monetization & Privacy Transformation Pipeline'}
                  {selectedFigure === 3 && 'FIG. 3 — Multi-Provider AI Orchestrator with Executive Election & 503 Failover'}
                  {selectedFigure === 4 && 'FIG. 4 — Proposed Code Sentinel & Self-Healing Concept · NOT VERIFIED'}
                  {selectedFigure === 5 && 'FIG. 5 — Cryptographic Evidence Preservation, Brand Web Monitoring & Multi-Rail Settlement'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Illustrative reference numerals 100–550; formal USPTO/PCT drawing compliance NOT VERIFIED.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                  Vector Scalable (SVG)
                </span>
              </div>
            </div>

            {/* SVG Visualizations */}
            <div className="w-full overflow-x-auto bg-slate-950 rounded-xl border border-slate-800 p-4 flex justify-center items-center">
              {selectedFigure === 1 && (
                <svg viewBox="0 0 920 540" className="w-full max-w-4xl h-auto font-sans" xmlns="http://www.w3.org/2000/svg">
                  {/* Background Grid */}
                  <defs>
                    <pattern id="grid1" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="920" height="540" fill="#090d16" />
                  <rect width="920" height="540" fill="url(#grid1)" />

                  {/* Figure Header */}
                  <text x="460" y="30" textAnchor="middle" fill="#94a3b8" fontSize="14" fontWeight="bold" fontFamily="monospace">
                    FIG. 1 — DISTRIBUTED SYSTEM TOPOLOGY (100)
                  </text>

                  {/* User Client Environment (102) */}
                  <rect x="40" y="70" width="220" height="340" rx="12" fill="#0f172a" stroke="#10b981" strokeWidth="2" strokeDasharray="4 2" />
                  <text x="150" y="95" textAnchor="middle" fill="#34d399" fontSize="12" fontWeight="bold">USER CLIENT ENV 102</text>
                  <rect x="60" y="115" width="180" height="40" rx="6" fill="#1e293b" stroke="#334155" />
                  <text x="150" y="140" textAnchor="middle" fill="#f8fafc" fontSize="10">Web / Mobile Client 102a</text>

                  <rect x="60" y="170" width="180" height="40" rx="6" fill="#1e293b" stroke="#334155" />
                  <text x="150" y="195" textAnchor="middle" fill="#f8fafc" fontSize="10">Federated Identity 102b</text>

                  <rect x="60" y="225" width="180" height="40" rx="6" fill="#1e293b" stroke="#334155" />
                  <text x="150" y="250" textAnchor="middle" fill="#f8fafc" fontSize="10">Local Privacy Budget Manager 102c</text>

                  <rect x="60" y="280" width="180" height="40" rx="6" fill="#1e293b" stroke="#334155" />
                  <text x="150" y="305" textAnchor="middle" fill="#f8fafc" fontSize="10">Multi-Sig Approval Signer 102d</text>

                  <rect x="60" y="335" width="180" height="55" rx="6" fill="#064e3b" stroke="#059669" />
                  <text x="150" y="358" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="bold">Sovereign Wallet 102e</text>
                  <text x="150" y="375" textAnchor="middle" fill="#6ee7b7" fontSize="9">Crypto & Fiat Claims</text>

                  {/* Connected Data Sources (104) */}
                  <rect x="40" y="430" width="220" height="85" rx="8" fill="#0f172a" stroke="#64748b" />
                  <text x="150" y="450" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">FEDERATED DATA SOURCES 104</text>
                  <text x="150" y="470" textAnchor="middle" fill="#cbd5e1" fontSize="9">Google Workspace (104a) &bull; GitHub (104b)</text>
                  <text x="150" y="490" textAnchor="middle" fill="#cbd5e1" fontSize="9">Web3 / Crypto (104c) &bull; Payment APM (104d)</text>

                  {/* Data Flows to Central Engine */}
                  <line x1="260" y1="240" x2="330" y2="240" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrow)" />
                  <line x1="260" y1="472" x2="330" y2="400" stroke="#38bdf8" strokeWidth="2" />

                  {/* Central Sovereign Engine (110) */}
                  <rect x="330" y="70" width="280" height="445" rx="14" fill="#0f172a" stroke="#0284c7" strokeWidth="2" />
                  <text x="470" y="95" textAnchor="middle" fill="#38bdf8" fontSize="13" fontWeight="bold">CENTRAL SOVEREIGN ENGINE 110</text>

                  <rect x="350" y="115" width="240" height="45" rx="6" fill="#1e293b" stroke="#0ea5e9" />
                  <text x="470" y="135" textAnchor="middle" fill="#e0f2fe" fontSize="10" fontWeight="bold">Footprint Ingestion Unit 112</text>
                  <text x="470" y="150" textAnchor="middle" fill="#7dd3fc" fontSize="9">Continuous OAuth / API Polling</text>

                  <rect x="350" y="170" width="240" height="60" rx="6" fill="#1e293b" stroke="#10b981" />
                  <text x="470" y="190" textAnchor="middle" fill="#d1fae5" fontSize="10" fontWeight="bold">Mathematical Privacy Engine 114</text>
                  <text x="470" y="205" textAnchor="middle" fill="#6ee7b7" fontSize="9">Laplace/Gaussian Noise &bull; k-Anonymity</text>
                  <text x="470" y="220" textAnchor="middle" fill="#6ee7b7" fontSize="9">zk-SNARK Attestation &bull; Synthetic Twins</text>

                  <rect x="350" y="240" width="240" height="60" rx="6" fill="#1e293b" stroke="#8b5cf6" />
                  <text x="470" y="260" textAnchor="middle" fill="#ede9fe" fontSize="10" fontWeight="bold">AI Orchestration Gateway 116</text>
                  <text x="470" y="275" textAnchor="middle" fill="#c4b5fd" fontSize="9">Dynamic Capability Scoring &bull; 503 Failover</text>
                  <text x="470" y="290" textAnchor="middle" fill="#c4b5fd" fontSize="9">Executive Leader Election Algorithm</text>

                  <rect x="350" y="310" width="240" height="60" rx="6" fill="#1e293b" stroke="#f59e0b" />
                  <text x="470" y="330" textAnchor="middle" fill="#fef3c7" fontSize="10" fontWeight="bold">Proposed AI Code Sentinel 118 · NOT VERIFIED</text>
                  <text x="470" y="345" textAnchor="middle" fill="#fcd34d" fontSize="9">Diagnostic Watchdog &bull; Unified Diff Synthesis</text>
                  <text x="470" y="360" textAnchor="middle" fill="#fcd34d" fontSize="9">Protected-Path Gate &bull; Build Test Verifier</text>

                  <rect x="350" y="380" width="240" height="55" rx="6" fill="#1e293b" stroke="#ec4899" />
                  <text x="470" y="400" textAnchor="middle" fill="#fce7f3" fontSize="10" fontWeight="bold">Proposed Settlement Ledger 120 · NOT VERIFIED</text>
                  <text x="470" y="415" textAnchor="middle" fill="#f472b6" fontSize="9">HMAC Webhooks &bull; Multi-Rail Disbursements</text>
                  <text x="470" y="428" textAnchor="middle" fill="#f472b6" fontSize="8">Cryptographic SHA-256 Audit Trail</text>

                  <rect x="350" y="445" width="240" height="55" rx="6" fill="#022c22" stroke="#059669" />
                  <text x="470" y="468" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="bold">Database & Encrypted Store 150/152</text>
                  <text x="470" y="485" textAnchor="middle" fill="#6ee7b7" fontSize="9">PostgreSQL Relational DB &bull; Secure Vault</text>

                  {/* Lines from Central to External Ecosystem */}
                  <line x1="610" y1="200" x2="680" y2="160" stroke="#10b981" strokeWidth="2" />
                  <line x1="610" y1="270" x2="680" y2="280" stroke="#8b5cf6" strokeWidth="2" />
                  <line x1="610" y1="405" x2="680" y2="440" stroke="#ec4899" strokeWidth="2" />

                  {/* External Data Buyers (130) */}
                  <rect x="680" y="90" width="200" height="130" rx="10" fill="#0f172a" stroke="#10b981" />
                  <text x="780" y="115" textAnchor="middle" fill="#34d399" fontSize="11" fontWeight="bold">EXTERNAL BUYERS 130</text>
                  <rect x="700" y="130" width="160" height="35" rx="4" fill="#1e293b" />
                  <text x="780" y="152" textAnchor="middle" fill="#cbd5e1" fontSize="9">AI Labs & Pre-training 130a</text>
                  <rect x="700" y="172" width="160" height="35" rx="4" fill="#1e293b" />
                  <text x="780" y="194" textAnchor="middle" fill="#cbd5e1" fontSize="9">Market Analytics Consortia 130b</text>

                  {/* Heterogeneous AI Models (140) */}
                  <rect x="680" y="235" width="200" height="145" rx="10" fill="#0f172a" stroke="#8b5cf6" />
                  <text x="780" y="258" textAnchor="middle" fill="#c084fc" fontSize="11" fontWeight="bold">AI PROVIDER POOL 140</text>
                  <rect x="700" y="270" width="160" height="30" rx="4" fill="#1e293b" />
                  <text x="780" y="290" textAnchor="middle" fill="#cbd5e1" fontSize="9">Google Gemini 140a</text>
                  <rect x="700" y="306" width="160" height="30" rx="4" fill="#1e293b" />
                  <text x="780" y="326" textAnchor="middle" fill="#cbd5e1" fontSize="9">OpenAI GPT-4o 140b</text>
                  <rect x="700" y="342" width="160" height="30" rx="4" fill="#1e293b" />
                  <text x="780" y="362" textAnchor="middle" fill="#cbd5e1" fontSize="9">Meta / Groq / Local 140c</text>

                  {/* Financial Settlement Rails (160) */}
                  <rect x="680" y="395" width="200" height="120" rx="10" fill="#0f172a" stroke="#ec4899" />
                  <text x="780" y="420" textAnchor="middle" fill="#f472b6" fontSize="11" fontWeight="bold">DISBURSEMENT RAILS 160</text>
                  <rect x="700" y="435" width="160" height="30" rx="4" fill="#1e293b" />
                  <text x="780" y="455" textAnchor="middle" fill="#cbd5e1" fontSize="9">Stablecoin Smart Contracts 160a</text>
                  <rect x="700" y="472" width="160" height="30" rx="4" fill="#1e293b" />
                  <text x="780" y="492" textAnchor="middle" fill="#cbd5e1" fontSize="9">Fiat ACH / SEPA / PayPal 160b</text>
                </svg>
              )}

              {selectedFigure === 2 && (
                <svg viewBox="0 0 920 540" className="w-full max-w-4xl h-auto font-sans" xmlns="http://www.w3.org/2000/svg">
                  <rect width="920" height="540" fill="#090d16" />
                  <text x="460" y="30" textAnchor="middle" fill="#94a3b8" fontSize="14" fontWeight="bold" fontFamily="monospace">
                    FIG. 2 — MULTI-TIER SOVEREIGN PRIVACY PIPELINE (200)
                  </text>

                  {/* Step 1: Raw Input */}
                  <rect x="40" y="70" width="180" height="420" rx="10" fill="#0f172a" stroke="#64748b" strokeWidth="2" />
                  <text x="130" y="98" textAnchor="middle" fill="#e2e8f0" fontSize="11" fontWeight="bold">RAW DATA INGESTION 202</text>
                  <rect x="55" y="120" width="150" height="40" rx="6" fill="#1e293b" />
                  <text x="130" y="145" textAnchor="middle" fill="#94a3b8" fontSize="9">Browsing & Search Logs</text>
                  <rect x="55" y="175" width="150" height="40" rx="6" fill="#1e293b" />
                  <text x="130" y="200" textAnchor="middle" fill="#94a3b8" fontSize="9">E-Commerce & Orders</text>
                  <rect x="55" y="230" width="150" height="40" rx="6" fill="#1e293b" />
                  <text x="130" y="255" textAnchor="middle" fill="#94a3b8" fontSize="9">Geolocation & Dwell</text>
                  <rect x="55" y="285" width="150" height="40" rx="6" fill="#1e293b" />
                  <text x="130" y="310" textAnchor="middle" fill="#94a3b8" fontSize="9">Biometrics & Fitness</text>
                  <rect x="55" y="340" width="150" height="40" rx="6" fill="#1e293b" />
                  <text x="130" y="365" textAnchor="middle" fill="#94a3b8" fontSize="9">Email Receipt Metadata</text>
                  <rect x="55" y="395" width="150" height="80" rx="6" fill="#334155" />
                  <text x="130" y="425" textAnchor="middle" fill="#f8fafc" fontSize="10" fontWeight="bold">Privacy Policy Matrix</text>
                  <text x="130" y="445" textAnchor="middle" fill="#cbd5e1" fontSize="9">Target ε Budget ∈ [0.05, 1.5]</text>
                  <text x="130" y="460" textAnchor="middle" fill="#cbd5e1" fontSize="9">Prohibited Domain Filter</text>

                  {/* Flow Arrow */}
                  <line x1="220" y1="280" x2="280" y2="280" stroke="#10b981" strokeWidth="3" />

                  {/* Step 2: Transformation Engine (4 Tiers) */}
                  <rect x="280" y="70" width="360" height="420" rx="10" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
                  <text x="460" y="98" textAnchor="middle" fill="#34d399" fontSize="12" fontWeight="bold">MATHEMATICAL PRIVACY TRANSFORMATION 208</text>

                  {/* Tier 1 */}
                  <rect x="300" y="115" width="320" height="80" rx="8" fill="#1e293b" stroke="#059669" />
                  <text x="460" y="138" textAnchor="middle" fill="#a7f3d0" fontSize="11" fontWeight="bold">Tier 1: Differential Privacy (Laplace / Gaussian) 210</text>
                  <text x="460" y="158" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontFamily="monospace">Noise Y ~ Lap(Δf / ε), b = sensitivity / epsilon</text>
                  <text x="460" y="176" textAnchor="middle" fill="#6ee7b7" fontSize="9">DP condition if mechanism is correctly implemented: Pr[M(D1) ∈ S] ≤ exp(ε) · Pr[M(D2) ∈ S]</text>

                  {/* Tier 2 */}
                  <rect x="300" y="205" width="320" height="80" rx="8" fill="#1e293b" stroke="#0ea5e9" />
                  <text x="460" y="228" textAnchor="middle" fill="#bae6fd" fontSize="11" fontWeight="bold">Tier 2: k-Anonymity & Cohort Aggregator 220</text>
                  <text x="460" y="248" textAnchor="middle" fill="#cbd5e1" fontSize="10">Equivalence partitioning: each record indistinguishable from k-1</text>
                  <text x="460" y="266" textAnchor="middle" fill="#7dd3fc" fontSize="9">Prevents re-identification via quasi-identifier linkage</text>

                  {/* Tier 3 */}
                  <rect x="300" y="295" width="320" height="80" rx="8" fill="#1e293b" stroke="#8b5cf6" />
                  <text x="460" y="318" textAnchor="middle" fill="#ddd6fe" fontSize="11" fontWeight="bold">Tier 3: Zero-Knowledge Proof Attestation 230</text>
                  <text x="460" y="338" textAnchor="middle" fill="#cbd5e1" fontSize="10">zk-SNARK proof πZK asserts criteria: f(attribute) ≥ threshold</text>
                  <text x="460" y="356" textAnchor="middle" fill="#c4b5fd" fontSize="9">Raw witness withheld; only cryptographic proof released</text>

                  {/* Tier 4 */}
                  <rect x="300" y="385" width="320" height="85" rx="8" fill="#1e293b" stroke="#f59e0b" />
                  <text x="460" y="408" textAnchor="middle" fill="#fef3c7" fontSize="11" fontWeight="bold">Tier 4: Synthetic Twin Generator 240</text>
                  <text x="460" y="428" textAnchor="middle" fill="#cbd5e1" fontSize="10">Generative latent model conditioned on empirical cohort moments</text>
                  <text x="460" y="448" textAnchor="middle" fill="#fcd34d" fontSize="9">Zero 1-to-1 linkage to individual identity; statistical fidelity preserved</text>

                  {/* Flow Arrow */}
                  <line x1="640" y1="280" x2="700" y2="280" stroke="#10b981" strokeWidth="3" />

                  {/* Step 3: Verified Data Release & Monetization */}
                  <rect x="700" y="70" width="180" height="420" rx="10" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
                  <text x="790" y="98" textAnchor="middle" fill="#34d399" fontSize="11" fontWeight="bold">ILLUSTRATIVE RELEASES 250 · NOT VERIFIED</text>
                  <rect x="715" y="125" width="150" height="65" rx="6" fill="#1e293b" />
                  <text x="790" y="148" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="bold">Differentially Private Feed</text>
                  <text x="790" y="165" textAnchor="middle" fill="#6ee7b7" fontSize="9">Per-Query Micro-Yield</text>

                  <rect x="715" y="210" width="150" height="65" rx="6" fill="#1e293b" />
                  <text x="790" y="233" textAnchor="middle" fill="#bae6fd" fontSize="10" fontWeight="bold">Cohort Subscriptions</text>
                  <text x="790" y="250" textAnchor="middle" fill="#7dd3fc" fontSize="9">Monthly Flat Yield</text>

                  <rect x="715" y="295" width="150" height="65" rx="6" fill="#1e293b" />
                  <text x="790" y="318" textAnchor="middle" fill="#ddd6fe" fontSize="10" fontWeight="bold">zk-Attestation Grants</text>
                  <text x="790" y="335" textAnchor="middle" fill="#c4b5fd" fontSize="9">One-Time High Value</text>

                  <rect x="715" y="380" width="150" height="95" rx="6" fill="#064e3b" stroke="#059669" />
                  <text x="790" y="405" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="bold">Sovereign Revenue Ledger</text>
                  <text x="790" y="425" textAnchor="middle" fill="#a7f3d0" fontSize="9">Direct Credit to User</text>
                  <text x="790" y="445" textAnchor="middle" fill="#a7f3d0" fontSize="9">Audit Proof Hash Stored</text>
                  <text x="790" y="460" textAnchor="middle" fill="#6ee7b7" fontSize="9">Instant Payout Available</text>
                </svg>
              )}

              {selectedFigure === 3 && (
                <svg viewBox="0 0 920 540" className="w-full max-w-4xl h-auto font-sans" xmlns="http://www.w3.org/2000/svg">
                  <rect width="920" height="540" fill="#090d16" />
                  <text x="460" y="30" textAnchor="middle" fill="#94a3b8" fontSize="14" fontWeight="bold" fontFamily="monospace">
                    FIG. 3 — MULTI-PROVIDER AI ORCHESTRATION & DYNAMIC EXECUTIVE ELECTION (300)
                  </text>

                  {/* Incoming Client / Sentinel Request 302 */}
                  <rect x="40" y="190" width="160" height="120" rx="10" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
                  <text x="120" y="220" textAnchor="middle" fill="#38bdf8" fontSize="11" fontWeight="bold">REQUEST STREAM 302</text>
                  <text x="120" y="245" textAnchor="middle" fill="#cbd5e1" fontSize="9">User Queries / Role Prompts</text>
                  <text x="120" y="265" textAnchor="middle" fill="#cbd5e1" fontSize="9">Code Sentinel Diagnostics</text>
                  <text x="120" y="285" textAnchor="middle" fill="#cbd5e1" fontSize="9">Marketplace Bid Evaluations</text>

                  <line x1="200" y1="250" x2="260" y2="250" stroke="#38bdf8" strokeWidth="3" />

                  {/* AI Orchestrator Core 310 */}
                  <rect x="260" y="70" width="380" height="420" rx="12" fill="#0f172a" stroke="#8b5cf6" strokeWidth="2" />
                  <text x="450" y="98" textAnchor="middle" fill="#c084fc" fontSize="12" fontWeight="bold">DYNAMIC AI ORCHESTRATION GATEWAY 310</text>

                  {/* Capability Scorer */}
                  <rect x="280" y="115" width="340" height="70" rx="8" fill="#1e293b" stroke="#7c3aed" />
                  <text x="450" y="138" textAnchor="middle" fill="#ddd6fe" fontSize="10" fontWeight="bold">Model Capability Scorer C(M) 312</text>
                  <text x="450" y="156" textAnchor="middle" fill="#cbd5e1" fontSize="9">Reasoning & Coding Weights: GPT-4o=96, Gemini-Pro=92, Meta-Llama=88</text>
                  <text x="450" y="172" textAnchor="middle" fill="#a78bfa" fontSize="9">Static architectural family calibration</text>

                  {/* Telemetry Tracker */}
                  <rect x="280" y="195" width="340" height="85" rx="8" fill="#1e293b" stroke="#0284c7" />
                  <text x="450" y="218" textAnchor="middle" fill="#bae6fd" fontSize="10" fontWeight="bold">Real-Time Telemetry Tracker 314</text>
                  <text x="450" y="238" textAnchor="middle" fill="#cbd5e1" fontSize="9">Success Rate: Ri = Si / (Si + Fi) &bull; Uptime Percentage</text>
                  <text x="450" y="254" textAnchor="middle" fill="#cbd5e1" fontSize="9">Exponential Moving Average Latency: Li = α · Lnew + (1-α) · Li-1</text>
                  <text x="450" y="270" textAnchor="middle" fill="#7dd3fc" fontSize="9">Token Throughput & Response Quality Metric Q</text>

                  {/* Executive Election Algorithm */}
                  <rect x="280" y="290" width="340" height="85" rx="8" fill="#1e293b" stroke="#10b981" />
                  <text x="450" y="312" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="bold">Executive Election Algorithm 316</text>
                  <text x="450" y="332" textAnchor="middle" fill="#cbd5e1" fontSize="9">Ordinal Rank: Rank(Pi) = ⟨C(Mi), Ri, -Li⟩</text>
                  <text x="450" y="350" textAnchor="middle" fill="#6ee7b7" fontSize="9">Elects "Executive Leader" + Sorted Secondary Backup Pool</text>
                  <text x="450" y="365" textAnchor="middle" fill="#34d399" fontSize="9">Auto-recomputed on consecutive query completions</text>

                  {/* Automatic 503/429 Failover Router */}
                  <rect x="280" y="385" width="340" height="85" rx="8" fill="#1e293b" stroke="#ef4444" />
                  <text x="450" y="408" textAnchor="middle" fill="#fecaca" fontSize="10" fontWeight="bold">Non-Blocking Failover Router 318</text>
                  <text x="450" y="428" textAnchor="middle" fill="#cbd5e1" fontSize="9">Intercepts HTTP 503 (High Demand) & HTTP 429 (Rate Limit)</text>
                  <text x="450" y="445" textAnchor="middle" fill="#f87171" fontSize="9">Instant seamless re-dispatch to Provider(Rank 2) without session drop</text>
                  <text x="450" y="460" textAnchor="middle" fill="#fca5a5" fontSize="8">Demotes failing provider in reliability index dynamically</text>

                  {/* Flow Arrow */}
                  <line x1="640" y1="280" x2="700" y2="280" stroke="#8b5cf6" strokeWidth="3" />

                  {/* Provider Targets 330 */}
                  <rect x="700" y="70" width="180" height="420" rx="10" fill="#0f172a" stroke="#8b5cf6" strokeWidth="2" />
                  <text x="790" y="98" textAnchor="middle" fill="#c084fc" fontSize="11" fontWeight="bold">PROVIDER POOL 330</text>

                  {/* Provider A */}
                  <rect x="715" y="120" width="150" height="90" rx="6" fill="#1e293b" stroke="#10b981" />
                  <text x="790" y="142" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="bold">Provider 1 (Elected Leader)</text>
                  <text x="790" y="160" textAnchor="middle" fill="#f8fafc" fontSize="9">OpenAI GPT-4o / Claude</text>
                  <text x="790" y="178" textAnchor="middle" fill="#6ee7b7" fontSize="8">Rank 1 &bull; Active Route</text>
                  <text x="790" y="195" textAnchor="middle" fill="#94a3b8" fontSize="8">Primary execution</text>

                  {/* Provider B */}
                  <rect x="715" y="225" width="150" height="90" rx="6" fill="#1e293b" stroke="#f59e0b" />
                  <text x="790" y="247" textAnchor="middle" fill="#fef3c7" fontSize="10" fontWeight="bold">Provider 2 (Standby Hot)</text>
                  <text x="790" y="265" textAnchor="middle" fill="#f8fafc" fontSize="9">Google Gemini 2.5/Flash</text>
                  <text x="790" y="283" textAnchor="middle" fill="#fcd34d" fontSize="8">Rank 2 &bull; Hot Standby</text>
                  <text x="790" y="300" textAnchor="middle" fill="#94a3b8" fontSize="8">Auto-failover target</text>

                  {/* Provider C */}
                  <rect x="715" y="330" width="150" height="90" rx="6" fill="#1e293b" stroke="#64748b" />
                  <text x="790" y="352" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight="bold">Provider 3 (Cold Enclave)</text>
                  <text x="790" y="370" textAnchor="middle" fill="#f8fafc" fontSize="9">Meta Llama / Local</text>
                  <text x="790" y="388" textAnchor="middle" fill="#94a3b8" fontSize="8">Rank 3 &bull; Deep Fallback</text>
                  <text x="790" y="405" textAnchor="middle" fill="#64748b" fontSize="8">Offline / Airgap ready</text>

                  <rect x="715" y="435" width="150" height="45" rx="6" fill="#0f172a" stroke="#334155" />
                  <text x="790" y="455" textAnchor="middle" fill="#94a3b8" fontSize="9">Telemetry Return Loop</text>
                  <text x="790" y="470" textAnchor="middle" fill="#64748b" fontSize="8">Updates Latency & Ri</text>
                </svg>
              )}

              {selectedFigure === 4 && (
                <svg viewBox="0 0 920 540" className="w-full max-w-4xl h-auto font-sans" xmlns="http://www.w3.org/2000/svg">
                  <rect width="920" height="540" fill="#090d16" />
                  <text x="460" y="30" textAnchor="middle" fill="#94a3b8" fontSize="14" fontWeight="bold" fontFamily="monospace">
                    FIG. 4 — PROPOSED CODE SENTINEL & SELF-HEALING CONCEPT (400) · NOT VERIFIED
                  </text>

                  {/* Step 1: Watchdog Probes 402 */}
                  <rect x="30" y="70" width="190" height="420" rx="10" fill="#0f172a" stroke="#ef4444" strokeWidth="2" />
                  <text x="125" y="98" textAnchor="middle" fill="#fca5a5" fontSize="11" fontWeight="bold">ERROR DETECTION 402</text>

                  <rect x="45" y="120" width="160" height="50" rx="6" fill="#1e293b" />
                  <text x="125" y="142" textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="bold">Runtime Exception</text>
                  <text x="125" y="158" textAnchor="middle" fill="#94a3b8" fontSize="8">window.onerror / unhandled</text>

                  <rect x="45" y="180" width="160" height="50" rx="6" fill="#1e293b" />
                  <text x="125" y="202" textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="bold">API 503 / 429 Faults</text>
                  <text x="125" y="218" textAnchor="middle" fill="#94a3b8" fontSize="8">Upstream service drop</text>

                  <rect x="45" y="240" width="160" height="50" rx="6" fill="#1e293b" />
                  <text x="125" y="262" textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="bold">Build / Lint Failures</text>
                  <text x="125" y="278" textAnchor="middle" fill="#94a3b8" fontSize="8">npm run build / type error</text>

                  <rect x="45" y="305" width="160" height="80" rx="6" fill="#1e293b" stroke="#b91c1c" />
                  <text x="125" y="328" textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="bold">Diagnostic Bundle 404</text>
                  <text x="125" y="348" textAnchor="middle" fill="#cbd5e1" fontSize="8">&bull; Error stack trace</text>
                  <text x="125" y="362" textAnchor="middle" fill="#cbd5e1" fontSize="8">&bull; Offending file AST</text>
                  <text x="125" y="376" textAnchor="middle" fill="#cbd5e1" fontSize="8">&bull; Environment state</text>

                  <rect x="45" y="400" width="160" height="75" rx="6" fill="#1e293b" />
                  <text x="125" y="425" textAnchor="middle" fill="#cbd5e1" fontSize="9" fontWeight="bold">CRUD Error Manager</text>
                  <text x="125" y="445" textAnchor="middle" fill="#94a3b8" fontSize="8">Manual User Override</text>
                  <text x="125" y="460" textAnchor="middle" fill="#64748b" fontSize="8">Create/Read/Update/Delete</text>

                  <line x1="220" y1="280" x2="260" y2="280" stroke="#f59e0b" strokeWidth="2" />

                  {/* Step 2: Multi-Model Consensus & Diff Synthesis 410 */}
                  <rect x="260" y="70" width="200" height="420" rx="10" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
                  <text x="360" y="98" textAnchor="middle" fill="#fcd34d" fontSize="11" fontWeight="bold">PATCH SYNTHESIS 410</text>

                  <rect x="275" y="125" width="170" height="70" rx="6" fill="#1e293b" />
                  <text x="360" y="148" textAnchor="middle" fill="#fde68a" fontSize="10" fontWeight="bold">AI Collaborator</text>
                  <text x="360" y="165" textAnchor="middle" fill="#cbd5e1" fontSize="8">Concurrent GPT-4o & Gemini</text>
                  <text x="360" y="180" textAnchor="middle" fill="#fcd34d" fontSize="8">Proposes code fix candidate</text>

                  <rect x="275" y="210" width="170" height="110" rx="6" fill="#1e293b" stroke="#d97706" />
                  <text x="360" y="232" textAnchor="middle" fill="#fde68a" fontSize="10" fontWeight="bold">Unified Diff Generator 412</text>
                  <text x="360" y="252" textAnchor="middle" fill="#a7f3d0" fontSize="8" fontFamily="monospace">diff --git a/src/app.ts</text>
                  <text x="360" y="268" textAnchor="middle" fill="#cbd5e1" fontSize="8" fontFamily="monospace">@@ -12,4 +12,4 @@</text>
                  <text x="360" y="284" textAnchor="middle" fill="#f87171" fontSize="8" fontFamily="monospace">- const res = null;</text>
                  <text x="360" y="300" textAnchor="middle" fill="#34d399" fontSize="8" fontFamily="monospace">+ const res = fallback;</text>

                  <rect x="275" y="335" width="170" height="135" rx="6" fill="#1e293b" />
                  <text x="360" y="358" textAnchor="middle" fill="#fde68a" fontSize="9" fontWeight="bold">Multi-Model Consensus</text>
                  <text x="360" y="378" textAnchor="middle" fill="#cbd5e1" fontSize="8">Consensus matching index:</text>
                  <text x="360" y="395" textAnchor="middle" fill="#34d399" fontSize="8">Agreement Score ≥ 85%</text>
                  <text x="360" y="415" textAnchor="middle" fill="#cbd5e1" fontSize="8">Filters hallucinated edits</text>
                  <text x="360" y="435" textAnchor="middle" fill="#cbd5e1" fontSize="8">Enforces minimal edits</text>
                  <text x="360" y="455" textAnchor="middle" fill="#fcd34d" fontSize="8">Prevents wide rewrites</text>

                  <line x1="460" y1="280" x2="500" y2="280" stroke="#10b981" strokeWidth="2" />

                  {/* Step 3: Safety Policy Gatekeeper 420 */}
                  <rect x="500" y="70" width="190" height="420" rx="10" fill="#0f172a" stroke="#3b82f6" strokeWidth="2" />
                  <text x="595" y="98" textAnchor="middle" fill="#93c5fd" fontSize="11" fontWeight="bold">SAFETY POLICY GATE 420</text>

                  <rect x="515" y="125" width="160" height="100" rx="6" fill="#1e293b" stroke="#1d4ed8" />
                  <text x="595" y="148" textAnchor="middle" fill="#bfdbfe" fontSize="10" fontWeight="bold">Protected Path Rules 422</text>
                  <text x="595" y="168" textAnchor="middle" fill="#f87171" fontSize="8">&times; Reject: .env / secrets</text>
                  <text x="595" y="184" textAnchor="middle" fill="#f87171" fontSize="8">&times; Reject: .github/workflows</text>
                  <text x="595" y="200" textAnchor="middle" fill="#f87171" fontSize="8">&times; Reject: signing keystores</text>
                  <text x="595" y="214" textAnchor="middle" fill="#f87171" fontSize="8">&times; Reject: lockfiles</text>

                  <rect x="515" y="240" width="160" height="90" rx="6" fill="#1e293b" />
                  <text x="595" y="262" textAnchor="middle" fill="#bfdbfe" fontSize="10" fontWeight="bold">Blast Radius Filter 424</text>
                  <text x="595" y="282" textAnchor="middle" fill="#cbd5e1" fontSize="8">Max Files Modified: ≤ 5</text>
                  <text x="595" y="298" textAnchor="middle" fill="#cbd5e1" fontSize="8">Max Lines Changed: ≤ 120</text>
                  <text x="595" y="315" textAnchor="middle" fill="#34d399" fontSize="8">Requires strict containment</text>

                  <rect x="515" y="345" width="160" height="130" rx="6" fill="#022c22" stroke="#059669" />
                  <text x="595" y="370" textAnchor="middle" fill="#6ee7b7" fontSize="10" fontWeight="bold">Gate Decision</text>
                  <text x="595" y="392" textAnchor="middle" fill="#34d399" fontSize="9">&radic; If Passed: Sandbox</text>
                  <text x="595" y="415" textAnchor="middle" fill="#f87171" fontSize="9">&times; If Breached: Terminate</text>
                  <text x="595" y="435" textAnchor="middle" fill="#cbd5e1" fontSize="8">Logs alert to sentinel console</text>
                  <text x="595" y="455" textAnchor="middle" fill="#cbd5e1" fontSize="8">Zero security compromise</text>

                  <line x1="690" y1="280" x2="730" y2="280" stroke="#10b981" strokeWidth="2" />

                  {/* Step 4: Verification & Autonomous Deployment 430 */}
                  <rect x="730" y="70" width="160" height="420" rx="10" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
                  <text x="810" y="98" textAnchor="middle" fill="#34d399" fontSize="11" fontWeight="bold">DEPLOY GATE 430</text>

                  <rect x="745" y="125" width="130" height="85" rx="6" fill="#1e293b" stroke="#059669" />
                  <text x="810" y="148" textAnchor="middle" fill="#a7f3d0" fontSize="9" fontWeight="bold">Sandbox Test 432</text>
                  <text x="810" y="168" textAnchor="middle" fill="#cbd5e1" fontSize="8">npm run lint</text>
                  <text x="810" y="184" textAnchor="middle" fill="#cbd5e1" fontSize="8">npm run build</text>
                  <text x="810" y="200" textAnchor="middle" fill="#34d399" fontSize="8">Zero-error required</text>

                  <rect x="745" y="225" width="130" height="110" rx="6" fill="#064e3b" stroke="#059669" />
                  <text x="810" y="248" textAnchor="middle" fill="#34d399" fontSize="9" fontWeight="bold">AUTO-COMMIT 434</text>
                  <text x="810" y="268" textAnchor="middle" fill="#a7f3d0" fontSize="8">Hot-patch deployed</text>
                  <text x="810" y="285" textAnchor="middle" fill="#a7f3d0" fontSize="8">Production restored</text>
                  <text x="810" y="302" textAnchor="middle" fill="#6ee7b7" fontSize="8">Zero human needed</text>
                  <text x="810" y="320" textAnchor="middle" fill="#6ee7b7" fontSize="8">Append audit log</text>

                  <rect x="745" y="350" width="130" height="115" rx="6" fill="#450a0a" stroke="#dc2626" />
                  <text x="810" y="375" textAnchor="middle" fill="#f87171" fontSize="9" fontWeight="bold">ROLLBACK 436</text>
                  <text x="810" y="398" textAnchor="middle" fill="#fca5a5" fontSize="8">If build fails:</text>
                  <text x="810" y="415" textAnchor="middle" fill="#fca5a5" fontSize="8">git reset --hard</text>
                  <text x="810" y="432" textAnchor="middle" fill="#fca5a5" fontSize="8">Clean environment</text>
                  <text x="810" y="448" textAnchor="middle" fill="#cbd5e1" fontSize="8">Escalate to admin</text>
                </svg>
              )}

              {selectedFigure === 5 && (
                <svg viewBox="0 0 920 540" className="w-full max-w-4xl h-auto font-sans" xmlns="http://www.w3.org/2000/svg">
                  <rect width="920" height="540" fill="#090d16" />
                  <text x="460" y="30" textAnchor="middle" fill="#94a3b8" fontSize="14" fontWeight="bold" fontFamily="monospace">
                    FIG. 5 — CRYPTOGRAPHIC EVIDENCE PRESERVATION & MULTI-RAIL SETTLEMENT (500)
                  </text>

                  {/* Left: Brand Web Monitoring 502 */}
                  <rect x="40" y="70" width="240" height="420" rx="10" fill="#0f172a" stroke="#8b5cf6" strokeWidth="2" />
                  <text x="160" y="98" textAnchor="middle" fill="#c084fc" fontSize="11" fontWeight="bold">BRAND EVIDENCE MONITORING 502</text>

                  <rect x="55" y="120" width="210" height="60" rx="6" fill="#1e293b" />
                  <text x="160" y="142" textAnchor="middle" fill="#ddd6fe" fontSize="10" fontWeight="bold">Public Web & Repo Scanner</text>
                  <text x="160" y="160" textAnchor="middle" fill="#cbd5e1" fontSize="8">Scans GitHub, Forums, Package Registries</text>
                  <text x="160" y="172" textAnchor="middle" fill="#94a3b8" fontSize="8">Rate-limited non-invasive queries</text>

                  <rect x="55" y="195" width="210" height="85" rx="6" fill="#1e293b" stroke="#7c3aed" />
                  <text x="160" y="218" textAnchor="middle" fill="#ddd6fe" fontSize="10" fontWeight="bold">SHA-256 Hasher 504</text>
                  <text x="160" y="238" textAnchor="middle" fill="#a78bfa" fontSize="8" fontFamily="monospace">Hash = SHA256(TermID || URL</text>
                  <text x="160" y="254" textAnchor="middle" fill="#a78bfa" fontSize="8" fontFamily="monospace">|| Timestamp || Context)</text>
                  <text x="160" y="270" textAnchor="middle" fill="#cbd5e1" fontSize="8">Immutable digest prevents fabrication</text>

                  <rect x="55" y="295" width="210" height="85" rx="6" fill="#1e293b" />
                  <text x="160" y="318" textAnchor="middle" fill="#ddd6fe" fontSize="10" fontWeight="bold">Tamper-Evident Ledger 506</text>
                  <text x="160" y="338" textAnchor="middle" fill="#cbd5e1" fontSize="8">Hash-chained observation blocks</text>
                  <text x="160" y="354" textAnchor="middle" fill="#cbd5e1" fontSize="8">Permanent chronological order</text>
                  <text x="160" y="370" textAnchor="middle" fill="#a78bfa" fontSize="8">Court-admissible proof export</text>

                  <rect x="55" y="395" width="210" height="80" rx="6" fill="#2e1065" stroke="#7c3aed" />
                  <text x="160" y="420" textAnchor="middle" fill="#e9d5ff" fontSize="10" fontWeight="bold">Infringement & Clawback Action</text>
                  <text x="160" y="440" textAnchor="middle" fill="#c084fc" fontSize="8">Automated DMCA / Trademark Cease</text>
                  <text x="160" y="458" textAnchor="middle" fill="#a855f7" fontSize="8">One-click enforcement dispatch</text>

                  {/* Center: Data Monetization Transaction Reconciliation 520 */}
                  <rect x="310" y="70" width="260" height="420" rx="10" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
                  <text x="440" y="98" textAnchor="middle" fill="#34d399" fontSize="11" fontWeight="bold">PROPOSED SETTLEMENT LEDGER 520 · NOT VERIFIED</text>

                  <rect x="325" y="120" width="230" height="70" rx="6" fill="#1e293b" />
                  <text x="440" y="142" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="bold">Buyer Payment Webhook Ingestion</text>
                  <text x="440" y="160" textAnchor="middle" fill="#cbd5e1" fontSize="8">HMAC-SHA256 Signature Verification</text>
                  <text x="440" y="174" textAnchor="middle" fill="#94a3b8" fontSize="8">Replay-attack nonces + idempotency key</text>

                  <rect x="325" y="200" width="230" height="85" rx="6" fill="#1e293b" stroke="#059669" />
                  <text x="440" y="222" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="bold">Double-Entry Accounting Ledger</text>
                  <text x="440" y="242" textAnchor="middle" fill="#6ee7b7" fontSize="8">&bull; Debit: Buyer Escrow Account</text>
                  <text x="440" y="258" textAnchor="middle" fill="#6ee7b7" fontSize="8">&bull; Credit: User Sovereign Claim Account</text>
                  <text x="440" y="274" textAnchor="middle" fill="#cbd5e1" fontSize="8">Micro-transaction precision (0.0001 USD)</text>

                  <rect x="325" y="295" width="230" height="85" rx="6" fill="#1e293b" />
                  <text x="440" y="318" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="bold">Yield Optimization & Pacing</text>
                  <text x="440" y="338" textAnchor="middle" fill="#cbd5e1" fontSize="8">Calculates real-time monthly pacing ($)</text>
                  <text x="440" y="354" textAnchor="middle" fill="#cbd5e1" fontSize="8">Dynamic market-clearing equilibrium bids</text>
                  <text x="440" y="370" textAnchor="middle" fill="#34d399" fontSize="8">Maximizes revenue subject to ε privacy</text>

                  <rect x="325" y="390" width="230" height="85" rx="6" fill="#064e3b" stroke="#059669" />
                  <text x="440" y="415" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="bold">Automated Payout Router 530</text>
                  <text x="440" y="435" textAnchor="middle" fill="#a7f3d0" fontSize="8">Direct transfer triggers upon balance claim</text>
                  <text x="440" y="452" textAnchor="middle" fill="#6ee7b7" fontSize="8">Zero intermediary lockup or delays</text>

                  <line x1="570" y1="280" x2="610" y2="280" stroke="#ec4899" strokeWidth="2" />

                  {/* Right: Multi-Rail Disbursement Rails 540 */}
                  <rect x="610" y="70" width="270" height="420" rx="10" fill="#0f172a" stroke="#ec4899" strokeWidth="2" />
                  <text x="745" y="98" textAnchor="middle" fill="#f472b6" fontSize="11" fontWeight="bold">MULTI-RAIL DISBURSEMENTS 540</text>

                  {/* Rail 1: Crypto */}
                  <rect x="625" y="120" width="240" height="110" rx="6" fill="#1e293b" stroke="#db2777" />
                  <text x="745" y="145" textAnchor="middle" fill="#fbcfe8" fontSize="10" fontWeight="bold">Decentralized Blockchain Rails 542</text>
                  <text x="745" y="165" textAnchor="middle" fill="#cbd5e1" fontSize="8">&bull; Polygon / Ethereum USDC & USDT</text>
                  <text x="745" y="180" textAnchor="middle" fill="#cbd5e1" fontSize="8">&bull; Solana SPL USD Tokens</text>
                  <text x="745" y="195" textAnchor="middle" fill="#cbd5e1" fontSize="8">&bull; Bitcoin Lightning Network Satoshis</text>
                  <text x="745" y="212" textAnchor="middle" fill="#f472b6" fontSize="8">Instant cryptographic settlement</text>

                  {/* Rail 2: Fiat */}
                  <rect x="625" y="245" width="240" height="110" rx="6" fill="#1e293b" stroke="#0ea5e9" />
                  <text x="745" y="270" textAnchor="middle" fill="#bae6fd" fontSize="10" fontWeight="bold">Regulated Fiat Banking Rails 544</text>
                  <text x="745" y="290" textAnchor="middle" fill="#cbd5e1" fontSize="8">&bull; Automated Clearing House (ACH)</text>
                  <text x="745" y="305" textAnchor="middle" fill="#cbd5e1" fontSize="8">&bull; Single Euro Payments Area (SEPA)</text>
                  <text x="745" y="320" textAnchor="middle" fill="#cbd5e1" fontSize="8">&bull; Stripe Connect & PayPal Direct</text>
                  <text x="745" y="337" textAnchor="middle" fill="#38bdf8" fontSize="8">Same-day bank account deposit</text>

                  {/* Audit Receipt */}
                  <rect x="625" y="370" width="240" height="105" rx="6" fill="#1e293b" />
                  <text x="745" y="395" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight="bold">Cryptographic Receipt 546</text>
                  <text x="745" y="415" textAnchor="middle" fill="#94a3b8" fontSize="8">Non-repudiable transaction hash</text>
                  <text x="745" y="430" textAnchor="middle" fill="#94a3b8" fontSize="8">Tax compliance & 1099-MISC export</text>
                  <text x="745" y="450" textAnchor="middle" fill="#34d399" fontSize="8">Immutable confirmation ledger</text>
                </svg>
              )}
            </div>

            {/* Reference Numerals Table for the Selected Figure */}
            <div className="mt-6 bg-slate-950/70 rounded-xl p-4 border border-slate-800">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-emerald-400" /> Reference Numerals Key for FIG. {selectedFigure}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {selectedFigure === 1 && (
                  <>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">100:</span> Distributed System Topology</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">102:</span> User Client Environment</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">104:</span> Federated Data Sources (Workspace, GitHub, Web3)</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">110:</span> Central Sovereign Engine</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">114:</span> Mathematical Privacy Engine</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">116:</span> AI Orchestration Gateway</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">118:</span> Proposed AI Code Sentinel · NOT VERIFIED</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">120:</span> Proposed Settlement Ledger · NOT VERIFIED</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">130/140:</span> External Buyers & AI Providers</div>
                  </>
                )}
                {selectedFigure === 2 && (
                  <>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">200:</span> Sovereign Privacy Pipeline</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">202:</span> Raw Footprint Ingestion</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">210:</span> Tier 1: Laplace/Gaussian DP (Noise Y ~ Lap(Δf/ε))</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">220:</span> Tier 2: k-Anonymity Cohort Binning (k ≥ 50)</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">230:</span> Tier 3: Zero-Knowledge Attestation (zk-SNARKs)</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">240:</span> Tier 4: Generative Synthetic Twins</div>
                  </>
                )}
                {selectedFigure === 3 && (
                  <>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">300:</span> AI Orchestrator Topology</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">312:</span> Model Capability Scorer C(M)</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">314:</span> Telemetry Tracker (Success Ri, Latency Li)</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">316:</span> Executive Election Algorithm</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">318:</span> Non-Blocking 503/429 Failover Router</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">330:</span> Disparate AI Provider Pool (GPT, Gemini, Meta)</div>
                  </>
                )}
                {selectedFigure === 4 && (
                  <>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">400:</span> Self-Healing Sentinel Cycle</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">402:</span> Runtime Exception Watchdog Probes</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">410:</span> Multi-Model Patch Synthesis (GPT-4o & Gemini)</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">412:</span> Unified Diff Synthesizer (diff --git)</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">420:</span> Safety Policy Filter (Protected Path & Blast Radius)</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">430:</span> Sandbox Build Gate (Auto-Commit or Rollback)</div>
                  </>
                )}
                {selectedFigure === 5 && (
                  <>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">500:</span> Evidence & Settlement Architecture</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">504:</span> SHA-256 Observation Hasher</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">506:</span> Tamper-Evident Audit Ledger</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">520:</span> Proposed Double-Entry Settlement Ledger · NOT VERIFIED</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">542:</span> Decentralized Blockchain Stablecoin Rails (USDC/USDT)</div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800"><span className="font-mono text-emerald-400 font-bold">544:</span> Regulated Fiat Banking Rails (ACH/SEPA/PayPal)</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: PROPOSED CLAIMS MATRIX (1 - 20)                                */}
      {/* ========================================================================= */}
      {activeSubTab === 'claims' && (
        <div className="space-y-6">
          {/* Claims Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filter Claims:</span>
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'all', label: 'All 20 Claims' },
                  { id: 'independent', label: 'Independent Only (1, 11, 19)' },
                  { id: 'dependent', label: 'Dependent Only (17 Claims)' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedClaimFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      selectedClaimFilter === f.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Showing <span className="text-emerald-400 font-bold">{filteredClaims.length}</span> of 20 proposed claims
            </div>
          </div>

          {/* Claims List */}
          <div className="space-y-4">
            {filteredClaims.map((claim) => {
              const isIndependent = claim.type.startsWith('Independent');
              return (
                <div
                  key={claim.num}
                  className={`border rounded-2xl p-5 transition-all ${
                    isIndependent
                      ? 'bg-slate-900/90 border-emerald-500/60 shadow-lg shadow-emerald-950/20'
                      : 'bg-slate-900/50 border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded font-mono font-bold text-xs ${
                        isIndependent ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-300'
                      }`}>
                        CLAIM {claim.num}
                      </span>
                      <span className={`text-xs font-semibold ${isIndependent ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {claim.type}
                      </span>
                      {claim.parent && (
                        <span className="text-xs font-mono text-slate-500">
                          (Depends on Claim {claim.parent})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-mono">
                        {claim.category}
                      </span>
                      <button
                        onClick={() => handleCopyText(`[CLAIM ${claim.num}]\n${claim.text}`, `claim_${claim.num}`)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="Copy claim text"
                      >
                        {copiedSection === `claim_${claim.num}` ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-200 font-mono leading-relaxed whitespace-pre-line pl-2 border-l-2 border-slate-700">
                    {claim.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: COMPLETE USPTO SPECIFICATION                                   */}
      {/* ========================================================================= */}
      {activeSubTab === 'spec' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  Draft Patent Specification · Filing status NOT VERIFIED
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Conforming to 37 CFR § 1.77 (Standard arrangement for patent applications).
                </p>
              </div>

              <button
                onClick={handleDownloadSpec}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Download Full Markdown
              </button>
            </div>

            {/* Structured Sections Preview */}
            <div className="space-y-6 text-xs sm:text-sm text-slate-300 leading-relaxed font-sans max-h-[700px] overflow-y-auto pr-3">
              <section className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 font-mono">
                  TITLE OF THE INVENTION
                </h4>
                <p className="font-bold text-white text-base">
                  SYSTEM AND METHOD FOR AUTONOMOUS CROSS-PROVIDER ARTIFICIAL INTELLIGENCE ORCHESTRATION, PRIVACY-PRESERVING SOVEREIGN DATA MONETIZATION, AND CONTINUOUS SELF-HEALING SOFTWARE ARCHITECTURE
                </p>
              </section>

              <section className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 font-mono">
                  3. FIELD OF THE INVENTION [0003]
                </h4>
                <p>
                  The present invention relates generally to distributed computing systems, artificial intelligence (AI) model orchestration, and data privacy governance. More particularly, the invention relates to computer-implemented systems, methods, and non-transitory computer-readable media for dynamically evaluating and federating across disparate, heterogeneous artificial intelligence providers using capability scoring and real-time reliability/latency metrics; transforming raw personal data footprints into privacy-preserved, differentially private mathematical representations, zero-knowledge attestations, and synthetic twins for fair-compensation data licensing; executing 24/7 continuous autonomous code monitoring, closed-loop unified diff synthesis, and regression-gated self-healing without human intervention; and preserving cryptographically anchored audit trails, public web brand observations, and verified multi-rail settlement ledgers.
                </p>
              </section>

              <section className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 font-mono">
                  4. BACKGROUND OF THE INVENTION & DEFICIENCIES IN PRIOR ART [0004 - 0006]
                </h4>
                <p className="mb-2">
                  In the modern digital economy, vast amounts of personal and behavioral data—such as search history, browsing footprints, e-commerce transactions, location signals, health biometrics, and communication metadata—are harvested continuously by third-party data brokers and platform intermediaries. These intermediaries aggregate, profile, and monetize user data for advertising, machine learning pre-training, and market analytics without the data subject's informed consent, granular governance, or direct monetary compensation.
                </p>
                <p>
                  Furthermore, existing systems suffer from critical technical deficiencies: (1) binary all-or-nothing privacy checkboxes that lack calibrated mathematical guarantees; (2) extreme vulnerability of single-provider LLM applications to upstream HTTP 503 service unavailable spikes and 429 quota exhaustion; (3) passive monitoring tools that alert human developers without executing closed-loop self-repair; and (4) lack of verifiable, cryptographic proof-of-query execution and instant multi-rail settlement.
                </p>
              </section>

              <section className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 font-mono">
                  5. BRIEF SUMMARY OF THE INVENTION [0007 - 0011]
                </h4>
                <p className="mb-2">
                  The present invention solves these technical problems through four tightly coupled subsystems:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                  <li>
                    <strong className="text-white">Proposed Multi-Provider AI Orchestration:</strong> The design describes capability scoring and failover routing. Live scoring, latency measurement, leader election, and successful 503 failover are NOT VERIFIED.
                  </li>
                  <li>
                    <strong className="text-white">Proposed Privacy Transformation:</strong> Differential privacy, k-anonymity, zero-knowledge proofs, and synthetic-data processing are described as design concepts; production implementation and validation are NOT VERIFIED.
                  </li>
                  <li>
                    <strong className="text-white">Proposed Code Sentinel & Self-Healing:</strong> Monitoring, patch synthesis, protected-path enforcement, sandbox testing, and deployment automation are intended design elements. Continuous operation and enforcement are NOT VERIFIED.
                  </li>
                  <li>
                    <strong className="text-white">Proposed Evidence & Settlement:</strong> Hashing, ledger reconciliation, and multi-rail payouts are design goals. Immutability, accounting reconciliation, and external settlement are NOT VERIFIED.
                  </li>
                </ul>
              </section>

              <section className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 font-mono">
                  10. PRIOR ART DIFFERENTIATION MATRIX
                </h4>
                <p className="text-slate-400 mb-3">
                  Comprehensive mapping of conventional techniques versus the claimed technological advancements:
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 pr-4">Dimension</th>
                        <th className="py-2 pr-4">Prior Art (Conventional)</th>
                        <th className="py-2">The Present Invention</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      <tr>
                        <td className="py-2 font-semibold text-white pr-4">Data Monetization</td>
                        <td className="py-2 text-slate-400 pr-4">Third parties harvest data without compensation.</td>
                        <td className="py-2 text-emerald-400">Direct user-governed monetization with calibrated privacy tiers.</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold text-white pr-4">Privacy Math</td>
                        <td className="py-2 text-slate-400 pr-4">Static masking easily defeated by linkage attacks.</td>
                        <td className="py-2 text-emerald-400">Formal $\varepsilon$-differential privacy + zero-knowledge attribute proofs.</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold text-white pr-4">LLM Resilience</td>
                        <td className="py-2 text-slate-400 pr-4">Hardcoded single-API endpoint crashes on 503 spikes.</td>
                        <td className="py-2 text-emerald-400">Dynamic executive election with non-blocking failover routing.</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold text-white pr-4">Software Remediation</td>
                        <td className="py-2 text-slate-400 pr-4">Passive APM alerts requiring human on-call engineers.</td>
                        <td className="py-2 text-emerald-400">Closed-loop autonomous unified diff synthesis and sandbox gating.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: 35 U.S.C. § 101 ALICE/MAYO DEFENSE BRIEF                       */}
      {/* ========================================================================= */}
      {activeSubTab === 'alice101' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <span className="px-2.5 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-mono">
                Legal Analysis for Reviewing Patent Attorney
              </span>
              <h3 className="text-lg font-bold text-white mt-2">
                35 U.S.C. § 101 Subject-Matter Eligibility Brief (Alice/Mayo Step 2B Defense)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Strategic analysis anticipating Section 101 subject-matter rejections and establishing concrete improvements to computer functionality.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider font-mono">
                  <CheckCircle2 className="w-4 h-4" /> Step 2A: Technological Integration
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Under the USPTO 2019 Revised Guidance, a claim is not directed to an abstract idea if the judicial exception is integrated into a practical application.
                </p>
                <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                  <li>
                    <strong className="text-slate-200">Mathematical Concept Integration:</strong> Laplace differential privacy formulas (Y ~ Lap(Δf / ε)) are directly tied to transforming ingested digital footprint database records to prevent database reconstruction attacks.
                  </li>
                  <li>
                    <strong className="text-slate-200">Hardware & Network Coupling:</strong> Claims explicitly recite one or more processors, network interfaces, federated user data repositories, and containerized sandbox test environments.
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider font-mono">
                  <Cpu className="w-4 h-4" /> Step 2B: Improvement to Computer Functionality
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Under Federal Circuit precedents (<em>Enfish, LLC v. Microsoft Corp.</em>, 822 F.3d 1327; <em>Berkheimer v. HP Inc.</em>, 881 F.3d 1360):
                </p>
                <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                  <li>
                    <strong className="text-slate-200">Eliminating Failure Cascades:</strong> Conventional systems fail when an upstream LLM returns a 503. The claimed dynamic capability scoring and real-time executive election improves distributed computing resilience.
                  </li>
                  <li>
                    <strong className="text-slate-200">Autonomous Self-Healing:</strong> The closed-loop error capture, unified diff generation, protected path gate, and sandbox compilation test improve the computer’s ability to recover from runtime software corruption without human debugging.
                  </li>
                </ul>
              </div>
            </div>

            {/* Precedent Citation Box */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                Key Supporting Federal Circuit Precedents to Cite in Office Action Responses
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="font-bold text-emerald-400">Enfish, LLC v. Microsoft Corp.</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Software claims directed to a specific improvement in how computers store and retrieve data in memory are patent eligible under Step 2A.
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="font-bold text-cyan-400">Berkheimer v. HP Inc.</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Whether claim limitations represent well-understood, routine, and conventional activity is a factual question that defeats premature 101 rejections.
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="font-bold text-purple-400">McRO, Inc. v. Bandai Namco</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Using specific mathematical rules to automate tasks previously done manually constitutes a patent-eligible technical improvement.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 5: A.I. BOT: PATENT ATTORNEY & CHIEF IP RESEARCH SCIENTIST         */}
      {/* ========================================================================= */}
      {activeSubTab === 'attorney_ai' && (
        <div className="space-y-6">
          {/* Main Bot Terminal Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            
            {/* Top Identity & Credentials Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 p-0.5 shadow-lg shadow-purple-950/40 flex-shrink-0">
                  <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                    <Scale className="w-6 h-6 text-purple-400" />
                  </div>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      AI Patent Research Assistant (not a lawyer)
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-semibold uppercase">
                      Credentials NOT VERIFIED · not a lawyer
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    AI research assistant for patent-draft exploration. It has no verified legal credentials; all legal conclusions and technical claims require independent review.
                  </p>
                </div>
              </div>

              {/* Right Side: Engine Selector & Export Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-slate-400 text-[11px]">Engine:</span>
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value as any)}
                    className="bg-transparent text-emerald-400 font-mono text-[11px] font-semibold focus:outline-none cursor-pointer"
                  >
                    <option value="gemini-3.8-flash" className="bg-slate-900 text-slate-200">Gemini 3.8 Flash (DeepMind)</option>
                    <option value="gpt-4o" className="bg-slate-900 text-slate-200">OpenAI GPT-4o (Frontier)</option>
                    <option value="consensus" className="bg-slate-900 text-slate-200">Dual-Consensus (Gemini + GPT)</option>
                  </select>
                </div>

                {onOpenGptCoWorkTab && (
                  <button
                    onClick={onOpenGptCoWorkTab}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-950/40 transition-colors"
                    title="Open Work Together with GPT Studio"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-200" /> Work Together with GPT
                  </button>
                )}

                <button
                  onClick={handleExportConsultation}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
                  title="Export complete legal-scientific brief as Markdown"
                >
                  <Download className="w-3.5 h-3.5 text-purple-400" /> Export Brief (.MD)
                </button>

                <button
                  onClick={handleClearHistory}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs transition-colors"
                  title="Reset consultation thread"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Clear
                </button>
              </div>
            </div>

            {/* Specialty Prosecution Mode Selector Tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Specialty Prosecution & Scientific Modes:
                </span>
                <span className="text-[11px] text-slate-400">
                  Target figure: <span className="text-purple-400 font-mono font-bold">FIG. {selectedFigure}</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {[
                  {
                    id: 'claim_prosecution' as PatentSpecialtyMode,
                    label: 'Patent Claim Prosecution',
                    subtitle: 'USPTO Claims 1–20 & Antecedent Basis',
                    icon: Scale,
                    color: 'purple'
                  },
                  {
                    id: 'alice_101_defense' as PatentSpecialtyMode,
                    label: 'Alice 101 Defense Brief',
                    subtitle: 'Step 2B Technical Improvement',
                    icon: ShieldCheck,
                    color: 'emerald'
                  },
                  {
                    id: 'scientific_enablement' as PatentSpecialtyMode,
                    label: 'Scientific Enablement & Math',
                    subtitle: '§ 112 Laplace & zk-SNARK Proofs',
                    icon: Calculator,
                    color: 'teal'
                  },
                  {
                    id: 'prior_art_differentiation' as PatentSpecialtyMode,
                    label: 'Prior Art Matrix',
                    subtitle: 'Novelty vs Ad-Tech & APM',
                    icon: Database,
                    color: 'cyan'
                  },
                  {
                    id: 'office_action_response' as PatentSpecialtyMode,
                    label: 'Office Action Response',
                    subtitle: '37 CFR § 1.111 Formal Remarks',
                    icon: FileText,
                    color: 'amber'
                  }
                ].map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = specialtyMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setSpecialtyMode(mode.id)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-purple-950/40 border-purple-500/70 shadow-md shadow-purple-950/30'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-purple-400' : 'text-slate-400'}`} />
                        <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                          {mode.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        {mode.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scientific Mathematical Quick Reference Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950/80 border border-slate-800/80 p-3.5 rounded-xl">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                <div className="text-[10px] font-mono text-purple-400 font-bold uppercase">Laplace Differential Privacy (§ 112)</div>
                <div className="text-xs font-mono text-slate-200 mt-1">Y ~ Lap(Δf / ε)</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Scale b = Δf / ε &bull; Pr[M(D)] ≤ e^ε · Pr[M(D')]</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                <div className="text-[10px] font-mono text-teal-400 font-bold uppercase">Dynamic AI Orchestrator (§ 101)</div>
                <div className="text-xs font-mono text-slate-200 mt-1">Rank(P_i) = ⟨C(M_i), R_i, -L_i⟩</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Instant 503 circuit-breaking failover routing</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                <div className="text-[10px] font-mono text-cyan-400 font-bold uppercase">Zero-Knowledge Attribute Proofs</div>
                <div className="text-xs font-mono text-slate-200 mt-1">π = Prove(pk, x, w)</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Verify(vk, x, π) ∈ {'{0, 1}'} without revealing raw scalars</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase">Closed-Loop Self-Healing Invariant</div>
                <div className="text-xs font-mono text-slate-200 mt-1">ΔS ≤ τ_safe &bull; Gated Build</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Protected paths filtered & sandboxed test gate</div>
              </div>
            </div>

            {/* Mode-Specific Quick Prompts */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                <span>Recommended Queries for {specialtyMode.replace(/_/g, ' ').toUpperCase()}:</span>
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400 hover:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeFigContext}
                    onChange={(e) => setIncludeFigContext(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span>Include FIG. {selectedFigure} drawing context</span>
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                {specialtyMode === 'claim_prosecution' && [
                  'Audit Claims 1 to 10 for antecedent basis defects and indefinite terms',
                  'Draft a new independent claim for zero-knowledge privacy-preserving data monetization',
                  'Verify that Claim 11 avoids means-plus-function traps under 35 U.S.C. § 112(f)',
                  'Structure dependent claims for double-entry cryptographic ledger settlement'
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleAskAttorneyAi(q)}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors text-left flex items-center gap-1.5"
                  >
                    <ChevronRight className="w-3 h-3 text-purple-400" />
                    <span>&ldquo;{q}&rdquo;</span>
                  </button>
                ))}

                {specialtyMode === 'alice_101_defense' && [
                  'Draft Alice Step 2B brief proving 24/7 code sentinel is an inventive concept under Berkheimer',
                  'How does dynamic 503 AI failover routing qualify as a computer-functioning improvement under Enfish?',
                  'Synthesize Step 2A Prong 2 arguments for mathematical differential privacy data monetization',
                  'Distinguish our autonomous self-healing software from generic computerized abstract ideas'
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleAskAttorneyAi(q)}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors text-left flex items-center gap-1.5"
                  >
                    <ChevronRight className="w-3 h-3 text-emerald-400" />
                    <span>&ldquo;{q}&rdquo;</span>
                  </button>
                ))}

                {specialtyMode === 'scientific_enablement' && [
                  'Formulate mathematical proof for Laplace differential privacy noise bounds under § 112',
                  'Derive sensitivity Δf and scale b for e-commerce and developer telemetry streams',
                  'Define zk-SNARK arithmetic circuit constraints for consumer demographic and credit attestation',
                  'State the mathematical convergence proof for the moving-average latency scoring formula'
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleAskAttorneyAi(q)}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors text-left flex items-center gap-1.5"
                  >
                    <ChevronRight className="w-3 h-3 text-teal-400" />
                    <span>&ldquo;{q}&rdquo;</span>
                  </button>
                ))}

                {specialtyMode === 'prior_art_differentiation' && [
                  'Construct technical comparison matrix distinguishing our architecture from BigID and Datadog',
                  'Why do conventional ad networks (Criteo, LiveRamp) fail to anticipate Claim 1?',
                  'Highlight patentable differences over Google Privacy Sandbox Topics API',
                  'Differentiate our autonomous code sentinel from conventional CI/CD automated test runners'
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleAskAttorneyAi(q)}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors text-left flex items-center gap-1.5"
                  >
                    <ChevronRight className="w-3 h-3 text-cyan-400" />
                    <span>&ldquo;{q}&rdquo;</span>
                  </button>
                ))}

                {specialtyMode === 'office_action_response' && [
                  'Draft 37 CFR § 1.111 response traversing a provisional 35 U.S.C. § 101 rejection of Claim 1',
                  'Prepare formal remarks amending Claim 11 to introduce cryptographic commit verification',
                  'Draft terminal disclaimer and non-obviousness argument against cited APM prior art',
                  'Generate complete USPTO filing caption with listing of claims for examiner review'
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleAskAttorneyAi(q)}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors text-left flex items-center gap-1.5"
                  >
                    <ChevronRight className="w-3 h-3 text-amber-400" />
                    <span>&ldquo;{q}&rdquo;</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation Terminal */}
            <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800 space-y-4 max-h-[520px] overflow-y-auto font-sans">
              {aiHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 text-xs sm:text-sm leading-relaxed ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex-shrink-0 flex items-center justify-center font-bold text-xs mt-0.5 shadow-md shadow-purple-950/50">
                      §
                    </div>
                  )}

                  <div
                    className={`p-4 rounded-2xl max-w-3xl space-y-2 ${
                      msg.role === 'user'
                        ? 'bg-emerald-600 text-white font-medium shadow-md shadow-emerald-950/30'
                        : 'bg-slate-900/95 text-slate-200 border border-slate-800 shadow-md shadow-black/40'
                    }`}
                  >
                    {/* Assistant Metadata Header */}
                    {msg.role === 'assistant' && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-purple-300">
                            AI Patent Research Assistant (not a lawyer)
                          </span>
                          {msg.mode && (
                            <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono text-[10px]">
                              {msg.mode.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-slate-400 font-mono text-[10px]">
                          {msg.modelUsed && <span>{msg.modelUsed}</span>}
                          {msg.timestamp && <span>{msg.timestamp}</span>}
                          <button
                            onClick={() => handleCopyText(msg.text, `msg_${idx}`)}
                            className="hover:text-white transition-colors"
                            title="Copy response text"
                          >
                            <Copy className="w-3 h-3 inline mr-1" />
                            {copiedSection === `msg_${idx}` ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Message Body */}
                    <div className="whitespace-pre-line text-xs sm:text-sm leading-relaxed text-slate-200">
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}

              {isAiLoading && (
                <div className="flex items-center gap-3 text-xs text-purple-400 font-mono py-3 px-4 rounded-xl bg-purple-950/20 border border-purple-500/20">
                  <Sparkles className="w-4 h-4 animate-spin text-purple-400" />
                  <span>AI Patent Research Assistant (not a lawyer) synthesizing 35 U.S.C. statutes, mathematical proofs, and claim limitations...</span>
                </div>
              )}
            </div>

            {/* Input Form & Query Controls */}
            <form onSubmit={(e) => handleAskAttorneyAi(undefined, e)} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  placeholder={`Ask the AI research assistant (${specialtyMode.replace(/_/g, ' ')}) regarding 35 U.S.C. §§ 101/112, prior art, or claim scope...`}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={isAiLoading || !aiQuestion.trim()}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-lg shadow-purple-950/50 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Ask AI about this draft</span>
                  <span className="sm:hidden">Consult</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-1">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    AI-assisted research · attorney credentials and USPTO registration NOT VERIFIED
                  </span>
                  <span>&bull;</span>
                  <span>Legal references are informational; legal accuracy NOT independently verified</span>
                </div>
                <div>
                  Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">Enter</kbd> to submit consultation
                </div>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
};
