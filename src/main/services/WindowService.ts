import { BrowserWindow, screen, globalShortcut } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { Corner } from '@shared/types'
import { loadSettings, saveSettings } from '../config/store'

const PILL = { width: 220, height: 56 }
const DEFAULT_PANEL = { width: 420, height: 560 }
const MARGIN = 16

export class WindowService {
  readonly win: BrowserWindow
  private collapsed = false
  private expandedSize = { ...DEFAULT_PANEL }
  private persistTimer: NodeJS.Timeout | null = null

  constructor() {
    const settings = loadSettings()
    const bounds = settings.bounds ?? this.defaultBounds()
    if (settings.bounds) this.expandedSize = { width: bounds.width, height: bounds.height }

    this.win = new BrowserWindow({
      ...bounds,
      minWidth: 280,
      minHeight: 120,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
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
    const map: Record<string, Corner> = {
      'CommandOrControl+Up': 'top-left',
      'CommandOrControl+Left': 'bottom-left',
      'CommandOrControl+Right': 'top-right',
      'CommandOrControl+Down': 'bottom-right'
    }
    // ponytail: arrows map to the nearest sensible corner; Up/Down pick the side,
    // Left/Right pick the other. Header icons in the UI cover all four explicitly.
    for (const [accel, corner] of Object.entries(map)) {
      globalShortcut.register(accel, () => this.snapToCorner(corner))
    }
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
      this.win.setMinimumSize(280, 120)
      this.win.setBounds({ ...b, ...this.expandedSize }, true)
    }
  }

  private schedulePersist(): void {
    if (this.collapsed) return
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      const b = this.win.getBounds()
      saveSettings({ bounds: { x: b.x, y: b.y, width: b.width, height: b.height } })
    }, 400)
  }
}
