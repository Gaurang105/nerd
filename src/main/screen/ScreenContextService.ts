import { app, desktopCapturer, screen } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const execFileP = promisify(execFile)

function helperPath(): string | null {
  const candidates = [
    join(process.resourcesPath, 'ocr', 'nerd-ocr'),
    join(app.getAppPath(), 'resources', 'ocr', 'nerd-ocr')
  ]
  return candidates.find(existsSync) ?? null
}

/**
 * On-demand OCR of the active display, injected as the SCREEN block at hotkey time.
 * Best-effort: any failure returns '' so generation proceeds KB-only and never blocks.
 * ponytail: macOS-only (Windows returns ''); upgrade path = a Windows.Media.Ocr addon.
 * ponytail: captures the primary display; upgrade path = the display under the cursor.
 */
export async function captureScreenText(): Promise<string> {
  if (process.platform !== 'darwin') return ''
  const helper = helperPath()
  if (!helper) return ''
  let tmp: string | null = null
  try {
    const display = screen.getPrimaryDisplay()
    const scale = display.scaleFactor || 1
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * scale),
        height: Math.round(display.size.height * scale)
      }
    })
    const png = sources[0]?.thumbnail.toPNG()
    if (!png || png.length === 0) return ''
    tmp = join(tmpdir(), `nerd-screen-${Date.now()}.png`)
    await writeFile(tmp, png)
    const { stdout } = await execFileP(helper, [tmp], { maxBuffer: 8 * 1024 * 1024 })
    return stdout.trim()
  } catch (err) {
    console.error('[screen] OCR failed, degrading to KB-only', err)
    return ''
  } finally {
    if (tmp) void unlink(tmp).catch(() => {})
  }
}
