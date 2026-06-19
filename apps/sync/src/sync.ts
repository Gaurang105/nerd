import { chunk } from '@nerd/chunker'
import type { OpenAI, QdrantClient, SupabaseClient } from '@nerd/rag-clients'
import type { SourceKind } from '@nerd/shared'
import * as qdrant from './db/qdrant.js'
import * as db from './db/supabase.js'
import { computeSparseVector } from './lib/bm25.js'
import { batchEmbed } from './lib/embed.js'
import { log } from './lib/logger.js'

export interface Connector {
  listDocs(): Promise<
    Array<{ id: string; name: string; modifiedTime: string; webViewLink: string }>
  >
  getDocText(id: string): Promise<string>
}

export interface SyncStats {
  docsScanned: number
  docsNew: number
  docsUpdated: number
  docsSkipped: number
  docsDeleted: number
  errors: Array<{ message: string; docId?: string }>
}

export interface SyncSourceOptions {
  source: SourceKind
  connector: Connector
  supabase: SupabaseClient
  qdrantClient: QdrantClient
  openai: OpenAI
}

export async function syncSource(opts: SyncSourceOptions): Promise<SyncStats> {
  const { source, connector, supabase, qdrantClient, openai } = opts
  const stats: SyncStats = {
    docsScanned: 0,
    docsNew: 0,
    docsUpdated: 0,
    docsSkipped: 0,
    docsDeleted: 0,
    errors: []
  }

  const remoteDocs = await connector.listDocs()
  stats.docsScanned = remoteDocs.length
  log.info('remote manifest fetched', { source, count: remoteDocs.length })

  const localDocs = await db.getAllDocumentIds(supabase, source)
  const localMap = new Map(localDocs.map((d) => [d.id, d]))
  const remoteMap = new Map(remoteDocs.map((d) => [d.id, d]))

  for (const [id] of localMap) {
    if (!remoteMap.has(id)) {
      try {
        await db.deleteChunksByDocId(supabase, id)
        await qdrant.deleteByDocId(qdrantClient, id)
        await db.softDeleteDocument(supabase, id)
        stats.docsDeleted++
      } catch (err) {
        log.error('doc delete failed', err, { docId: id })
        stats.errors.push({ message: String(err), docId: id })
      }
    }
  }

  for (const remote of remoteDocs) {
    const local = localMap.get(remote.id)
    const remoteUpdatedAt = new Date(remote.modifiedTime).getTime()

    if (local && local.updatedAt >= remoteUpdatedAt) {
      stats.docsSkipped++
      continue
    }

    const isNew = !local
    try {
      const text = await connector.getDocText(remote.id)
      if (!text.trim()) {
        stats.docsSkipped++
        continue
      }

      const chunks = chunk(text, remote.id)
      if (chunks.length === 0) {
        stats.docsSkipped++
        continue
      }

      const embeddings = await batchEmbed(
        chunks.map((c) => c.text),
        openai
      )

      if (!isNew) {
        await db.deleteChunksByDocId(supabase, remote.id)
        await qdrant.deleteByDocId(qdrantClient, remote.id)
      }

      await db.upsertDocument(supabase, {
        id: remote.id,
        source,
        title: remote.name,
        url: remote.webViewLink,
        contentHash: String(remoteUpdatedAt),
        sourceMetadata: {},
        lastSyncedAt: Date.now(),
        updatedAt: remoteUpdatedAt,
        deletedAt: null
      })

      const chunkRecords = chunks.map((c) => ({
        id: `${remote.id}-${c.chunkIndex}`,
        docId: remote.id,
        chunkIndex: c.chunkIndex,
        tokenCount: c.tokenCount
      }))
      await db.upsertChunks(supabase, chunkRecords)

      const points = chunks.map((c, i) => ({
        id: `${remote.id}-${c.chunkIndex}`,
        docId: remote.id,
        source,
        docTitle: remote.name,
        url: remote.webViewLink,
        sourceMetadata: {},
        text: c.text,
        vector: embeddings[i]!,
        sparseVector: computeSparseVector(c.text),
        updatedAt: remoteUpdatedAt
      }))
      await qdrant.upsertPoints(qdrantClient, points)

      if (isNew) {
        stats.docsNew++
      } else {
        stats.docsUpdated++
      }
      log.info(isNew ? 'doc added' : 'doc updated', {
        docId: remote.id,
        chunks: chunks.length
      })
    } catch (err) {
      log.error('doc sync failed', err, { docId: remote.id })
      stats.errors.push({ message: String(err), docId: remote.id })
    }
  }

  return stats
}
