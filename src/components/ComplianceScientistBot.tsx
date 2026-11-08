import React, { useState } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Scale, 
  FileText, 
  Sparkles, 
  Cpu, 
  Download, 
  Copy, 
  Trash2, 
  Send, 
  ChevronRight, 
  CheckCircle2, 
  AlertTriangle, 
  Calculator, 
  Database, 
  Globe, 
  ExternalLink,
  Lock,
  Zap,
  ArrowUpRight
} from 'lucide-react';
import { MonetizationPolicy, DataFootprintSource, DataBrokerExposure } from '../types';

export type ComplianceSpecialtyMode = 
  | 'gdpr_erasure_dpia'
  | 'ccpa_cpra_clawbacks'
  | 'eu_ai_act_governance'
  | 'statistical_privacy_audit'
  | 'regulatory_audit_memo';

interface ComplianceChatMessage {
  role: 'user' | 'assistant';
  text: string;
  mode?: ComplianceSpecialtyMode;
  modelUsed?: string;
  timestamp?: string;
}

interface ComplianceScientistBotProps {
  policy?: MonetizationPolicy;
  footprints?: DataFootprintSource[];
  exposures?: DataBrokerExposure[];
  onOpenClawbackTab?: () => void;
  onOpenPrivacyLabTab?: () => void;
  onOpenGptCoWorkTab?: () => void;
}

export const ComplianceScientistBot: React.FC<ComplianceScientistBotProps> = ({
  policy,
  footprints = [],
  exposures = [],
  onOpenClawbackTab,
  onOpenPrivacyLabTab,
  onOpenGptCoWorkTab
}) => {
  const [specialtyMode, setSpecialtyMode] = useState<ComplianceSpecialtyMode>('gdpr_erasure_dpia');
  const [aiModel, setAiModel] = useState<'gemini-3.8-flash' | 'gpt-4o' | 'auto'>('gemini-3.8-flash');
  const [aiQuestion, setAiQuestion] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [includeExposureContext, setIncludeExposureContext] = useState(true);

  // Initial consultation history
  const [aiHistory, setAiHistory] = useState<ComplianceChatMessage[]>([
    {
      role: 'assistant',
      mode: 'gdpr_erasure_dpia',
      modelUsed: 'Starter template (not an AI result)',
      timestamp: 'Template — not generated at runtime',
      text: `### Compliance review starter template — NOT A LEGAL OPINION

This is static starter text, not a live compliance check, legal advice, certification, or evidence that a control is operating.

- **GDPR / CCPA / CPRA:** Compliance depends on the actual data flows, legal basis, notices, contracts, retention, rights handling, and operational evidence. This interface does not certify compliance.
- **Privacy transformations:** This panel has not verified that differential privacy, anonymization, or another privacy mechanism is applied to outbound data.
- **Deletion / clawback:** This panel has not verified that a statutory deletion or broker-clawback pipeline is active, or that any evidence token is immutable.
- **EU AI Act / HIPAA:** This interface does not certify an AI risk classification, Article 50 compliance, HIPAA compliance, or a quantitative re-identification bound.
- **Next step:** Request a source-backed review, then validate the findings with qualified privacy/legal counsel and operational evidence.

AI-generated responses, when available, are advisory and require human review.`
    }
  ]);

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(label);
    setTimeout(() => setCopiedSection(null), 2500);
  };

  const handleClearHistory = () => {
    setAiHistory([
      {
        role: 'assistant',
        mode: specialtyMode,
        modelUsed: 'Requested model only — not executed',
        timestamp: new Date().toLocaleTimeString(),
        text: `Consultation session refreshed. Ready for statutory inquiries on GDPR, CCPA/CPRA, the EU AI Act, or statistical privacy verification.`
      }
    ]);
  };

  const handleExportAudit = () => {
    const header = `# COMPLIANCE AI SCIENTIST & REGULATORY PRIVACY AUDIT DOSSIER
**Generated:** ${new Date().toISOString()}  
**Prepared by:** GLORIFIER compliance review assistant (AI-generated checklist; no professional certification, legal authority, or legal opinion is claimed)  
**Governing Laws:** GDPR (EU 2016/679), CCPA/CPRA (Cal. Civ. Code § 1798), EU AI Act (Reg. 2024/1689), HIPAA § 164.514  
**Configured epsilon target (runtime enforcement NOT VERIFIED):** ε = ${policy?.globalEpsilon ?? 'not configured'}  

================================================================================
`;
    const transcript = aiHistory.map((msg, i) => {
      const author = msg.role === 'user' ? 'USER QUERY' : 'AI-GENERATED REVIEW NOTE (NOT LEGAL ADVICE)';
      const meta = msg.mode ? `[Specialty: ${msg.mode}] [Engine: ${msg.modelUsed || 'Core'}] [${msg.timestamp || ''}]` : '';
      return `### ${i + 1}. ${author} ${meta}\n\n${msg.text}\n`;
    }).join('\n---\n\n');

    const fullBlob = new Blob([header + transcript], { type: 'text/markdown' });
    const url = URL.createObjectURL(fullBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GLORIFIER_Compliance_Review_Draft_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAskComplianceAi = async (overridePrompt?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = (overridePrompt || aiQuestion).trim();
    if (!query || isAiLoading) return;

    const userMsg: ComplianceChatMessage = {
      role: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString()
    };
    setAiHistory(prev => [...prev, userMsg]);
    setAiQuestion('');
    setIsAiLoading(true);

    try {
      const exposureDataSummary = includeExposureContext && exposures.length > 0
        ? `Unverified UI-provided broker exposure context (may include sample records; do not treat as verified facts): ${exposures.map(e => `${e.brokerName} (${e.complianceStatute}, ~${e.estimatedRecordsHeld} records)`).join(', ')}`
        : undefined;

      const res = await fetch('/api/ai/compliance-scientist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          model: aiModel,
          specialtyMode,
          regulatoryFramework: specialtyMode.replace(/_/g, ' ').toUpperCase(),
          exposureContext: exposureDataSummary,
          // No data category is asserted unless supplied and verified by the backend.
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const assistantMsg: ComplianceChatMessage = {
        role: 'assistant',
        text: data.content || 'No evaluation content was returned. No conclusion was verified.',
        mode: specialtyMode,
        modelUsed: data.modelUsed || 'Actual model not reported by backend — NOT VERIFIED',
        timestamp: new Date().toLocaleTimeString()
      };
      setAiHistory(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Compliance AI query error:', err);
      const unavailableMsg: ComplianceChatMessage = {
        role: 'assistant',
        text: 'Compliance AI backend unavailable. No regulatory conclusion or legal execution was generated locally.',
        mode: specialtyMode,
        modelUsed: 'Unavailable',
        timestamp: new Date().toLocaleTimeString()
      };
      setAiHistory(prev => [...prev, unavailableMsg]);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Identity Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold uppercase tracking-wider">
                Compliance review assistant · NOT legal counsel or certification
              </span>
              <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono">
                GDPR · CCPA · EU AI Act topics
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              AI Compliance Review Assistant
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Assists with regulatory checklists and draft language only. This is not legal advice, legal counsel, a compliance certification, a completed conformity assessment, or a mathematical privacy verification. Qualified review and implementation evidence are required.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onOpenGptCoWorkTab && (
              <button
                onClick={onOpenGptCoWorkTab}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-emerald-950/40"
                title="Launch Work Together with GPT Studio"
              >
                <Sparkles className="w-4 h-4 text-emerald-200" /> Work Together with GPT
              </button>
            )}
            <button
              onClick={handleExportAudit}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-amber-950/40"
              title="Download a draft compliance review memo in Markdown format"
            >
              <Download className="w-4 h-4" /> Download Draft Review Memo (.MD)
            </button>
            {onOpenClawbackTab && (
              <button
                onClick={onOpenClawbackTab}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs transition-colors"
                title="Open broker exposure view; records and execution status may be unverified"
              >
                <ShieldAlert className="w-4 h-4 text-amber-400" /> View Clawback Exposures
              </button>
            )}
            {onOpenPrivacyLabTab && (
              <button
                onClick={onOpenPrivacyLabTab}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs transition-colors"
                title="Navigate to Privacy Tech Lab"
              >
                <Lock className="w-4 h-4 text-teal-400" /> Privacy Tech Lab
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compliance topic checklist (not an assessment) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">GDPR & CCPA Erasure</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold">
              NOT VERIFIED
            </span>
          </div>
          <div className="text-xl font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>GDPR Art. 17 · CCPA § 1798.105</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Deletion request processing, provider completion, and evidence immutability are NOT VERIFIED.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">EU AI Act (2024/1689)</span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono font-bold">
              Classification not assessed
            </span>
          </div>
          <div className="text-xl font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <span>Conformity NOT VERIFIED</span>
          </div>
          <p className="text-[11px] text-slate-400">
            No legal classification or EU AI Act conformity assessment has been performed by this interface.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Re-identification risk assessment</span>
            <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/30 text-[10px] font-mono font-bold">
              NOT CALCULATED
            </span>
          </div>
          <div className="text-xl font-bold text-white flex items-center gap-2">
            <Calculator className="w-5 h-5 text-teal-400" />
            <span>§ 164.514(b)(1)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            No dataset-specific statistical test or HIPAA expert determination has been performed.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Configured ε target (not enforced)</span>
            <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30 text-[10px] font-mono font-bold">
              ε = {policy?.globalEpsilon ?? 'NOT CONFIGURED'}
            </span>
          </div>
          <div className="text-xl font-bold text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-purple-400" />
            <span>Runtime enforcement NOT VERIFIED</span>
          </div>
          <p className="text-[11px] text-slate-400">
            No Laplace mechanism or runtime privacy guarantee has been verified.
          </p>
        </div>
      </div>

      {/* Main Bot Interactive Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        
        {/* Top Controls & Engine Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-600 via-orange-600 to-yellow-500 p-0.5 shadow-lg shadow-amber-950/40 flex items-center justify-center flex-shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Regulatory Research & Privacy Science Workspace
              </h3>
              <p className="text-xs text-slate-400">
                Provides informational issue-spotting and draft text. Legal applicability and implementation facts require source-backed review.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400 text-[11px]">Requested model:</span>
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value as any)}
                className="bg-transparent text-amber-400 font-mono text-[11px] font-semibold focus:outline-none cursor-pointer"
              >
                <option value="gemini-3.8-flash" className="bg-slate-900 text-slate-200">Gemini 3.8 Flash (requested)</option>
                <option value="gpt-4o" className="bg-slate-900 text-slate-200">OpenAI GPT-4o (requested)</option>
                <option value="auto" className="bg-slate-900 text-slate-200">Automatic provider routing (requested)</option>
              </select>
            </div>

            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs transition-colors"
              title="Reset consultation thread"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Clear
            </button>
          </div>
        </div>

        {/* 5 Regulatory Specialty Modes Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Regulatory Specialty & Scientific Domains:
            </span>
            <span className="text-[11px] text-slate-400">
              Active Focus: <span className="text-amber-400 font-mono font-bold">{specialtyMode.replace(/_/g, ' ').toUpperCase()}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {[
              {
                id: 'gdpr_erasure_dpia' as ComplianceSpecialtyMode,
                label: 'GDPR Articles 17, 25 & 35',
                subtitle: 'Erasure, privacy by design, and DPIA',
                icon: Globe,
                color: 'emerald'
              },
              {
                id: 'ccpa_cpra_clawbacks' as ComplianceSpecialtyMode,
                label: 'CCPA & Clawbacks',
                subtitle: 'Cal. Civ. Code § 1798.105 & SB 362',
                icon: ShieldAlert,
                color: 'amber'
              },
              {
                id: 'eu_ai_act_governance' as ComplianceSpecialtyMode,
                label: 'EU AI Act Governance',
                subtitle: 'Regulation 2024/1689 Conformity',
                icon: Cpu,
                color: 'cyan'
              },
              {
                id: 'statistical_privacy_audit' as ComplianceSpecialtyMode,
                label: 'Statistical Privacy & HIPAA',
                subtitle: 'HIPAA de-identification & privacy engineering',
                icon: Calculator,
                color: 'teal'
              },
              {
                id: 'regulatory_audit_memo' as ComplianceSpecialtyMode,
                label: 'Regulatory Audit Memo',
                subtitle: 'Draft review memo for qualified counsel',
                icon: FileText,
                color: 'purple'
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
                      ? 'bg-amber-950/40 border-amber-500/70 shadow-md shadow-amber-950/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`} />
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

        {/* Regulatory and technical reference notes — not assessments */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950/80 border border-slate-800/80 p-3.5 rounded-xl">
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
            <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase">Pure ε-Differential Privacy</div>
            <div className="text-xs font-mono text-slate-200 mt-1">Pr[M(D) ∈ S] ≤ e^ε · Pr[M(D') ∈ S]</div>
            <div className="text-[10px] text-slate-400 mt-0.5">For every output event S and adjacent datasets D, D'. Technical definition only; not a GDPR requirement. Runtime implementation NOT VERIFIED.</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
            <div className="text-[10px] font-mono text-amber-400 font-bold uppercase">GDPR Articles 17, 25 & 35</div>
            <div className="text-xs font-mono text-slate-200 mt-1">Erasure · Design/default · DPIA</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Separate legal duties with conditions and exceptions. Applicability and operational compliance NOT ASSESSED.</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
            <div className="text-[10px] font-mono text-cyan-400 font-bold uppercase">CCPA § 1798.155 Enforcement</div>
            <div className="text-xs font-mono text-slate-200 mt-1">No general 30-day cure precondition</div>
            <div className="text-[10px] text-slate-400 mt-0.5">The general regulatory cure prerequisite ended January 1, 2023. The limited private-action rules in § 1798.150 are separate. Applicability NOT ASSESSED.</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
            <div className="text-[10px] font-mono text-teal-400 font-bold uppercase">EU AI Act · Regulation 2024/1689</div>
            <div className="text-xs font-mono text-slate-200 mt-1">No generic “Class 1” classification</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Assess Article 5 prohibitions, Article 6/Annex III high-risk criteria, and applicable Article 50 transparency duties. No assessment performed.</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
            <div className="text-[10px] font-mono text-purple-400 font-bold uppercase">HIPAA Expert Determination · § 164.514(b)(1)</div>
            <div className="text-xs font-mono text-slate-200 mt-1">Very small risk — expert-specific</div>
            <div className="text-[10px] text-slate-400 mt-0.5">A qualified expert documents methods and results. HHS establishes no universal numerical risk or k-anonymity threshold. Assessment NOT PERFORMED.</div>
          </div>
        </div>

        {/* Quick Action Prompts for Selected Mode */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
            <span>Recommended Compliance Queries for {specialtyMode.replace(/_/g, ' ').toUpperCase()}:</span>
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400 hover:text-slate-200">
              <input
                type="checkbox"
                checked={includeExposureContext}
                onChange={(e) => setIncludeExposureContext(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-amber-600 focus:ring-0 w-3.5 h-3.5"
              />
              <span>Include configured broker exposure context (may contain sample/unverified records)</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {specialtyMode === 'gdpr_erasure_dpia' && [
              'Assess whether the described processing may require a GDPR Article 35 DPIA; list missing facts, risks, and review steps without assuming implementation.',
              'Review whether the supplied facts may support a GDPR Article 17 erasure request, including applicable exceptions and controller/processor roles.',
              'Evaluate cross-border transfer compliance under Chapter V and Schrems II',
              'Verify lawful basis under Article 6(1)(a) and data protection by design under Article 25'
            ].map((q, i) => (
              <button
                key={i}
                onClick={() => handleAskComplianceAi(q)}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors text-left flex items-center gap-1.5"
              >
                <ChevronRight className="w-3 h-3 text-emerald-400" />
                <span>&ldquo;{q}&rdquo;</span>
              </button>
            ))}

            {specialtyMode === 'ccpa_cpra_clawbacks' && [
              'Draft statutory CCPA § 1798.105 mandatory deletion and accounting demand for shadow brokers',
              'Analyze California SB 362 (Delete Act) registry submission requirements',
              'Explain potential CCPA enforcement penalties under the current text of § 1798.155 and distinguish regulatory enforcement from the limited private action under § 1798.150.',
              'Audit consumer opt-out of sale/sharing under § 1798.120 and CPRA regulations'
            ].map((q, i) => (
              <button
                key={i}
                onClick={() => handleAskComplianceAi(q)}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors text-left flex items-center gap-1.5"
              >
                <ChevronRight className="w-3 h-3 text-amber-400" />
                <span>&ldquo;{q}&rdquo;</span>
              </button>
            ))}

            {specialtyMode === 'eu_ai_act_governance' && [
              'Classify the autonomous multi-provider AI orchestrator under the EU AI Act (Reg. 2024/1689)',
              'Verify Article 50 transparency obligations for AI-generated synthetic profiles',
              'Screen the described use against each potentially relevant Article 5 prohibited practice; identify missing facts and do not presume a clean result.',
              'Draft a GPAI (General Purpose AI) systemic-risk applicability checklist for a configured multi-provider AI system; do not assume consensus or execution.'
            ].map((q, i) => (
              <button
                key={i}
                onClick={() => handleAskComplianceAi(q)}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors text-left flex items-center gap-1.5"
              >
                <ChevronRight className="w-3 h-3 text-cyan-400" />
                <span>&ldquo;{q}&rdquo;</span>
              </button>
            ))}

            {specialtyMode === 'statistical_privacy_audit' && [
              'Review differential privacy design parameters separately from the HIPAA Expert Determination standard; identify evidence needed for each.',
              'Evaluate a proposed Laplace mechanism against pure or approximate differential privacy, requiring adjacency, sensitivity, mechanism, composition, and implementation evidence.',
              'Evaluate a proposed k-anonymity design using dataset-specific quasi-identifiers; do not assume a universal k threshold or HIPAA equivalence.',
              'Calculate total privacy budget consumption across 10,000 research queries'
            ].map((q, i) => (
              <button
                key={i}
                onClick={() => handleAskComplianceAi(q)}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors text-left flex items-center gap-1.5"
              >
                <ChevronRight className="w-3 h-3 text-teal-400" />
                <span>&ldquo;{q}&rdquo;</span>
              </button>
            ))}

            {specialtyMode === 'regulatory_audit_memo' && [
              'Draft formal regulatory compliance memo for the California Privacy Protection Agency (CPPA)',
              'Prepare supervisory authority audit brief for European Data Protection Board (EDPB)',
              'Synthesize FTC Section 5 Safeguards Rule conformity opinion for consumer data sovereignty',
              'Draft executive compliance declaration for international institutional data buyers'
            ].map((q, i) => (
              <button
                key={i}
                onClick={() => handleAskComplianceAi(q)}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 transition-colors text-left flex items-center gap-1.5"
              >
                <ChevronRight className="w-3 h-3 text-purple-400" />
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
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-600 text-white flex-shrink-0 flex items-center justify-center font-bold text-xs mt-0.5 shadow-md shadow-amber-950/50">
                  §
                </div>
              )}

              <div
                className={`p-4 rounded-2xl max-w-3xl space-y-2 ${
                  msg.role === 'user'
                    ? 'bg-amber-600 text-white font-medium shadow-md shadow-amber-950/30'
                    : 'bg-slate-900/95 text-slate-200 border border-slate-800 shadow-md shadow-black/40'
                }`}
              >
                {/* Assistant Metadata Header */}
                {msg.role === 'assistant' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-amber-300">
                        A.I. Bot Compliance Scientist
                      </span>
                      {msg.mode && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono text-[10px]">
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
            <div className="flex items-center gap-3 text-xs text-amber-400 font-mono py-3 px-4 rounded-xl bg-amber-950/20 border border-amber-500/20">
              <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
              <span>A.I. Bot Compliance Scientist auditing statutory mandates, calculating Laplace noise bounds, and drafting compliance opinion...</span>
            </div>
          )}
        </div>

        {/* Input Form & Query Controls */}
        <form onSubmit={(e) => handleAskComplianceAi(undefined, e)} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder={`Ask the Compliance Scientist (${specialtyMode.replace(/_/g, ' ')}) regarding GDPR, CCPA/CPRA, EU AI Act, or statistical privacy bounds...`}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={isAiLoading || !aiQuestion.trim()}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-lg shadow-amber-950/50 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Consult Compliance Scientist</span>
              <span className="sm:hidden">Consult</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-1">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-emerald-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Regulatory and privacy framework references · no professional certification is claimed
              </span>
              <span>&bull;</span>
              <span>GDPR Art. 17 / CCPA § 1798.105 references · applicability not assessed</span>
            </div>
            <div>
              Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">Enter</kbd> to submit query
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
