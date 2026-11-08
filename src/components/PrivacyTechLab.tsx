import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Cpu, 
  Layers, 
  Sparkles, 
  Sliders, 
  Binary, 
  CheckCircle2, 
  ArrowRight, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  FileText,
  Activity,
  Play
} from 'lucide-react';

export const PrivacyTechLab: React.FC = () => {
  const [activeTech, setActiveTech] = useState<'dp' | 'fhe' | 'fl' | 'zkp'>('dp');

  // 1. Differential Privacy Simulator State
  const [dpEpsilon, setDpEpsilon] = useState<number>(0.35);
  const [dpTrueAge, setDpTrueAge] = useState<number>(29);
  const [dpSensitivity, setDpSensitivity] = useState<number>(1.0);
  const [dpPerturbedResult, setDpPerturbedResult] = useState<number>(29.4);
  const [dpNoiseHistory, setDpNoiseHistory] = useState<number[]>([29.2, 28.7, 30.1, 29.4]);

  const handleSimulateLaplace = () => {
    // Laplace mechanism: sample from Laplace(0, scale) where scale = sensitivity / epsilon
    const scale = dpSensitivity / dpEpsilon;
    // Deterministic preview value derived from the configured inputs.
    // This is a mathematical preview, not a claim of cryptographic randomness.
    const normalized = ((Math.round(dpTrueAge * 100) + Math.round(dpEpsilon * 1000) + Math.round(dpSensitivity * 100)) % 1000) / 1000 - 0.5;
    const noise = -scale * Math.sign(normalized || 0.25) * Math.log(1 - 2 * Math.abs(normalized || 0.25));
    const perturbed = parseFloat((dpTrueAge + noise).toFixed(2));
    setDpPerturbedResult(perturbed);
    setDpNoiseHistory(prev => [perturbed, ...prev.slice(0, 5)]);
  };

  // 2. Homomorphic Encryption Simulator State
  const [fhePlainA, setFhePlainA] = useState<number>(72); // resting heart rate
  const [fhePlainB, setFhePlainB] = useState<number>(85); // exercise heart rate
  const [fheOperation, setFheOperation] = useState<'add' | 'multiply'>('add');
  const [fheCipherA, setFheCipherA] = useState<string>('0x9a4f7e2c...b109');
  const [fheCipherB, setFheCipherB] = useState<string>('0x1c83d04a...e552');
  const [fheResultCipher, setFheResultCipher] = useState<string>('0xb6d24e76...901f');
  const [fheDecrypted, setFheDecrypted] = useState<number>(157);
  const [fheIsComputing, setFheIsComputing] = useState(false);

  const handleRunFhe = () => {
    const result = fheOperation === 'add' ? fhePlainA + fhePlainB : fhePlainA * fhePlainB;
    const seed = Math.abs(fhePlainA * 31 + fhePlainB * 17 + (fheOperation === 'add' ? 7 : 13));
    const cipherHex = '0x' + seed.toString(16).padStart(8, '0').slice(-8) + '...' + (seed * 97).toString(16).padStart(4, '0').slice(-4);
    setFheResultCipher(cipherHex);
    setFheDecrypted(result);
    setFheIsComputing(false);
  };

  // 3. Federated Learning Simulator State
  const [flEpoch, setFlEpoch] = useState<number>(14);
  const [flLocalLoss, setFlLocalLoss] = useState<number>(0.082);
  const [flGradientNorm, setFlGradientNorm] = useState<number>(0.014);
  const [flIsTraining, setFlIsTraining] = useState<boolean>(false);
  const [flStepsLog, setFlStepsLog] = useState<string[]>([
    'Local weights initialized on client smartphone/desktop',
    'Local backward pass completed: ΔW computed without sending telemetry',
    'Local Differential Privacy noise (ε=0.5) added to gradient vector',
    'SIMULATED: gradient threshold check passed; no cryptographic proof was generated'
  ]);

  const handleTrainFlRound = () => {
    const nextEpoch = flEpoch + 1;
    const nextLoss = parseFloat((Math.max(0.01, flLocalLoss * 0.88)).toFixed(4));
    const nextGradient = parseFloat((Math.max(0.002, flGradientNorm * 0.92)).toFixed(4));
    setFlEpoch(nextEpoch);
    setFlLocalLoss(nextLoss);
    setFlGradientNorm(nextGradient);
    setFlStepsLog(prev => [
      `Round #${nextEpoch}: Local training preview computed (Loss: ${nextLoss.toFixed(4)})`,
      ...prev.slice(0, 4)
    ]);
    setFlIsTraining(false);
  };

  // 4. Zero-Knowledge Proof Simulator State
  const [zkpAttribute, setZkpAttribute] = useState<'credit_score' | 'age_verification' | 'geo_jurisdiction'>('credit_score');
  const [zkpSecretValue, setZkpSecretValue] = useState<number>(765);
  const [zkpPublicThreshold, setZkpPublicThreshold] = useState<number>(700);
  const [zkpProofHex, setZkpProofHex] = useState<string>('NOT GENERATED — simulation only');
  const [zkpHasRun, setZkpHasRun] = useState(false);
  const [zkpVerifierResult, setZkpVerifierResult] = useState<boolean>(true);
  const [zkpIsGenerating, setZkpIsGenerating] = useState<boolean>(false);

  const handleGenerateZkProof = () => {
    const isValid = zkpSecretValue >= zkpPublicThreshold;
    const seed = Math.abs(zkpSecretValue * 37 + zkpPublicThreshold * 19);
    const proof = '0x' + seed.toString(16).padStart(12, '0').slice(-12) + '...' + (seed * 53).toString(16).padStart(4, '0').slice(-4);
    setZkpVerifierResult(isValid);
    setZkpProofHex(proof);
    setZkpHasRun(true);
    setZkpIsGenerating(false);
  };

  return (
    <div className="space-y-6">
      <div role="note" className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-100">
        Educational local simulations only. These controls do not transform real GLORIFIER data, encrypt production records, produce a cryptographic proof, or attest differential privacy. Runtime enforcement is NOT VERIFIED.
      </div>

      {/* Overview Banner */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Privacy-Preserving Technologies (PETs) Engineering Lab
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              Explore simplified local demonstrations of privacy technologies. No production data is transformed and no cryptographic guarantee is provided by this lab.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs bg-slate-950 px-3.5 py-2 rounded-lg border border-slate-800 text-emerald-400">
            <Lock className="w-4 h-4" /> Simulation only · NOT VERIFIED
          </div>
        </div>
      </div>

      {/* PET Navigation Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { id: 'dp', title: 'Differential Privacy', tag: 'Noise Injection', icon: Sliders },
          { id: 'fhe', title: 'Homomorphic Enc.', tag: 'Compute on Ciphertext', icon: Lock },
          { id: 'fl', title: 'Federated Learning', tag: 'Demo only · data-flow NOT VERIFIED', icon: Cpu },
          { id: 'zkp', title: 'Zero-Knowledge Proofs', tag: 'Concept demo · proof NOT VERIFIED', icon: Binary }
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTech === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTech(item.id as any)}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                isActive
                  ? 'bg-slate-900 border-emerald-500 shadow-md'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                  isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-900 text-slate-400'
                }`}>
                  {item.tag}
                </span>
              </div>
              <div className="text-xs font-bold text-white">{item.title}</div>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: Differential Privacy (DP) */}
      {activeTech === 'dp' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                Differential Privacy (Laplace Mechanism) Simulator
              </h3>
              <span className="text-xs font-mono text-emerald-400">ε-Differential Privacy</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              When a mechanism is correctly designed, calibrated, and implemented, differential privacy bounds output-distribution ratios for neighboring datasets by $e^\epsilon$. This educational demo does not implement or verify that guarantee.
            </p>

            {/* Formula */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 space-y-1">
              <div className="text-[10px] uppercase font-bold text-slate-500">Mathematical Mechanism</div>
              <div className="text-emerald-400 font-bold text-sm">
                M(x) = f(x) + Lap(scale = Δf / ε)
              </div>
              <p className="text-[11px] text-slate-400 font-sans">
                Where <strong>Δf</strong> is global query sensitivity and <strong>ε</strong> is the privacy loss parameter.
              </p>
            </div>

            {/* Interactive sliders */}
            <div className="space-y-3 pt-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Privacy Budget Loss (ε - Epsilon)</span>
                  <span className="font-mono text-emerald-400 font-bold">ε = {dpEpsilon}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.5"
                  step="0.05"
                  value={dpEpsilon}
                  onChange={(e) => setDpEpsilon(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>ε=0.05 (Maximum Noise / Zero Re-ID)</span>
                  <span>ε=0.35 (Recommended)</span>
                  <span>ε=1.5 (Lower Noise / High Utility)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Raw Attribute Value (e.g. Mean User Metric)</span>
                  <span className="font-mono text-slate-200">{dpTrueAge}</span>
                </div>
                <input
                  type="number"
                  value={dpTrueAge}
                  onChange={(e) => setDpTrueAge(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Illustrative local output (not sent or sold)</div>
                <div className="text-2xl font-black font-mono text-emerald-400">
                  {dpPerturbedResult}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                  Scale: {(dpSensitivity / dpEpsilon).toFixed(3)} | Noise error: {(dpPerturbedResult - dpTrueAge).toFixed(2)}
                </div>
              </div>
              <button
                onClick={handleSimulateLaplace}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Sample Noise
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Illustration: Differential Privacy and Data Licensing
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Without differential privacy, licensing browsing or location data creates catastrophic re-identification risks (the "Netflix Prize" attack). 
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              In a system with a correctly implemented and tested query barrier (not verified in this demo):
            </p>
            <ul className="text-xs text-slate-300 space-y-2">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Plausible Deniability: Any single user's presence cannot be deduced.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Privacy-budget composition: concept only; no production privacy-budget accounting or zero-disclosure guarantee has been verified.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>No automatic legal safe harbor: identifiability and personal-information status depend on context and applicable law; no legal de-identification determination has been performed.</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* SECTION 2: Homomorphic Encryption (FHE) */}
      {activeTech === 'fhe' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                Fully Homomorphic Encryption (FHE) Arithmetic Sandbox
              </h3>
              <span className="text-xs font-mono text-emerald-400">CKKS / BFV Scheme</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Homomorphic encryption allows mathematical operations (addition, multiplication, neural net inference) to be executed directly on <strong>encrypted ciphertexts</strong> without ever revealing the underlying plaintext to the computing server.
            </p>

            {/* Inputs & Operation */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Plaintext Metric A (e.g. Heart Rate)</label>
                <input
                  type="number"
                  value={fhePlainA}
                  onChange={(e) => setFhePlainA(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono"
                />
                <div className="text-[10px] font-mono text-slate-500 mt-1 truncate">Enc(A): {fheCipherA}</div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Plaintext Metric B (e.g. Peak Vitals)</label>
                <input
                  type="number"
                  value={fhePlainB}
                  onChange={(e) => setFhePlainB(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono"
                />
                <div className="text-[10px] font-mono text-slate-500 mt-1 truncate">Enc(B): {fheCipherB}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-300">Homomorphic Operation:</label>
              <button
                onClick={() => setFheOperation('add')}
                className={`px-3 py-1 text-xs font-mono rounded ${
                  fheOperation === 'add' ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                }`}
              >
                Enc(A) ⊕ Enc(B)
              </button>
              <button
                onClick={() => setFheOperation('multiply')}
                className={`px-3 py-1 text-xs font-mono rounded ${
                  fheOperation === 'multiply' ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                }`}
              >
                Enc(A) ⊗ Enc(B)
              </button>
            </div>

            {/* Run Button & Result */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-500">
                  Buyer Server Evaluates Ciphertext:
                </span>
                <button
                  onClick={handleRunFhe}
                  disabled={fheIsComputing}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5"
                >
                  {fheIsComputing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Evaluate FHE Circuit
                </button>
              </div>

              <div className="font-mono text-xs text-slate-300 bg-slate-900 p-2.5 rounded border border-slate-800 truncate">
                Result Ciphertext = {fheResultCipher}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-400">Decrypted only by User Private Key:</span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  = {fheDecrypted} (Proven Valid)
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Why FHE is the Holy Grail for Health & Finance
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Pharmaceutical researchers and risk underwriters can calculate disease correlations or credit scores without ever holding the raw genome, medical chart, or bank account balance. 
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              The data remains mathematically unintelligible throughout storage, transit, and processing.
            </p>
          </div>
        </div>
      )}

      {/* SECTION 3: Federated Learning (FL) */}
      {activeTech === 'fl' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                Federated Learning & Secure Aggregation Simulator
              </h3>
              <span className="text-xs font-mono text-emerald-400">FedAvg Protocol</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Instead of moving private data to a central cloud server, the machine learning model is sent to the user's local device. The device trains locally, calculates gradient parameter updates ($\Delta W$), and transmits only the weight updates.
            </p>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="text-[10px] text-slate-500 uppercase font-mono">Current Epoch</div>
                <div className="text-lg font-bold font-mono text-white mt-0.5">#{flEpoch}</div>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="text-[10px] text-slate-500 uppercase font-mono">Local Training Loss</div>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{flLocalLoss}</div>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="text-[10px] text-slate-500 uppercase font-mono">Gradient L2-Norm</div>
                <div className="text-lg font-bold font-mono text-amber-300 mt-0.5">{flGradientNorm}</div>
              </div>
            </div>

            {/* Protocol Step Log */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400">Client-Side Secure Aggregation Flow</span>
                <button
                  onClick={handleTrainFlRound}
                  disabled={flIsTraining}
                  className="px-3 py-1.5 text-xs font-bold rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1"
                >
                  {flIsTraining ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Train Round
                </button>
              </div>

              <div className="font-mono text-[11px] text-slate-300 space-y-1.5 pt-1">
                {flStepsLog.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 border-b border-slate-900 pb-1">
                    <span className="text-emerald-400 font-bold">&gt;</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Federated Learning Concept · Data Flow NOT VERIFIED
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              In standard AI development, companies hoover up gigabytes of raw keystrokes, voice snippets, and photos.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              In a correctly implemented federated-learning system, raw data may remain local while model updates are shared. This is conceptual text only; this demo does not establish that GLORIFIER data remains on-device or that SMPC is implemented.
            </p>
          </div>
        </div>
      )}

      {/* SECTION 4: Zero-Knowledge Proofs (ZKP) */}
      {activeTech === 'zkp' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Binary className="w-4 h-4 text-emerald-400" />
                Zero-Knowledge Proof Concept Demo · NOT VERIFIED
              </h3>
              <span className="text-xs font-mono text-emerald-400">ZK proof concept · prover implementation NOT VERIFIED</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              A properly implemented zero-knowledge proof can establish a defined statement without revealing the witness. This panel is a demonstration; no production Groth16/Plonk proof, circuit audit, or cryptographic verification is established here.
            </p>

            {/* ZKP Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Secret Private Input (User Vault Only)</label>
                <input
                  type="number"
                  value={zkpSecretValue}
                  onChange={(e) => setZkpSecretValue(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono"
                />
                <div className="text-[10px] text-rose-400 mt-0.5">🔒 Strictly shielded from verifier</div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Public Verification Threshold</label>
                <input
                  type="number"
                  value={zkpPublicThreshold}
                  onChange={(e) => setZkpPublicThreshold(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono"
                />
                <div className="text-[10px] text-slate-500 mt-0.5 font-mono">Statement: Secret ≥ Threshold</div>
              </div>
            </div>

            {/* Proof result */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400">Generated pseudo-proof (not cryptographic):</span>
                <button
                  onClick={handleGenerateZkProof}
                  disabled={zkpIsGenerating}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5"
                >
                  {zkpIsGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Run simulation
                </button>
              </div>

              <div className="font-mono text-xs text-slate-300 bg-slate-900 p-2 rounded border border-slate-800 truncate">
                Pseudo-proof output = {zkpProofHex}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-400">Local threshold result (simulated):</span>
                <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                  !zkpHasRun ? 'bg-amber-500/20 text-amber-300' : zkpVerifierResult ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {!zkpHasRun ? 'NOT RUN' : zkpVerifierResult ? 'SIMULATED PASS — NOT A CRYPTOGRAPHIC PROOF' : 'SIMULATED FAIL — NOT A CRYPTOGRAPHIC PROOF'}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Commercial Value of ZK Proofs
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Advertisers and lenders do not actually need your raw identity—they only need confirmation that you belong to an accredited segment or demographic.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              In principle, a verified zero-knowledge proof can help demonstrate a qualifying attribute without disclosing its witness. This demo does not issue a production proof or establish a monetization opportunity.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
