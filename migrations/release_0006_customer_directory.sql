CREATE INDEX IF NOT EXISTS idx_customer_created_id ON customers(created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS customer_giveaway_entries (
 customer_id TEXT NOT NULL REFERENCES customers(id),
 campaign TEXT NOT NULL,
 instagram_username TEXT NOT NULL,
 comment_verified_at INTEGER,
 updated_at INTEGER NOT NULL,
 updated_by TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(customer_id,campaign)
);
CREATE INDEX IF NOT EXISTS idx_customer_giveaway_campaign ON customer_giveaway_entries(campaign,comment_verified_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_giveaway_instagram ON customer_giveaway_entries(campaign,instagram_username);
