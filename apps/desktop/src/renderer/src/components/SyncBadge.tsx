import { useEffect, useState } from 'react'
import type { LastSyncInfo } from '@nerd/shared'

export function SyncBadge(): React.JSX.Element {
  const [info, setInfo] = useState<LastSyncInfo | null>(null)

  useEffect(() => {
    const fetch = (): void => {
      window.nerd.getLastSyncInfo().then(setInfo)
    }
    fetch()
    const interval = setInterval(fetch, 60_000) // refresh every minute
    return () => clearInterval(interval)
  }, [])

  if (!info) return <></>

  return (
    <span className="sync-badge" title={`Last synced from ${info.source}`}>
      ↻ {info.age}
    </span>
  )
}
