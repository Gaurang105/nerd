import { config as loadEnv } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(__dirname, '../../../.env') })

async function main(): Promise<void> {
  console.log('[nerd-sync] cron entry point — connectors land in slice 3')
}

main().catch((err) => {
  console.error('[nerd-sync] fatal', err)
  process.exit(1)
})
