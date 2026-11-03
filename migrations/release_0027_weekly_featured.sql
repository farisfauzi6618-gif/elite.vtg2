CREATE TABLE weekly_featured_runs (
  period INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  plan TEXT NOT NULL
);

CREATE TABLE weekly_featured_products (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  period INTEGER NOT NULL
);
