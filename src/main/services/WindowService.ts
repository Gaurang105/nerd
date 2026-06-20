import { BrowserWindow, screen, globalShortcut } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { Corner, ShortcutAction, ShortcutId } from '@shared/types'
import { loadSettings, saveSettings } from '../config/store'
import { remapBounds } from './displayFollow'
import { CH } from '../ipc/channels'

const PILL = { width: 220, height: 56 }
const DEFAULT_PANEL = { width: 420, height: 560 }
const MARGIN = 16
const NUDGE_STEP = 70 // px per cmd+arrow press

export class WindowService {
  readonly win: BrowserWindow
  private collapsed = false
  private expandedSize = { ...DEFAULT_PANEL }
  private persistTimer: NodeJS.Timeout | null = null
  private followTimer: NodeJS.Timeout | null = null
  // Width the overlay should return to once a transient widening (Settings) ends.
  private restoreWidth: number | null = null
  // Currently registered accelerator per rebindable shortcut, so we can unregister it.
  private accels: Partial<Record<ShortcutId, string>> = {}

  constructor() {
    const settings = loadSettings()
    const bounds = settings.bounds ?? this.defaultBounds()
    if (settings.bounds) this.expandedSize = { width: bounds.width, height: bounds.height }

    this.win = new BrowserWindow({
      ...bounds,
      minWidth: 280,
      minHeight: 72,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      // macOS: an NSPanel is what lets an overlay ride along on every Space,
      // including other apps' fullscreen Spaces. visibleOnAllWorkspaces alone
      // does not cover fullscreen Spaces for a plain window.
      ...(process.platform === 'darwin' && { type: 'panel' as const }),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    // Hidden mode persists across restarts (PRD §7.1): exclude from screen capture.
    this.setHidden(settings.hidden)

    this.win.on('ready-to-show', () => this.win.show())
    this.win.on('moved', () => this.schedulePersist())
    this.win.on('resized', () => this.schedulePersist())

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    this.startCursorFollow()
  }

  // ponytail: poll the cursor's display and hop the overlay onto whichever screen
  // the user is on. The display-id compare is its own debounce (no move while the
  // cursor stays put; dragging moves window+cursor together so it never fights).
  // Ceiling: mouse-as-focus proxy + fixed 750ms polling. Upgrade path: a native
  // frontmost-window observer if the mouse proxy ever feels wrong.
  private startCursorFollow(): void {
    if (this.followTimer) return
    this.followTimer = setInterval(() => this.followCursorDisplay(), 750)
    this.win.on('closed', () => {
      if (this.followTimer) {
        clearInterval(this.followTimer)
        this.followTimer = null
      }
    })
  }

  private followCursorDisplay(): void {
    if (this.win.isDestroyed()) return
    const cursor = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const b = this.win.getBounds()
    const winDisplay = screen.getDisplayNearestPoint(b)
    if (cursor.id === winDisplay.id) return
    const { x, y } = remapBounds(b, winDisplay.workArea, cursor.workArea, MARGIN)
    this.win.setPosition(x, y)
    // ponytail: no-ops while collapsed; collapsed pill position is not persisted by design
    this.schedulePersist()
  }

  private defaultBounds(): { x: number; y: number; width: number; height: number } {
    const wa = screen.getPrimaryDisplay().workArea
    return {
      x: wa.x + wa.width - DEFAULT_PANEL.width - MARGIN,
      y: wa.y + MARGIN,
      width: DEFAULT_PANEL.width,
      height: DEFAULT_PANEL.height
    }
  }

  registerShortcuts(): void {
    const map: Record<string, [number, number]> = {
      'CommandOrControl+Up': [0, -NUDGE_STEP],
      'CommandOrControl+Down': [0, NUDGE_STEP],
      'CommandOrControl+Left': [-NUDGE_STEP, 0],
      'CommandOrControl+Right': [NUDGE_STEP, 0]
    }
    // ponytail: arrows nudge the overlay one step in their direction; holding a key
    // lets the OS auto-repeat for smooth continuous movement. Header icons in the UI
    // still snap to all four corners explicitly.
    for (const [accel, [dx, dy]] of Object.entries(map)) {
      globalShortcut.register(accel, () => this.nudge(dx, dy))
    }
    this.applyConfiguredShortcuts()
  }

  // The user-rebindable shortcuts (Cmd/Ctrl + a configurable key). Re-registers from
  // the persisted config; called on startup and whenever a binding changes.
  private applyConfiguredShortcuts(): void {
    const handlers: Record<ShortcutId, () => void> = {
      openSettings: () => this.sendShortcut('openSettings'),
      toggleSession: () => this.sendShortcut('toggleSession'),
      newChat: () => this.sendShortcut('newChat'),
      hide: () => this.toggleVisible()
    }
    const { shortcuts } = loadSettings()
    for (const id of Object.keys(handlers) as ShortcutId[]) {
      const prev = this.accels[id]
      if (prev) globalShortcut.unregister(prev)
      const accel = `CommandOrControl+${shortcuts[id]}`
      try {
        if (globalShortcut.register(accel, handlers[id])) this.accels[id] = accel
        else delete this.accels[id]
      } catch {
        delete this.accels[id]
      }
    }
  }

  updateShortcut(id: ShortcutId, key: string): void {
    const shortcuts = { ...loadSettings().shortcuts, [id]: key }
    saveSettings({ shortcuts })
    this.applyConfiguredShortcuts()
  }

  private sendShortcut(action: ShortcutAction): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(CH.shortcut, action)
  }

  toggleVisible(): void {
    if (this.win.isDestroyed()) return
    if (this.win.isVisible()) this.win.hide()
    else this.win.show()
  }

  nudge(dx: number, dy: number): void {
    const b = this.win.getBounds()
    const wa = screen.getDisplayNearestPoint(b).workArea
    const x = Math.min(Math.max(b.x + dx, wa.x + MARGIN), wa.x + wa.width - b.width - MARGIN)
    const y = Math.min(Math.max(b.y + dy, wa.y + MARGIN), wa.y + wa.height - b.height - MARGIN)
    this.win.setPosition(Math.round(x), Math.round(y))
    this.schedulePersist()
  }

  snapToCorner(corner: Corner): void {
    const b = this.win.getBounds()
    const wa = screen.getDisplayNearestPoint(this.win.getBounds()).workArea
    const left = wa.x + MARGIN
    const right = wa.x + wa.width - b.width - MARGIN
    const top = wa.y + MARGIN
    const bottom = wa.y + wa.height - b.height - MARGIN
    const pos: Record<Corner, { x: number; y: number }> = {
      'top-left': { x: left, y: top },
      'top-right': { x: right, y: top },
      'bottom-left': { x: left, y: bottom },
      'bottom-right': { x: right, y: bottom }
    }
    this.win.setPosition(pos[corner].x, pos[corner].y, true)
    this.schedulePersist()
  }

  // ponytail: window height is content-driven (renderer ResizeObserver -> here), so
  // vertical user-resize is overridden; width stays user-resizable. Ceiling: a fast
  // feedback loop could thrash if content height oscillates; renderer debounces it.
  setContentSize(width: number | null, height: number): void {
    if (this.collapsed || this.win.isDestroyed()) return
    const b = this.win.getBounds()
    const wa = screen.getDisplayNearestPoint(b).workArea

    let targetWidth = b.width
    if (width != null) {
      if (this.restoreWidth == null) this.restoreWidth = b.width
      targetWidth = width
    } else if (this.restoreWidth != null) {
      targetWidth = this.restoreWidth
      this.restoreWidth = null
    }
    targetWidth = Math.min(Math.max(targetWidth, 280), wa.width - MARGIN * 2)
    const targetHeight = Math.min(Math.max(Math.ceil(height), 72), wa.height - MARGIN * 2)

    let x = Math.min(b.x, wa.x + wa.width - targetWidth - MARGIN)
    x = Math.max(x, wa.x + MARGIN)
    let y = Math.min(b.y, wa.y + wa.height - targetHeight - MARGIN)
    y = Math.max(y, wa.y + MARGIN)

    this.win.setBounds({ x, y, width: targetWidth, height: targetHeight })
    this.expandedSize = { width: targetWidth, height: targetHeight }
  }

  setHidden(hidden: boolean): void {
    // Built-in Electron content protection: macOS NSWindow sharingType=.none,
    // Windows WDA_EXCLUDEFROMCAPTURE. No native addon needed.
    this.win.setContentProtection(hidden)
    saveSettings({ hidden })
  }

  setCollapsed(collapsed: boolean): void {
    if (collapsed === this.collapsed) return
    this.collapsed = collapsed
    const b = this.win.getBounds()
    if (collapsed) {
      this.expandedSize = { width: b.width, height: b.height }
      this.win.setMinimumSize(PILL.width, PILL.height)
      this.win.setBounds({ ...b, ...PILL }, true)
    } else {
      this.win.setMinimumSize(280, 72)
      this.win.setBounds({ ...b, ...this.expandedSize }, true)
    }
  }

  private schedulePersist(): void {
    if (this.collapsed) return
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      const b = this.win.getBounds()
      // Keep the persisted width as the overlay width even while transiently widened.
      const width = this.restoreWidth ?? b.width
      saveSettings({ bounds: { x: b.x, y: b.y, width, height: b.height } })
    }, 400)
  }
}
