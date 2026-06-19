import type { SupabaseClient } from '@nerd/rag-clients'
import type { Document, SourceKind, SyncRun } from '@nerd/shared'

const DOCUMENTS = 'documents'
const CHUNKS = 'chunks'
const SYNC_RUNS = 'sync_runs'

interface DocumentRow {
  id: string
  source: SourceKind
  title: string | null
  url: string | null
  content_hash: string
  source_metadata: Record<string, unknown>
  last_synced_at: number
  updated_at: number
  deleted_at: number | null
}

interface ChunkRow {
  id: string
  doc_id: string
  chunk_index: number
  token_count: number
}

interface SyncRunRow {
  id: number
  source: SourceKind
  started_at: number
  finished_at: number | null
  docs_scanned: number
  docs_new: number
  docs_updated: number
  docs_skipped: number
  docs_deleted: number
  errors: Array<{ message: string; docId?: string }>
}

function documentToRow(doc: Document): DocumentRow {
  return {
    id: doc.id,
    source: doc.source,
    title: doc.title,
    url: doc.url,
    content_hash: doc.contentHash,
    source_metadata: doc.sourceMetadata,
    last_synced_at: doc.lastSyncedAt,
    updated_at: doc.updatedAt,
    deleted_at: doc.deletedAt
  }
}

function syncRunPartialToRow(update: Partial<SyncRun>): Partial<SyncRunRow> {
  const row: Partial<SyncRunRow> = {}
  if (update.source !== undefined) row.source = update.source
  if (update.startedAt !== undefined) row.started_at = update.startedAt
  if (update.finishedAt !== undefined) row.finished_at = update.finishedAt
  if (update.docsScanned !== undefined) row.docs_scanned = update.docsScanned
  if (update.docsNew !== undefined) row.docs_new = update.docsNew
  if (update.docsUpdated !== undefined) row.docs_updated = update.docsUpdated
  if (update.docsSkipped !== undefined) row.docs_skipped = update.docsSkipped
  if (update.docsDeleted !== undefined) row.docs_deleted = update.docsDeleted
  if (update.errors !== undefined) row.errors = update.errors
  return row
}

export async function upsertDocument(client: SupabaseClient, doc: Document): Promise<void> {
  const { error } = await client.from(DOCUMENTS).upsert(documentToRow(doc), { onConflict: 'id' })
  if (error) throw new Error(`upsertDocument failed: ${error.message}`)
}

export async function getAllDocumentIds(
  client: SupabaseClient,
  source: SourceKind
): Promise<Array<{ id: string; contentHash: string; updatedAt: number }>> {
  const { data, error } = await client
    .from(DOCUMENTS)
    .select('id, content_hash, updated_at')
    .eq('source', source)
    .is('deleted_at', null)
  if (error) throw new Error(`getAllDocumentIds failed: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    contentHash: row.content_hash as string,
    updatedAt: row.updated_at as number
  }))
}

export async function softDeleteDocument(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from(DOCUMENTS).update({ deleted_at: Date.now() }).eq('id', id)
  if (error) throw new Error(`softDeleteDocument failed: ${error.message}`)
}

export async function upsertChunks(
  client: SupabaseClient,
  chunks: Array<{ id: string; docId: string; chunkIndex: number; tokenCount: number }>
): Promise<void> {
  if (chunks.length === 0) return
  const rows: ChunkRow[] = chunks.map((c) => ({
    id: c.id,
    doc_id: c.docId,
    chunk_index: c.chunkIndex,
    token_count: c.tokenCount
  }))
  const { error } = await client.from(CHUNKS).upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`upsertChunks failed: ${error.message}`)
}

export async function deleteChunksByDocId(client: SupabaseClient, docId: string): Promise<void> {
  const { error } = await client.from(CHUNKS).delete().eq('doc_id', docId)
  if (error) throw new Error(`deleteChunksByDocId failed: ${error.message}`)
}

export async function insertSyncRun(
  client: SupabaseClient,
  run: Omit<SyncRun, 'id'>
): Promise<number> {
  const row: Omit<SyncRunRow, 'id'> = {
    source: run.source,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    docs_scanned: run.docsScanned,
    docs_new: run.docsNew,
    docs_updated: run.docsUpdated,
    docs_skipped: run.docsSkipped,
    docs_deleted: run.docsDeleted,
    errors: run.errors
  }
  const { data, error } = await client.from(SYNC_RUNS).insert(row).select('id').single()
  if (error) throw new Error(`insertSyncRun failed: ${error.message}`)
  return (data as { id: number }).id
}

export async function updateSyncRun(
  client: SupabaseClient,
  id: number,
  update: Partial<SyncRun>
): Promise<void> {
  const { error } = await client.from(SYNC_RUNS).update(syncRunPartialToRow(update)).eq('id', id)
  if (error) throw new Error(`updateSyncRun failed: ${error.message}`)
}
