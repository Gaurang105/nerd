import { Octokit } from '@octokit/rest'
import { log } from '../lib/logger.js'

const REPOS = [
  { owner: 'headout', repo: 'magellan' },
  { owner: 'headout', repo: 'dex-playground' },
  { owner: 'headout', repo: 'dex-ios' },
  { owner: 'headout', repo: 'muse' }
]

const TEXT_EXTENSIONS = new Set([
  'md',
  'txt',
  'yaml',
  'yml',
  'json',
  'ts',
  'tsx',
  'js',
  'jsx',
  'py',
  'go',
  'rb',
  'rs',
  'java',
  'kt',
  'swift',
  'sh',
  'toml',
  'env'
])

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  '.next',
  'vendor'
])

const MAX_FILE_BYTES = 100_000

export interface GitHubDoc {
  id: string
  name: string
  modifiedTime: string
  webViewLink: string
}

function isTextFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_EXTENSIONS.has(ext)
}

function shouldSkipPath(path: string): boolean {
  return path.split('/').some((part) => SKIP_DIRS.has(part))
}

export class GitHubConnector {
  private octokit: Octokit

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token })
  }

  async listDocs(): Promise<GitHubDoc[]> {
    const docs: GitHubDoc[] = []

    for (const { owner, repo } of REPOS) {
      try {
        const repoData = await this.octokit.repos.get({ owner, repo })
        const branch = repoData.data.default_branch
        const pushedAt = repoData.data.pushed_at ?? new Date().toISOString()

        const treeResp = await this.octokit.git.getTree({
          owner,
          repo,
          tree_sha: branch,
          recursive: '1'
        })

        for (const item of treeResp.data.tree) {
          if (item.type !== 'blob') continue
          if (!item.path || !item.sha) continue
          if (shouldSkipPath(item.path)) continue
          if (!isTextFile(item.path)) continue
          if ((item.size ?? 0) > MAX_FILE_BYTES) continue

          docs.push({
            id: `github-${owner}-${repo}-${item.sha}`,
            name: `${repo}/${item.path}`,
            modifiedTime: pushedAt,
            webViewLink: `https://github.com/${owner}/${repo}/blob/${branch}/${item.path}`
          })
        }
      } catch (err) {
        log.warn('github list failed', { owner, repo, err: String(err) })
      }
    }

    return docs
  }

  async getDocText(id: string): Promise<string> {
    const parts = id.split('-')
    if (parts.length < 4) return ''
    const owner = parts[1]!
    const repoName = parts[2]!
    const fileSha = parts[3]!

    try {
      const resp = await this.octokit.git.getBlob({
        owner,
        repo: repoName,
        file_sha: fileSha
      })
      if (resp.data.encoding === 'base64') {
        return Buffer.from(resp.data.content, 'base64').toString('utf-8')
      }
      return resp.data.content
    } catch {
      return ''
    }
  }
}
