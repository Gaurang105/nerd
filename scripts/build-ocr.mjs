// Compiles the macOS Vision OCR helper. No-op on non-macOS (Windows OCR is stubbed).
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

if (process.platform !== 'darwin') {
  console.log('[ocr] skip — non-macOS platform')
  process.exit(0)
}

mkdirSync('resources/ocr', { recursive: true })
try {
  execFileSync(
    'swiftc',
    [
      '-O',
      'src/main/screen/ocr/ocr.swift',
      '-o',
      'resources/ocr/nerd-ocr',
      '-framework',
      'Vision',
      '-framework',
      'AppKit'
    ],
    { stdio: 'inherit' }
  )
  console.log('[ocr] built resources/ocr/nerd-ocr')
} catch (err) {
  console.error('[ocr] build failed (screen grounding will degrade to KB-only):', err.message)
  process.exit(0) // non-fatal: the app still runs without OCR
}
