import { ENV } from '../config/env'
import type { RetrievedChunk } from '@shared/types'

// All Postgres + Qdrant access goes through the gateway service (Node + ngrok).
// `ngrok-skip-browser-warning` bypasses ngrok's free-tier interstitial HTML page.
const HEADERS = {
  'content-type': 'application/json',
  'ngrok-skip-browser-warning': '1'
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${ENV.gatewayUrl}${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`gateway ${path} ${res.status}: ${detail}`)
  }
  return (await res.json()) as T
}

/** Qdrant vector search via the gateway. Returns chunks already in RetrievedChunk shape. */
export async function gatewaySearch(
  vector: number[],
  limit: number,
  signal?: AbortSignal
): Promise<RetrievedChunk[]> {
  const data = await post<{ chunks: RetrievedChunk[] }>('/search', { vector, limit }, signal)
  return data.chunks
}

/** Read-only SQL via the gateway. Returns the result rows. */
export async function gatewaySql<R = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  signal?: AbortSignal
): Promise<R[]> {
  const data = await post<{ rows: R[] }>('/sql', { sql, params }, signal)
  return data.rows
}
