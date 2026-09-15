-- Patch: JWT session infrastructure (Phase 2 auth).
-- Access tokens are stateless JWT (revoked JTIs denied here); refresh tokens
-- are opaque, stored hashed, rotated on use. token_version enables logout-all.
-- Idempotent: safe to re-apply on every init.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_refresh_user_idx ON auth_refresh_tokens(user_id);
CREATE TABLE IF NOT EXISTS auth_revoked_jti (
  jti TEXT PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL
);
