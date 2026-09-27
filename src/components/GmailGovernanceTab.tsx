import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  ShieldCheck, 
  Lock, 
  RefreshCw, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  FileText,
  Sliders,
  EyeOff,
  UserCheck
} from 'lucide-react';
import { User } from 'firebase/auth';
import { getAccessToken } from '../lib/firebase';
import { 
  listGmailMessages, 
  getGmailMessage, 
  analyzeEmailForSovereignMonetization,
  sendGmailMessage 
} from '../services/gmailService';
import { GmailAnalysisItem } from '../types';

interface GmailGovernanceTabProps {
  currentUser: User | null;
  onLogin: () => void;
}

export const GmailGovernanceTab: React.FC<GmailGovernanceTabProps> = ({
  currentUser,
  onLogin,
}) => {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<GmailAnalysisItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<GmailAnalysisItem | null>(null);

  // Gmail access is read-only in this dashboard view.
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('Data Governance Notice: Sovereign Privacy Rights');
  const [body, setBody] = useState('Greetings,\n\nIn accordance with CCPA/GDPR personal data rights, this inbox is managed via an AI Data Sovereign Gateway. All consumer profile telemetry is scrubbed and synthesized before licensing.\n\nVerified via DataSovereign AI.');
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  const hasAccessToken = !!getAccessToken();

  const fetchEmails = async () => {
    if (!currentUser || !hasAccessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { messages: msgList } = await listGmailMessages(10);
      if (msgList.length === 0) {
        setMessages([]);
        setLoading(false);
        return;
      }

      const fetchedSummaries = await Promise.all(
        msgList.slice(0, 8).map(async (m) => {
          try {
            return await getGmailMessage(m.id);
          } catch {
            return null;
          }
        })
      );

      const validSummaries = fetchedSummaries.filter((s): s is NonNullable<typeof s> => s !== null);
      const analyzed = validSummaries.map(analyzeEmailForSovereignMonetization);
      setMessages(analyzed);

    } catch (err: any) {
      console.error('Failed to sync Gmail:', err);
      setError(err.message || 'Error connecting to Gmail. Please sign in again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && hasAccessToken && messages.length === 0) {
      fetchEmails();
    }
  }, [currentUser, hasAccessToken]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                <Mail className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Gmail Data Governance
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                READ-ONLY WORKSPACE VIEW
              </span>
            </div>
            <p className="text-sm text-slate-400 max-w-2xl">
              Review selected Gmail metadata and message excerpts only after explicit Google authorization. GLORIFIER does not treat access as proof of ownership, monetization, or guaranteed privacy transformation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!currentUser || !hasAccessToken ? (
              <button
                onClick={onLogin}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
              >
                <UserCheck className="w-4 h-4" />
                <span>Connect & Authorize Gmail</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchEmails}
                  disabled={loading}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'Reading Gmail…' : 'Refresh Gmail'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Scanned Emails</span>
            <div className="text-lg font-bold text-white font-mono mt-0.5">{messages.length}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Records Loaded</span>
            <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
              {messages.length}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Authorization</span>
            <div className="text-lg font-bold text-cyan-400 font-mono mt-0.5">Google OAuth</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Data Handling</span>
            <div className="text-lg font-bold text-amber-400 font-mono mt-0.5">Governed</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button 
            onClick={onLogin} 
            className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold"
          >
            Re-authorize
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {!currentUser || !hasAccessToken ? (
        <div className="p-12 rounded-2xl bg-slate-900/50 border border-slate-800 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Gmail Access Required</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Connect your Google account and grant only the Gmail scopes required by this feature. Access is used to display the authorized Gmail data available to GLORIFIER.
            </p>
          </div>
          <button
            onClick={onLogin}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 inline-flex items-center gap-2"
          >
            <UserCheck className="w-4 h-4" />
            <span>Connect Google & Authorize Gmail</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Email Analysis List */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Authorized Gmail Data</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                  {messages.length} Records
                </span>
              </h3>
              <span className="text-[11px] text-slate-400">Access controlled</span>
            </div>

            {loading && messages.length === 0 ? (
              <div className="p-8 rounded-xl bg-slate-900 border border-slate-800 text-center text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 mx-auto animate-spin text-emerald-400 mb-2" />
                Reading authorized Gmail data...
              </div>
            ) : messages.length === 0 ? (
              <div className="p-8 rounded-xl bg-slate-900 border border-slate-800 text-center text-slate-400 text-xs space-y-2">
                <Mail className="w-6 h-6 mx-auto text-slate-600" />
                <p>No recent messages found or access token expired.</p>
                <button
                  onClick={fetchEmails}
                  className="px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-semibold"
                >
                  Scan Inbox Now
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {messages.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      selectedItem?.id === item.id
                        ? 'bg-slate-900 border-emerald-500/50 shadow-md'
                        : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate max-w-[200px]">
                            {item.sender}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2">
                          {item.snippet}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-emerald-400 font-mono">
                          +${item.estimatedYieldUsd.toFixed(2)}
                        </div>
                        <span className="text-[10px] text-slate-400">{item.date}</span>
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Action: {item.governanceAction}</span>
                      </span>
                      <span className="text-cyan-400 font-mono font-medium">Safe for Buyer Aggregates</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Inspection Panel */}
          <div className="space-y-4">
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Sanitization & Token Inspector</span>
              </h4>

              {selectedItem ? (
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Sender (Masked)</span>
                    <span className="text-slate-200 font-mono mt-0.5 block break-all">{selectedItem.sender}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Category</span>
                    <span className="text-emerald-400 font-semibold mt-0.5 block">{selectedItem.category}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Synthesized Market Insight</span>
                    <p className="text-slate-300 mt-1 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] leading-relaxed">
                      {selectedItem.extractedInsights}
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Calculated Compensation</span>
                    <div className="text-base font-bold text-emerald-400 font-mono mt-1">
                      ${selectedItem.estimatedYieldUsd.toFixed(2)} USD
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Zero-Raw Leak Contract</span>
                    </div>
                    <p className="text-[10px] text-emerald-400/80">
                      Only data explicitly authorized by the connected Google account is shown here. No claim of anonymization, licensing, or compensation is made unless separately verified.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs space-y-2">
                  <EyeOff className="w-6 h-6 mx-auto text-slate-600" />
                  <p>Select an item to inspect the data available to this dashboard.</p>
                </div>
              )}
            </div>

            {/* Statutory Disclaimer */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-2">
              <span className="font-semibold text-slate-300 block">Google Authorization</span>
              <p>
                Gmail access requires explicit Google authentication and the scopes configured for this feature. Keep access limited to what you intend to authorize.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
