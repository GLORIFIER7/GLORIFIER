import React, { useEffect, useState } from 'react';
import { Smartphone, ShieldCheck, RefreshCw, Wifi, Trash2 } from 'lucide-react';
import { registerCurrentDevice, getCurrentDevice, revokeCurrentDevice, type GlorifierDeviceSnapshot } from '../lib/mobile/deviceIntegration';

export const MobileDeviceControl: React.FC = () => {
  const [device, setDevice] = useState<GlorifierDeviceSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const sync = async () => {
    setLoading(true);
    setMessage('');
    try {
      const result = await registerCurrentDevice();
      setDevice(result.device);
      setStatus('connected');
      setMessage('Android device registered with authenticated GLORIFIER control.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Unable to register device');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const result = await getCurrentDevice();
        if (result.device) {
          setDevice(result.device);
          setStatus('connected');
        }
      } catch {
        // A first-time device has no record yet.
      }
    })();
  }, []);

  const revoke = async () => {
    setLoading(true);
    try {
      await revokeCurrentDevice();
      setDevice(null);
      setStatus('idle');
      setMessage('This device connection was revoked.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Unable to revoke device');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Android Device</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Device metadata is sent only after Firebase authentication and remains scoped to your GLORIFIER identity.
          </p>
        </div>
        <span className={`text-[10px] font-mono uppercase ${status === 'connected' ? 'text-emerald-300' : status === 'error' ? 'text-amber-300' : 'text-slate-500'}`}>
          {status === 'connected' ? 'Connected' : status === 'error' ? 'Attention' : 'Not connected'}
        </span>
      </div>

      {device && (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div><span className="text-slate-500">Platform</span><div className="text-slate-200 mt-1">{device.platform}</div></div>
          <div><span className="text-slate-500">Model</span><div className="text-slate-200 mt-1">{device.model || '—'}</div></div>
          <div><span className="text-slate-500">OS</span><div className="text-slate-200 mt-1">{device.osName || '—'} {device.osVersion || ''}</div></div>
          <div><span className="text-slate-500">App</span><div className="text-slate-200 mt-1">{device.appVersion || '—'} {device.appBuild ? `(${device.appBuild})` : ''}</div></div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={() => void sync()} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {device ? 'Sync device' : 'Connect device'}
        </button>
        {device && (
          <button onClick={() => void revoke()} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-xs text-slate-400 hover:text-red-300 hover:bg-slate-900 disabled:opacity-50">
            <Trash2 className="h-3.5 w-3.5" />
            Revoke
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Firebase ID token</span>
        <span className="inline-flex items-center gap-1"><Wifi className="h-3 w-3" /> Authenticated API</span>
      </div>
      {message && <p className="mt-3 text-xs text-slate-400">{message}</p>}
    </section>
  );
};
