CREATE TABLE IF NOT EXISTS auth_login_throttles (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  lockout_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_auth_login_throttles_lockout_until
  ON auth_login_throttles(lockout_until);

CREATE TABLE IF NOT EXISTS auth_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip TEXT,
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_events_created_at
  ON auth_audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_audit_events_event_type
  ON auth_audit_events(event_type);
