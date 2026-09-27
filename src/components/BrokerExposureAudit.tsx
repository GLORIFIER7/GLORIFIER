import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Trash2, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Send, 
  Sparkles, 
  RefreshCw, 
  Scale, 
  ExternalLink,
  Download,
  X
} from 'lucide-react';
import { DataBrokerExposure } from '../types';

interface BrokerExposureAuditProps {
  exposures: DataBrokerExposure[];
  onOpenComplianceBot?: () => void;
}

export const BrokerExposureAudit: React.FC<BrokerExposureAuditProps> = ({
  exposures,
  onOpenComplianceBot
}) => {
  const [activeNoticeModal, setActiveNoticeModal] = useState<{
    brokerName: string;
    title: string;
    notice: string;
  } | null>(null);

  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const totalShadowRevenue = exposures.reduce((acc, exp) => acc + exp.monetizedWithoutConsent, 0);
  const totalLeakedRecords = exposures.reduce((acc, exp) => acc + exp.estimatedRecordsHeld, 0);

  const handleGenerateNotice = async (exp: DataBrokerExposure) => {
    setGeneratingId(exp.id);
    try {
      const res = await fetch('/api/ai/generate-clawback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokerName: exp.brokerName,
          complianceStatute: exp.complianceStatute,
          recordCount: exp.estimatedRecordsHeld,
          model: 'gpt-4o'
        })
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setActiveNoticeModal({
        brokerName: exp.brokerName,
        title: data.documentTitle || 'STATUTORY NOTICE OF DATA ERASURE & ACCOUNTING OF PROFITS',
        notice: data.legalNotice || 'Statutory Demand Notice Generated.'
      });
    } catch (e) {
      console.error(e);
      setActiveNoticeModal({
        brokerName: exp.brokerName,
        title: `STATUTORY NOTICE OF DATA ERASURE & ACCOUNTING OF PROFITS`,
        notice: `DEMAND FOR IMMEDIATE EXPUNGEMENT AND STATUTORY ACCOUNTING\n\nTo: Compliance Officer, ${exp.brokerName}\n\nPursuant to ${exp.complianceStatute || 'CCPA § 1798.105, GDPR Art. 17, and the California Delete Act'}:\n\n1. You are hereby formally notified to immediately purge, delete, and cease commercial syndication of all consumer profiles, device telemetry, and identity graphs associated with the undersigned (estimated ${exp.estimatedRecordsHeld || 350} records held).\n2. Provide a cryptographic Certificate of Deletion within thirty (30) calendar days.\n3. Disclose all third-party downstream licensees who received telemetry for financial gain.`
      });
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              Unconsented Data Broker Exposure & Statutory Clawback
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Commercial shadow brokers scrape, syndicate, and monetize your digital footprint across the internet without your consent or compensation. Generate statutory deletion orders backed by CCPA, CPRA, and GDPR.
            </p>
            {onOpenComplianceBot && (
              <div className="mt-3">
                <button
                  onClick={onOpenComplianceBot}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-medium transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Consult A.I. Bot Compliance Scientist for Statutory Legal Opinions</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 bg-slate-950 px-4 py-2.5 rounded-lg border border-slate-800">
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Exposed Records Held</div>
              <div className="text-sm font-bold font-mono text-rose-400">
                ~{totalLeakedRecords.toLocaleString()} records
              </div>
            </div>
            <div className="w-px h-8 bg-slate-800"></div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Uncompensated Broker Profit</div>
              <div className="text-sm font-bold font-mono text-amber-400">
                ${totalShadowRevenue.toFixed(2)}/yr
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Exposure Cards */}
      <div className="grid grid-cols-1 gap-4">
        {exposures.map((exp) => {
          const isDetected = exp.status === 'detected';
          const isClawbackSent = exp.status === 'clawback_sent';
          const isPurged = exp.status === 'purged';
          const isGenerating = generatingId === exp.id;

          return (
            <div
              key={exp.id}
              id={`exposure-card-${exp.id}`}
              className="rounded-xl bg-slate-900 border border-slate-800 p-5 hover:border-slate-700 transition-all"
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-sm font-bold text-white">{exp.brokerName}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {exp.brokerType}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      exp.exposureSeverity === 'CRITICAL'
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                    }`}>
                      {exp.exposureSeverity} RISK
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                    <span>
                      Estimated Records: <strong className="text-slate-200 font-mono">{exp.estimatedRecordsHeld}</strong>
                    </span>
                    <span>
                      Stolen Yield: <strong className="text-rose-400 font-mono">${exp.monetizedWithoutConsent.toFixed(2)}/yr</strong>
                    </span>
                    <span className="text-slate-500 font-mono">{exp.complianceStatute}</span>
                  </div>

                  {exp.actionTimestamp && (
                    <div className="text-[11px] text-slate-400 font-mono pt-1">
                      {exp.actionTimestamp}
                    </div>
                  )}
                </div>

                {/* Right Status / Actions */}
                <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                  <button
                    onClick={() => handleGenerateNotice(exp)}
                    disabled={isGenerating}
                    id={`notice-btn-${exp.id}`}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
                  >
                    {isGenerating ? (
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    Draft Legal Notice
                  </button>


                  {isClawbackSent && (
                    <span className="text-xs text-amber-400 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <Clock className="w-3.5 h-3.5" /> Notice Active (30-Day Window)
                    </span>
                  )}

                  {isPurged && (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Cryptographic Purge Verified
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal for viewing legal statutory notice */}
      {activeNoticeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  Statutory Erasure Demand &bull; {activeNoticeModal.brokerName}
                </h3>
              </div>
              <button
                onClick={() => setActiveNoticeModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed space-y-3 whitespace-pre-wrap bg-slate-950/60 m-4 rounded-xl border border-slate-800">
              {activeNoticeModal.notice}
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Grounded in GDPR Art. 17 & CCPA § 1798.105 with statutory penalty warnings.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([activeNoticeModal.notice], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Statutory-Clawback-${activeNoticeModal.brokerName.replace(/\s+/g, '_')}.txt`;
                    a.click();
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Notice (.txt)
                </button>
                <button
                  onClick={() => setActiveNoticeModal(null)}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
