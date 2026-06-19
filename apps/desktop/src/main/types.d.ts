declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: 'png' | 'jpg'
    filename?: string
    screen?: string
  }

  interface ScreenshotFn {
    (options?: ScreenshotOptions): Promise<Buffer>
    listDisplays(): Promise<Array<{ id: string; name: string }>>
  }

  const screenshot: ScreenshotFn
  export default screenshot
}
