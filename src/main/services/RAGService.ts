import type {
  AnswerSource,
  ChatTurn,
  FinalAnswer,
  OutputFormat,
  PartialAnswer,
  SqlResult,
  StatusEvent
} from '@shared/types'
import { embed, generateWithTools, rewriteQuery, type ToolExecutor } from './openai'
import { searchChunks } from './qdrant'
import { rerank, selectTop } from './rerank'
import { buildUserPrompt } from './prompts'
import { getSchema, runSqlTool, SQL_TOOL } from './sqlTool'
import { toSqlResult } from './sqlTool-core'
import { getActiveSystemPrompt } from '../mode/ModeService'
import { stage } from '../util/timeout'

// Rows shown in the deterministic table; rowCount still reports the true total.
const DISPLAY_CAP = 200

// Per-stage budgets sized for real network round-trips to OpenAI/Qdrant/Cohere.
// embed has no fallback, so its budget must comfortably exceed normal API latency.
const BUDGET = { rewrite: 4_000, embed: 5_000, retrieve: 4_000, rerank: 4_000 }
const WALL_CLOCK_MS = 30_000

export interface AnswerRequest {
  requestId: number
  question: string
  format: OutputFormat
  /** Clean up the text into a question first (hotkey transcript). Off for typed Q&A. */
  rewrite: boolean
  /** RECENT TRANSCRIPT block (hotkey flow). */
  transcript?: string
  /** RECENT ANSWERS block to avoid repetition. */
  answerMemory?: string
  /** Prior conversation turns replayed so follow-ups ("which ones?") resolve. */
  history?: ChatTurn[]
  /** Resolves the SCREEN OCR text; awaited in parallel with rewrite/embed. */
  screenText?: Promise<string>
  signal: AbortSignal
  onDelta: (p: PartialAnswer) => void
  /** Transient progress updates (e.g. "Querying database…"). Optional for non-UI callers. */
  onStatus?: (s: StatusEvent) => void
}

export async function answer(req: AnswerRequest): Promise<FinalAnswer> {
  const { requestId, format, signal, onDelta } = req
  const safety = new AbortController()
  const onAbort = (): void => safety.abort(signal.reason)
  signal.addEventListener('abort', onAbort, { once: true })
  const wallTimer = setTimeout(
    () => safety.abort(new Error('pipeline wall-clock exceeded')),
    WALL_CLOCK_MS
  )

  const startedAt = Date.now()
  // Schema doesn't depend on the vector, so fetch it concurrently with the retrieval chain.
  // Cached after the first call (and prewarmed at startup), so this is usually instant.
  const schemaPromise = getSchema(safety.signal).catch((err) => {
    console.error('[RAG] schema introspection failed', err)
    return ''
  })

  try {
    let question = req.question
    if (req.rewrite) {
      try {
        question = await stage('rewrite', BUDGET.rewrite, safety.signal, (s) =>
          rewriteQuery(req.question, s)
        )
      } catch {
        question = req.question // degrade: embed the raw transcript slice
      }
    }

    const vector = await stage('embed', BUDGET.embed, safety.signal, (s) => embed(question, s))

    let chunks = await stage('retrieve', BUDGET.retrieve, safety.signal, () =>
      searchChunks(vector, 20)
    ).catch((err) => {
      console.error('[RAG] retrieve failed, going KB-less', err)
      return []
    })

    if (chunks.length > 0) {
      chunks = await stage('rerank', BUDGET.rerank, safety.signal, (s) =>
        rerank(question, chunks, s)
      ).catch((err) => {
        console.error('[RAG] rerank failed, using fused order', err)
        return selectTop(chunks)
      })
    }

    const chunkSources: AnswerSource[] = chunks.map((c) => ({
      docTitle: c.docTitle,
      url: c.url,
      source: c.source
    }))

    // Screen OCR ran in parallel (kicked at hotkey); collect it now, best-effort.
    let screenText = '(none)'
    if (req.screenText) {
      screenText = await req.screenText.catch(() => '')
    }

    const schema = await schemaPromise

    const userPrompt = buildUserPrompt({
      question,
      chunks,
      format,
      screenText,
      transcript: req.transcript,
      answerMemory: req.answerMemory,
      schema
    })

    let sqlRows = 0
    let sqlCalls = 0
    let sqlOk = 0
    const results: SqlResult[] = []
    const exec: ToolExecutor = async (name, args, s) => {
      if (name !== 'query_database') return JSON.stringify({ error: `unknown tool: ${name}` })
      let sql = ''
      try {
        sql = (JSON.parse(args) as { sql?: string }).sql ?? ''
      } catch {
        return JSON.stringify({ error: 'invalid tool arguments' })
      }
      sqlCalls++
      req.onStatus?.({ requestId, text: 'Querying database…' })
      const res = await runSqlTool(sql, s)
      sqlRows += res.rowCount
      // res.rows is defined on a successful query (even with 0 rows); undefined on error.
      if (res.rows !== undefined) sqlOk++
      if (res.rows && res.rows.length > 0) results.push(toSqlResult(sql, res.rows, DISPLAY_CAP))
      return res.raw
    }

    let text = ''
    for await (const delta of generateWithTools(
      getActiveSystemPrompt(),
      userPrompt,
      req.history ?? [],
      [SQL_TOOL],
      exec,
      safety.signal
    )) {
      if (safety.signal.aborted) break
      text += delta
      onDelta({ requestId, delta })
    }

    // A successful DB query makes the answer DB-grounded; don't cite KB chunks then, since
    // they'd imply the data came from Slack. The exact SQL stays visible in the table caption.
    const sources: AnswerSource[] =
      sqlOk > 0 ? [{ source: 'database', docTitle: 'Database', url: '' }] : chunkSources
    const grounded = sqlOk > 0 || chunkSources.length > 0

    console.info(
      '[RAG] answer',
      JSON.stringify({
        requestId,
        path: sqlCalls > 0 ? (chunks.length > 0 ? 'sql+kb' : 'sql') : chunks.length > 0 ? 'kb' : 'none',
        chunks: chunks.length,
        sqlCalls,
        sqlRows,
        ms: Date.now() - startedAt
      })
    )

    return { requestId, text, sources, grounded, format, data: results.length ? results : undefined }
  } catch (err) {
    return {
      requestId,
      text: '',
      sources: [],
      grounded: false,
      format,
      error: signal.aborted ? 'cancelled' : (err as Error).message || 'context unavailable'
    }
  } finally {
    clearTimeout(wallTimer)
    signal.removeEventListener('abort', onAbort)
  }
}
