ALTER TABLE products ADD COLUMN sold_hidden INTEGER NOT NULL DEFAULT 0 CHECK(sold_hidden IN (0,1));
