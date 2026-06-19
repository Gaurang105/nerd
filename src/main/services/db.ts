import { Pool } from 'pg'
import { ENV } from '../config/env'

let pool: Pool | null = null
function db(): Pool {
  if (!pool) pool = new Pool({ connectionString: ENV.databaseUrl, max: 3 })
  return pool
}

/** Epoch ms of the most recent finished sync, or null if unknown. */
export async function getLastSync(): Promise<number | null> {
  try {
    const res = await db().query<{ finished_at: string | null }>(
      'SELECT MAX(finished_at) AS finished_at FROM sync_runs WHERE finished_at IS NOT NULL'
    )
    const v = res.rows[0]?.finished_at
    return v == null ? null : Number(v)
  } catch (err) {
    // 42P01 = undefined_table: the KB schema isn't created until the sync job runs.
    // Expected before first sync — degrade quietly to "not synced yet".
    if ((err as { code?: string }).code === '42P01') {
      console.warn('[db] KB schema not initialized yet — run the sync job')
      return null
    }
    console.error('[db] getLastSync failed', err)
    return null
  }
}
