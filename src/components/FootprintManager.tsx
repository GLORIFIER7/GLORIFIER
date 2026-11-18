import React, { useState } from 'react';
import { 
  Database, 
  ShieldCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  Sliders, 
  Sparkles, 
  AlertTriangle, 
  RefreshCw, 
  ArrowRight, 
  Check, 
  Globe, 
  ShoppingBag, 
  Code, 
  HeartPulse, 
  Share2, 
  MapPin, 
  Landmark,
  FileSearch,
  ExternalLink,
  ChevronDown,
  Mail,
  HardDrive
} from 'lucide-react';
import { DataFootprintSource, PrivacyTier, DataCategoryType } from '../types';

interface FootprintManagerProps {
  footprints: DataFootprintSource[];
  onToggleMonetization: (id: string) => void;
  onUpdatePrivacyTier: (id: string, tier: PrivacyTier, epsilon: number) => void;
  onInspectDataSamples: (footprint: DataFootprintSource) => void;
}

export const FootprintManager: React.FC<FootprintManagerProps> = ({
  footprints,
  onToggleMonetization,
  onUpdatePrivacyTier,
  onInspectDataSamples,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [auditingId, setAuditingId] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<{ id: string; data: any } | null>(null);

  const getCategoryIcon = (cat: DataCategoryType) => {
    switch (cat) {
      case 'browsing': return Globe;
      case 'ecommerce': return ShoppingBag;
      case 'developer': return Code;
      case 'health': return HeartPulse;
      case 'social': return Share2;
      case 'location': return MapPin;
      case 'financial': return Landmark;
      case 'email': return Mail;
      case 'drive': return HardDrive;
      default: return Database;
    }
  };

  const handleRunAiAudit = async (fp: DataFootprintSource) => {
    setAuditingId(fp.id);
    try {
      const res = await fetch('/api/ai/audit-footprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: fp.category,
          sourceName: fp.name,
          sampleData: fp.samples
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `Audit API unavailable (HTTP ${res.status})`);
      }
      setAuditResult({ id: fp.id, data: { ...data, status: 'response-received' } });
    } catch (err) {
      console.error('Footprint audit did not return a verified result:', err);
      setAuditResult({
        id: fp.id,
        data: {
          status: 'unavailable',
          error: err instanceof Error ? err.message : 'Audit API unavailable',
          sanitizationReport: 'No audit result was returned. No risk score, valuation, or privacy guarantee was inferred.'
        }
      });
    } finally {
      setAuditingId(null);
    }
  };

  const filteredFootprints = selectedCategory === 'all' 
    ? footprints 
    : footprints.filter(f => f.category === selectedCategory);

  const totalMarketValue = footprints.reduce((acc, f) => acc + f.marketMonthlyValueUsd, 0);
  const userCapturedValue = footprints.filter(f => f.isMonetized).reduce((acc, f) => acc + f.userMonthlyCompUsd, 0);

  return (
    <div className="space-y-6">
      {/* Header Info Card */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" />
              Digital Footprint Governance & Privacy Tiers
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Illustrative governance controls only. These starter records are sample data; changing a setting here does not connect a data source, apply a privacy transform, contact a buyer, or create earnings.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-950 px-4 py-2.5 rounded-lg border border-slate-800/80">
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Sample value inputs (illustrative)</div>
              <div className="text-sm font-bold font-mono text-slate-400">
                ${totalMarketValue.toFixed(2)}/mo
              </div>
              <div className="text-[9px] text-amber-300">SAMPLE ONLY · NOT MARKET EVIDENCE</div>
            </div>
            <ArrowRight className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-[10px] uppercase font-semibold text-emerald-400">Sample model output</div>
              <div className="text-sm font-bold font-mono text-emerald-400">
                ${userCapturedValue.toFixed(2)}/mo
              </div>
              <div className="text-[9px] text-amber-300">NOT REVENUE · NOT PAYABLE</div>
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-4 mt-3 border-t border-slate-800/80 scrollbar-none">
          {['all', 'browsing', 'ecommerce', 'developer', 'health', 'social', 'location', 'financial'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Footprint Stream Cards */}
      <div className="grid grid-cols-1 gap-4">
        {filteredFootprints.map((fp) => {
          const Icon = getCategoryIcon(fp.category);
          const isAuditing = auditingId === fp.id;
          const audit = auditResult?.id === fp.id ? auditResult.data : null;

          return (
            <div
              key={fp.id}
              id={`footprint-card-${fp.id}`}
              className={`rounded-xl border p-5 transition-all ${
                fp.isMonetized
                  ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  : 'bg-slate-950/60 border-slate-850 hover:border-slate-800 opacity-90'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                {/* Left: Icon, Name, Category, Platform */}
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    fp.isMonetized
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-white">{fp.name}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                        {fp.platform}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        fp.isMonetized 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {fp.isMonetized ? 'LOCAL SETTING: ON' : 'LOCAL SETTING: OFF'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1 max-w-xl">
                      {fp.description}
                    </p>

                    {/* Stats bar */}
                    <div className="flex items-center gap-4 text-xs text-slate-300 mt-3 pt-2.5 border-t border-slate-800/80">
                      <div>
                        <span className="text-slate-500">Sample volume: </span>
                        <span className="font-mono font-medium">{(fp.dataPointsMonthly / 1000).toFixed(0)}k records/mo</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Sample value input: </span>
                        <span className="font-mono text-slate-400 line-through">${fp.marketMonthlyValueUsd.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Sample model share: </span>
                        <span className="font-mono font-bold text-emerald-400">
                          {fp.isMonetized ? `${fp.userMonthlyCompUsd.toFixed(2)}/mo (sample)` : 'NOT VERIFIED'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                  <button
                    onClick={() => onInspectDataSamples(fp)}
                    id={`inspect-btn-${fp.id}`}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    Inspect sample records
                  </button>

                  <button
                    onClick={() => handleRunAiAudit(fp)}
                    disabled={isAuditing}
                    id={`audit-btn-${fp.id}`}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
                  >
                    {isAuditing ? (
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    Request AI audit
                  </button>

                  <button
                    onClick={() => onToggleMonetization(fp.id)}
                    id={`switch-btn-${fp.id}`}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      fp.isMonetized
                        ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                    }`}
                  >
                    {fp.isMonetized ? 'Disable local setting' : 'Enable local setting'}
                  </button>
                </div>
              </div>

              {/* Privacy Tier Controls & Math Epsilon Slider */}
              {fp.isMonetized && (
                <div className="mt-4 pt-4 border-t border-slate-800/80 bg-slate-950/40 -mx-5 -mb-5 p-5 rounded-b-xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Privacy Tier Selector */}
                    <div>
                      <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">Selected privacy technique (configuration only)</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'differential-privacy', label: 'Differential Privacy (ε)', desc: 'Selection only; runtime enforcement not verified' },
                          { id: 'zero-knowledge', label: 'Zero-Knowledge Proof', desc: 'Selection only; runtime enforcement not verified' },
                          { id: 'privacy-twin', label: 'Privacy Twin AI', desc: 'Selection only; runtime enforcement not verified' },
                          { id: 'k-anonymity', label: 'k-Anonymity (k=50)', desc: 'Selection only; runtime enforcement not verified' },
                        ].map((tierOption) => (
                          <div
                            key={tierOption.id}
                            onClick={() => onUpdatePrivacyTier(fp.id, tierOption.id as PrivacyTier, fp.privacyEpsilon)}
                            className={`cursor-pointer rounded-lg p-2.5 border text-left transition-all ${
                              fp.privacyTier === tierOption.id
                                ? 'bg-slate-800 border-emerald-500/70 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            <div className="text-xs font-bold text-slate-200">{tierOption.label}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{tierOption.desc}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Differential Privacy Epsilon Fine-tuning Slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider" htmlFor="glorifier-FootprintManager-tsx-1">
                          Epsilon target (configuration only): ε = {fp.privacyEpsilon}
                        </label>
                        <span className="text-[10px] font-mono text-emerald-400">
                          {fp.privacyEpsilon <= 0.25 ? 'Lower ε target' : fp.privacyEpsilon <= 0.6 ? 'Middle ε target' : 'Higher ε target'}
                        </span>
                      </div>

                      <input
                        type="range"
                        min="0.1"
                        max="1.2"
                        step="0.05"
                        value={fp.privacyEpsilon}
                        onChange={(e) => onUpdatePrivacyTier(fp.id, fp.privacyTier, Number.parseFloat(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-805 rounded-lg"
                      />

                      <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                        <span>ε=0.10 (configured target)</span>
                        <span>ε=0.50 (configured target)</span>
                        <span>ε=1.20 (configured target)</span>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                        This slider changes a local configuration value only. This UI does not apply a Laplace mechanism, prove differential privacy, or calculate compensation.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* API results are displayed as unverified reports; failures never get a synthetic success score. */}
              {audit && (
                <div className={audit.status === 'unavailable' ? 'mt-4 p-3.5 rounded-lg border border-amber-500/30 bg-amber-950/20 text-xs text-slate-300 space-y-2' : 'mt-4 p-3.5 rounded-lg border border-slate-700 bg-slate-950/40 text-xs text-slate-300 space-y-2'}>
                  <div className="flex items-center justify-between">
                    <span className={audit.status === 'unavailable' ? 'font-bold text-amber-300' : 'font-bold text-slate-200'}>
                      {audit.status === 'unavailable' ? 'Audit unavailable — no result returned' : 'Audit API response (NOT VERIFIED)'}
                    </span>
                    <button onClick={() => setAuditResult(null)} className="text-slate-500 hover:text-slate-300 text-xs">Dismiss</button>
                  </div>
                  {audit.status === 'unavailable' ? (
                    <p className="text-amber-100 text-[11px]">{audit.error}</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] bg-slate-950/60 p-2 rounded">
                        <div>Reported re-identification risk: <span className="font-bold">{audit.reidentificationRisk ?? 'NOT PROVIDED'}</span></div>
                        <div>Reported ε recommendation: <span className="font-bold">{audit.recommendedEpsilon ?? 'NOT PROVIDED'}</span></div>
                        <div>Reported monthly value: <span className="font-bold">{audit.fairMarketMonthlyUsd != null ? '$' + audit.fairMarketMonthlyUsd + '/mo' : 'NOT PROVIDED'}</span></div>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">{audit.sanitizationReport || 'The API did not return a sanitization report.'}</p>
                      <p className="text-amber-300 text-[10px]">This is an API-reported result; this interface has not independently verified the claims.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
