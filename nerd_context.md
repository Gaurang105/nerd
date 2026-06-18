# Nerd — context transfer document

## What is Nerd

Nerd is a floating AI overlay for macOS that sits on a BD rep's screen during partner calls, invisible to the other party. It listens to both sides of the conversation, detects when the partner asks a question, retrieves the right answer from a pre-loaded knowledge base, and surfaces it on screen before the rep needs to hedge or defer.

The core problem it solves: BD reps at Dex lose negotiating leverage when they approximate, defer, or hedge answers to specific commercial questions — SLA uptime numbers, margin tiers, payout cycles, GST compliance, bulk pricing — because that information lives across Notion, Slack, Google Docs, GitHub, and Pitch decks, not in the rep's head.

---

## Target users

- OTA / distribution platform BD reps (questions: API uptime SLAs, inventory depth, margin tiers)
- Offline travel agent network reps (questions: payout cycles, group booking, complaint resolution)
- Corporate / MICE reseller reps (questions: bulk pricing, GST compliance, NPS by city, consolidated invoicing)

---

## Platform

- macOS only (v1)
- Desktop app: Electron + React + Vite
- The overlay window is `alwaysOnTop: true`, `transparent: true`, `skipTaskbar: true`
- Screen-share invisibility via macOS `CGWindowLevel` native addon (same approach as Cluely)

---

## Full system architecture

```
Data Sources (Slack, GitHub, Google Docs, Notion, Pitch)
        │
        ▼
AWS EC2 — cron only (Node.js, no HTTP server)
  ├── node-cron every 6h — differential sync
  ├── Fetch changed docs from source APIs
  ├── Chunk + embed (OpenAI text-embedding-3-small)
  ├── Write vectors → Qdrant Cloud
  └── Write metadata → Supabase Postgres
        │
        ▼ (vectors + metadata written, always fresh)

Qdrant Cloud (ap-south-1)    ←── queried directly by Electron app
Supabase Postgres (ap-south-1) ←── queried directly by Electron app

        │
        ▼
Electron App — all RAG and answer logic runs locally (macOS only)
  ├── AudioCaptureService (electron-audio-loopback — mic + system)
  ├── TranscriptionService (Deepgram Nova-3 — two WebSocket streams)
  ├── QuestionDetector (regex + Claude classifier)
  ├── RAGService
  │     ├── embed question → OpenAI API
  │     ├── search → Qdrant Cloud directly
  │     └── generate answer → Claude API
  ├── PreCallBriefingService
  │     ├── embed rep's meeting description → Qdrant (full knowledge base)
  │     └── generate briefing → Claude API
  └── IPC bridge → Renderer (React overlay)
```

### What runs where — quick reference

| Component | Where it runs | Why |
|---|---|---|
| Cron sync | AWS EC2 (always-on) | Device-off problem — laptop can be closed |
| Chunking + embedding | AWS EC2 (during sync) | Runs once per changed doc, not per query |
| Qdrant vectors | Qdrant Cloud (hosted) | Always writable by cron, always queryable by app |
| Supabase metadata | Supabase (hosted) | Always writable by cron, always queryable by app |
| RAG query logic | Electron main process (local) | Low latency, no server hop during live call |
| Answer generation | Electron → Claude API (local call) | Direct API call, no middleman |
| Pre-call briefing | Electron → Claude API (local call) | Direct API call, no middleman |
| Audio capture | Electron main process (local) | OS-level audio driver access |
| Transcription | Electron → Deepgram (WebSocket) | Streaming STT, low latency |
| Overlay UI | Electron renderer (local) | React, always-on-top window |

**The EC2 server has no HTTP server, no Express, no API endpoints.
It is a single cron job that runs, syncs, and exits. Nothing else.**

---

## Technology decisions (with reasoning)

### Desktop framework — Electron

Chosen over Tauri because:
- `electron-audio-loopback` npm package handles system audio loopback (mic + speaker) on macOS 12.3+ out of the box
- Full Node.js in main process — IPC, native addons, direct API calls all just work
- Larger ecosystem for the OS integrations Nerd needs (tray, global hotkeys, window level control)
- Tauri would require custom Rust native plugins for audio capture — significant extra work

### Transcription — Deepgram Nova-3

Chosen over Whisper (local), AssemblyAI, ElevenLabs Scribe:
- Sub-300ms streaming latency — fastest among production STT APIs
- `utterance_end_ms` event fires the moment a speaker stops — this is the trigger for the RAG pipeline
- Two simultaneous WebSocket connections: one for mic (`Me`), one for system audio (`Them`)
- Question detector watches the `Them` stream primarily
- Pricing: $0.0077/min streaming — negligible at BD call volumes

### Vector database — Qdrant Cloud

Chosen over Pinecone, LanceDB (local), pgvector:
- 4ms p50 latency (vs Pinecone serverless ~20–40ms) — critical for answering before the partner finishes asking
- Rust implementation: tight p99, no GC pauses, no cold-start variance
- No org-level filtering needed — single shared index, search across full knowledge base
- **Free tier: 1GB RAM / 4GB disk, forever, no credit card** — enough for ~500k vectors
- Queried directly from the Electron app — no server hop, no middleman latency
- Deploy in `ap-south-1` (Mumbai) for minimum network hop from Bengaluru

Why not local LanceDB: the device-off problem — cron can never fire if the laptop is closed. Qdrant Cloud stays writable by the always-on EC2 cron regardless of whether the rep's laptop is on.

Why not Pinecone: serverless tier trades latency for convenience. 20–40ms vs 4ms matters when the product promise is "answer before the partner finishes asking."

### Structured database — Supabase Postgres

Stores: documents, chunks index, sync_runs log
- Free tier: 500MB, always-on
- Queried directly from the Electron app — no server hop
- Same `ap-south-1` region as Qdrant

### Embedding model — OpenAI text-embedding-3-small

- 1536-dimension vectors
- $0.02 per million tokens — ~$0.50/month at Nerd's sync volume
- Runs on EC2 during sync (not on the rep's machine, not per query)
- Best quality/cost ratio; no GPU required

### Server — AWS EC2 (cron only, no HTTP server)

- Runs a single `cron.ts` file — no Express, no API, no open ports
- Free tier: 750 hours/month of t3.micro for 12 months
- After 12 months: t4g.micro ~$6/month
- Region: `ap-south-1` (Mumbai)
- Warning: avoid NAT Gateways (~$33/month just for being on), unattached Elastic IPs, unnecessary data transfer out

### Reranker — Cohere Rerank v2 (optional, add in v2)

- Retrieves top-20 from Qdrant, reranks to top-5 before sending to Claude
- Adds ~200ms but significantly reduces hallucination risk
- Skip in v1, add when first wrong answer appears in production

---

## Data sources and sync

### Sources (v1)

**Notion**
- Workspace: headouthub
- URL: https://www.notion.so/headouthub/9140d4907abf4714941eaee6c13b0037
- Scope: all pages and subpages recursively

**GitHub** (12hr cron — changes less frequently)
- headout/magellan
- headout/dex-playground
- headout/dex-ios
- headout/muse
- Scope: every text file across all repos (md, txt, yaml, json, code files) — skip binaries

**Slack** (6hr cron)
- Dex Biz: C07LEENR3AM
- Dex GTM: C0A2T8NN08J
- Dex Internal: C06SN0JS1R8
- Scope: every thread in each channel, all messages within threads, text file attachments

**Google Docs** (6hr cron)
- Current doc: 1N47qw2ycH7V_FEii5f2HbqT9CH6cr7MAHPD0CIjXf7w
- Scope: full text of every doc in shared drive / provided folder IDs

**Pitch.com** (6hr cron)
- Scope: all decks in the workspace — text from every slide

### Sync strategy — differential sync (not full rebuild)

Every 6-hour cron run on EC2:
1. Fetch remote manifest (doc id + `updated_at`) from each source API — lightweight
2. Diff against Supabase `documents` table by `content_hash` and `updated_at`
3. Three outcomes:
   - **New**: fetch full content → chunk → embed → insert Qdrant + Supabase
   - **Changed**: delete old chunks from Qdrant (`doc_id` filter) + Supabase → re-embed → insert
   - **Unchanged**: skip entirely (typically 80–90% of docs on any given run)
4. Handle deleted docs: remove from both stores when they disappear from remote manifest
5. Write `sync_runs` row to Supabase with stats + any errors

The cron runs regardless of whether any rep's laptop is on. Context is always fresh.

### Chunking strategy

- Target: ~400 tokens per chunk
- Overlap: ~50 tokens between chunks (handles questions that span paragraph boundaries)
- Split at paragraph boundaries, not mid-sentence
- Each chunk carries: `source`, `doc_title`, `url`, `source_metadata`, `updated_at`

---

## Database schemas

### Supabase Postgres

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,        -- 'gdocs' | 'slack' | 'github' | 'notion' | 'pitch'
  title TEXT,
  url TEXT,
  content_hash TEXT,
  source_metadata JSONB,       -- source-specific context (channel name, repo path, etc.)
  last_synced_at BIGINT,
  updated_at BIGINT,
  deleted_at BIGINT            -- soft delete: set when doc disappears from source
);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,         -- same value used as Qdrant point ID
  doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  token_count INTEGER
);

CREATE TABLE sync_runs (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,        -- which source this run covered
  started_at BIGINT NOT NULL,
  finished_at BIGINT,
  docs_scanned INTEGER DEFAULT 0,
  docs_new INTEGER DEFAULT 0,
  docs_updated INTEGER DEFAULT 0,
  docs_skipped INTEGER DEFAULT 0,
  docs_deleted INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'
);

CREATE INDEX ON documents(content_hash);
CREATE INDEX ON chunks(doc_id);
```

### Qdrant index

```
index name: nerd-chunks
fields per vector:
  id: string              ← same as chunks.id in Supabase
  doc_id: string
  source: string          ← 'gdocs' | 'slack' | 'github' | 'notion' | 'pitch'
  doc_title: string
  url: string
  source_metadata: object ← channel name, repo path, Notion parent, etc.
  text: string            ← raw chunk text sent to Claude
  vector: float[1536]     ← text-embedding-3-small output
  updated_at: timestamp
```

---

## RAG query pipeline (during a live call)

Runs entirely inside the Electron main process — no server hop.

```
Deepgram utterance_end fires (Them stream)
  → QuestionDetector: regex + Claude classifier confirms it's a question
  → embed question via OpenAI API — ~80ms
  → Qdrant Cloud ANN search, full index, top-20 — ~4ms
  → (v2) Cohere rerank top-20 → top-5 — ~200ms
  → Claude API: top-5 chunks + question → cited answer — ~800ms
  → IPC push → React overlay renders answer
Total: ~900ms v1 (without reranker)
```

### Claude prompt structure

```
You are Nerd, a real-time assistant for a BD rep at Dex.
The rep is on a call with a strategic partner.

Answer the partner's question using ONLY the context below.
Be concise. Lead with the exact number or fact. Cite the source.
If the answer is not in the context, say "I don't have that data — check with ops."

CONTEXT:
{top_5_chunks_with_source_labels}

PARTNER'S QUESTION:
{question}
```

---

## Pre-call briefing flow

Triggered when the rep opens Nerd and describes their upcoming meeting, before joining the call.
Runs entirely inside the Electron main process — no server hop.

1. Rep types a free-form meeting description (e.g. "going to meet MakeMyTrip SP, they want to talk about API reliability and payout timelines")
2. That full sentence is embedded → Qdrant semantic search across the full knowledge base → top-20 chunks
3. Context assembler: rank by recency + relevance, deduplicate, pack into ~10k token context block
4. Claude generates a 200-word briefing: the 3 most likely questions the SP will ask + exact defensible answers
   — the rep's description is passed as prompt context, no DB filtering
5. Briefing card shown at top of overlay; full context bundle held in memory as live RAG corpus for the call
6. Deepgram starts listening on both streams

End-to-end: 4–8 seconds. Completes while the rep is clicking "join call."

### Briefing response shape

```ts
{
  briefing: string,              // 200-word summary — shown in overlay header
  anticipated_questions: [       // 3 predicted Q+A pairs — shown as quick-reference cards
    { question: string, answer: string, source: string }
  ],
  context_age: string,           // e.g. "2h ago" — from last sync_runs row
  sources_loaded: number         // count of chunks in context bundle
}
```

---

## Electron app — internal module structure

```
Main process (Node.js — runs locally)
  ├── AudioCaptureService
  │     ├── mic stream  → Deepgram WebSocket #1  (role: "Me")
  │     └── system stream → Deepgram WebSocket #2  (role: "Them")
  ├── TranscriptionService
  │     ├── interim_results: true  (live rolling transcript in overlay)
  │     └── utterance_end_ms: 1000  (silence threshold to trigger detection)
  ├── QuestionDetector
  │     ├── regex pass: ends with "?", starts with question word
  │     └── Claude classifier for ambiguous utterances
  ├── RAGService
  │     ├── embedQuestion()   → OpenAI text-embedding-3-small
  │     ├── retrieveChunks()  → Qdrant Cloud (full index, top-20)
  │     └── generateAnswer()  → Claude API (claude-sonnet-4-6)
  ├── PreCallBriefingService
  │     ├── loadContext()        → Qdrant (full knowledge base, seed queries)
  │     └── generateBriefing()  → Claude API (partner name passed as prompt context)
  └── IPC bridge (contextBridge)
        └── exposes: onAnswer, onTranscript, onBriefingReady, askManually

Renderer process (React + Vite — runs locally)
  ├── Overlay window (alwaysOnTop: true, transparent: true, skipTaskbar: true)
  ├── BriefingCard       — pre-call summary + anticipated questions
  ├── AnswerPanel        — live answers with source citation + confidence
  ├── TranscriptFeed     — rolling live transcript (Them stream highlighted)
  └── ManualInputBar     — fallback: rep types question, gets RAG answer
```

---

## Credentials security note

Qdrant Cloud and Supabase credentials live inside the Electron app on the rep's machine (in `.env`, loaded at build time via `electron-builder`). For an internal tool used only by Dex reps, this is acceptable in v1. If Nerd is ever distributed externally, move credentials behind a thin auth API so they never touch the client binary.

---

## Complete cost breakdown (per rep per month)

| Service | Plan | Cost |
|---|---|---|
| AWS EC2 t3.micro (cron only) | Free tier (12 months) | $0 → $8/mo after |
| Supabase Postgres | Free tier (500MB) | $0 |
| Qdrant Cloud | Free tier (1GB RAM) | $0 |
| OpenAI embeddings | text-embedding-3-small (sync only) | ~$0.50 |
| Deepgram Nova-3 | Streaming (~2h calls/day) | ~$3–5 |
| Claude API | claude-sonnet-4-6 (answers + briefing) | ~$5–10 |
| **Total** | | **~$8–15/mo per rep** |

---

## What to build — recommended order

1. **Electron shell + floating overlay** — window renders, always-on-top, transparent, React inside, IPC wired
2. **EC2 cron scaffold** — `cron.ts` connects to Supabase + Qdrant, runs on schedule, no HTTP server
3. **One data source sync** — Google Docs → differential sync → Qdrant (proves full pipeline end to end)
4. **Pre-call briefing + manual Q&A** — rep types meeting description → briefing appears → rep types question → RAG answer (no audio yet)
5. **Audio capture + Deepgram** — mic + system loopback, rolling transcript appears in overlay
6. **Question detector** — regex + Claude classifier watching the Them stream
7. **Full auto-detect flow** — question fires → RAG → answer appears automatically
8. **Remaining data sources** — Slack, Notion, GitHub, Pitch
9. **Cohere reranker** — add when first wrong answer appears in production

---

## Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Qdrant / Supabase unreachable during call | 2s timeout, show "context unavailable" — never hang the overlay |
| Qdrant free tier fills up | Monitor chunk count in sync_runs; scalar quantization gives 4x compression before needing to upgrade |
| Deepgram misses a question | ManualInputBar fallback always visible in overlay |
| Sync fails silently on EC2 | sync_runs table logs every run + errors; overlay shows "last synced Xh ago" in header |
| Screen share detects overlay | CGWindowLevel native addon — test against Zoom, Google Meet, Teams before launch |
| AWS free tier expires after 12 months | Set billing alert at $5/month; move to t4g.micro 1-year reserved instance (~$4/mo) |
| Credentials exposed in app bundle | Acceptable for internal v1; add auth API layer before any external distribution |

---

## Open decisions (not yet resolved)

- **Authentication**: Google OAuth restricted to @headout.com — Supabase Auth handles domain restriction, RLS locks tables, Qdrant key moves to Supabase Edge Function
- **Multi-rep**: single shared Qdrant index (all reps query the same knowledge base) — no per-rep isolation needed since sources are Dex-internal
- **Offline / degraded mode**: if Qdrant or Supabase unreachable, fall back to a local cached snapshot of the last briefing?
- **Sync credentials on EC2**: EC2 holds OAuth tokens for Slack, Notion, GDocs, GitHub, Pitch — store in AWS Secrets Manager or SSM Parameter Store (both free tier eligible)
- **Pitch.com API**: verify Pitch exposes a programmatic API for slide text extraction — may need to use their export flow

---

*Last updated: June 2026 — revised to local RAG architecture + cron-only server + pre-call briefing naming*
