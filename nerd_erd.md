# Nerd — context transfer document

## What is Nerd

Nerd is a floating AI overlay for macOS and Windows that sits on a user's screen during calls, invisible to the other party. It listens to both sides of the conversation and builds a live transcript. When the user presses a hotkey, it answers based on the recent conversation context and surfaces the answer on screen — without the user needing to type a question. The answer blends two sources: Headout's pre-loaded internal knowledge base (authoritative for company-specific facts) and the LLM's own general knowledge (to fill gaps and handle conceptual questions).

The core problem it solves: people lose leverage or credibility in live conversations when they approximate, defer, or hedge answers to specific questions — SLA uptime numbers, margin tiers, payout cycles, GST compliance, bulk pricing — because that information lives in Slack, not in their head.

**How the trigger works**: there is no auto-detection. The user presses `Cmd+Enter` (global hotkey). Nerd takes the last ~120s / 12 turns of transcript as the question context, runs the RAG pipeline, and pushes the answer to the overlay. The user stays in the conversation the whole time.

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
Data Sources (Slack — unstructured text) + BigQuery (structured analytics tables)
        │
        ▼
Dedicated always-on laptop (Docker; data in named volumes — survives restarts)
  ├── cron only (Node.js, no HTTP server)
  │     ├── node-cron every 6h — differential sync (Slack → RAG)
  │     ├── Fetch changed docs from source APIs
  │     ├── Chunk + embed (OpenAI text-embedding-3-small)
  │     ├── Write vectors → Qdrant on localhost:6333
  │     ├── Write metadata → Postgres on localhost:5432
  │     └── BigQuery mirror job → Postgres analytical tables on localhost:5432
  │           (dim_experiences, dim_experience_listings, dim_experience_management,
  │            experience_listing_events, fct_zendesk_ops_tickets — NOT chunked/embedded)
  ├── Qdrant   — local Docker :6333 (web UI at /dashboard) → ngrok static HTTPS URL
  └── Postgres — local Docker :5432                        → bore.pub TCP host:port
        │ (the cron writes locally; the public tunnel URLs below are for the Electron apps)
        ▼ (vectors + metadata written, always fresh)

Qdrant   ←── ngrok static HTTPS URL   ──┐
Postgres ←── bore.pub TCP host:port    ──┴── queried directly by every Electron app

        │
        ▼
Electron App — all RAG and answer logic runs locally (macOS + Windows)
  ├── AudioCaptureService (electron-audio-loopback — mic + system; WASAPI loopback on Windows)
  ├── TranscriptionService (Deepgram Nova-3 — two WebSocket streams, rolling 120s / 12-turn buffer + last 3 answers)
  ├── ScreenContextService (on-demand OCR — macOS ScreenCaptureKit+Vision / Windows Graphics Capture+Windows.Media.Ocr)
  ├── HotkeyService (global hotkey → slices transcript + screen OCR → triggers RAG)
  ├── ModeService (local modes.json — active custom system prompt)
  ├── RAGService
  │     ├── rewrite + route → fast LLM (GPT-5.4-mini): clean question + route (slack | sql | both)
  │     ├── embed question → OpenAI API
  │     ├── search → Qdrant directly (ngrok public HTTPS URL) — always
  │     ├── text-to-SQL → read-only Postgres (bore.pub) when route is sql/both — parallel to Qdrant
  │     └── generate answer → OpenAI API (GPT-5.5, active Mode prompt + screen text + SQL data)
  ├── PreCallBriefingService
  │     ├── embed rep's meeting description → Qdrant (full knowledge base)
  │     └── generate briefing → OpenAI API (GPT-5.5, active Mode prompt)
  └── IPC bridge → Renderer (React overlay)
```

### What runs where — quick reference

| Component                      | Where it runs                                                                | Why                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Cron sync                      | Dedicated always-on laptop                                                   | Stays on so the cron always fires; reps' own laptops can be closed                                         |
| Chunking + embedding           | Dedicated laptop (during sync)                                               | Runs once per changed doc, not per query                                                                   |
| Qdrant vectors                 | Local Docker :6333 on dedicated laptop, public via ngrok static HTTPS        | Cron writes locally; Electron apps query over the tunnel                                                   |
| Postgres metadata              | Local Docker :5432 on dedicated laptop, public via bore.pub TCP              | Cron writes locally; Electron apps query over the tunnel                                                   |
| BigQuery analytical tables     | Local Docker Postgres :5432, mirrored from BigQuery, public via bore.pub TCP | Structured facts queried live via SQL; mirror job keeps them fresh                                         |
| Query routing (slack/sql/both) | Electron main process (local), folded into the rewrite LLM call              | No extra hop — the rewrite call already runs on every hotkey                                               |
| Text-to-SQL query logic        | Electron main process (local) → read-only Postgres over bore.pub             | Structured numbers need SQL, not vector search; runs parallel to Qdrant                                    |
| RAG query logic                | Electron main process (local)                                                | Low latency, no server hop during live call                                                                |
| Answer generation              | Electron → OpenAI API (local call)                                           | Direct API call, no middleman                                                                              |
| Pre-call briefing              | Electron → OpenAI API (local call)                                           | Direct API call, no middleman                                                                              |
| Audio capture                  | Electron main process (local)                                                | OS-level audio driver access                                                                               |
| Transcription                  | Electron → Deepgram (WebSocket)                                              | Streaming STT, low latency                                                                                 |
| Screen OCR                     | Electron main process (local)                                                | Native per-OS (macOS ScreenCaptureKit+Vision / Windows Graphics Capture+Windows.Media.Ocr); on-demand only |
| Mode store                     | Electron main process (local)                                                | Per-rep `modes.json`; no sync needed                                                                       |
| Overlay UI                     | Electron renderer (local)                                                    | React, always-on-top window                                                                                |

**The host laptop runs no HTTP server, no Express, no API endpoints.
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

### Vector database — Qdrant (self-hosted, local Docker)

Chosen over Pinecone, LanceDB (embedded), pgvector:

- Rust implementation: tight p99, no GC pauses, no cold-start variance
- Native hybrid search (dense + sparse/BM25, RRF) — critical for an acronym- and number-heavy KB
- No org-level filtering needed — single shared index, search across full knowledge base
- **Runs in Docker (`qdrant/qdrant`) on a dedicated always-on laptop** — no quota, no free-tier RAM/disk ceiling; storage is bounded only by the host machine
- Web UI at `localhost:6333/dashboard` for inspecting collections, payloads, and running manual queries
- Exposed publicly via an **ngrok static domain** (HTTPS) so every Electron app connects to one stable URL as if it were hosted remotely (the cron runs on the same laptop and writes to `localhost:6333` directly)
- Data persists in a Docker named volume — survives container restarts

Why not embedded LanceDB: the device-off problem — a DB embedded in the rep's own app can't be synced when that laptop is closed. The dedicated host laptop stays on and runs the cron next to Qdrant, so the index is kept fresh regardless of whether any rep's laptop is on.

Why not Pinecone / Qdrant Cloud: the self-hosted Docker setup has no quota and no monthly cost; the tunnel adds a hop but the host laptop sits close to the team.

### Structured database — Postgres (self-hosted, local Docker)

Stores two distinct kinds of data in the same Postgres instance:

1. **RAG bookkeeping**: documents, document_chunks index, sync_runs log (written by the Slack cron)
2. **BigQuery analytical mirror**: `dim_experiences`, `dim_experience_listings`, `dim_experience_management`, `experience_listing_events`, `fct_zendesk_ops_tickets` — structured facts mirrored from BigQuery and queried live via SQL (see § Structured data routing)

- Plain **Postgres 16 (`postgres:16`)** in Docker on the same dedicated laptop; data in a named volume (survives restarts)
- Exposed publicly via a **bore.pub** free TCP tunnel (`bore local 5432 --to bore.pub`) → a public `host:port` used as the connection string by every Electron app (the cron runs on the same laptop and writes to `localhost:5432` directly)
- Standard `libpq` connection string — no Supabase SDK/Auth/RLS/Edge Functions; schema managed via plain SQL migrations
- Queried directly from the Electron app — no app server hop
- **The Electron apps connect with a read-only role** (`GRANT SELECT` only; no INSERT/UPDATE/DELETE/DDL). Live text-to-SQL is AI-generated, so the read-only role is the hard guarantee — the database itself rejects any write or a prompt-injected `DROP`/`DELETE`, regardless of what the model emits. The cron/mirror jobs use a separate read-write role.

### Embedding model — OpenAI text-embedding-3-small

- 1536-dimension vectors
- $0.02 per million tokens — ~$0.50/month at Nerd's sync volume
- Runs on the host laptop during sync (not on the rep's machine, not per query)
- Best quality/cost ratio; no GPU required

### LLM — OpenAI GPT-5.5 (generation) + GPT-5.4-mini (query rewrite)

Single provider across the stack (same as embeddings) — one API key, one SDK, one billing surface.

- **Answer + briefing generation → GPT-5.5**: flagship quality for grounded, cited answers. Run with low/none `reasoning.effort` during live calls to keep latency near the ~800ms budget; bump effort for the pre-call briefing where 4–8s is acceptable.
- **Query rewrite → GPT-5.4-mini**: cheap, low-latency; the task (clean up a transcript slice into a question) is simple and doesn't need the flagship. GPT-5.4-nano is an even cheaper option if rewrite quality holds.
- Reranking stays on Cohere Rerank (OpenAI has no dedicated rerank endpoint) — or drop to embedding-similarity reranking if single-vendor is a hard requirement.

### Server — dedicated always-on laptop (cron only, no HTTP server)

- Runs a single `cron.ts` file — no Express, no API, no open ports
- Same laptop that hosts Postgres + Qdrant in Docker; the cron writes to both on localhost
- No cloud bill — uses existing hardware; just keep the laptop powered and online
- ngrok (Qdrant) + bore.pub (Postgres) expose the DBs to the Electron apps; the cron needs neither tunnel

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
- **Dedup near-identical chunks.** Slack repeats the same number across 10 messages/threads; collapse them so the model sees one copy, not ten, and the 8 slots go to 8 _distinct_ facts.
- **Boost recency + authoritative sources** (a recent, pinned message > a stale one) so fresh data wins ties — pricing/SLA facts go stale.

Order of operations: retrieve 20 → dedup → rerank → drop below threshold → take top 8 (often fewer).

### Screen grounding — native OCR (on-demand, per-OS)

Some facts aren't in the synced KB — a number on the counterparty's shared deck, a figure on a dashboard, an open tab. Nerd grounds on the live screen _in addition to_ the KB. Capture + OCR use each OS's native, local APIs behind one `ScreenContextService` interface.

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

**Slack** (6hr cron)

- Dex Biz: C07LEENR3AM
- Dex GTM: C0A2T8NN08J
- Dex Internal: C06SN0JS1R8
- BizOps channels (36):

```
C045CQVBVC7  CHKRLFDPU    C0809DN93DH  CSQ10TALA    C097DVBLHGS  CH64TEB71
C01C4NPLYN6  CH2LRMJF2    C03US4WRHB6  C045L2WQ79P  CQD6220VB    C01CARUM1CL
C01CHADFPAM  C046622L80Z  C0889D22PM5  C012949PQ81  CL13UPZ6V    C039TMH0GEP
C05PACYAFNV  C5WFYN82H    C03R4UJ4DHC  C05R7S17Y8Z  CKTFHT4AF    CNSHDD2H1
C05D50N5BQW  C0ADLGW79JB  C0AC7BZLV9R  C08R0NE428M  C0B4ZALELKU  C0APFFL9QRZ
C0B5MQ442JE  C0B6G3BAAAC  C0B4HHA5K0X  C0B4WUKJE8N  C0B50RZ0H6V  C0B4VKFGBD3
```

- Scope: every channel above — every thread, every message, all messages within threads, text file attachments, and channel canvases

### Sync strategy — differential sync (not full rebuild)

Every 6-hour cron run on the host laptop:

1. Fetch remote manifest (doc id + `updated_at`) from each source API — lightweight
2. Diff against the Postgres `documents` table by `content_hash` and `updated_at`
3. Three outcomes:
   - **New**: fetch full content → chunk → embed → insert Qdrant + Postgres
   - **Changed**: delete old chunks from Qdrant (`doc_id` filter) + Postgres → re-embed → insert
   - **Unchanged**: skip entirely (typically 80–90% of docs on any given run)
4. Handle deleted docs: remove from both stores when they disappear from remote manifest
5. Write `sync_runs` row to Postgres with stats + any errors

The cron runs regardless of whether any rep's laptop is on. Context is always fresh.

### Chunking strategy

- Target: ~400 tokens per chunk
- Overlap: ~50 tokens between chunks (handles questions that span paragraph boundaries)
- Split at paragraph boundaries, not mid-sentence
- Each chunk carries: `source`, `doc_title`, `url`, `source_metadata`, `updated_at`

---

## Database schemas

### Postgres (local Docker)

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,        -- 'slack'
  title TEXT,
  url TEXT,
  content_hash TEXT,
  source_metadata JSONB,       -- source-specific context (channel name, repo path, etc.)
  last_synced_at BIGINT,
  updated_at BIGINT,
  deleted_at BIGINT            -- soft delete: set when doc disappears from source
);

CREATE TABLE document_chunks (
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
CREATE INDEX ON document_chunks(doc_id);
```

### BigQuery analytical mirror (same Postgres, queried via SQL — never embedded)

Mirrored from BigQuery into the same Postgres instance and kept fresh by a mirror job. These are **structured fact/dimension tables** answered by SQL filtering + aggregation, not by vector search — they are deliberately **not** chunked or written to Qdrant. Routing decides when a question hits these vs. the Slack KB (see § Structured data routing). Full DDL lives in the DB; the queryable shape:

| Table                       | Grain                                              | What it answers                                    | Key columns                                                                                                                                                               |
| --------------------------- | -------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dim_experiences`           | one row per experience                             | catalog facts: pricing, rating, location, category | `experience_id`, `experience_name`, `city`, `country`, `primary_category_name`, `average_rating`, `count_ratings`, `listing_final_price`, `currency`, `is_available`      |
| `dim_experience_listings`   | one row per listing ticket                         | supply/catalog pipeline status                     | `ticket_id`, `experience_id`, `city`, `listing_status`, `plc_status`, `content_status`, `inventory_status`, `sp_name`, `owner`, `priority`                                |
| `dim_experience_management` | one row per experience↔collection↔category mapping | discoverability / taxonomy mapping                 | `experience_id`, `experience_city`, `category_name`, `collection_name`, `sub_category_name`, `combined_entity_name`                                                       |
| `experience_listing_events` | one row per listing pipeline event (timestamped)   | throughput / time-in-stage over time               | `ticket_id`, `experience_id`, `event_name`, `event_timestamp`, `city`, `days_since_previous_step` (indexed on `event_timestamp`, `experience_id`)                         |
| `fct_zendesk_ops_tickets`   | one row per ops ticket                             | ops SLA performance, resolution times              | `ticket_id`, `created_at`, `custom_city`, `priority`, `ticket_status`, `has_met_sla`, `sla_hours`, `minutes_to_full_resolution`, `l1_categorisation`, `l2_categorisation` |

Tables may read empty while the mirror back-fills one-by-one — this does not affect routing or SQL generation, which are driven by the **schema/catalog, not by the presence of data**.

### Qdrant index

```
index name: nerd-chunks
fields per vector:
  id: string              ← same as document_chunks.id in Postgres
  doc_id: string
  source: string          ← 'slack'
  doc_title: string
  url: string
  source_metadata: object ← Slack channel name, thread ts, message author, etc.
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
  → take last ~120s / 12 turns of transcript as raw context (+ last 3 answers to avoid repeating)
  ├─ (parallel) screen OCR: native capture of active display → native OCR (macOS Vision / Windows.Media.Ocr) → screen text — ~100–300ms
  └─ rewrite + route: fast LLM (gpt-5.4-mini) cleans transcript → { clean_question, route } — ~120ms
       route ∈ { slack | sql | both }   (one call — routing adds ~0ms over the rewrite already made)
  → embed the clean question via OpenAI API — ~80ms
  ├─ (always) Qdrant hybrid search (dense + sparse/BM25, RRF), full index, top 20 — ~6ms
  │     → dedup near-identical chunks + recency/source boost
  │     → Cohere rerank → drop below score threshold → take top 8 (often fewer) — ~180ms
  └─ (only if route ∈ {sql, both}, parallel to Qdrant) text-to-SQL — ~1–2s
        → generate SQL (gpt-5.5) grounded on the table catalog (schemas + descriptions)
        → execute against read-only Postgres with a statement_timeout — return rows (capped LIMIT)
  → OpenAI API (gpt-5.5, low reasoning effort): up to 8 chunks (CONTEXT) + SQL rows (DATA) + screen text (SCREEN)
       + transcript context + last 3 answers + active Mode system prompt + list/paragraph format → cited answer — ~800ms
  → IPC push → React overlay renders answer
Total: ~1.2s for slack-only; ~2.5–3.5s when a SQL query runs (user accepts the extra latency for exact-number accuracy)
```

Qdrant retrieval is so cheap (~190ms incl. rerank) that the KB is fetched on **every** query regardless of route — so a `sql` question still gets relevant Slack context for free, and `both` costs nothing extra to support. Only the SQL path is conditional, and it runs in parallel with Qdrant so its latency does not stack on top of retrieval.

Screen OCR runs on-demand at hotkey only (never ambient) and is best-effort: if capture/OCR fails or returns nothing, generation proceeds without it (the SCREEN block is `(none)`) and never blocks the answer. The SQL path is likewise best-effort: on timeout, error, or empty result, the `DATA` block degrades to `(none)` and generation proceeds on KB + screen alone.

### OpenAI prompt structure

The **system prompt below is the default**. When the user has an active Mode selected (§ Modes), that Mode's `systemPrompt` **replaces** this default block verbatim; the CONTEXT / SCREEN / RECENT TRANSCRIPT assembly and the `{output_format_instruction}` are still appended either way. The same Mode-swap applies to the pre-call briefing prompt.

```
You are Nerd, a real-time assistant for a Headout employee on a live call.

The user just pressed their hotkey. Below is the recent conversation transcript,
retrieved context from Headout's internal knowledge base, live query results from
Headout's analytics database, and the text currently visible on the user's screen.

Answer the question implied by the conversation. Use FOUR sources of truth:
1. Headout's internal knowledge base (the CONTEXT below) — authoritative for what
   Headout SAYS: stated policies, SLAs, pricing tiers, processes, names. Always prefer it.
2. Headout's analytics database (the DATA below) — authoritative for exact, current
   NUMBERS computed from live data: counts, averages, statuses, SLA-hit rates. When a
   question asks "how many / what's the average / what's the status of", this is the truth.
3. The user's live SCREEN text below — authoritative for whatever is on screen right
   now (a shared deck, a dashboard, an open tab) that the KB and DATA may not contain.
4. Your own general knowledge — use it to fill gaps, explain concepts, or answer
   anything the above do not cover.

Rules:
- Be concise. Lead with the exact number or fact.
- When a fact comes from the CONTEXT, cite the source. When a number comes from DATA,
  say it is from live analytics.
- When a Headout-specific fact (a number, policy, SLA, price) is NOT in the CONTEXT,
  DATA, or SCREEN, do NOT invent it from general knowledge — say "I don't have that data — check with ops."
- General/conceptual answers from your own knowledge are fine without a source, but make
  clear they are general guidance, not Headout's confirmed data.
- {output_format_instruction}
  // "list"      → answer as terse bullets — just the number/hook (senior users)
  // "paragraph" → answer as fully paraphrased, ready-to-speak prose (junior users)

CONTEXT (Slack knowledge base):
{up_to_8_reranked_deduped_chunks_with_source_labels}

DATA (live analytics SQL result, or "(none)"):
{sql_rows_as_compact_table_or_"(none)"}

SCREEN (live, on user's display right now):
{screen_ocr_text_or_"(none)"}

RECENT TRANSCRIPT:
{last_n_seconds_of_transcript}
```

---

## Structured data routing (Slack KB vs. SQL)

Nerd has two retrieval modalities and must decide, per question, which to use:

- **Slack KB (Qdrant, semantic RAG)** — answers what Headout _says_: stated policies, SLA commitments, pricing tiers, processes, qualitative knowledge written in threads. The answer is a _sentence_.
- **Analytics DB (Postgres, text-to-SQL)** — answers the exact _number right now_: counts, averages, statuses, SLA-hit rates filtered/aggregated over the BigQuery-mirror tables. The answer is a _number or a list_.

### The decision boundary

| Signal            | → Slack KB (Qdrant)                                     | → Analytics DB (SQL)                                                          |
| ----------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Question shape    | "what's our policy / how do we handle / why / approach" | "how many / what's the average / what's the status of / list / which / top N" |
| Answer type       | qualitative, narrative, a stated commitment             | a computed number, a row, a filtered list                                     |
| Where truth lives | written by a human in a thread                          | derived from dim/fct tables                                                   |
| Freshness         | last 6h Slack sync                                      | last BigQuery mirror                                                          |

Worked examples:

- _"What's our SLA commitment to OTA partners?"_ → **Slack** (a stated promise).
- _"What % of ops tickets actually met SLA last month in Paris?"_ → **SQL** (`fct_zendesk_ops_tickets.has_met_sla` filtered by `custom_city`, `created_at`).
- _"How do we onboard a new vendor?"_ → **Slack** (process knowledge).
- _"How many Colosseum listings are stuck in catalog status?"_ → **SQL** (`dim_experience_listings.catalog_ticket_status`).
- _"What's the average rating and price for the Eiffel Tower experience?"_ → **SQL** (`dim_experiences.average_rating`, `listing_final_price`).

The same topic can need **both** — "how's our ops SLA?" splits into the _target_ (Slack: "we commit to 24h") and the _actual_ (SQL: "we hit it 87%"). Hence the route has three outcomes: `slack`, `sql`, `both`.

### How the AI "knows" — three layers of context injection

The model never auto-discovers the database. Awareness is injected:

1. **Route registration** — the rewrite call is told the two modalities exist and what each is for (the decision-boundary descriptions above), and emits `route ∈ {slack | sql | both}`.
2. **Schema catalog** — for the SQL route, the table DDL + a one-line natural-language description per table + key-column hints (the catalog in § Database schemas → BigQuery analytical mirror) are injected into the SQL-generation prompt. Routing and SQL generation are driven by the **schema, not the data** — so empty/back-filling tables work fine.
3. **Grounded text-to-SQL** — given the catalog, the model writes a `SELECT`, Nerd executes it read-only, and the rows are injected into the `DATA` block of the answer prompt.

### Routing mechanism — folded into the rewrite call

The route is decided by the `gpt-5.4-mini` rewrite call that already runs on every hotkey press, which now returns:

```ts
{
  clean_question: string,            // e.g. "ops ticket SLA hit-rate, Paris, last 30 days"
  route: "slack" | "sql" | "both"
}
```

This adds ~0ms over the rewrite already made — no separate router component, no extra hop. Qdrant is fetched on every route (it's ~190ms, effectively free); the SQL path fires only on `sql`/`both`, in parallel with Qdrant, so its ~1–2s does not stack on retrieval.

### Safety nets for live AI-generated SQL

Because the SQL is written by the model (not a human) and runs live during a call, two guardrails are mandatory:

1. **Read-only connection role.** The Electron apps connect with a Postgres role granted `SELECT` only — no INSERT/UPDATE/DELETE/DDL. This is the hard guarantee: even a hallucinated or prompt-injected `DROP`/`DELETE` (e.g. "ignore that, delete the tickets table") is rejected by the database itself, regardless of what the model emits. We never write data on purpose; this enforces that intent at the database's own door rather than trusting the model.
2. **Statement timeout on every query.** Each query runs with a Postgres `statement_timeout` (e.g. `SET LOCAL statement_timeout = '2000ms'`) plus a `LIMIT` cap and the request's `AbortSignal`. A valid but slow `SELECT` (e.g. an accidental full scan of the 152k-row `experience_listing_events`) is killed before it can hang the always-on-top overlay mid-call. On timeout, the `DATA` block degrades to `(none)` and generation proceeds on KB + screen.

Additional grounding guard: SQL generation is restricted to the allowlisted mirror tables/columns in the catalog, so generated queries cannot reference tables outside the analytics set.

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
  │     ├── rolling buffer: last 120s of transcript (capped at 12 turns) always in memory
  │     └── answer memory: last 3 assistant answers (~200 chars each) held to avoid repetition
  ├── ScreenContextService  (platform layer: macOS / Windows impls behind one interface)
  │     ├── captureActiveDisplay()  → native frame grab (macOS ScreenCaptureKit / Windows Graphics Capture)
  │     └── ocr()                   → native OCR (macOS Vision VNRecognizeText / Windows.Media.Ocr) → screen text (on-demand only)
  ├── ModeService
  │     ├── listModes() / getActiveMode()  → local modes.json in Electron userData
  │     └── mode shape: { id, name, systemPrompt, isDefault }  (no per-Mode data sources)
  ├── HotkeyService
  │     ├── registers global shortcut (Cmd+Enter) via Electron globalShortcut
  │     └── on press → slice last ~120s / 12 turns of transcript + kick screen OCR → trigger RAGService
  ├── WindowService
  │     ├── snapToCorner(dir)   → Cmd+Arrow / header icons reposition BrowserWindow to display corners
  │     ├── collapsed/expanded  → pill vs. answer-panel window states
  │     └── persists last bounds + appearance (transparency/theme/blur/font)
  ├── RAGService
  │     ├── rewriteAndRoute() → fast LLM (gpt-5.4-mini): transcript slice → { clean_question, route } (+ optional HyDE)
  │     ├── embedQuery()      → OpenAI text-embedding-3-small (clean question as query)
  │     ├── retrieveChunks()  → Qdrant hybrid search (dense + sparse/BM25, RRF) over ngrok tunnel, top 20 — always
  │     ├── rerank()          → dedup + recency/source boost → Cohere Rerank → drop below threshold → up to 8
  │     ├── queryAnalytics()  → if route ∈ {sql, both}: gpt-5.5 text-to-SQL (catalog-grounded) → read-only
  │     │                       Postgres (statement_timeout + LIMIT + AbortSignal) → rows for DATA block
  │     └── generateAnswer({ format, screenText, sqlData, systemPrompt })
  │                           → OpenAI API (gpt-5.5); active Mode prompt + CONTEXT + DATA + SCREEN + list/paragraph format
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

The DB connection strings live inside the Electron app on the rep's machine (in `.env`, loaded at build time via `electron-builder`):

```
QDRANT_URL=https://sherice-exopathic-daphne.ngrok-free.dev
DATABASE_URL=postgresql://admin:password@bore.pub:25649/localdb
```

`QDRANT_URL` is the ngrok static HTTPS URL; `DATABASE_URL` is the bore.pub TCP `host:port` (the port rotates per `bore` session unless pinned). For an internal tool used by Headout employees, this is acceptable in v1. If Nerd is ever distributed externally, move credentials behind a thin auth API so they never touch the client binary.

---

## Complete cost breakdown (per rep per month)

| Service                                | Plan                                                        | Cost                   |
| -------------------------------------- | ----------------------------------------------------------- | ---------------------- |
| Host laptop (cron + Postgres + Qdrant) | Existing hardware, kept always-on                           | $0                     |
| Postgres (local Docker)                | Self-hosted on dedicated laptop, Docker volume              | $0                     |
| Qdrant (local Docker)                  | Self-hosted on dedicated laptop, Docker volume              | $0                     |
| ngrok (Qdrant tunnel)                  | Free tier, static domain                                    | $0                     |
| bore.pub (Postgres tunnel)             | Free TCP tunnel                                             | $0                     |
| OpenAI embeddings                      | text-embedding-3-small (sync only)                          | ~$0.50                 |
| Deepgram Nova-3                        | Streaming (~2h calls/day)                                   | ~$3–5                  |
| OpenAI API                             | gpt-5.5 (answers + briefing) + gpt-5.4-mini (query rewrite) | ~$3–8                  |
| Cohere Rerank                          | rerank-3.5 (per query, top 20 → up to 8)                    | ~$1–2                  |
| **Total**                              |                                                             | **~$7–14/mo per user** |

---

## What to build — recommended order

1. **Electron shell + floating overlay** — window renders, always-on-top, transparent, React inside, IPC wired; widget shell (`WindowService`): Cmd+Arrow corner docking, collapsed/expanded, drag/resize with reflow, appearance settings
2. **Cron scaffold on host laptop** — `cron.ts` connects to Postgres + Qdrant on localhost, runs on schedule, no HTTP server
3. **One data source sync** — Slack → differential sync → Qdrant (proves full pipeline end to end)
4. **Pre-call briefing + manual Q&A** — rep types meeting description → briefing appears → rep types question → RAG answer (no audio yet); add list/paragraph output toggle
5. **Audio capture + Deepgram** — mic + system loopback, rolling transcript appears in overlay
6. **Hotkey-triggered RAG flow** — Cmd+Enter slices transcript → query rewrite → hybrid retrieve (top 20) → dedup → Cohere rerank → drop below threshold → up to 8 → cited answer in overlay (no auto-detect)
7. **Screen grounding** — ScreenContextService: on-demand native capture + OCR at hotkey (macOS ScreenCaptureKit+Vision / Windows Graphics Capture+Windows.Media.Ocr), injected as SCREEN block (parallel to embed, KB-only degrade)
8. **Modes** — ModeService + local `modes.json`; custom system prompt swaps the default in generation + briefing
9. **Structured data routing** — BigQuery-mirror tables in Postgres; rewrite call emits `route`; catalog-grounded text-to-SQL over a read-only role with statement_timeout + LIMIT; SQL rows injected as the DATA block (parallel to Qdrant, best-effort degrade)
10. **Retrieval tuning** — score thresholds, dedup, recency/source weighting; add HyDE if recall is still weak

---

## Key risks and mitigations

| Risk                                                     | Mitigation                                                                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local DB / tunnel unreachable during call                | 2s timeout, show "context unavailable" — never hang the overlay                                                                                                                               |
| AI-generated SQL mutates or drops data                   | Electron apps use a read-only Postgres role (SELECT only) — DB rejects any write/DDL, even a hallucinated or prompt-injected `DELETE`/`DROP`                                                  |
| AI-generated SQL hangs the overlay (slow full scan)      | `statement_timeout` (~2s) + `LIMIT` cap + `AbortSignal` on every query; on timeout the DATA block degrades to `(none)` and generation continues KB-only                                       |
| Wrong routing (SQL question sent to Slack or vice-versa) | KB is fetched on every route regardless, so a misrouted question still has Slack context; route is `both` when ambiguous                                                                      |
| bore.pub Postgres tunnel drops                           | Run the tunnel in a keepalive loop so it auto-reconnects: `while true; do bore local 5432 --to bore.pub; sleep 5; done` (note: assigned port can change on reconnect — update `DATABASE_URL`) |
| Deepgram drops transcript                                | Rolling buffer still holds last clean segment; user can also type context manually in ManualInputBar                                                                                          |
| Sync fails silently on the host laptop                   | sync_runs table logs every run + errors; overlay shows "last synced Xh ago" in header                                                                                                         |
| Screen share detects overlay                             | Per-OS capture exclusion (macOS `sharingType=.none`/CGWindowLevel; Windows `WDA_EXCLUDEFROMCAPTURE`) — test against Zoom, Google Meet, Teams on both OSes before launch                       |
| Credentials exposed in app bundle                        | Acceptable for internal v1; add auth API layer before any external distribution                                                                                                               |

---

## Key decisions (resolved)

- **Multi-rep**: single shared Qdrant index — all users (across any internal team) query the same knowledge base; no per-rep or per-team isolation needed, since every user is allowed to see the same shared internal sources.
- **No fallbacks / degraded mode**: if Qdrant or Postgres is unreachable, the overlay shows "context unavailable" — there is no local cached-snapshot fallback.
- **Hosting**: no AWS/EC2. A single always-on laptop runs Postgres (Docker :5432), Qdrant (Docker :6333, web UI at `/dashboard`), and the cron. Qdrant is exposed for the Electron apps via an ngrok static HTTPS URL and Postgres via a bore.pub TCP tunnel; the cron itself writes to both on localhost. Sync credentials (the Slack token) live on that laptop.

---

_Last updated: June 2026 — added structured data routing: BigQuery analytical tables (dim_experiences, dim_experience_listings, dim_experience_management, experience_listing_events, fct_zendesk_ops_tickets) mirrored into the same Postgres and queried live via catalog-grounded text-to-SQL. The rewrite call now also emits a route (slack | sql | both); Qdrant KB is fetched on every query, the SQL path runs in parallel only when needed, and rows are injected as a new DATA block in the answer prompt. SQL runs over a read-only Postgres role with a statement_timeout + LIMIT (live AI-generated SQL can never write/DROP and can never hang the overlay). User accepts ~2.5–3.5s on SQL questions for exact-number accuracy. Prior: removed AWS/EC2 entirely (the cron now runs on the same dedicated always-on laptop as Postgres + Qdrant, writing to both on localhost; only the Electron apps use the ngrok/bore.pub tunnels); resolved the open decisions (single shared Qdrant index, no degraded-mode fallbacks, laptop hosting). Prior: narrowed sources to Slack only (dropped github/notion/pitch/google-docs and removed the Zendesk integration); expanded Slack scope to every thread/message + text attachments + channel canvases across the Dex + 36 BizOps channels; renamed `chunks` table to `document_chunks`. Earlier: migrated DBs from Qdrant Cloud + Supabase to self-hosted Docker on a dedicated always-on laptop (Qdrant :6333 exposed via ngrok static HTTPS, Postgres :5432 exposed via bore.pub TCP, data in Docker volumes); dropped authentication for v1; reworked cost/risk sections for the tunnel setup; synced transcript buffer to 120s / 12-turn + last-3-answers memory. Originally: revised to local RAG architecture + cron-only server + pre-call briefing naming; added Modes (custom system prompt, local store), list/paragraph output toggle, widget shell behaviors, and on-demand screen OCR grounding; expanded to cross-platform (macOS + Windows)_
