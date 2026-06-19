import { useState, useEffect } from 'react'
import { OverlayShell } from './components/OverlayShell'

export default function App(): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    window.nerd.getCollapsed().then(setCollapsed)
  }, [])

  return <OverlayShell collapsed={collapsed} setCollapsed={setCollapsed} />
}
