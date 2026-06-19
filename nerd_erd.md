# Nerd — context transfer document

## What is Nerd

Nerd is a floating AI overlay for macOS and Windows that sits on a user's screen during calls, invisible to the other party. It listens to both sides of the conversation and builds a live transcript. When the user presses a hotkey, it answers based on the recent conversation context and surfaces the answer on screen — without the user needing to type a question. The answer blends two sources: Headout's pre-loaded internal knowledge base (authoritative for company-specific facts) and the LLM's own general knowledge (to fill gaps and handle conceptual questions).

The core problem it solves: people lose leverage or credibility in live conversations when they approximate, defer, or hedge answers to specific questions — SLA uptime numbers, margin tiers, payout cycles, GST compliance, bulk pricing — because that information lives across Notion, Slack, Google Docs, GitHub, and Pitch decks, not in their head.

**How the trigger works**: there is no auto-detection. The user presses `Cmd+Enter` (global hotkey). Nerd takes the last N seconds of transcript as the question context, runs the RAG pipeline, and pushes the answer to the overlay. The user stays in the conversation the whole time.

**Modes**: the user can select a **Mode** — a saved, named **custom system prompt** that replaces Nerd's default generation system prompt (e.g. a terse-leadership persona vs. a verbose-junior persona). Modes are stored locally per-rep; the knowledge base stays global/shared (Modes do not scope data sources). A Mode marked default is applied when none is selected.

---

## Target users

Any Headout / Dex employee who has live conversations where specific internal data would be useful. Power users:

- OTA / distribution platform BD reps (questions: API uptime SLAs, inventory depth, margin tiers)
- Offline travel agent network reps (questions: payout cycles, group booking, complaint resolution)
- Corporate / MICE reseller reps (questions: bulk pricing, GST compliance, NPS by city, consolidated invoicing)

Also useful for: support leads, ops, account managers, anyone in a meeting who needs Headout internal data fast.

---

## Platform

- macOS + Windows (v1)
- Desktop app: Electron + React + Vite (single codebase, OS-specific native bits behind a thin platform layer)
- The overlay window is `alwaysOnTop: true`, `transparent: true`, `skipTaskbar: true`
- Screen-share invisibility (per-OS native):
  - **macOS:** `NSWindow.sharingType = .none` / `CGWindowLevel` native addon (same approach as Cluely)
  - **Windows:** `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`
- Native capabilities that differ per OS — screen-capture exclusion, screen capture + OCR, and audio loopback — sit behind a small platform abstraction so the RAG/answer logic stays OS-agnostic.
- Widget shell (managed by `WindowService`, see module structure): corner docking via `Cmd+Arrow` and header arrow icons; collapsed (pill) vs. expanded (answer panel) states; drag-to-move with hover handles and edge/corner resize (answer content reflows to fill); appearance customization (transparency slider, theme, blur, font size) live-previewed in config, not changed mid-call. Last bounds + appearance persist across restarts.

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
Electron App — all RAG and answer logic runs locally (macOS + Windows)
  ├── AudioCaptureService (electron-audio-loopback — mic + system; WASAPI loopback on Windows)
  ├── TranscriptionService (Deepgram Nova-3 — two WebSocket streams, rolling 60s buffer)
  ├── ScreenContextService (on-demand OCR — macOS ScreenCaptureKit+Vision / Windows Graphics Capture+Windows.Media.Ocr)
  ├── HotkeyService (global hotkey → slices transcript + screen OCR → triggers RAG)
  ├── ModeService (local modes.json — active custom system prompt)
  ├── RAGService
  │     ├── embed question → OpenAI API
  │     ├── search → Qdrant Cloud directly
  │     └── generate answer → OpenAI API (GPT-5.5, active Mode prompt + screen text)
  ├── PreCallBriefingService
  │     ├── embed rep's meeting description → Qdrant (full knowledge base)
  │     └── generate briefing → OpenAI API (GPT-5.5, active Mode prompt)
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
| Answer generation | Electron → OpenAI API (local call) | Direct API call, no middleman |
| Pre-call briefing | Electron → OpenAI API (local call) | Direct API call, no middleman |
| Audio capture | Electron main process (local) | OS-level audio driver access |
| Transcription | Electron → Deepgram (WebSocket) | Streaming STT, low latency |
| Screen OCR | Electron main process (local) | Native per-OS (macOS ScreenCaptureKit+Vision / Windows Graphics Capture+Windows.Media.Ocr); on-demand only |
| Mode store | Electron main process (local) | Per-rep `modes.json`; no sync needed |
| Overlay UI | Electron renderer (local) | React, always-on-top window |

**The EC2 server has no HTTP server, no Express, no API endpoints.
It is a single cron job that runs, syncs, and exits. Nothing else.**

---

## Technology decisions (with reasoning)

### Desktop framework — Electron

Chosen over Tauri because:
- `electron-audio-loopback` npm package handles system audio loopback (mic + speaker) on macOS 12.3+ out of the box; on Windows, system audio is captured via WASAPI loopback (Electron `getDisplayMedia` with audio, or a thin native addon). **[Verify]** Windows loopback path on target Windows versions.
- One codebase ships both macOS and Windows; OS-specific native bits (capture exclusion, screen capture + OCR, audio loopback) sit behind a small platform layer
- Full Node.js in main process — IPC, native addons, direct API calls all just work
- Larger ecosystem for the OS integrations Nerd needs (tray, global hotkeys, window level control) on both platforms
- Tauri would require custom Rust native plugins for audio capture — significant extra work

### Transcription — Deepgram Nova-3

Chosen over Whisper (local), AssemblyAI, ElevenLabs Scribe:
- Sub-300ms streaming latency — fastest among production STT APIs
- `utterance_end_ms` event fires the moment a speaker stops — this is the trigger for the RAG pipeline
- Two simultaneous WebSocket connections: one for mic (`Me`), one for system audio (`Them`)
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

### LLM — OpenAI GPT-5.5 (generation) + GPT-5.4-mini (query rewrite)

Single provider across the stack (same as embeddings) — one API key, one SDK, one billing surface.

- **Answer + briefing generation → GPT-5.5**: flagship quality for grounded, cited answers. Run with low/none `reasoning.effort` during live calls to keep latency near the ~800ms budget; bump effort for the pre-call briefing where 4–8s is acceptable.
- **Query rewrite → GPT-5.4-mini**: cheap, low-latency; the task (clean up a transcript slice into a question) is simple and doesn't need the flagship. GPT-5.4-nano is an even cheaper option if rewrite quality holds.
- Reranking stays on Cohere Rerank (OpenAI has no dedicated rerank endpoint) — or drop to embedding-similarity reranking if single-vendor is a hard requirement.

### Server — AWS EC2 (cron only, no HTTP server)

- Runs a single `cron.ts` file — no Express, no API, no open ports
- Free tier: 750 hours/month of t3.micro for 12 months
- After 12 months: t4g.micro ~$6/month
- Region: `ap-south-1` (Mumbai)
- Warning: avoid NAT Gateways (~$33/month just for being on), unattached Elastic IPs, unnecessary data transfer out

### Retrieval quality — query rewrite + hybrid search + reranker (all v1)

These three upgrades matter far more than the choice of top-k. All ship in v1, because the product promise is "the exact right number, cited, live" — the first wrong answer in a BD call is the failure we can't afford, so we don't defer accuracy.

**1. Query rewrite (before embedding) — biggest single lever**
- The raw transcript slice is a noisy query: two speakers, filler words, ASR errors, half-sentences. Embedding it directly matches messy speech against clean document chunks and retrieves mediocre pages.
- A fast LLM call rewrites the transcript slice into a clean search question before embedding.
  e.g. "...uh what kind of uptime are you guys doing on the API these days..." → "What is the API uptime SLA?"
- Optional HyDE: have the LLM draft a hypothetical answer and embed that instead — a fake answer sits closer to real answer chunks in vector space than a question does.
- Use a small/fast model (e.g. gpt-5.4-mini) — ~100–150ms.

**2. Hybrid search (dense + sparse, fused with RRF)**
- Dense embeddings are weak on exact tokens: "GST", "MakeMyTrip", repo names, specific numbers — they find topically-similar pages, not the page with the literal term.
- Add sparse/BM25 keyword search alongside dense and fuse both with Reciprocal Rank Fusion — Qdrant supports hybrid natively.
- Critical for an acronym- and number-heavy internal KB.

**3. Cohere Rerank**
- **Final decision: retrieve top 20 → narrow to 8 → send 8 to the model.** This resolves the earlier 20-vs-5 contradiction — 20 is the candidate pool, 8 is what reaches generation.
- A cross-encoder re-reads every candidate against the query; far more precise than raw cosine order. Adds ~150–200ms, fractions of a cent per query.

**Plus, on the candidate set (applied between rerank and the final 5):**
- **Score threshold, not fixed-k.** Keep at most 5, but drop anything below a relevance score — if only 2 chunks clear the bar, send 2. Never pad the prompt with junk: extra distractors cause "lost in the middle" errors where the model loses the one fact that matters.
- **Dedup near-identical chunks.** Slack repeats the same number across 10 messages/threads; collapse them so the model sees one copy, not ten, and the 8 slots go to 8 *distinct* facts.
- **Boost recency + authoritative sources** (canonical Notion doc > stale Slack message) so fresh data wins ties — pricing/SLA facts go stale.

Order of operations: retrieve 20 → dedup → rerank → drop below threshold → take top 8 (often fewer).

### Screen grounding — native OCR (on-demand, per-OS)

Some facts aren't in the synced KB — a number on the counterparty's shared deck, a figure on a dashboard, an open tab. Nerd grounds on the live screen *in addition to* the KB. Capture + OCR use each OS's native, local APIs behind one `ScreenContextService` interface.

- **Capture (active display, on-demand only — never ambient):**
  - **macOS:** `ScreenCaptureKit` grabs a frame.
  - **Windows:** `Windows.Graphics.Capture` grabs a frame.
  - On-demand capture keeps the lightweight-footprint requirement intact (no continuous CPU/battery drain, no rolling frame buffer).
- **OCR (fully local, no API/network, ~100–300ms, text-only — no chart/image understanding in v1):**
  - **macOS:** Vision `VNRecognizeText`.
  - **Windows:** `Windows.Media.Ocr` (WinRT OCR engine).
- **Why native over a vision LLM:** native OCR runs in parallel with query-rewrite/embed and hides under the critical path; a vision-LLM call would add ~1–2s and break the ~1.2s budget. Charts/layout understanding can be a later upgrade if text OCR proves insufficient.
- Output is injected as the `SCREEN` block in the generation prompt; empty/failed OCR degrades to KB-only.

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
  text: string            ← raw chunk text sent to the model
  vector: float[1536]     ← text-embedding-3-small output (dense)
  sparse_vector: object   ← BM25/sparse term weights for hybrid keyword search
  updated_at: timestamp
```

---

## RAG query pipeline (during a live call)

Runs entirely inside the Electron main process — no server hop.

```
User presses hotkey (Cmd+Enter)
  → take last N seconds of transcript as raw context
  ├─ (parallel) screen OCR: native capture of active display → native OCR (macOS Vision / Windows.Media.Ocr) → screen text — ~100–300ms
  └─ query rewrite: fast LLM (gpt-5.4-mini) cleans transcript → clean question — ~120ms
  → embed the clean question via OpenAI API — ~80ms
  → Qdrant hybrid search (dense + sparse/BM25, RRF), full index, top 20 — ~6ms
  → dedup near-identical chunks + recency/source boost
  → Cohere rerank → drop below score threshold → take top 8 (often fewer) — ~180ms
  → OpenAI API (gpt-5.5, low reasoning effort): 8 chunks + screen text + transcript context
       + active Mode system prompt + list/paragraph format → cited answer — ~800ms
  → IPC push → React overlay renders answer
Total: ~1.2s v1 (screen OCR runs parallel to rewrite/embed, so it hides under the critical path)
```

Screen OCR runs on-demand at hotkey only (never ambient) and is best-effort: if capture/OCR fails or returns nothing, generation proceeds KB-only (the SCREEN block is `(none)`) and never blocks the answer.

### OpenAI prompt structure

The **system prompt below is the default**. When the user has an active Mode selected (§ Modes), that Mode's `systemPrompt` **replaces** this default block verbatim; the CONTEXT / SCREEN / RECENT TRANSCRIPT assembly and the `{output_format_instruction}` are still appended either way. The same Mode-swap applies to the pre-call briefing prompt.

```
You are Nerd, a real-time assistant for a Headout employee on a live call.

The user just pressed their hotkey. Below is the recent conversation transcript,
retrieved context from Headout's internal knowledge base, and the text currently
visible on the user's screen.

Answer the question implied by the conversation. Use THREE sources of truth:
1. Headout's internal knowledge base (the CONTEXT below) — this is authoritative for
   Headout-specific facts: numbers, SLAs, pricing, policies, names. Always prefer it.
2. The user's live SCREEN text below — authoritative for whatever is on screen right
   now (a shared deck, a dashboard, an open tab) that the KB may not contain.
3. Your own general knowledge — use it to fill gaps, explain concepts, or answer
   anything the CONTEXT and SCREEN do not cover.

Rules:
- Be concise. Lead with the exact number or fact.
- When a fact comes from the CONTEXT, cite the source.
- When a Headout-specific fact (a number, policy, SLA, price) is NOT in the CONTEXT
  or SCREEN, do NOT invent it from general knowledge — say "I don't have that data — check with ops."
- General/conceptual answers from your own knowledge are fine without a source, but make
  clear they are general guidance, not Headout's confirmed data.
- {output_format_instruction}
  // "list"      → answer as terse bullets — just the number/hook (senior users)
  // "paragraph" → answer as fully paraphrased, ready-to-speak prose (junior users)

CONTEXT:
{up_to_8_reranked_deduped_chunks_with_source_labels}

SCREEN (live, on user's display right now):
{screen_ocr_text_or_"(none)"}

RECENT TRANSCRIPT:
{last_n_seconds_of_transcript}
```

---

## Pre-call briefing flow

Triggered when the rep opens Nerd and describes their upcoming meeting, before joining the call.
Runs entirely inside the Electron main process — no server hop.

1. Rep types a free-form meeting description (e.g. "going to meet MakeMyTrip SP, they want to talk about API reliability and payout timelines")
2. That full sentence is embedded → Qdrant hybrid search (dense + sparse/BM25, RRF) across the full knowledge base → top 20–40 chunks (query rewrite optional here — typed text is already clean)
3. Context assembler: rerank, rank by recency + relevance, deduplicate, pack into ~10k token context block
4. GPT-5.5 generates a 200-word briefing: the 3 most likely questions the SP will ask + exact defensible answers
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
  │     └── rolling buffer: last 60s of transcript always in memory
  ├── ScreenContextService  (platform layer: macOS / Windows impls behind one interface)
  │     ├── captureActiveDisplay()  → native frame grab (macOS ScreenCaptureKit / Windows Graphics Capture)
  │     └── ocr()                   → native OCR (macOS Vision VNRecognizeText / Windows.Media.Ocr) → screen text (on-demand only)
  ├── ModeService
  │     ├── listModes() / getActiveMode()  → local modes.json in Electron userData
  │     └── mode shape: { id, name, systemPrompt, isDefault }  (no per-Mode data sources)
  ├── HotkeyService
  │     ├── registers global shortcut (Cmd+Enter) via Electron globalShortcut
  │     └── on press → slice last N seconds of transcript + kick screen OCR → trigger RAGService
  ├── WindowService
  │     ├── snapToCorner(dir)   → Cmd+Arrow / header icons reposition BrowserWindow to display corners
  │     ├── collapsed/expanded  → pill vs. answer-panel window states
  │     └── persists last bounds + appearance (transparency/theme/blur/font)
  ├── RAGService
  │     ├── rewriteQuery()    → fast LLM (gpt-5.4-mini): transcript slice → clean question (+ optional HyDE)
  │     ├── embedQuery()      → OpenAI text-embedding-3-small (clean question as query)
  │     ├── retrieveChunks()  → Qdrant Cloud hybrid search (dense + sparse/BM25, RRF), top 20
  │     ├── rerank()          → dedup + recency/source boost → Cohere Rerank → drop below threshold → up to 8
  │     └── generateAnswer({ format, screenText, systemPrompt })
  │                           → OpenAI API (gpt-5.5); active Mode prompt + screen text + list/paragraph format
  ├── PreCallBriefingService
  │     ├── loadContext()        → Qdrant (full knowledge base, seed queries)
  │     └── generateBriefing()  → OpenAI API (gpt-5.5, active Mode prompt + meeting description as context)
  └── IPC bridge (contextBridge)
        └── exposes: onAnswer, onTranscript, onBriefingReady, askManually,
                     setOutputFormat, listModes, setActiveMode, snapToCorner

Renderer process (React + Vite — runs locally)
  ├── Overlay window (alwaysOnTop: true, transparent: true, skipTaskbar: true)
  │     ├── corner docking via Cmd+Arrow + header arrow icons
  │     ├── collapsed (pill) ↔ expanded (answer panel) states
  │     ├── drag-to-move, hover handles, edge/corner resize → answer content reflows to fill
  │     └── appearance: transparency slider, theme, blur, font size (live-preview in config, not mid-call)
  ├── BriefingCard       — pre-call summary + anticipated questions
  ├── AnswerPanel        — live answers with source citation + confidence
  │     └── output-format toggle: Pointers (list) ↔ Paragraph → setOutputFormat over IPC
  ├── TranscriptFeed     — rolling live transcript (Them stream highlighted)
  └── ManualInputBar     — fallback: rep types question, gets RAG answer
```

Window bounds, level, and OS integration live in the main process (`WindowService`); layout and content reflow live in the renderer.

### Threading & non-blocking guarantee

The overlay is `alwaysOnTop` and visible during a live call — it must NEVER stutter or freeze, even mid-pipeline. Hard rule: **the renderer (React overlay) does zero heavy work.** It only renders state and receives results over IPC.

- **All pipeline stages run off the UI thread.** Query rewrite, embedding, Qdrant retrieval, rerank, and answer generation execute in the Electron main process (or a `worker_thread` / `utilityProcess` spawned from it) — never in the renderer. The renderer fires `askManually` / hotkey intent over IPC and waits for `onAnswer` / `onPartialAnswer` events.
- **Stream, don't batch.** Answer tokens stream from the model → main process → renderer via IPC so the overlay shows progress immediately instead of blocking on the full ~800ms generation.
- **Hard latency budget per stage** (overlay shows a degraded result rather than hanging):
  - screen OCR ≤ 350ms, runs parallel to rewrite/embed (skip → SCREEN `(none)`, KB-only generation on timeout/failure)
  - query rewrite ≤ 250ms (skip rewrite, embed raw transcript on timeout)
  - embedding ≤ 300ms
  - Qdrant hybrid retrieve ≤ 500ms (fall back to local snapshot / lexical on timeout)
  - rerank ≤ 400ms (skip rerank, use fused score order on timeout)
  - generation: first token ≤ 1.2s, else show "still thinking…" with a cancel affordance
  - whole pipeline wall-clock cap ~3s → past that, surface partial/"context unavailable" instead of an indefinite spinner.
- **Cancel-in-flight on a new hotkey press.** Each hotkey press opens a new request with an `AbortController` (and a monotonically increasing request id). Pressing the hotkey again immediately aborts the prior in-flight request — its embedding/retrieval/rerank/generation calls are cancelled and any late IPC results are dropped by request-id check, so a stale answer can never overwrite a newer one.
- **Network calls are abortable + timed out.** Every external call (OpenAI, Qdrant, Cohere) is wrapped with a per-stage timeout and the request's `AbortSignal`; a hung socket can never stall the overlay.

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
| OpenAI API | gpt-5.5 (answers + briefing) + gpt-5.4-mini (query rewrite) | ~$3–8 |
| Cohere Rerank | rerank-3.5 (per query, top 20 → up to 8) | ~$1–2 |
| **Total** | | **~$7–14/mo per user** |

---

## What to build — recommended order

1. **Electron shell + floating overlay** — window renders, always-on-top, transparent, React inside, IPC wired; widget shell (`WindowService`): Cmd+Arrow corner docking, collapsed/expanded, drag/resize with reflow, appearance settings
2. **EC2 cron scaffold** — `cron.ts` connects to Supabase + Qdrant, runs on schedule, no HTTP server
3. **One data source sync** — Google Docs → differential sync → Qdrant (proves full pipeline end to end)
4. **Pre-call briefing + manual Q&A** — rep types meeting description → briefing appears → rep types question → RAG answer (no audio yet); add list/paragraph output toggle
5. **Audio capture + Deepgram** — mic + system loopback, rolling transcript appears in overlay
6. **Hotkey-triggered RAG flow** — Cmd+Enter slices transcript → query rewrite → hybrid retrieve (top 20) → dedup → Cohere rerank → drop below threshold → up to 8 → cited answer in overlay (no auto-detect)
7. **Screen grounding** — ScreenContextService: on-demand native capture + OCR at hotkey (macOS ScreenCaptureKit+Vision / Windows Graphics Capture+Windows.Media.Ocr), injected as SCREEN block (parallel to embed, KB-only degrade)
8. **Modes** — ModeService + local `modes.json`; custom system prompt swaps the default in generation + briefing
9. **Remaining data sources** — Slack, Notion, GitHub, Pitch
10. **Retrieval tuning** — score thresholds, dedup, recency/source weighting; add HyDE if recall is still weak

---

## Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Qdrant / Supabase unreachable during call | 2s timeout, show "context unavailable" — never hang the overlay |
| Qdrant free tier fills up | Monitor chunk count in sync_runs; scalar quantization gives 4x compression before needing to upgrade |
| Deepgram drops transcript | Rolling buffer still holds last clean segment; user can also type context manually in ManualInputBar |
| Sync fails silently on EC2 | sync_runs table logs every run + errors; overlay shows "last synced Xh ago" in header |
| Screen share detects overlay | Per-OS capture exclusion (macOS `sharingType=.none`/CGWindowLevel; Windows `WDA_EXCLUDEFROMCAPTURE`) — test against Zoom, Google Meet, Teams on both OSes before launch |
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

*Last updated: June 2026 — revised to local RAG architecture + cron-only server + pre-call briefing naming; added Modes (custom system prompt, local store), list/paragraph output toggle, widget shell behaviors, and on-demand screen OCR grounding; expanded to cross-platform (macOS + Windows)*
