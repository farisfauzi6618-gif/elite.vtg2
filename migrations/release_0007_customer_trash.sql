CREATE TABLE IF NOT EXISTS customer_trash (
 customer_id TEXT PRIMARY KEY NOT NULL REFERENCES customers(id),
 deleted_at INTEGER NOT NULL,
 deleted_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_trash_time ON customer_trash(deleted_at);
