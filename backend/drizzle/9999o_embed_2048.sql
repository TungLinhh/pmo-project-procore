-- Nemotron free embeddings are 2048-dim (nvidia/nemotron-3-embed-1b native,
-- reduced sizes unsupported). Widen the column.
-- NOTE: the old HNSW index is dropped WITHOUT replacement — pgvector HNSW
-- refuses columns over 2000 dims. At our corpus scale (hundreds of chunks)
-- exact brute-force cosine (<=> seq scan) is milliseconds and always correct.
-- Old 1536-dim rows are incompatible: the next backfill for the new model
-- deletes other-model rows and re-embeds (see lib/ai/retrieval.js).
-- Idempotent. Runs last (rank 16).
DROP INDEX IF EXISTS ai_embeddings_hnsw_idx;
--> statement-breakpoint
ALTER TABLE ai_embeddings ALTER COLUMN embedding TYPE vector(2048);
--> statement-breakpoint
