import { PillView } from './PillView'
import { PanelView } from './PanelView'

interface OverlayShellProps {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}

export function OverlayShell({ collapsed, setCollapsed }: OverlayShellProps): React.JSX.Element {
  const handleExpand = (): void => {
    setCollapsed(false)
    window.nerd.setCollapsed(false)
  }

  const handleCollapse = (): void => {
    setCollapsed(true)
    window.nerd.setCollapsed(true)
  }

  return (
    <div className="overlay-root" style={{ width: '100%', height: '100%' }}>
      {collapsed ? <PillView onExpand={handleExpand} /> : <PanelView onCollapse={handleCollapse} />}
    </div>
  )
}
