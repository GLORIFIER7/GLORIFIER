import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, LogIn, LogOut, Mail, UserPlus, X } from 'lucide-react';
import { User } from 'firebase/auth';
import { loginWithEmail, loginWithSocialProvider, registerWithEmail, resetPassword, logout, SOCIAL_PROVIDER_REGISTRY, SocialProviderId } from '../lib/firebase';

interface AuthPanelProps {
  currentUser: User | null;
}

const friendlyAuthError = (error: any) => {
  const code = error?.code || '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-login-credentials': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account exists for this email.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'An account already exists for this email. Sign in instead.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in popup. Allow popups and try again.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase yet.',
    'auth/unauthorized-domain': `Google sign-in is not authorized for ${window.location.hostname}. Add this production domain to Firebase Authentication > Settings > Authorized domains.`,
    'auth/invalid-api-key': 'Firebase configuration is invalid. Please check the production Firebase configuration.',
    'auth/network-request-failed': 'Network connection to Firebase failed. Check your connection and try again.',
  };
  return map[code] || error?.message || 'Authentication failed. Please try again.';
};

export const AuthPanel: React.FC<AuthPanelProps> = ({ currentUser }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{type:'error'|'success'; text:string} | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('glorifier_google_auth_error');
      if (!raw) return;
      sessionStorage.removeItem('glorifier_google_auth_error');
      const parsed = JSON.parse(raw);
      setMessage({ type: 'error', text: friendlyAuthError({ code: parsed?.code, message: parsed?.message }) });
      setOpen(true);
    } catch {}
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!email.trim() || !password) {
      setMessage({ type: 'error', text: 'Enter your email and password.' });
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
        setMessage({ type: 'success', text: 'Signed in successfully.' });
      } else {
        if (password.length < 6) throw new Error('Password must be at least 6 characters.');
        await registerWithEmail(email, password, name);
        setMessage({ type: 'success', text: 'Account created and signed in.' });
      }
      setPassword('');
      setTimeout(() => setOpen(false), 500);
    } catch (error) {
      setMessage({ type: 'error', text: friendlyAuthError(error) });
    } finally {
      setBusy(false);
    }
  };

  const socialLogin = async (provider: SocialProviderId) => {
    if (!SOCIAL_PROVIDER_REGISTRY[provider].enabled) { setMessage({ type: 'error', text: `${SOCIAL_PROVIDER_REGISTRY[provider].label} sign-in is not enabled yet.` }); return; }
    setBusy(true);
    setMessage(null);
    try {
      await loginWithSocialProvider(provider);
      setMessage({ type: 'success', text: `${SOCIAL_PROVIDER_REGISTRY[provider].label} sign-in successful.` });
      setTimeout(() => setOpen(false), 500);
    } catch (error) {
      setMessage({ type: 'error', text: friendlyAuthError(error) });
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Enter your email first, then choose Forgot password.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await resetPassword(email);
      setMessage({ type: 'success', text: 'Password reset email sent. Check your inbox.' });
    } catch (error) {
      setMessage({ type: 'error', text: friendlyAuthError(error) });
    } finally {
      setBusy(false);
    }
  };

  const signedInLabel = currentUser?.displayName || currentUser?.email || 'Signed in';

  return (
    <>
      {currentUser ? (
        <div className="flex items-center gap-2">
          <div className="hidden sm:block max-w-32 truncate text-xs text-slate-300" title={currentUser.email || ''}>
            {signedInLabel}
          </div>
          <button
            onClick={() => logout().catch(error => setMessage({ type: 'error', text: friendlyAuthError(error) }))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-rose-500/40 hover:text-rose-300"
            title="Sign out of the Command Center"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setOpen(true); setMessage(null); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
        >
          <LogIn className="h-3.5 w-3.5" /> Sign in
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <KeyRound className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-widest">GLORIFIER AI</span>
                </div>
                <h2 className="mt-1 text-xl font-bold text-white">Command Center Access</h2>
                <p className="mt-1 text-xs text-slate-400">One account for the full GLORIFIER AI Command Center.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-2">
              {(Object.entries(SOCIAL_PROVIDER_REGISTRY) as [SocialProviderId, {label:string; enabled:boolean}][]).map(([id, config]) => (
                <button
                  key={id}
                  onClick={() => socialLogin(id)}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-white px-4 py-3 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="font-bold">{config.label === 'Google' ? 'G' : config.label[0]}</span>
                  `Continue with ${config.label}`
                </button>
              ))}
            </div>

            <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-500">
              <span className="h-px flex-1 bg-slate-800" /> or email/password <span className="h-px flex-1 bg-slate-800" />
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === 'register' && (
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Display name (optional)</label>
                  <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500" />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-slate-400">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-500" placeholder="you@example.com" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 pr-10 text-sm text-white outline-none focus:border-emerald-500" placeholder="At least 6 characters" />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {message && (
                <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${message.type === 'error' ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
                  {message.type === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                  <span>{message.text}</span>
                </div>
              )}

              <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                {mode === 'login' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {busy ? 'Please wait...' : mode === 'login' ? 'Sign in to Command Center' : 'Create account'}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between text-xs">
              <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage(null); }} className="text-emerald-400 hover:text-emerald-300">
                {mode === 'login' ? 'Create a new account' : 'I already have an account'}
              </button>
              {mode === 'login' && <button onClick={forgot} disabled={busy} className="text-slate-400 hover:text-slate-200">Forgot password?</button>}
            </div>

            <p className="mt-5 text-[10px] leading-5 text-slate-500">
              Authentication is handled by Firebase. Your password is never stored by this app code.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
