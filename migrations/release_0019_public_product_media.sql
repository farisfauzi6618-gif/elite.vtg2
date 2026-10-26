-- Additive cache metadata only. Product, photo and order records are untouched.
CREATE TABLE photo_public_derivatives (
 photo_key TEXT NOT NULL,
 preset TEXT NOT NULL CHECK(preset IN ('thumb','cardSmall','card','detail')),
 pipeline TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('building','ready','revoked')),
 lease_id TEXT NOT NULL,
 pathname TEXT NOT NULL,
 public_url TEXT,
 byte_size INTEGER NOT NULL DEFAULT 0 CHECK(byte_size>=0),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(photo_key,preset,pipeline)
);
CREATE INDEX photo_public_derivatives_cleanup ON photo_public_derivatives(state,updated_at);
