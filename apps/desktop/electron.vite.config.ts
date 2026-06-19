import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const workspaceRoot = resolve(__dirname, '../..')

export default defineConfig({
  main: {
    envDir: workspaceRoot
  },
  preload: {
    envDir: workspaceRoot
  },
  renderer: {
    envDir: workspaceRoot,
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
