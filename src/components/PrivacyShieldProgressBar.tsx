import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  Sparkles, 
  Zap, 
  ArrowUp, 
  Lock, 
  CheckCircle2,
  Shield,
  ChevronRight
} from 'lucide-react';
import { SovereignStats, MonetizationPolicy } from '../types';

interface PrivacyShieldProgressBarProps {
  stats: SovereignStats;
  policy: MonetizationPolicy;
  onUpdatePolicy?: (newPolicy: Partial<MonetizationPolicy>) => void;
  className?: string;
  onNavigateToTab?: (tab: string) => void;
}

export const PrivacyShieldProgressBar: React.FC<PrivacyShieldProgressBarProps> = ({
  stats,
  policy,
  onUpdatePolicy,
  className = '',
  onNavigateToTab
}) => {
  const score = stats.privacyShieldIndex;
  const prevScoreRef = useRef<number>(score);
  const [isLevelingUp, setIsLevelingUp] = useState(false);
  const [levelUpDelta, setLevelUpDelta] = useState(0);
  const [showLevelUpToast, setShowLevelUpToast] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);

  // Audio synthesis for satisfying level-up chime
  const playLevelUpChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        void ctx.resume().catch((error) => console.warn('Audio context resume failed:', error));
      }
      const now = ctx.currentTime;
      // High-resolution melodic chord: C5 -> E5 -> G5 -> C6
      const frequencies = [523.25, 659.25, 783.99, 1046.50];
      frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.04, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
      });
    } catch {
      // AudioContext fails gracefully if browser requires user gesture
    }
  };

  // Watch for policy/stats updates that increase the Privacy Shield score
  useEffect(() => {
    if (score > prevScoreRef.current) {
      const delta = score - prevScoreRef.current;
      setLevelUpDelta(delta);
      setIsLevelingUp(true);
      setShowLevelUpToast(true);

      // Generate burst particle coordinates
      const newParticles = Array.from({ length: 12 }).map((_, i) => ({
        id: Date.now() + i,
        x: (Math.random() - 0.5) * 160,
        y: -20 - Math.random() * 50,
        delay: Math.random() * 0.15
      }));
      setParticles(newParticles);

      playLevelUpChime();

      const timer = setTimeout(() => {
        setIsLevelingUp(false);
      }, 2600);

      const toastTimer = setTimeout(() => {
        setShowLevelUpToast(false);
      }, 5000);

      return () => {
        clearTimeout(timer);
        clearTimeout(toastTimer);
      };
    }
    prevScoreRef.current = score;
  }, [score]);

  // The interface has no independent runtime attestation for privacy enforcement.
  const tier = {
    label: 'NOT VERIFIED: configuration only',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    description: 'Selected privacy targets are configuration only. Data transformation, differential privacy, cryptographic attestation, and tracker quarantine are not verified.',
    color: 'from-amber-400 to-slate-300',
    barGradient: 'from-amber-500 to-slate-500'
  };

  return (
    <div className={`rounded-xl bg-slate-900/90 border transition-all duration-500 p-4 shadow-sm relative overflow-hidden ${
      isLevelingUp 
        ? 'border-emerald-500/90 shadow-[0_0_25px_rgba(16,185,129,0.3)] ring-1 ring-emerald-400/50' 
        : 'border-slate-800'
    } ${className}`}>
      {/* Background Animated Level-Up Sheen */}
      <AnimatePresence>
        {isLevelingUp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-teal-500/15 to-transparent pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Header Row */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Privacy Shield Index</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium font-mono ${tier.badge}`}>
            {tier.label.split(':')[0]}
          </span>
        </div>

        <motion.div
          animate={isLevelingUp ? { rotate: [0, -15, 15, 0], scale: [1, 1.25, 1] } : {}}
          transition={{ duration: 0.6 }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            isLevelingUp 
              ? 'bg-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(52,211,153,0.8)]' 
              : 'bg-emerald-500/10 text-emerald-400'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
        </motion.div>
      </div>

      {/* Main Score & Level-Up Callout */}
      <div className="mt-2 flex items-baseline justify-between relative z-10">
        <div className="flex items-baseline gap-2">
          <motion.span 
            animate={isLevelingUp ? { scale: [1, 1.28, 1], color: ['#34d399', '#6ee7b7', '#34d399'] } : {}}
            transition={{ duration: 0.5 }}
            className="text-2xl font-bold font-mono text-emerald-400 tracking-tight"
          >
            NOT VERIFIED
          </motion.span>
          <span className="text-xs text-slate-400 font-medium">
            {tier.label.split(':')[1]?.trim() || 'NOT VERIFIED'}
          </span>
        </div>

        {/* Level-Up Badge Animation */}
        <AnimatePresence>
          {isLevelingUp && (
            <motion.div
              initial={{ scale: 0, y: 10, opacity: 0 }}
              animate={{ scale: [0, 1.2, 1], y: 0, opacity: 1 }}
              exit={{ scale: 0.8, y: -8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 20 }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 text-slate-950 font-bold text-xs shadow-[0_0_16px_rgba(52,211,153,0.85)]"
            >
              <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
              <span>LEVEL UP! +{levelUpDelta}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Burst Particles on Level Up */}
      {isLevelingUp && (
        <div className="absolute left-1/2 top-10 pointer-events-none z-20">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ 
                x: p.x, 
                y: p.y, 
                opacity: 0, 
                scale: 0.2 
              }}
              transition={{ duration: 0.9, delay: p.delay, ease: 'easeOut' }}
              className="absolute w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]"
            />
          ))}
        </div>
      )}

      {/* The Animated Progress Bar */}
      <div className="mt-3 relative z-10">
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 font-mono">
          <span>Protection Level</span>
          <span className="text-emerald-400 font-semibold">Runtime enforcement: NOT VERIFIED</span>
        </div>

        {/* Outer Bar Track */}
        <div className="w-full h-3 bg-slate-950/90 rounded-full p-0.5 border border-slate-800/90 relative overflow-hidden shadow-inner">
          {/* Milestone Notches */}
          <div className="absolute inset-0 flex justify-between px-6 pointer-events-none z-10">
            <div className="w-[1px] h-full bg-slate-800/60" />
            <div className="w-[1px] h-full bg-slate-800/60" />
            <div className="w-[1px] h-full bg-slate-800/60" />
          </div>

          {/* Animated Fill Bar */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '0%' }}
            transition={{ type: 'spring', stiffness: 55, damping: 14 }}
            className={`h-full rounded-full bg-gradient-to-r ${tier.barGradient} relative shadow-[0_0_12px_rgba(52,211,153,0.5)]`}
          >
            {/* Shimmer Light Reflection */}
            <motion.div
              animate={{ x: ['-100%', '250%'] }}
              transition={{ 
                repeat: Infinity, 
                duration: isLevelingUp ? 0.9 : 2.8, 
                ease: 'easeInOut' 
              }}
              className="absolute top-0 bottom-0 w-16 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12"
            />
          </motion.div>
        </div>
      </div>

      {/* Footer Details & Level-Up Message */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] relative z-10">
        <div className="flex items-center gap-1.5 text-slate-400 truncate">
          <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="truncate">{tier.description}</span>
        </div>

        {onUpdatePolicy ? (
          <button
            onClick={() => {
              onUpdatePolicy({
                brokerMode: 'strict-sovereign',
                globalEpsilon: 0.15,
                allowAdTargeting: false,
                allowInsuranceRiskProfiling: false,
              });
            }}
            className="text-emerald-400 hover:text-emerald-300 font-semibold text-[11px] flex items-center gap-1 shrink-0 ml-2 transition-colors group"
            title="Changes a local policy target only; runtime privacy enforcement is not verified"
          >
            <span>Update local target</span>
            <ArrowUp className="w-3 h-3 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        ) : (
          <span className="text-emerald-400 font-medium font-mono text-[11px] shrink-0">
            NOT VERIFIED
          </span>
        )}
      </div>

      {/* Floating Level-Up Banner */}
      <AnimatePresence>
        {showLevelUpToast && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="mt-2.5 p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-between gap-2 text-xs text-emerald-200"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
              <div className="truncate">
                <span className="font-bold text-emerald-300">Privacy Shield Fortified: </span>
                <span className="text-emerald-100">{tier.label}</span>
              </div>
            </div>
            <button
              onClick={() => setShowLevelUpToast(false)}
              className="text-emerald-400/80 hover:text-emerald-200 text-[10px] uppercase font-bold shrink-0"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
