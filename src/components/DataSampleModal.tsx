import React, { useState } from 'react';
import { 
  X, 
  Eye, 
  ShieldCheck, 
  Zap, 
  Lock, 
  Sliders, 
  Check, 
  Info,
  ArrowRight
} from 'lucide-react';
import { DataFootprintSource } from '../types';

interface DataSampleModalProps {
  footprint: DataFootprintSource;
  onClose: () => void;
  onUpdateEpsilon: (id: string, newEpsilon: number) => void;
}

export const DataSampleModal: React.FC<DataSampleModalProps> = ({
  footprint,
  onClose,
  onUpdateEpsilon
}) => {
  const [currentEpsilon, setCurrentEpsilon] = useState(footprint.privacyEpsilon);

  const handleSliderChange = (newVal: number) => {
    setCurrentEpsilon(newVal);
    onUpdateEpsilon(footprint.id, newVal);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Noise & Privacy Inspector &bull; {footprint.name}
              </h3>
              <p className="text-[11px] text-slate-400">
                Comparing raw internet telemetry vs buyer-facing sanitized output
              </p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Epsilon Adjuster Bar */}
        <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-white flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              Differential Privacy Budget: <span className="font-mono text-emerald-400">ε = {currentEpsilon}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Lower ε = heavier Laplacian noise (higher privacy). Higher ε = higher statistical utility.
            </p>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="range"
              min="0.1"
              max="1.2"
              step="0.05"
              value={currentEpsilon}
              onChange={(e) => handleSliderChange(Number.parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-1">
              <span>ε=0.1 (Strict)</span>
              <span>ε=0.6 (Balanced)</span>
              <span>ε=1.2 (High Comp)</span>
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              Raw Digital Footprint (What Tech Companies Scrape)
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Buyer-Facing Sanitized Data (What Buyers Pay You For)
            </div>
          </div>

          <div className="space-y-3">
            {footprint.samples.map((sample, idx) => (
              <div 
                key={idx}
                className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
              >
                {/* Left: Raw */}
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Field: {sample.field}
                  </div>
                  <div className="font-mono text-rose-300 bg-rose-950/20 p-2 rounded border border-rose-500/20 break-words">
                    {sample.rawValue}
                  </div>
                  <div className="text-[10px] text-rose-400/80">
                    ⚠ Contains direct personal quasi-identifiers
                  </div>
                </div>

                {/* Right: Sanitized */}
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center justify-between">
                    <span>Transformed Record</span>
                    <span className="text-emerald-400 font-mono text-[9px]">
                      {sample.noiseLevel}
                    </span>
                  </div>
                  <div className="font-mono text-emerald-300 bg-emerald-950/20 p-2 rounded border border-emerald-500/20 break-words">
                    {sample.anonymizedValue}
                  </div>
                  <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Zero raw PII transmitted • Cryptographically certified
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Current Tier: <strong className="text-white font-mono uppercase">{footprint.privacyTier}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950"
          >
            Done Inspecting
          </button>
        </div>
      </div>
    </div>
  );
};
