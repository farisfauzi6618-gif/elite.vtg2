CREATE TABLE delegated_admin (
  slot INTEGER PRIMARY KEY CHECK (slot=1),
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  version INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0,1)),
  signature TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE delegated_admin_sessions (
  hash TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  credential_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX delegated_admin_sessions_account ON delegated_admin_sessions(admin_id);
CREATE TABLE admin_handover_links (
  hash TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('invite','payment')),
  payload TEXT NOT NULL,
  signature TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE payment_destination_override (
  id INTEGER PRIMARY KEY CHECK (id=1),
  payload TEXT NOT NULL,
  signature TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE admin_security_audit (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
