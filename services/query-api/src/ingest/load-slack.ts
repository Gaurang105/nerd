/**
 * One-time Slack → Qdrant + Postgres backfill loader.
 *
 * This is a THROWAWAY one-shot loader, NOT the ERD differential cron. It never
 * touches Slack — it only reads the JSON dumped by the Slack MCP extraction
 * (data/slack/<channel_id>.json) and:
 *   1. filters bot/automation noise + Slack markup
 *   2. builds documents (per-thread, per-canvas, per-day standalone buckets)
 *   3. chunks (~400 tok / 50 overlap), dedups near-identical chunks
 *   4. embeds via OpenAI text-embedding-3-small
 *   5. upserts to Qdrant Cloud (`nerd-chunks`, named `dense` vector)
 *   6. writes documents / document_chunks / sync_runs to Postgres
 *
 * Idempotent: re-running deletes a doc's prior points/rows before re-inserting,
 * so you can re-run the loader without re-pulling Slack.
 *
 * Env: OPENAI_API_KEY, QDRANT_URL, QDRANT_API_KEY, PG_HOST/PG_PORT/PG_DATABASE/
 *      PG_USER/PG_PASSWORD (localhost defaults).
 *
 * Run:  (from services/query-api)
 *   set -a; . ../../.env; . ./.env; set +a
 *   npx tsx src/ingest/load-slack.ts
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { QdrantClient } from '@qdrant/js-client-rest'
import { encode, decode } from 'gpt-tokenizer'
import pg from 'pg'

const DATA_DIR = join(process.cwd(), '..', '..', 'data', 'slack')
const COLLECTION = 'nerd-chunks'
const DENSE_VECTOR = 'dense'
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small'
const EMBED_DIM = 1536
const EMBED_BATCH = 128
const TARGET_TOKENS = 400
const OVERLAP_TOKENS = 50

// ---------- types matching the MCP extraction dump ----------
interface RawMsg {
  ts: string
  thread_ts?: string | null
  author?: string
  author_email?: string | null
  is_bot?: boolean
  text?: string
  replies?: RawMsg[]
}
interface ChannelDump {
  channel_id: string
  channel_name: string
  pulled_at?: number
  messages: RawMsg[]
  canvases?: { id: string; title?: string; markdown?: string }[]
}
interface Doc {
  docId: string
  title: string
  url: string
  text: string
  updatedAt: number // ms
  meta: Record<string, unknown>
}

// ---------- noise filter ----------
const BOT_AUTHORS = new Set(
  [
    'omni',
    'inventory alerts',
    'slackbot',
    'wbr helper bot',
    'mea opspulse',
    'studio standup bot',
    'mmp handover',
    'wbr app',
    'focus ces - mmp reviews',
    'focus ces',
    'threadcatcher'
  ].map((s) => s.toLowerCase())
)
const SYSTEM_TEXT = /(has joined the channel|has left the channel|made updates to a canvas tab|set the channel|pinned a message|was added to)/i

function isHuman(m: RawMsg): boolean {
  if (m.is_bot) return false
  if (!m.author_email) return false // bots/apps post without an email in MCP output
  if (BOT_AUTHORS.has((m.author || '').trim().toLowerCase())) return false
  const t = (m.text || '').trim()
  if (!t) return false
  if (SYSTEM_TEXT.test(t)) return false
  // drop messages that are essentially just a single link
  const stripped = t.replace(/<[^>]+>/g, '').replace(/https?:\/\/\S+/g, '').trim()
  if (stripped.length < 3) return false
  return true
}

// ---------- Slack markup → readable text ----------
function clean(text: string): string {
  return (text || '')
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2') // <url|label> -> label
    .replace(/<@[^|>]+\|([^>]+)>/g, '@$1') // <@U..|Name> -> @Name
    .replace(/<@([A-Z0-9]+)>/g, '@$1')
    .replace(/<!subteam\^[^>]+>/g, '') // group mentions -> drop
    .replace(/<!([a-z]+)>/g, '@$1') // <!here>/<!channel>
    .replace(/<(https?:\/\/[^>]+)>/g, '$1') // bare <url>
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function tsToMs(ts: string): number {
  return Math.round(parseFloat(ts) * 1000)
}
function permalink(channelId: string, ts: string): string {
  return `https://slack.com/archives/${channelId}/p${ts.replace('.', '')}`
}
function uuidFromString(s: string): string {
  const h = createHash('sha1').update(s).digest()
  const b = Buffer.from(h.subarray(0, 16))
  b[6] = (b[6] & 0x0f) | 0x50 // version 5
  b[8] = (b[8] & 0x3f) | 0x80 // variant
  const x = b.toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}
function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex')
}
function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

// ---------- chunker (paragraph-aware, ~400/50 — mirrors packages/chunker) ----------
function chunk(text: string): { index: number; text: string; tokenCount: number }[] {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  const out: { index: number; text: string; tokenCount: number }[] = []
  let idx = 0
  let cur: number[] = []
  const flush = (): void => {
    if (cur.length === 0) return
    out.push({ index: idx++, text: decode(cur), tokenCount: cur.length })
    cur = cur.slice(-OVERLAP_TOKENS)
  }
  for (const para of paragraphs) {
    const pt = encode(para)
    if (pt.length > TARGET_TOKENS) {
      for (const sentence of para.split(/(?<=[.!?])\s+/)) {
        const st = encode(sentence)
        if (cur.length + st.length > TARGET_TOKENS) flush()
        cur.push(...st)
      }
    } else {
      if (cur.length + pt.length > TARGET_TOKENS) flush()
      cur.push(...pt)
    }
  }
  flush()
  return out
}

// ---------- build documents from a channel dump ----------
function buildDocs(dump: ChannelDump): Doc[] {
  const { channel_id, channel_name } = dump
  const docs: Doc[] = []
  const standalone: RawMsg[] = []

  for (const m of dump.messages || []) {
    const hasThread = (m.replies && m.replies.length > 0) || (m.thread_ts && m.thread_ts === m.ts)
    if (hasThread) {
      const all = [m, ...(m.replies || [])].filter(isHuman)
      if (all.length === 0) continue
      const lines = all.map((r) => `${r.author}: ${clean(r.text || '')}`)
      const text = lines.join('\n\n')
      const updatedAt = Math.max(...all.map((r) => tsToMs(r.ts)))
      docs.push({
        docId: `slack:${channel_id}:${m.ts}`,
        title: `${channel_name} — ${clean(m.text || all[0].text || '').slice(0, 80)}`,
        url: permalink(channel_id, m.ts),
        text,
        updatedAt,
        meta: {
          channel_id,
          channel_name,
          thread_ts: m.ts,
          author: all[0].author,
          kind: 'thread',
          message_count: all.length
        }
      })
    } else if (isHuman(m)) {
      standalone.push(m)
    }
  }

  // standalone messages → merged per-day buckets (avoid one-line vector explosion)
  const byDay = new Map<string, RawMsg[]>()
  for (const m of standalone) {
    const k = dayKey(tsToMs(m.ts))
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(m)
  }
  for (const [day, msgs] of byDay) {
    msgs.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts))
    const text = msgs.map((m) => `${m.author}: ${clean(m.text || '')}`).join('\n\n')
    const updatedAt = Math.max(...msgs.map((m) => tsToMs(m.ts)))
    docs.push({
      docId: `slack:${channel_id}:day:${day}`,
      title: `${channel_name} — ${day}`,
      url: permalink(channel_id, msgs[msgs.length - 1].ts),
      text,
      updatedAt,
      meta: { channel_id, channel_name, kind: 'day_bucket', day, message_count: msgs.length }
    })
  }

  // canvases
  for (const c of dump.canvases || []) {
    const text = clean(c.markdown || '')
    if (text.length < 3) continue
    docs.push({
      docId: `slack:${channel_id}:canvas:${c.id}`,
      title: `${channel_name} — canvas: ${c.title || c.id}`,
      url: `https://slack.com/docs/${channel_id}/${c.id}`,
      text,
      updatedAt: dump.pulled_at ? dump.pulled_at * 1000 : Date.now(),
      meta: { channel_id, channel_name, kind: 'canvas', canvas_id: c.id }
    })
  }

  return docs
}

// ---------- OpenAI embeddings ----------
async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts })
  })
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] }
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

// ---------- main ----------
async function main(): Promise<void> {
  const startedAt = Date.now()
  const qdrant = new QdrantClient({ url: process.env.QDRANT_URL!, apiKey: process.env.QDRANT_API_KEY })
  const pool = new pg.Pool({
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'localdb',
    user: process.env.PG_USER || 'admin',
    password: process.env.PG_PASSWORD || 'password',
    max: 4
  })

  let pgOk = true
  try {
    await pool.query('select 1')
  } catch (e) {
    pgOk = false
    console.warn(`[pg] unreachable — continuing Qdrant-only. (${(e as Error).message})`)
  }

  // sanity: collection + vector config
  const info = await qdrant.getCollection(COLLECTION)
  console.log(`[qdrant] ${COLLECTION} points before: ${info.points_count}`)

  // Payload indexes — required: the cloud collection runs strict_mode with
  // unindexed_filtering_update/retrieve = false, so delete/search by doc_id or
  // source is rejected unless the field is indexed. (idempotent — ignore "exists")
  for (const field of ['doc_id', 'source', 'source_metadata.channel_id']) {
    try {
      await qdrant.createPayloadIndex(COLLECTION, { field_name: field, field_schema: 'keyword', wait: true })
      console.log(`[qdrant] payload index ready: ${field}`)
    } catch (e) {
      console.log(`[qdrant] payload index ${field}: ${(e as Error).message} (likely already exists)`)
    }
  }

  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json'))
  console.log(`[load] ${files.length} channel dumps in ${DATA_DIR}`)

  const stats = { scanned: 0, docs: 0, chunks: 0, deduped: 0, channels: 0, errors: [] as string[] }
  const seenHashes = new Set<string>() // global near-dup dedup

  for (const file of files) {
    let dump: ChannelDump
    try {
      dump = JSON.parse(await readFile(join(DATA_DIR, file), 'utf8'))
    } catch (e) {
      stats.errors.push(`${file}: parse ${(e as Error).message}`)
      continue
    }
    stats.channels++
    const docs = buildDocs(dump)
    console.log(`[${dump.channel_name}] ${docs.length} docs from ${(dump.messages || []).length} msgs`)

    for (const doc of docs) {
      stats.scanned++
      const pieces = chunk(doc.text)
      // dedup near-identical chunks (normalize whitespace + case)
      const kept = pieces.filter((p) => {
        const norm = p.text.toLowerCase().replace(/\s+/g, ' ').trim()
        const h = sha1(norm)
        if (seenHashes.has(h)) {
          stats.deduped++
          return false
        }
        seenHashes.add(h)
        return true
      })
      if (kept.length === 0) continue

      let vectors: number[][] = []
      try {
        for (let i = 0; i < kept.length; i += EMBED_BATCH) {
          vectors.push(...(await embedBatch(kept.slice(i, i + EMBED_BATCH).map((p) => p.text))))
        }
      } catch (e) {
        stats.errors.push(`${doc.docId}: embed ${(e as Error).message}`)
        continue
      }
      if (vectors.some((v) => v.length !== EMBED_DIM)) {
        stats.errors.push(`${doc.docId}: bad embed dim`)
        continue
      }

      const points = kept.map((p, i) => ({
        id: uuidFromString(`${doc.docId}#${p.index}`),
        vector: { [DENSE_VECTOR]: vectors[i] },
        payload: {
          doc_id: doc.docId,
          source: 'slack',
          doc_title: doc.title,
          url: doc.url,
          text: p.text,
          source_metadata: { ...doc.meta, pinned: false },
          updated_at: doc.updatedAt
        }
      }))

      // idempotent: clear prior points for this doc, then upsert
      try {
        await qdrant.delete(COLLECTION, {
          filter: { must: [{ key: 'doc_id', match: { value: doc.docId } }] },
          wait: true
        })
        await qdrant.upsert(COLLECTION, { points, wait: true })
      } catch (e) {
        stats.errors.push(`${doc.docId}: qdrant ${(e as Error).message}`)
        continue
      }

      if (pgOk) {
        try {
          await pool.query('DELETE FROM documents WHERE id = $1', [doc.docId])
          await pool.query(
            `INSERT INTO documents (id, source, title, url, content_hash, source_metadata, last_synced_at, updated_at)
             VALUES ($1,'slack',$2,$3,$4,$5,$6,$7)`,
            [doc.docId, doc.title, doc.url, sha1(doc.text), JSON.stringify(doc.meta), Date.now(), doc.updatedAt]
          )
          for (let i = 0; i < kept.length; i++) {
            await pool.query(
              `INSERT INTO document_chunks (id, doc_id, chunk_index, token_count) VALUES ($1,$2,$3,$4)`,
              [points[i].id, doc.docId, kept[i].index, kept[i].tokenCount]
            )
          }
        } catch (e) {
          stats.errors.push(`${doc.docId}: pg ${(e as Error).message}`)
        }
      }

      stats.docs++
      stats.chunks += kept.length
    }
  }

  if (pgOk) {
    await pool.query(
      `INSERT INTO sync_runs (source, started_at, finished_at, docs_scanned, docs_new, errors)
       VALUES ('slack',$1,$2,$3,$4,$5)`,
      [startedAt, Date.now(), stats.scanned, stats.docs, JSON.stringify(stats.errors.slice(0, 50))]
    )
  }
  await pool.end().catch(() => {})

  const after = await qdrant.getCollection(COLLECTION)
  console.log('\n===== DONE =====')
  console.log(JSON.stringify({ ...stats, errors: stats.errors.length }, null, 2))
  console.log(`[qdrant] ${COLLECTION} points after: ${after.points_count}`)
  if (stats.errors.length) console.log('first errors:', stats.errors.slice(0, 10))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
