export interface PitchDoc {
  id: string
  name: string
  modifiedTime: string
  webViewLink: string
}

// Pitch.com has no public API for programmatic slide text extraction at the
// time of writing. Real implementation will either use the Pitch export flow
// (download PDF/PPTX, parse) or a future public API. Returning empty until then.
export class PitchConnector {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor(_token: string) {}

  async listDocs(): Promise<PitchDoc[]> {
    return []
  }

  async getDocText(_id: string): Promise<string> {
    return ''
  }
}
