import { Device } from '@capacitor/device';
import { auth } from '../firebase';

export interface GlorifierDeviceSnapshot {
  deviceId: string;
  platform: string;
  manufacturer?: string;
  model?: string;
  osName?: string;
  osVersion?: string;
  webViewVersion?: string;
  appVersion?: string;
  appBuild?: string;
  language?: string;
  timezone?: string;
  isVirtual?: boolean;
  capturedAt: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

export async function collectDeviceSnapshot(): Promise<GlorifierDeviceSnapshot> {
  const [info, id, battery, language, app] = await Promise.all([
    Device.getInfo(),
    Device.getId(),
    Device.getBatteryInfo().catch(() => ({ batteryLevel: undefined, isCharging: undefined })),
    Device.getLanguageTag().catch(() => ({ value: undefined })),
    Device.getAppInfo().catch(() => ({ version: undefined, build: undefined }))
  ]);

  return {
    deviceId: id.identifier,
    platform: info.platform,
    manufacturer: info.manufacturer || undefined,
    model: info.model || undefined,
    osName: info.operatingSystem || undefined,
    osVersion: info.osVersion || undefined,
    webViewVersion: info.webViewVersion || undefined,
    appVersion: app.version || undefined,
    appBuild: app.build || undefined,
    language: language.value || undefined,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
    isVirtual: info.isVirtual,
    capturedAt: new Date().toISOString()
  };
}

export async function registerCurrentDevice(): Promise<{ device: GlorifierDeviceSnapshot; registeredAt: string }> {
  const device = await collectDeviceSnapshot();
  const response = await fetch('/api/mobile/device/register', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(device)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Device registration failed (${response.status})`);
  return payload;
}

export async function getCurrentDevice(): Promise<{ device: GlorifierDeviceSnapshot | null }> {
  const response = await fetch('/api/mobile/device/me', {
    method: 'GET',
    headers: await authHeaders(),
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Device lookup failed (${response.status})`);
  return payload;
}

export async function sendDeviceTelemetry(event: {
  eventType: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const response = await fetch('/api/mobile/device/telemetry', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      ...event,
      occurredAt: new Date().toISOString()
    })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Device telemetry failed (${response.status})`);
  }
}

export async function revokeCurrentDevice(): Promise<void> {
  const response = await fetch('/api/mobile/device/me', {
    method: 'DELETE',
    headers: await authHeaders()
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Device revocation failed (${response.status})`);
  }
}
