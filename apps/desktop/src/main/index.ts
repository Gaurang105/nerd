import { app, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import { IPC } from '@nerd/shared'
import type {
  CreateModeRequest,
  DeleteModeRequest,
  SetActiveModeRequest,
  SnapToCornerRequest,
  UpdateModeRequest
} from '@nerd/shared'
import { WindowService } from './services/window.service'
import { ModeService } from './services/mode.service'

let windowService: WindowService
let modeService: ModeService

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.headout.nerd')
  app.on('browser-window-created', (_, win) => optimizer.watchWindowShortcuts(win))

  windowService = new WindowService()
  modeService = new ModeService()
  const win = windowService.getWindow()

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  ipcMain.handle(IPC.SNAP_TO_CORNER, (_e, { corner }: SnapToCornerRequest) =>
    windowService.snapToCorner(corner)
  )
  ipcMain.handle(IPC.LIST_MODES, () => modeService.listModes())
  ipcMain.handle(IPC.GET_ACTIVE_MODE, () => modeService.getActiveMode())
  ipcMain.handle(IPC.SET_ACTIVE_MODE, (_e, { modeId }: SetActiveModeRequest) =>
    modeService.setActiveMode(modeId)
  )
  ipcMain.handle(IPC.CREATE_MODE, (_e, { name, systemPrompt }: CreateModeRequest) =>
    modeService.createMode(name, systemPrompt)
  )
  ipcMain.handle(IPC.UPDATE_MODE, (_e, { id, updates }: UpdateModeRequest) =>
    modeService.updateMode(id, updates)
  )
  ipcMain.handle(IPC.DELETE_MODE, (_e, { id }: DeleteModeRequest) => modeService.deleteMode(id))
  ipcMain.handle(IPC.SET_OUTPUT_FORMAT, (_e, _fmt) => {
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
