/** Compact relative label e.g. "2h ago", "5m ago", or "unknown". */
export function timeAgo(epochMs: number | null): string {
  if (!epochMs) return 'unknown'
  const diff = Date.now() - epochMs
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
