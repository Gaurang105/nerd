# nerd — "Know it all"

A real-time meeting copilot: a floating, always-on-top desktop overlay (macOS + Windows) that listens to a call and, on `⌘+Enter`, answers from the recent conversation — grounded in Headout's synced Slack knowledge base. Hidden mode keeps the overlay invisible to screen-share viewers.

Built with Electron + React + Vite.

## How it works

```
┌─────────────────────┐     HTTPS (ngrok)      ┌──────────────────────┐
│  nerd (Electron)    │ ─────────────────────► │  query-api gateway   │
│  mic + system audio │                        │  localhost:3841        │
│  Deepgram → RAG     │                        │  /search  → Qdrant   │
└─────────────────────┘                        │  /sql     → Postgres │
                                               └──────────────────────┘
```

The desktop app never talks to Qdrant or Postgres directly. It calls a single **gateway URL** (`MAIN_VITE_GATEWAY_URL`) that fronts read-only SQL and vector search. On the host laptop, `services/query-api` runs locally and is exposed via ngrok (or another static tunnel).

**Assist flow (`⌘+Enter`):** recent transcript → query rewrite → embed → vector search → Cohere rerank → optional SQL tool → streamed answer with citations.

**Other flows:** typed Q&A in the composer, pre-meeting briefing (Settings → Briefing), and configurable **Modes** (per-rep system prompts stored in `modes.json`).

## Features

| Feature | Detail |
| --- | --- |
| Live transcription | Deepgram nova-3 on mic + system audio (`multi` language for Hindi/English code-switching) |
| Hidden mode | Overlay excluded from screen capture; toggle with `⌘+\` |
| Output format | Bullet pointers (`list`) or full prose (`paragraph`) |
| Modes | Named personas with custom system prompts |
| Global shortcuts | `⌘+Enter` assist, `⌘+T` toggle session, `⌘+N` new chat, `⌘+.` settings — all rebindable |

## Project setup

### 1. Electron app

Copy `.env.example` to `.env` and fill in:

- `MAIN_VITE_GATEWAY_URL` — public URL of the query-api gateway (ngrok)
- `MAIN_VITE_OPENAI_API_KEY`, `MAIN_VITE_COHERE_API_KEY`, `MAIN_VITE_DEEPGRAM_API_KEY`
- Optional model overrides (see `.env.example`)

```bash
npm install
npm run dev
```

### 2. Gateway (`services/query-api`)

Runs on `127.0.0.1:3841`. Needs local Postgres + Qdrant reachable from that machine.

```bash
cd services/query-api
npm install

# Bootstrap local Postgres schema (once)
psql -h localhost -U admin -d localdb -f schema.sql

# Create services/query-api/.env with QDRANT_URL, QDRANT_API_KEY, OPENAI_API_KEY, PG_* vars
npm run dev
```

Expose port 3841 with ngrok and set the URL in the app's `MAIN_VITE_GATEWAY_URL`.

**Slack knowledge base (one-time backfill):** dump channel JSON to `data/slack/<channel_id>.json`, then run the ingest loader from `services/query-api`:

```bash
set -a; . ../../.env; . ./.env; set +a
npx tsx src/ingest/load-slack.ts
```

See `services/query-api/src/ingest/load-slack.ts` for env vars and options. A differential sync cron is planned; this loader is the current path to seed Qdrant + Postgres.

## Scripts

```bash
npm run check       # runnable self-checks (rerank, transcript buffer, display follow)
npm run typecheck
npm run lint
npm run build
npm run build:mac   # or build:win / build:linux
```

## Repo layout

```
src/                  Electron app (main, preload, renderer)
services/query-api/   Local gateway — /search, /sql, Slack ingest
data/slack/           Slack JSON dumps for ingest (gitignored)
nerd_prd.md           Product spec
nerd_erd.md           Architecture & data model
```
