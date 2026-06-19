import { config as loadEnv } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import cron from 'node-cron'
import { createOpenAIClient, createQdrantClient, createSupabaseClient } from '@nerd/rag-clients'
import { GDocsConnector } from './connectors/gdocs.js'
import { ensureCollection } from './db/qdrant.js'
import { insertSyncRun, updateSyncRun } from './db/supabase.js'
import { log } from './lib/logger.js'
import { syncSource } from './sync.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(__dirname, '../../../.env') })

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing env var: ${key}`)
  return v
}

// Fix 10: re-entrancy guard so overlapping cron runs don't double-spend OpenAI / race Supabase
let syncRunning = false

async function runSync(): Promise<void> {
  if (syncRunning) {
    log.warn('skipping cron — previous sync still running')
    return
  }
  syncRunning = true

  try {
    const openai = createOpenAIClient({ apiKey: requireEnv('OPENAI_API_KEY') })
    const qdrantClient = createQdrantClient({
      url: requireEnv('QDRANT_URL'),
      apiKey: requireEnv('QDRANT_API_KEY')
    })
    const supabase = createSupabaseClient({
      url: requireEnv('SUPABASE_URL'),
      key: requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    })

    await ensureCollection(qdrantClient)

    const gdocs = new GDocsConnector({
      clientId: requireEnv('GDOCS_OAUTH_CLIENT_ID'),
      clientSecret: requireEnv('GDOCS_OAUTH_CLIENT_SECRET'),
      refreshToken: requireEnv('GDOCS_OAUTH_REFRESH_TOKEN')
    })

    const runId = await insertSyncRun(supabase, {
      source: 'gdocs',
      startedAt: Date.now(),
      finishedAt: null,
      docsScanned: 0,
      docsNew: 0,
      docsUpdated: 0,
      docsSkipped: 0,
      docsDeleted: 0,
      errors: []
    })

    try {
      const stats = await syncSource({
        source: 'gdocs',
        connector: gdocs,
        supabase,
        qdrantClient,
        openai
      })
      await updateSyncRun(supabase, runId, { finishedAt: Date.now(), ...stats })
      log.info('sync complete', { ...stats })
    } catch (err) {
      log.error('sync failed', err)
      await updateSyncRun(supabase, runId, {
        finishedAt: Date.now(),
        errors: [{ message: String(err) }]
      })
    }
  } finally {
    syncRunning = false
  }
}

runSync().catch((err) => log.error('initial sync failed', err))

cron.schedule('0 */6 * * *', () => {
  log.info('cron triggered')
  runSync().catch((err) => log.error('cron sync failed', err))
})

log.info('nerd-sync started, cron scheduled every 6h')
