import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../database/migrations/20261115_001_glorifier_autopilot_missions.sql', import.meta.url), 'utf8');
const workerStore = readFileSync(new URL('../src/lib/autopilot-worker-store.ts', import.meta.url), 'utf8');

test('Autopilot migration creates the durable mission contract and idempotency constraint', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.glorifier_autopilot_missions/);
  assert.match(migration, /id TEXT PRIMARY KEY/);
  assert.match(migration, /requester TEXT NOT NULL/);
  assert.match(migration, /idempotency_key TEXT NOT NULL/);
  assert.match(migration, /UNIQUE \(requester, idempotency_key\)/);
  assert.match(migration, /payload JSONB NOT NULL/);
  assert.match(migration, /lease_owner TEXT/);
  assert.match(migration, /lease_expires_at TIMESTAMPTZ/);
});

test('Autopilot migration enables requester-scoped row-level security for the Worker role', () => {
  assert.match(migration, /ALTER TABLE public\.glorifier_autopilot_missions ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE POLICY glorifier_autopilot_missions_worker_scope/);
  assert.match(migration, /TO glorifier_worker_app_rw/);
  assert.match(migration, /USING \([\s\S]*requester = NULLIF\(current_setting\('glorifier\.requester', true\), ''\)[\s\S]*current_setting\('glorifier\.allow_all', true\) = 'true'[\s\S]*\)/);
  assert.match(migration, /WITH CHECK \([\s\S]*requester = NULLIF\(current_setting\('glorifier\.requester', true\), ''\)[\s\S]*current_setting\('glorifier\.allow_all', true\) = 'true'[\s\S]*\)/);
});

test('Autopilot migration grants only read/create/update and revokes public access', () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.glorifier_autopilot_missions FROM PUBLIC/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE[\s\S]*TO glorifier_worker_app_rw/);
  assert.doesNotMatch(migration, /GRANT [^;]*(DELETE|TRUNCATE|REFERENCES|TRIGGER)/i);
  assert.doesNotMatch(migration, /TO (anon|authenticated|PUBLIC)\b/i);
});

test('Worker Autopilot adapter uses transaction-local RLS context and performs no runtime DDL', () => {
  assert.match(workerStore, /set_config\('glorifier\.requester'/);
  assert.match(workerStore, /set_config\('glorifier\.allow_all'/);
  assert.match(workerStore, /BEGIN READ ONLY/);
  assert.doesNotMatch(workerStore, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
});
