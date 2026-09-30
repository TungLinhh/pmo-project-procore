-- Correct the family index: one family holds MANY rotated tokens, so a UNIQUE
-- index on family_id alone makes the second rotation of a chain fail with
-- "duplicate key value violates unique constraint". The token hash stays
-- unique (it is the lookup key); the family is only a grouping key.
DROP INDEX IF EXISTS auth_refresh_tokens_family_idx;

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_family_idx
  ON auth_refresh_tokens (family_id);
