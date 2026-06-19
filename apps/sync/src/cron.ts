import { config as loadEnv } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import cron from 'node-cron'
import {
  createOpenAIClient,
  createQdrantClient,
  createSupabaseClient,
  type OpenAI,
  type QdrantClient,
  type SupabaseClient
} from '@nerd/rag-clients'
import type { SourceKind } from '@nerd/shared'
import { GDocsConnector } from './connectors/gdocs.js'
import { GitHubConnector } from './connectors/github.js'
import { NotionConnector } from './connectors/notion.js'
import { PitchConnector } from './connectors/pitch.js'
import { SlackConnector } from './connectors/slack.js'
import { ensureCollection } from './db/qdrant.js'
import { insertSyncRun, updateSyncRun } from './db/supabase.js'
import { log } from './lib/logger.js'
import { syncSource, type Connector } from './sync.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(__dirname, '../../../.env') })

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing env var: ${key}`)
  return v
}

interface Clients {
  openai: OpenAI
  qdrantClient: QdrantClient
  supabase: SupabaseClient
}

function buildClients(): Clients {
  return {
    openai: createOpenAIClient({ apiKey: requireEnv('OPENAI_API_KEY') }),
    qdrantClient: createQdrantClient({
      url: requireEnv('QDRANT_URL'),
      apiKey: requireEnv('QDRANT_API_KEY')
    }),
    supabase: createSupabaseClient({
      url: requireEnv('SUPABASE_URL'),
      key: requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    })
  }
}

async function runConnectorSync(
  source: SourceKind,
  connector: Connector,
  { openai, qdrantClient, supabase }: Clients
): Promise<void> {
  const runId = await insertSyncRun(supabase, {
    source,
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
    const stats = await syncSource({ source, connector, supabase, qdrantClient, openai })
    await updateSyncRun(supabase, runId, { finishedAt: Date.now(), ...stats })
    log.info('sync complete', { source, ...stats })
  } catch (err) {
    log.error('sync failed', err, { source })
    await updateSyncRun(supabase, runId, {
      finishedAt: Date.now(),
      errors: [{ message: String(err) }]
    })
  }
}

function gdocsConnector(): GDocsConnector | null {
  const clientId = process.env['GDOCS_OAUTH_CLIENT_ID']
  const clientSecret = process.env['GDOCS_OAUTH_CLIENT_SECRET']
  const refreshToken = process.env['GDOCS_OAUTH_REFRESH_TOKEN']
  if (!clientId || !clientSecret || !refreshToken) return null
  return new GDocsConnector({ clientId, clientSecret, refreshToken })
}

function slackConnector(): SlackConnector | null {
  const token = process.env['SLACK_BOT_TOKEN']
  if (!token) return null
  return new SlackConnector(token)
}

function notionConnector(): NotionConnector | null {
  const token = process.env['NOTION_INTEGRATION_TOKEN']
  if (!token) return null
  return new NotionConnector(token)
}

function githubConnector(): GitHubConnector | null {
  const token = process.env['GITHUB_TOKEN']
  if (!token) return null
  return new GitHubConnector(token)
}

function pitchConnector(): PitchConnector | null {
  const token = process.env['PITCH_API_TOKEN']
  if (!token) return null
  return new PitchConnector(token)
}

async function runSync(): Promise<void> {
  const clients = buildClients()
  await ensureCollection(clients.qdrantClient)

  const jobs: Array<{ source: SourceKind; connector: Connector | null }> = [
    { source: 'gdocs', connector: gdocsConnector() },
    { source: 'slack', connector: slackConnector() },
    { source: 'notion', connector: notionConnector() },
    { source: 'pitch', connector: pitchConnector() }
  ]

  for (const { source, connector } of jobs) {
    if (!connector) {
      log.warn('connector token missing, skipping', { source })
      continue
    }
    await runConnectorSync(source, connector, clients)
  }
}

async function runGitHubSync(): Promise<void> {
  const clients = buildClients()
  await ensureCollection(clients.qdrantClient)

  const connector = githubConnector()
  if (!connector) {
    log.warn('connector token missing, skipping', { source: 'github' })
    return
  }
  await runConnectorSync('github', connector, clients)
}

runSync().catch((err) => log.error('initial sync failed', err))
runGitHubSync().catch((err) => log.error('initial github sync failed', err))

cron.schedule('0 */6 * * *', () => {
  log.info('cron triggered', { schedule: '6h' })
  runSync().catch((err) => log.error('cron sync failed', err))
})

cron.schedule('0 */12 * * *', () => {
  log.info('cron triggered', { schedule: '12h' })
  runGitHubSync().catch((err) => log.error('cron github sync failed', err))
})

log.info('nerd-sync started; gdocs/slack/notion/pitch every 6h, github every 12h')
