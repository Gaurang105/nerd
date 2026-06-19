import { WebClient } from '@slack/web-api'
import type { MessageElement as Message } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse'

const CHANNELS = ['C07LEENR3AM', 'C0A2T8NN08J', 'C06SN0JS1R8']

export interface SlackDoc {
  id: string
  name: string
  modifiedTime: string
  webViewLink: string
}

export class SlackConnector {
  private client: WebClient

  constructor(token: string) {
    this.client = new WebClient(token)
  }

  async listDocs(): Promise<SlackDoc[]> {
    const docs: SlackDoc[] = []

    for (const channelId of CHANNELS) {
      let cursor: string | undefined
      do {
        const resp = await this.client.conversations.history({
          channel: channelId,
          limit: 200,
          ...(cursor ? { cursor } : {})
        })
        const messages = (resp.messages ?? []) as Message[]
        for (const msg of messages) {
          if (!msg.ts || !msg.text) continue
          const ts = msg.ts
          docs.push({
            id: `slack-${channelId}-${ts}`,
            name: `Slack #${channelId} ${ts}`,
            modifiedTime: new Date(parseFloat(ts) * 1000).toISOString(),
            webViewLink: `https://slack.com/archives/${channelId}/p${ts.replace('.', '')}`
          })
        }
        cursor = resp.response_metadata?.next_cursor ?? undefined
      } while (cursor)
    }

    return docs
  }

  async getDocText(id: string): Promise<string> {
    const parts = id.split('-')
    if (parts.length < 3) return ''
    const channelId = parts[1]!
    const threadTs = parts.slice(2).join('-')

    try {
      const resp = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 100
      })
      const messages = (resp.messages ?? []) as Message[]
      return messages
        .map((m) => m.text ?? '')
        .filter(Boolean)
        .join('\n\n')
    } catch {
      return `[Slack message in channel ${channelId}]`
    }
  }
}
