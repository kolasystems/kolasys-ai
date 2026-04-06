// Kolasys AI — pgvector operations via raw Neon SQL
// The TranscriptEmbedding table is managed here (outside Prisma) because
// Prisma v7 with PrismaNeonHttp doesn't support $queryRaw and the vector
// type requires Prisma's `Unsupported` escape hatch which has limited ergonomics.
// We use the `neon` tagged-template function from @neondatabase/serverless —
// the same connection layer already powering the Prisma adapter, just raw SQL.

import { neon } from '@neondatabase/serverless'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return neon(url)
}

let schemaEnsured = false

export async function ensureVectorSchema(): Promise<void> {
  if (schemaEnsured) return
  const sql = getSql()
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector`
    await sql`
      CREATE TABLE IF NOT EXISTS "TranscriptEmbedding" (
        id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "orgId"     TEXT        NOT NULL,
        "recordingId" TEXT      NOT NULL,
        "chunkIndex" INTEGER    NOT NULL,
        "chunkText" TEXT        NOT NULL,
        embedding   vector(1536),
        "startTime" FLOAT,
        "endTime"   FLOAT,
        "createdAt" TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS "idx_te_org" ON "TranscriptEmbedding"("orgId")`
    await sql`CREATE INDEX IF NOT EXISTS "idx_te_recording" ON "TranscriptEmbedding"("recordingId")`
    // IVFFlat index for fast cosine similarity search (requires at least 1 row to work)
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'idx_te_embedding'
        ) THEN
          CREATE INDEX idx_te_embedding
            ON "TranscriptEmbedding" USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100);
        END IF;
      END $$
    `
    schemaEnsured = true
  } catch (err) {
    // Non-fatal — vector ops will still work without the IVFFlat index
    console.warn('[db-vector] Schema init warning (non-fatal):', err)
    schemaEnsured = true
  }
}

export type EmbeddingRow = {
  id: string
  orgId: string
  recordingId: string
  chunkText: string
  startTime: number | null
  endTime: number | null
  similarity: number
}

export async function deleteEmbeddingsForRecording(recordingId: string): Promise<void> {
  const sql = getSql()
  await sql`DELETE FROM "TranscriptEmbedding" WHERE "recordingId" = ${recordingId}`
}

export async function insertEmbedding(params: {
  orgId: string
  recordingId: string
  chunkIndex: number
  chunkText: string
  embedding: number[]
  startTime?: number | null
  endTime?: number | null
}): Promise<void> {
  const sql = getSql()
  const { orgId, recordingId, chunkIndex, chunkText, embedding, startTime, endTime } = params
  await sql`
    INSERT INTO "TranscriptEmbedding"
      ("orgId", "recordingId", "chunkIndex", "chunkText", embedding, "startTime", "endTime")
    VALUES (
      ${orgId},
      ${recordingId},
      ${chunkIndex},
      ${chunkText},
      ${JSON.stringify(embedding)}::vector,
      ${startTime ?? null},
      ${endTime ?? null}
    )
    ON CONFLICT DO NOTHING
  `
}

export async function vectorSimilaritySearch(params: {
  orgId: string
  queryEmbedding: number[]
  limit?: number
  recordingId?: string
}): Promise<EmbeddingRow[]> {
  const sql = getSql()
  const { orgId, queryEmbedding, limit = 6, recordingId } = params
  const vec = JSON.stringify(queryEmbedding)

  if (recordingId) {
    return sql`
      SELECT
        id,
        "orgId",
        "recordingId",
        "chunkText",
        "startTime",
        "endTime",
        1 - (embedding <=> ${vec}::vector) AS similarity
      FROM "TranscriptEmbedding"
      WHERE "orgId" = ${orgId}
        AND "recordingId" = ${recordingId}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit}
    ` as unknown as EmbeddingRow[]
  }

  return sql`
    SELECT
      id,
      "orgId",
      "recordingId",
      "chunkText",
      "startTime",
      "endTime",
      1 - (embedding <=> ${vec}::vector) AS similarity
    FROM "TranscriptEmbedding"
    WHERE "orgId" = ${orgId}
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${limit}
  ` as unknown as EmbeddingRow[]
}
