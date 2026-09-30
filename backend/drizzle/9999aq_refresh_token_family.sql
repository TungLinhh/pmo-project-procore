-- Refresh-token reuse detection.
--
-- rotateRefresh() consumes a token with a conditional UPDATE, so a replayed
-- token currently just returns null: a stolen token and a benign double-submit
-- are indistinguishable, and a stolen chain stays alive. Grouping tokens into a
-- family lets us revoke the whole chain when a token that was already rotated is
-- presented again, while a short grace window keeps a genuine double-submit
-- (two tabs refreshing at once) from logging the user out.
--
-- Existing rows get their own id as the family id: they were never rotated, so
-- each is a chain of one. id is bigint, so derive a stable uuid from it.
ALTER TABLE auth_refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id uuid;

UPDATE auth_refresh_tokens
   SET family_id = md5('rt:' || id::text)::uuid
 WHERE family_id IS NULL;

ALTER TABLE auth_refresh_tokens
  ALTER COLUMN family_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS auth_refresh_tokens_family_idx
  ON auth_refresh_tokens (family_id);

CREATE INDEX IF NOT EXISTS auth_refresh_user_family_idx
  ON auth_refresh_tokens (user_id, family_id);
