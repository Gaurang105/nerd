import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import type { Corner } from '@nerd/shared'

interface Prefs {
  corner: Corner
  isCollapsed: boolean
  panelWidth: number
  panelHeight: number
  opacity: number
}

const COLLAPSED_SIZE = { width: 320, height: 54 }
const DEFAULT_PANEL_SIZE = { width: 380, height: 520 }
const EDGE_GAP = 16
const PERSIST_DEBOUNCE_MS = 500

const DEFAULT_PREFS: Prefs = {
  corner: 'top-right',
  isCollapsed: true,
  panelWidth: DEFAULT_PANEL_SIZE.width,
  panelHeight: DEFAULT_PANEL_SIZE.height,
  opacity: 0.88
}

export class WindowService {
  private readonly win: BrowserWindow
  private prefs: Prefs
  private readonly prefsPath: string
  private persistTimer: NodeJS.Timeout | null = null

  constructor() {
    this.prefsPath = join(app.getPath('userData'), 'nerd-prefs.json')
    this.prefs = this.loadPrefs()

    const initialSize = this.prefs.isCollapsed
      ? COLLAPSED_SIZE
      : { width: this.prefs.panelWidth, height: this.prefs.panelHeight }

    this.win = new BrowserWindow({
      width: initialSize.width,
      height: initialSize.height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true
      }
    })

    this.win.setContentProtection(true)
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.setOpacity(this.prefs.opacity)

    this.applyCornerPosition(this.prefs.corner)

    this.win.on('move', () => this.schedulePersist())
    this.win.on('resize', () => {
      if (!this.prefs.isCollapsed) {
        const [w, h] = this.win.getSize()
        this.prefs.panelWidth = w
        this.prefs.panelHeight = h
      }
      this.schedulePersist()
    })

    this.win.on('ready-to-show', () => this.win.show())
  }

  getWindow(): BrowserWindow {
    return this.win
  }

  isCollapsed(): boolean {
    return this.prefs.isCollapsed
  }

  setCollapsed(collapsed: boolean): void {
    this.prefs.isCollapsed = collapsed
    const size = collapsed
      ? COLLAPSED_SIZE
      : { width: this.prefs.panelWidth, height: this.prefs.panelHeight }
    this.win.setResizable(!collapsed)
    this.win.setSize(size.width, size.height, false)
    this.applyCornerPosition(this.prefs.corner)
    this.schedulePersist()
  }

  snapToCorner(corner: Corner): void {
    this.prefs.corner = corner
    this.applyCornerPosition(corner)
    this.schedulePersist()
  }

  setOpacity(opacity: number): void {
    const clamped = Math.max(0.7, Math.min(1.0, opacity))
    this.prefs.opacity = clamped
    this.win.setOpacity(clamped)
    this.schedulePersist()
  }

  private applyCornerPosition(corner: Corner): void {
    const { workAreaSize, workArea } = screen.getPrimaryDisplay()
    const [w, h] = this.win.getSize()

    let x: number
    let y: number
    switch (corner) {
      case 'top-left':
        x = workArea.x + EDGE_GAP
        y = workArea.y + EDGE_GAP
        break
      case 'top-right':
        x = workArea.x + workAreaSize.width - w - EDGE_GAP
        y = workArea.y + EDGE_GAP
        break
      case 'bottom-left':
        x = workArea.x + EDGE_GAP
        y = workArea.y + workAreaSize.height - h - EDGE_GAP
        break
      case 'bottom-right':
        x = workArea.x + workAreaSize.width - w - EDGE_GAP
        y = workArea.y + workAreaSize.height - h - EDGE_GAP
        break
    }

    this.win.setPosition(Math.round(x), Math.round(y), false)
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persistPrefs()
    }, PERSIST_DEBOUNCE_MS)
  }

  private persistPrefs(): void {
    try {
      writeFileSync(this.prefsPath, JSON.stringify(this.prefs, null, 2), 'utf8')
    } catch (err) {
      console.error('[WindowService] failed to persist prefs', err)
    }
  }

  private loadPrefs(): Prefs {
    try {
      const raw = readFileSync(this.prefsPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<Prefs>
      return { ...DEFAULT_PREFS, ...parsed }
    } catch {
      return { ...DEFAULT_PREFS }
    }
  }
}
