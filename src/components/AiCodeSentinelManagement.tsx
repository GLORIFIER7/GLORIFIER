import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Cpu, 
  Sparkles, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Trash2, 
  Edit3, 
  Plus, 
  Play, 
  Activity, 
  Terminal, 
  FileCode2, 
  ArrowRight, 
  Zap, 
  Sliders, 
  Check, 
  X, 
  Clock, 
  Search,
  ChevronDown,
  Layers,
  Flame,
  ShieldAlert
} from 'lucide-react';
import { CodeSentinelError, SentinelBotState, SentinelLogEntry, ErrorSeverity, ErrorLifecycleStatus } from '../types';

interface AiCodeSentinelManagementProps {
  errors: CodeSentinelError[];
  sentinelState: SentinelBotState;
  onUpdateError: (updatedError: CodeSentinelError) => void;
  onDeleteError: (errorId: string) => void;
  onCreateError: (newError: CodeSentinelError) => void;
  onAutoFixError: (errorId: string) => void;
  onToggleMonitoring: (enabled: boolean) => void;
  onToggleAutoHeal: (enabled: boolean) => void;
  onOpenCoWorkingStudio?: () => void;
}

export const AiCodeSentinelManagement: React.FC<AiCodeSentinelManagementProps> = ({
  errors,
  sentinelState,
  onUpdateError,
  onDeleteError,
  onCreateError,
  onAutoFixError,
  onToggleMonitoring,
  onToggleAutoHeal,
  onOpenCoWorkingStudio
}) => {
  const [selectedError, setSelectedError] = useState<CodeSentinelError | null>(errors[0] || null);
  const [isFixModalOpen, setIsFixModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [collaborateLoading, setCollaborateLoading] = useState(false);
  const [gptGeminiCollaborationResult, setGptGeminiCollaborationResult] = useState<any | null>(null);

  // Edit modal state
  const [editMessage, setEditMessage] = useState('');
  const [editPatch, setEditPatch] = useState('');
  const [editStatus, setEditStatus] = useState<ErrorLifecycleStatus>('active');

  // Create modal state
  const [newErrorCode, setNewErrorCode] = useState('ERR_503_GEMINI_HIGH_DEMAND');
  const [newErrorMessage, setNewErrorMessage] = useState('Gemini call [model=gemini-3.8-flash] returned 503 UNAVAILABLE');
  const [newErrorSource, setNewErrorSource] = useState('server.ts:callGeminiSafe');
  const [newErrorSeverity, setNewErrorSeverity] = useState<ErrorSeverity>('high');

  // Sync selected error if list changes
  useEffect(() => {
    if (selectedError) {
      const current = errors.find(e => e.id === selectedError.id);
      if (current) setSelectedError(current);
    } else if (errors.length > 0) {
      setSelectedError(errors[0]);
    }
  }, [errors]);

  const filteredErrors = errors.filter(err => {
    if (filterSeverity !== 'all' && err.severity !== filterSeverity) return false;
    if (filterStatus !== 'all' && err.status !== filterStatus) return false;
    return true;
  });

  // Trigger GPT + Gemini live code fix collaboration
  const handleRunGptCollaboration = async (error: CodeSentinelError) => {
    setCollaborateLoading(true);
    try {
      const res = await fetch('/api/ai/collaborate-gpt-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorCode: error.code,
          errorMessage: error.message,
          errorSource: error.source,
          codeSnippet: error.patchDiff || ''
        })
      });
      const data = await res.json();
      setGptGeminiCollaborationResult(data);
      setIsFixModalOpen(true);
    } catch (e) {
      console.warn('GPT collaboration request failed:', e);
      setGptGeminiCollaborationResult({
        success: false,
        errorCode: error.code,
        gptAnalysis: 'Collaboration unavailable. No provider response was verified.',
        geminiAnalysis: 'Collaboration unavailable. No provider response was verified.',
        collaborativeFixProposal: 'No fix proposal was generated because the collaboration backend did not return verified output.',
        patchDiff: '',
        collaboratingModels: []
      });
      setIsFixModalOpen(true);
    } finally {
      setCollaborateLoading(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (err: CodeSentinelError) => {
    setSelectedError(err);
    setEditMessage(err.message);
    setEditPatch(err.patchDiff || '');
    setEditStatus(err.status);
    setIsEditModalOpen(true);
  };

  // Save Edit
  const handleSaveEdit = () => {
    if (!selectedError) return;
    const updated: CodeSentinelError = {
      ...selectedError,
      message: editMessage,
      patchDiff: editPatch,
      status: editStatus
    };
    onUpdateError(updated);
    setIsEditModalOpen(false);
  };

  // Handle Create New Probe / Error Watch
  const handleSaveCreate = () => {
    const newErr: CodeSentinelError = {
      id: `err-${Date.now()}`,
      code: newErrorCode,
      message: newErrorMessage,
      source: newErrorSource,
      severity: newErrorSeverity,
      status: 'active',
      timestamp: new Date().toISOString(),
      occurrences: 1,
      rootCause: 'Manual watch record created in the interface; runtime detection has not been verified.',
      gptAnalysis: 'NOT RUN — no provider-backed analysis has been recorded.',
      geminiAnalysis: 'NOT RUN — no provider-backed analysis has been recorded.',
      collaborativeFixProposal: 'No fix proposal has been generated or tested.',
      patchDiff: '',
      canAutoFix: false,
      assignedBot: 'unassigned'
    };
    onCreateError(newErr);
    setIsCreateModalOpen(false);
    setSelectedError(newErr);
  };

  const getSeverityBadge = (severity: ErrorSeverity) => {
    switch (severity) {
      case 'critical':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">CRITICAL</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">HIGH</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-700/40 text-slate-400 border border-slate-700">LOW</span>;
    }
  };

  const getStatusBadge = (status: ErrorLifecycleStatus) => {
    switch (status) {
      case 'resolved':
        return <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Recorded resolved · evidence not verified</span>;
      case 'patch_ready':
        return <span className="flex items-center gap-1 text-amber-300 text-xs font-semibold"><Zap className="w-3.5 h-3.5" /> Patch record only</span>;
      case 'analyzing':
        return <span className="flex items-center gap-1 text-cyan-300 text-xs font-semibold"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analysis status not verified</span>;
      default:
        return <span className="flex items-center gap-1 text-rose-400 text-xs font-semibold"><AlertTriangle className="w-3.5 h-3.5" /> Active</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: 24/7 AI Code Sentinel Status */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
                <Bot className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white tracking-tight">AI Code Sentinel — issue management</h2>
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    MONITORING NOT VERIFIED
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400">
                  This screen manages issue records. Runtime monitoring, model availability, verified patches, and automatic healing are not established by this interface.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics & Controls */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <Activity className="w-5 h-5 text-emerald-400" />
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Health status</div>
                <div className="text-lg font-bold text-emerald-400 font-mono">NOT VERIFIED</div>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-teal-400" />
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Recorded resolved entries</div>
                <div className="text-lg font-bold text-teal-300 font-mono">{sentinelState.resolvedTotalCount}</div>
              </div>
            </div>

            <button
              onClick={() => onToggleAutoHeal(!sentinelState.autoHealEnabled)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                sentinelState.autoHealEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 shadow-sm'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Local auto-heal preference: {sentinelState.autoHealEnabled ? 'ON' : 'OFF'} · execution NOT VERIFIED</span>
            </button>

            {onOpenCoWorkingStudio && (
              <button
                onClick={onOpenCoWorkingStudio}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-950/40 transition-colors"
                title="Open Interactive Work Together with GPT & Gemini Studio"
              >
                <Sparkles className="w-4 h-4 text-emerald-200" />
                <span>Work Together with GPT</span>
              </button>
            )}

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Watch Probe</span>
            </button>
          </div>
        </div>

        {/* Collaborating Models Banner */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span className="font-medium text-slate-300">Configured model labels (availability not verified):</span>
            <span className="text-amber-300 font-mono font-semibold">Provider availability NOT VERIFIED</span>
          </div>

          <div className="flex items-center gap-2 text-slate-400 text-[11px]">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Actual scan cadence: NOT VERIFIED</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout: Error List vs Deep Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Error Registry with Filters (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Internal Runtime Issues & Error Probes</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                {filteredErrors.length}
              </span>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 text-xs">
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="patch_ready">Patch Ready</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>

          {/* List of Error Items */}
          <div className="space-y-3">
            {filteredErrors.map((err) => {
              const isSelected = selectedError?.id === err.id;
              return (
                <div
                  key={err.id}
                  onClick={() => setSelectedError(err)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    isSelected
                      ? 'bg-slate-850 border-emerald-500/60 shadow-lg shadow-emerald-950/20'
                      : 'bg-slate-900 hover:bg-slate-850/70 border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getSeverityBadge(err.severity)}
                        <span className="font-mono text-xs font-bold text-white tracking-wide">{err.code}</span>
                        <span className="text-[11px] text-slate-400 font-mono">({err.source})</span>
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2">{err.message}</p>
                    </div>

                    <div className="text-right space-y-1">
                      {getStatusBadge(err.status)}
                      <div className="text-[10px] text-slate-400">{err.timestamp}</div>
                    </div>
                  </div>

                  {/* Collaborative Bot Tag & CRUD Quick Actions */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                      <Bot className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Bot: <strong className="text-slate-300">{err.assignedBot}</strong></span>
                      <span>•</span>
                      <span>{err.occurrences}x detected</span>
                    </div>

                    {/* Quick CRUD Action Buttons */}
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {err.status !== 'resolved' && (
                        <button
                          onClick={() => onAutoFixError(err.id)}
                          className="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          title="Apply Collaborative Auto-Fix"
                        >
                          <Zap className="w-3 h-3 text-emerald-400" />
                          <span>Auto-Fix</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleRunGptCollaboration(err)}
                        className="px-2.5 py-1 rounded bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        title="Work together with OpenAI GPT-4o and Gemini to diagnose and fix this error"
                      >
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        <span>Work with GPT to Fix</span>
                      </button>

                      <button
                        onClick={() => handleOpenEdit(err)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                        title="Edit Error / Patch"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onDeleteError(err.id)}
                        className="p-1 rounded bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 transition-colors"
                        title="Delete / Dismiss Error"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredErrors.length === 0 && (
              <div className="text-center py-12 bg-slate-900/40 border border-slate-800/80 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-white">All Clear! No Matching Errors</h4>
                <p className="text-xs text-slate-400 mt-1">No issue records match these filters. This does not prove that monitoring ran or that the system is clean.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Deep Collaborative Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {selectedError ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 sticky top-20 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Sentinel Collaborative Diagnostics</h3>
                </div>
                {getSeverityBadge(selectedError.severity)}
              </div>

              {/* Error Details */}
              <div className="space-y-2">
                <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">Root Cause Analysis</div>
                <p className="text-xs text-slate-200 bg-slate-950 p-3 rounded-lg border border-slate-800/80 leading-relaxed">
                  {selectedError.rootCause}
                </p>
              </div>

              {/* OpenAI GPT-4o Analysis Card */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>OpenAI GPT-4o Diagnostic:</span>
                </div>
                <div className="text-xs text-slate-300 bg-emerald-950/20 border border-emerald-500/20 p-3 rounded-lg leading-relaxed">
                  {selectedError.gptAnalysis}
                </div>
              </div>

              {/* Google Gemini 3.8 Flash Peer Review Card */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-teal-400">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Google Gemini 3.8 Flash Review:</span>
                </div>
                <div className="text-xs text-slate-300 bg-teal-950/20 border border-teal-500/20 p-3 rounded-lg leading-relaxed">
                  {selectedError.geminiAnalysis}
                </div>
              </div>

              {/* Collaborative Patch Diff */}
              {selectedError.patchDiff && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300">Synthesized Patch (Unified Diff)</span>
                    <span className="text-[10px] text-emerald-400 font-mono">Safety assessment: NOT VERIFIED</span>
                  </div>
                  <pre className="text-[11px] font-mono bg-slate-950 p-3 rounded-lg border border-slate-800 text-emerald-300 overflow-x-auto whitespace-pre leading-normal">
                    {selectedError.patchDiff}
                  </pre>
                </div>
              )}

              {/* Inspector Action Footer */}
              <div className="pt-2 flex flex-col gap-2">
                {selectedError.status !== 'resolved' ? (
                  <button
                    onClick={() => onAutoFixError(selectedError.id)}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Apply Collaborative Hot-Patch Now</span>
                  </button>
                ) : (
                  <div className="w-full py-2 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold text-center flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Marked resolved in the issue record · production fix NOT VERIFIED ({selectedError.autoFixedAt || 'no verification timestamp'})</span>
                  </div>
                )}

                <button
                  onClick={() => handleRunGptCollaboration(selectedError)}
                  disabled={collaborateLoading}
                  className="w-full py-2 px-4 rounded-xl font-semibold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {collaborateLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" /> : <Sparkles className="w-3.5 h-3.5 text-cyan-400" />}
                  <span>Collaborate to GPT to Fix</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
              <Terminal className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs">Select an issue on the left to inspect multi-model collaborative diagnostics.</p>
            </div>
          )}
        </div>
      </div>

      {/* Local UI event log; it is not a live monitoring activity stream. */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Recorded Sentinel issue activity (runtime execution not verified)</h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">Local UI event log · monitoring not verified</span>
        </div>

        <div className="space-y-2">
          {sentinelState.sentinelLogs.map((log) => (
            <div key={log.id} className="text-xs p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-start gap-3">
              <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap pt-0.5">{log.timestamp}</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase whitespace-nowrap ${
                log.action === 'AUTO_FIX' ? 'bg-emerald-500/20 text-emerald-300' :
                log.action === 'GPT_COLLABORATE' ? 'bg-cyan-500/20 text-cyan-300' :
                log.action === 'DETECT' ? 'bg-amber-500/20 text-amber-300' :
                log.action === 'DELETE' ? 'bg-rose-500/20 text-rose-300' :
                'bg-slate-800 text-slate-400'
              }`}>
                {log.action}
              </span>
              <span className="text-slate-300 flex-1">{log.details}</span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                {log.model}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL 1: Live GPT + Gemini Collaboration Runner */}
      {isFixModalOpen && gptGeminiCollaborationResult && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">GPT & Gemini Code Collaboration</h3>
                  <p className="text-xs text-slate-400">Collaborative consensus fix for {gptGeminiCollaborationResult.errorCode}</p>
                </div>
              </div>
              <button onClick={() => setIsFixModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" /> OpenAI GPT-4o Systems Proposal:
                </div>
                <div className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed">
                  {gptGeminiCollaborationResult.gptAnalysis}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" /> Google Gemini 3.8 Flash Peer Review:
                </div>
                <div className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed">
                  {gptGeminiCollaborationResult.geminiAnalysis}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-bold text-cyan-400">Production Unified Patch:</div>
                <pre className="text-xs font-mono bg-slate-950 p-3 rounded-lg border border-slate-800 text-emerald-300 overflow-x-auto">
                  {gptGeminiCollaborationResult.patchDiff}
                </pre>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsFixModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Close
              </button>
              {selectedError && (
                <button
                  onClick={() => {
                    onAutoFixError(selectedError.id);
                    setIsFixModalOpen(false);
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply Patch & Heal Code</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit / Update Error & Patch (CRUD Update) */}
      {isEditModalOpen && selectedError && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Edit Issue & Patch Configuration</h3>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Error Message / Description</label>
                <textarea
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Patch Diff Snippet</label>
                <textarea
                  value={editPatch}
                  onChange={(e) => setEditPatch(e.target.value)}
                  rows={5}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-emerald-300 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Lifecycle Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ErrorLifecycleStatus)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="active">Active</option>
                  <option value="patch_ready">Patch Ready</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Create New Error Watch Probe (CRUD Create) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Create Manual Issue Record</h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Error Code Identifier</label>
                <input
                  type="text"
                  value={newErrorCode}
                  onChange={(e) => setNewErrorCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Source Component / File</label>
                <input
                  type="text"
                  value={newErrorSource}
                  onChange={(e) => setNewErrorSource(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Error Message / Symptom</label>
                <textarea
                  value={newErrorMessage}
                  onChange={(e) => setNewErrorMessage(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Severity</label>
                <select
                  value={newErrorSeverity}
                  onChange={(e) => setNewErrorSeverity(e.target.value as ErrorSeverity)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="critical">Critical (500 panic, system failure)</option>
                  <option value="high">High (503 high demand, quota spike)</option>
                  <option value="medium">Medium (rate limit, performance lag)</option>
                  <option value="low">Low (warning, epsilon advisory)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCreate}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md"
              >
                Register Probe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
