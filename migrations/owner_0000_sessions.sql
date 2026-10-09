CREATE TABLE owner_sessions (
  hash TEXT PRIMARY KEY NOT NULL,
  credential_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_owner_sessions_expiry ON owner_sessions(expires_at);
