import { randomUUID } from 'node:crypto';
import { getPostgresPool } from '../db/postgres';

export interface DeviceRegistration {
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
  capturedAt?: string;
}

let initialized = false;

export async function initializeMobileDeviceRegistry(): Promise<void> {
  if (initialized || !process.env.DATABASE_URL) return;
  const pool = getPostgresPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS glorifier_mobile_devices (
      id UUID PRIMARY KEY,
      user_uid TEXT NOT NULL,
      device_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      manufacturer TEXT,
      model TEXT,
      os_name TEXT,
      os_version TEXT,
      webview_version TEXT,
      app_version TEXT,
      app_build TEXT,
      language TEXT,
      timezone TEXT,
      is_virtual BOOLEAN,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'active',
      UNIQUE(user_uid, device_id)
    );
    CREATE INDEX IF NOT EXISTS idx_glorifier_mobile_devices_user
      ON glorifier_mobile_devices(user_uid);
    CREATE TABLE IF NOT EXISTS glorifier_mobile_device_telemetry (
      id UUID PRIMARY KEY,
      user_uid TEXT NOT NULL,
      device_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      properties JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_glorifier_mobile_device_telemetry_user
      ON glorifier_mobile_device_telemetry(user_uid, occurred_at DESC);
  `);
  initialized = true;
}

export async function registerMobileDevice(userUid: string, input: DeviceRegistration) {
  if (!userUid) throw new Error('Authenticated user is required');
  if (!input.deviceId || !input.platform) throw new Error('deviceId and platform are required');
  await initializeMobileDeviceRegistry();
  const pool = getPostgresPool();
  const result = await pool.query(
    `INSERT INTO glorifier_mobile_devices
      (id, user_uid, device_id, platform, manufacturer, model, os_name, os_version, webview_version, app_version, app_build, language, timezone, is_virtual, last_seen_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),'active')
     ON CONFLICT (user_uid, device_id)
     DO UPDATE SET platform=EXCLUDED.platform, manufacturer=EXCLUDED.manufacturer,
       model=EXCLUDED.model, os_name=EXCLUDED.os_name, os_version=EXCLUDED.os_version,
       webview_version=EXCLUDED.webview_version, app_version=EXCLUDED.app_version,
       app_build=EXCLUDED.app_build, language=EXCLUDED.language, timezone=EXCLUDED.timezone,
       is_virtual=EXCLUDED.is_virtual, last_seen_at=NOW(), status='active'
     RETURNING device_id AS "deviceId", platform, manufacturer, model, os_name AS "osName",
       os_version AS "osVersion", webview_version AS "webViewVersion", app_version AS "appVersion",
       app_build AS "appBuild", language, timezone, is_virtual AS "isVirtual",
       first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt", status`,
    [randomUUID(), userUid, input.deviceId, input.platform, input.manufacturer || null, input.model || null,
      input.osName || null, input.osVersion || null, input.webViewVersion || null, input.appVersion || null,
      input.appBuild || null, input.language || null, input.timezone || null, input.isVirtual ?? null]
  );
  return result.rows[0];
}

export async function getMobileDevice(userUid: string, deviceId?: string) {
  await initializeMobileDeviceRegistry();
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT device_id AS "deviceId", platform, manufacturer, model, os_name AS "osName",
      os_version AS "osVersion", webview_version AS "webViewVersion", app_version AS "appVersion",
      app_build AS "appBuild", language, timezone, is_virtual AS "isVirtual",
      first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt", status
      FROM glorifier_mobile_devices
      WHERE user_uid=$1 AND status='active' ${deviceId ? 'AND device_id=$2' : ''}
      ORDER BY last_seen_at DESC LIMIT 1`,
    deviceId ? [userUid, deviceId] : [userUid]
  );
  return result.rows[0] || null;
}

export async function revokeMobileDevice(userUid: string, deviceId?: string) {
  await initializeMobileDeviceRegistry();
  const pool = getPostgresPool();
  const result = await pool.query(
    `UPDATE glorifier_mobile_devices SET status='revoked', last_seen_at=NOW()
      WHERE user_uid=$1 AND status='active' ${deviceId ? 'AND device_id=$2' : ''}
      RETURNING device_id AS "deviceId"`,
    deviceId ? [userUid, deviceId] : [userUid]
  );
  return result.rows;
}

export async function recordMobileTelemetry(userUid: string, input: { deviceId: string; eventType: string; properties?: Record<string, unknown>; occurredAt?: string }) {
  if (!input.deviceId || !input.eventType) throw new Error('deviceId and eventType are required');
  await initializeMobileDeviceRegistry();
  const pool = getPostgresPool();
  await pool.query(
    `INSERT INTO glorifier_mobile_device_telemetry
      (id, user_uid, device_id, event_type, properties, occurred_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,COALESCE($6::timestamptz,NOW()))`,
    [randomUUID(), userUid, input.deviceId, input.eventType, JSON.stringify(input.properties || {}), input.occurredAt || null]
  );
  await pool.query(
    `UPDATE glorifier_mobile_devices SET last_seen_at=NOW()
      WHERE user_uid=$1 AND device_id=$2 AND status='active'`,
    [userUid, input.deviceId]
  );
}
