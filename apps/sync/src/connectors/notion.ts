import { Client, isFullPage } from '@notionhq/client'
import type {
  BlockObjectResponse,
  RichTextItemResponse
} from '@notionhq/client/build/src/api-endpoints.js'

const ROOT_PAGE_ID = '9140d4907abf4714941eaee6c13b0037'

export interface NotionDoc {
  id: string
  name: string
  modifiedTime: string
  webViewLink: string
}

function richTextToString(richText: RichTextItemResponse[]): string {
  return richText.map((rt) => rt.plain_text).join('')
}

function blockToText(block: BlockObjectResponse): string {
  const b = block as unknown as Record<string, { rich_text?: RichTextItemResponse[] }>
  const type = block.type
  const payload = b[type]
  const textArr = payload?.rich_text
  if (textArr) return richTextToString(textArr)
  if (type === 'divider') return '---'
  return ''
}

export class NotionConnector {
  private client: Client

  constructor(token: string) {
    this.client = new Client({ auth: token })
  }

  private async collectPages(
    rootPageId: string
  ): Promise<Array<{ id: string; title: string; lastEdited: string; url: string }>> {
    const pages: Array<{ id: string; title: string; lastEdited: string; url: string }> = []
    const visited = new Set<string>()

    const recurse = async (pageId: string): Promise<void> => {
      if (visited.has(pageId)) return
      visited.add(pageId)

      try {
        const page = await this.client.pages.retrieve({ page_id: pageId })
        if (isFullPage(page)) {
          const titleProp = Object.values(page.properties).find((p) => p.type === 'title') as
            | { title: Array<{ plain_text: string }> }
            | undefined
          const title = titleProp?.title?.map((t) => t.plain_text).join('') ?? 'Untitled'
          pages.push({
            id: page.id,
            title,
            lastEdited: page.last_edited_time,
            url: page.url
          })
        }
      } catch {
        return
      }

      let cursor: string | undefined
      do {
        const children = await this.client.blocks.children.list({
          block_id: pageId,
          ...(cursor ? { start_cursor: cursor } : {})
        })
        for (const block of children.results) {
          if ('type' in block && block.type === 'child_page') {
            await recurse(block.id)
          }
        }
        cursor = children.has_more ? (children.next_cursor ?? undefined) : undefined
      } while (cursor)
    }

    await recurse(rootPageId)
    return pages
  }

  async listDocs(): Promise<NotionDoc[]> {
    const pages = await this.collectPages(ROOT_PAGE_ID)
    return pages.map((p) => ({
      id: `notion-${p.id}`,
      name: p.title,
      modifiedTime: p.lastEdited,
      webViewLink: p.url
    }))
  }

  async getDocText(id: string): Promise<string> {
    const pageId = id.replace(/^notion-/, '')
    const lines: string[] = []
    let cursor: string | undefined

    do {
      const resp = await this.client.blocks.children.list({
        block_id: pageId,
        ...(cursor ? { start_cursor: cursor } : {})
      })
      for (const block of resp.results) {
        if ('type' in block) {
          const text = blockToText(block as BlockObjectResponse)
          if (text) lines.push(text)
        }
      }
      cursor = resp.has_more ? (resp.next_cursor ?? undefined) : undefined
    } while (cursor)

    return lines.join('\n\n')
  }
}
