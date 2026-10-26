-- Short-lived recovery verifiers. Existing customers and business history are retained.
CREATE TABLE customer_password_resets (
 token_hash TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL REFERENCES customers(id),
 password_digest TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('email','phone')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)),
 used_at INTEGER,
 issued_by TEXT
);
CREATE INDEX customer_password_resets_customer ON customer_password_resets(customer_id,created_at);
CREATE INDEX customer_password_resets_expiry ON customer_password_resets(expires_at);
