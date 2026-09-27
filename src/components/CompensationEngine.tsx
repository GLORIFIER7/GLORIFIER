import React, { useState } from 'react';
import { 
  DollarSign, 
  Cpu, 
  Activity, 
  Layers, 
  Zap, 
  CheckCircle2, 
  ArrowUpRight, 
  Clock, 
  Play, 
  RotateCw, 
  ShieldCheck, 
  Coins, 
  TrendingUp, 
  FileCode, 
  Sparkles,
  Info,
  Scale
} from 'lucide-react';
import { UsageTelemetryEvent, DataCategoryType } from '../types';

interface CompensationEngineProps {
  telemetryEvents: UsageTelemetryEvent[];
  totalPendingUsd: number;
}

export const CompensationEngine: React.FC<CompensationEngineProps> = ({
  telemetryEvents,
  totalPendingUsd
}) => {
  const [activeModelTab, setActiveModelTab] = useState<'shapley' | 'per_query' | 'subscription' | 'pipeline'>('shapley');
  
  // Interactive Shapley Calculator State
  const [datasetSize, setDatasetSize] = useState<number>(1000);
  const [modelAccuracyGain, setModelAccuracyGain] = useState<number>(4.2); // % gain
  const [buyerBudgetUsd, setBuyerBudgetUsd] = useState<number>(25000);
  const [userContributionQuality, setUserContributionQuality] = useState<number>(1.35); // multiplier

  // Interactive DP Query Pricing State
  const [dpBasePrice, setDpBasePrice] = useState<number>(0.02);
  const [querySensitivity, setQuerySensitivity] = useState<number>(1.0);
  const [queryEpsilon, setQueryEpsilon] = useState<number>(0.35);

  // Calculate values
  const calculatedShapleyPayout = (
    (buyerBudgetUsd * (modelAccuracyGain / 100) / datasetSize) * userContributionQuality
  ).toFixed(3);

  const calculatedDpPricePerQuery = (
    (dpBasePrice * querySensitivity) / queryEpsilon
  ).toFixed(4);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Coins className="w-5 h-5 text-emerald-400" />
              Automated Compensation Engine & Telemetry Tracking
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Cryptographic usage metering, mathematical valuation formulas (Data Shapley, Laplacian DP queries, cohort pacing), and Layer-2 micro-settlement rollups.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-950 px-4 py-2.5 rounded-lg border border-slate-800 self-start lg:self-auto">
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Unsettled Accrual</div>
              <div className="text-sm font-bold font-mono text-emerald-400">
                ${totalPendingUsd.toFixed(2)} USD
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Model Selection Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'shapley', label: '1. Data Shapley ML Attribution', icon: Sparkles },
          { id: 'per_query', label: '2. Per-Query DP Metering', icon: Activity },
          { id: 'subscription', label: '3. Cohort Subscription Pacing', icon: Layers },
          { id: 'pipeline', label: '4. Layer-2 Settlement Pipeline', icon: Zap }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeModelTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveModelTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                isActive
                  ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Data Shapley ML Attribution */}
      {activeModelTab === 'shapley' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Data Shapley Value for Machine Learning Pre-Training
              </h3>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Cooperative Game Theory
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              When AI foundation model labs train on collective datasets, simple volume metrics fail. <strong>Data Shapley</strong> mathematically computes the exact marginal utility of your specific records to the model's loss reduction.
            </p>

            {/* Formula Box */}
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 space-y-2">
              <div className="text-[10px] uppercase font-bold text-slate-500">Attribution Theorem</div>
              <div className="text-emerald-400 text-sm overflow-x-auto py-1">
                {"φ_i(v) = ∑ [ |S|!(|D|-|S|-1)! / |D|! ] × [ v(S ∪ {i}) - v(S) ]"}
              </div>
              <p className="text-[11px] text-slate-400 font-sans">
                Where <strong>v(S)</strong> is the model benchmark score on training subset <strong>S</strong>, and <strong>i</strong> is your personal data stream contribution.
              </p>
            </div>

            {/* Interactive Parameters */}
            <div className="space-y-3 pt-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Total Buyer Training Pool Budget</span>
                  <span className="font-mono text-emerald-400">${buyerBudgetUsd.toLocaleString()} USD</span>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="100000"
                  step="5000"
                  value={buyerBudgetUsd}
                  onChange={(e) => setBuyerBudgetUsd(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Model Accuracy / Perplexity Gain</span>
                  <span className="font-mono text-emerald-400">+{modelAccuracyGain}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="15.0"
                  step="0.5"
                  value={modelAccuracyGain}
                  onChange={(e) => setModelAccuracyGain(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Cohort Participant Count (N)</span>
                  <span className="font-mono text-slate-300">{datasetSize} contributors</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="5000"
                  step="100"
                  value={datasetSize}
                  onChange={(e) => setDatasetSize(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Live Result Callout */}
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase font-bold text-emerald-400">Illustrative Shapley Calculation</div>
                <div className="text-2xl font-black font-mono text-emerald-300">
                  ${calculatedShapleyPayout}{' '}
                  <span className="text-xs font-normal text-slate-400">/ training run epoch</span>
                </div>
              </div>

            </div>
          </div>

          {/* Right Explanation Column */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-400" />
                Why Shapley Value Eliminates Exploitation
              </h4>
              <ul className="text-xs text-slate-400 space-y-2.5">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span><strong>Fair Efficiency:</strong> 100% of the buyer's allocated data budget is distributed across contributors without platform skimming.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span><strong>Null Player Property:</strong> Low-entropy or noisy spam data receives $0.00, protecting pool integrity.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span><strong>Symmetry:</strong> Two users contributing identical marginal knowledge receive identical compensation.</span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 font-mono text-[11px] text-slate-400 space-y-2">
              <div className="text-slate-300 font-bold">Active Shapley Beneficiaries:</div>
              <div className="flex justify-between border-b border-slate-800 pb-1">
                <span>Anthropic Claude Code Assist</span>
                <span className="text-slate-500">Not verified</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1">
                <span>Meta OpenLLaMA Benchmark</span>
                <span className="text-slate-500">Not verified</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Per-Query Differential Privacy Pricing */}
      {activeModelTab === 'per_query' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Per-Query Privacy Budget Depletion Pricing
              </h3>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Micro-Metering
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Every query an analytical buyer sends against your sanitized data vault drains a fractional amount of your privacy budget $\epsilon$. To preserve your privacy equilibrium, queries requiring lower noise (higher $\epsilon$) are priced exponentially higher.
            </p>

            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 space-y-2">
              <div className="text-[10px] uppercase font-bold text-slate-500">Per-Query Price Equation</div>
              <div className="text-emerald-400 text-sm overflow-x-auto py-1">
                Price(Q) = BaseRate × [ Sensitivity(Δf) / ε_target ] × ComplexityWeight
              </div>
              <p className="text-[11px] text-slate-400 font-sans">
                As the buyer requests sharper resolution (smaller noise scale $b = \Delta f / \epsilon$), the user is compensated directly for the privacy loss.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Base Rate per Query</span>
                  <span className="font-mono text-emerald-400">${dpBasePrice.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min="0.005"
                  max="0.10"
                  step="0.005"
                  value={dpBasePrice}
                  onChange={(e) => setDpBasePrice(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Query Differential Privacy Target (ε)</span>
                  <span className="font-mono text-emerald-400">ε = {queryEpsilon}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.05"
                  value={queryEpsilon}
                  onChange={(e) => setQueryEpsilon(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase font-bold text-emerald-400">Calculated Query Fee</div>
                <div className="text-2xl font-black font-mono text-emerald-300">
                  ${calculatedDpPricePerQuery}{' '}
                  <span className="text-xs font-normal text-slate-400">/ single query execution</span>
                </div>
              </div>

            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Cryptographic Query Auditing
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                When a query is dispatched by an authenticated researcher, the platform's trusted query gateway verifies:
              </p>
              <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
                <li>Zero-Knowledge Proof of authorized purpose</li>
                <li>Cumulative $(\epsilon, \delta)$ budget consumption checks</li>
                <li>Laplace noise injection before returning the aggregate result</li>
                <li>Immediate Layer-2 balance credit to the user's account</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Cohort Subscription Pacing */}
      {activeModelTab === 'subscription' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                Cohort Subscription & Continuous Streaming Pacing
              </h3>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Predictable Recurring Yield
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Institutional economic and epidemiology researchers require continuous stream feeds rather than ad-hoc queries. Users who opt into certified research cohorts earn stable monthly recurring royalties.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-500">Stanford Macro Economics</div>
                <div className="text-lg font-bold font-mono text-slate-300 mt-1">No verified subscription</div>
                <div className="text-[10px] text-slate-400 mt-0.5">E-Commerce cohort stream</div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-500">MIT CSAIL AI Quality Cohort</div>
                <div className="text-lg font-bold font-mono text-slate-300 mt-1">No verified subscription</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Search & browsing intent stream</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase font-bold text-emerald-400">Illustrative Subscription Model</div>
                <div className="text-sm font-semibold text-slate-300">No verified recurring revenue is recorded.</div>
              </div>

            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Subscription Governance & Lockouts
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Cohort subscriptions do NOT grant permanent ownership. Data access is leased on a 30-day rolling basis. If a buyer breaches their retention window or tries to deanonymize participants, their license key is cryptographically revoked across the network.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Layer-2 Settlement Pipeline */}
      {activeModelTab === 'pipeline' && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              Automated Payment Clearing & Micro-Settlement Architecture
            </h3>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Zero-Gas Micro-Payouts
            </span>
          </div>

          {/* 4-Stage Visual Pipeline */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              {
                step: '01',
                title: 'Usage Metering',
                desc: 'Cryptographic API gateway meters query execution, Laplace noise parameter, and model weights.',
                status: 'Sub-second event'
              },
              {
                step: '02',
                title: 'State Channel Escrow',
                desc: 'Buyer pre-funds smart contract escrow. Micropayments sign off-chain balance proofs without gas.',
                status: 'Instant off-chain'
              },
              {
                step: '03',
                title: 'Batch Rollup',
                desc: 'Aggregates thousands of micro-royalties into a daily ZK-Rollup root hash committed on-chain.',
                status: 'Every 24 hours'
              },
              {
                step: '04',
                title: 'Disbursement',
                desc: 'User liquidates via Solana USDC (instant, 0-fee), Stripe Connect, or direct ACH bank wire.',
                status: 'Instant / Same-day'
              }
            ].map((stage) => (
              <div key={stage.step} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-emerald-400">{stage.step}</span>
                  <span className="text-[9px] font-mono text-slate-500">{stage.status}</span>
                </div>
                <div className="text-xs font-bold text-white">{stage.title}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{stage.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Telemetry Log Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Live Data Usage Telemetry Stream & Compensation Log
          </h3>
          <span className="text-[10px] font-mono text-slate-400">
            Real-time metering proofs
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                <th className="pb-2">Timestamp</th>
                <th className="pb-2">Buyer / Recipient</th>
                <th className="pb-2">Stream</th>
                <th className="pb-2">Calculation Model</th>
                <th className="pb-2">Proof Hash</th>
                <th className="pb-2 text-right">Comp Accrued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {telemetryEvents.map((evt) => (
                <tr key={evt.id} className="hover:bg-slate-950/40 transition-colors">
                  <td className="py-2.5 text-slate-400">{evt.timestamp}</td>
                  <td className="py-2.5 font-sans font-medium text-slate-200">{evt.recipientOrg}</td>
                  <td className="py-2.5 text-slate-400 uppercase text-[10px]">{evt.dataCategory}</td>
                  <td className="py-2.5">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-emerald-300 font-sans font-semibold">
                      {evt.calculationModel}
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-500 text-[10px]">{evt.zkProofHash}</td>
                  <td className="py-2.5 text-right font-bold text-emerald-400">
                    +${evt.compensationUsd.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
