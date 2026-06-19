import screenshot from 'screenshot-desktop'
import { createWorker } from 'tesseract.js'

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>

export class ScreenContextService {
  private worker: TesseractWorker | null = null
  private initializing = false
  private ready = false

  async init(): Promise<void> {
    if (this.ready || this.initializing) return
    this.initializing = true
    try {
      this.worker = await createWorker('eng', 1, {
        logger: () => {} // suppress verbose logging
      })
      this.ready = true
    } catch (err) {
      console.error('[ScreenContextService] Tesseract init failed:', err)
    } finally {
      this.initializing = false
    }
  }

  async captureAndOcr(): Promise<string> {
    if (!this.ready || !this.worker) {
      // Tesseract not ready — return empty (degrade to KB-only)
      return ''
    }

    try {
      const imgBuffer = await screenshot({ format: 'png' })
      const {
        data: { text }
      } = await this.worker.recognize(imgBuffer)
      return text.trim()
    } catch (err) {
      console.error('[ScreenContextService] OCR failed:', err)
      return ''
    }
  }

  async destroy(): Promise<void> {
    await this.worker?.terminate()
    this.worker = null
    this.ready = false
  }
}
