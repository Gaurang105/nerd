import { app, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import { IPC } from '@nerd/shared'
import type { SnapToCornerRequest } from '@nerd/shared'
import { WindowService } from './services/window.service'

let windowService: WindowService

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.headout.nerd')
  app.on('browser-window-created', (_, win) => optimizer.watchWindowShortcuts(win))

  windowService = new WindowService()
  const win = windowService.getWindow()

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  ipcMain.handle(IPC.SNAP_TO_CORNER, (_e, { corner }: SnapToCornerRequest) =>
    windowService.snapToCorner(corner)
  )
  ipcMain.handle(IPC.LIST_MODES, () => [])
  ipcMain.handle(IPC.SET_OUTPUT_FORMAT, (_e, _fmt) => {
    /* stub — ModeService lands later */
  })
  ipcMain.handle(IPC.SET_ACTIVE_MODE, (_e, _req) => {
    /* stub */
  })
  ipcMain.handle(IPC.ASK_MANUALLY, (_e, _req) => {
    /* stub */
  })
  ipcMain.handle(IPC.GENERATE_BRIEFING, (_e, _req) => {
    /* stub */
  })
  ipcMain.handle(IPC.START_AUDIO, () => {
    /* stub */
  })
  ipcMain.handle(IPC.STOP_AUDIO, () => {
    /* stub */
  })
  ipcMain.handle(IPC.GET_COLLAPSED, () => windowService.isCollapsed())
  ipcMain.handle(IPC.SET_COLLAPSED, (_e, collapsed: boolean) =>
    windowService.setCollapsed(collapsed)
  )
  ipcMain.handle(IPC.SET_OPACITY, (_e, opacity: number) => windowService.setOpacity(opacity))
})

app.on('window-all-closed', () => app.quit())
