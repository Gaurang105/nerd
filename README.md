# nerd — "Know it all"

A real-time meeting copilot: a floating, always-on-top desktop overlay (macOS + Windows) that listens to a call, and on `⌘+Enter` answers from the recent conversation — grounded in Headout's synced Slack knowledge base. Hidden mode keeps it invisible to screen-share viewers.

Built with Electron + React + Vite. The knowledge base is kept fresh by a separate host-laptop Slack sync job (planned).

## Project Setup

Copy `.env.example` to `.env` and fill in the keys (Qdrant, Postgres, OpenAI, Cohere, Deepgram).

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Checks & build

```bash
$ npm run check       # runnable self-checks (rerank + transcript buffer)
$ npm run typecheck
$ npm run lint
$ npm run build
```

### Package

```bash
$ npm run build:mac   # or build:win / build:linux
```
