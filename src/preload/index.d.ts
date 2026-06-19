import type { ElectronAPI } from '@electron-toolkit/preload'
import type { NerdAPI } from '@shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    nerd: NerdAPI
  }
}
