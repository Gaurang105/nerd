# nerd — "Know it all"

A floating, always-on-top meeting copilot for macOS and Windows. It listens to your call and, on `⌘+Enter`, answers questions grounded in your company's synced internal knowledge base. **Hidden mode** keeps the overlay invisible to screen-share viewers.

Built with Electron + React + Vite.

---

## How it works

```
┌─────────────────────┐     HTTPS (ngrok)      ┌──────────────────────┐
│  nerd (Electron)    │ ─────────────────────► │  query-api gateway   │
│  mic + system audio │                        │  localhost:3841       │
│  Deepgram → RAG     │                        │  /search  → Qdrant   │
└─────────────────────┘                        │  /sql     → Postgres │
                                               └──────────────────────┘
```

The desktop app never talks to Qdrant or Postgres directly — it calls a single **gateway URL** (`MAIN_VITE_GATEWAY_URL`) that fronts read-only vector search and SQL. On the host machine, `services/query-api` runs locally and is exposed via ngrok (or any static tunnel).

**Assist flow (`⌘+Enter`):** recent transcript → query rewrite → embed → vector search → Cohere rerank → optional SQL tool call → streamed answer with citations.

---

## Features

| | Feature | Detail |
|---|---|---|
| 🎙️ | Live transcription | Deepgram nova-3 on mic + system audio; `multi` language for Hindi/English code-switching |
| 🙈 | Hidden mode | Overlay excluded from screen capture — toggle with `⌘+\` |
| 📝 | Output formats | Bullet points (`list`) or prose (`paragraph`) |
| 🎭 | Modes | Named personas with custom system prompts, stored in `modes.json` |
| ⌨️ | Global shortcuts | `⌘+Enter` assist · `⌘+T` toggle session · `⌘+N` new chat · `⌘+.` settings — all rebindable |

---

## Setup

### 1. Electron app

```bash
cp .env.example .env   # fill in the values below
npm install
npm run dev
```

**Required env vars:**

| Variable | Purpose |
|---|---|
| `MAIN_VITE_GATEWAY_URL` | Public URL of the query-api gateway (ngrok) |
| `MAIN_VITE_OPENAI_API_KEY` | Embeddings, query rewrite, generation |
| `MAIN_VITE_COHERE_API_KEY` | Reranking |
| `MAIN_VITE_DEEPGRAM_API_KEY` | Live transcription |

Optional model overrides (`MAIN_VITE_GEN_MODEL`, `MAIN_VITE_REWRITE_MODEL`, etc.) are documented in `.env.example`.

### 2. Gateway (`services/query-api`)

Runs on `127.0.0.1:3841`. Requires a local Postgres instance and a reachable Qdrant cluster.

```bash
cd services/query-api

# Bootstrap the Postgres schema (once)
psql -h localhost -U admin -d localdb -f schema.sql

# Create services/query-api/.env with QDRANT_URL, QDRANT_API_KEY, OPENAI_API_KEY, PG_* vars
npm install && npm run dev
```

Then expose port 3841 via ngrok and paste the URL into `MAIN_VITE_GATEWAY_URL`.

### 3. Seed the knowledge base (one-time)

Dump Slack channel exports to `data/slack/<channel_id>.json`, then run the ingest loader:

```bash
cd services/query-api
set -a; . ../../.env; . ./.env; set +a
npx tsx src/ingest/load-slack.ts
```

This seeds both Qdrant (vectors) and Postgres (metadata). A differential sync cron is planned — this loader is the current path for initial backfill.

---

## Scripts

```bash
npm run dev          # start in development mode
npm run build        # typecheck + build
npm run build:mac    # package for macOS (also build:win / build:linux)
npm run check        # run self-checks (rerank, transcript buffer, display follow)
npm run typecheck    # type-check main + renderer
npm run lint
```

---

## Repo layout

```
src/                  Electron app (main, preload, renderer)
services/query-api/   Local gateway — /search, /sql, Slack ingest
data/slack/           Slack JSON dumps for ingest (gitignored)
nerd_prd.md           Product spec
nerd_erd.md           Architecture & data model
```
