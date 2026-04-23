-- Migration: fix_embedding_vector_768dim
--
-- The ai_embeddings.embedding column was created as vector(1536) for OpenAI.
-- Now using Ollama nomic-embed-text which produces 768-dimensional vectors.
-- Postgres pgvector rejects inserts with the wrong dimension, so we drop and
-- recreate the column with the correct size.
--
-- WARNING: This destroys any existing embedding data. Re-run your embedding
-- worker after applying this migration to regenerate vectors.

-- Drop the old IVFFlat index (tied to the column type)
DROP INDEX IF EXISTS "ai_embeddings_embedding_idx";

-- Drop the 1536-dim column
ALTER TABLE "ai_embeddings" DROP COLUMN IF EXISTS "embedding";

-- Add 768-dim column (nomic-embed-text output size)
ALTER TABLE "ai_embeddings" ADD COLUMN "embedding" vector(768);

-- Recreate IVFFlat index for cosine similarity on 768-dim vectors
CREATE INDEX IF NOT EXISTS "ai_embeddings_embedding_idx"
    ON "ai_embeddings" USING ivfflat ("embedding" vector_cosine_ops)
    WITH (lists = 100);
