ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_lockout_until ON users(lockout_until);
