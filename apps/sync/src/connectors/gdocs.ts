import { google } from 'googleapis'

export interface GDocsFile {
  id: string
  name: string
  modifiedTime: string
  webViewLink: string
}

export interface GDocsConnectorConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
}

export class GDocsConnector {
  private auth: InstanceType<typeof google.auth.OAuth2>

  constructor(cfg: GDocsConnectorConfig) {
    this.auth = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret)
    this.auth.setCredentials({ refresh_token: cfg.refreshToken })
  }

  async listDocs(): Promise<GDocsFile[]> {
    const drive = google.drive({ version: 'v3', auth: this.auth })
    const allFiles: GDocsFile[] = []
    let pageToken: string | undefined

    do {
      const res = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.document' and trashed=false",
        fields: 'nextPageToken, files(id, name, modifiedTime, webViewLink)',
        pageSize: 100,
        ...(pageToken ? { pageToken } : {}),
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        corpora: 'allDrives'
      })
      const files = res.data.files ?? []
      for (const f of files) {
        if (!f.id) continue
        allFiles.push({
          id: f.id,
          name: f.name ?? '',
          modifiedTime: f.modifiedTime ?? new Date(0).toISOString(),
          webViewLink: f.webViewLink ?? ''
        })
      }
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)

    return allFiles
  }

  async getDocText(fileId: string): Promise<string> {
    const drive = google.drive({ version: 'v3', auth: this.auth })
    const res = await drive.files.export(
      { fileId, mimeType: 'text/plain' },
      { responseType: 'text' }
    )
    return typeof res.data === 'string' ? res.data : ''
  }
}
