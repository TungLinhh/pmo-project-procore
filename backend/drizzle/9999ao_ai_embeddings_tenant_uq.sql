-- Make AI embedding identity tenant-scoped. Resource ids are only unique inside a table.
DROP INDEX IF EXISTS ai_embeddings_resource_model_uq;
--> statement-breakpoint
DELETE FROM ai_embeddings duplicate
USING ai_embeddings keeper
WHERE duplicate.tenant_id = keeper.tenant_id
  AND duplicate.resource_type = keeper.resource_type
  AND duplicate.resource_id = keeper.resource_id
  AND duplicate.embed_model = keeper.embed_model
  AND duplicate.id > keeper.id;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ai_embeddings_tenant_resource_model_uq
  ON ai_embeddings (tenant_id, resource_type, resource_id, embed_model);
