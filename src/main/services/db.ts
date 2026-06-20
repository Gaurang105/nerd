import { gatewaySql } from './gateway'

/** Epoch ms of the most recent finished sync, or null if unknown. */
export async function getLastSync(): Promise<number | null> {
  try {
    const rows = await gatewaySql<{ finished_at: string | null }>(
      'SELECT MAX(finished_at) AS finished_at FROM sync_runs WHERE finished_at IS NOT NULL'
    )
    const v = rows[0]?.finished_at
    return v == null ? null : Number(v)
  } catch (err) {
    // Before the first sync the table may not exist yet, or the gateway may be down —
    // degrade quietly to "not synced yet" rather than blocking the overlay.
    console.error('[db] getLastSync failed', err)
    return null
  }
}
