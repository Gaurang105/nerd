# Nerd — execution workplan

Derived from `nerd_erd.md`. Optimized for a solo engineer building toward a demo-able product as quickly as possible, with clean module boundaries kept from day one.

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| **Execution** | Solo, serial | One engineer |
| **OS scope** | macOS-first; Windows parity as a single pass near the end | Doubles per-OS work (capture exclusion, OCR, audio loopback) if done in parallel; defer to keep velocity |
| **Repo layout** | pnpm workspace monorepo (`apps/*` + `packages/*`) | Clean separation between Electron app, EC2 cron, and shared libraries even with one engineer |
| **Auth** | Deferred until external distribution | Internal Dex-only use; `.env` credentials per ERD security note |
| **Package manager** | pnpm | Strict module resolution catches phantom deps; faster installs |
| **No backend** | Per ERD, no HTTP server exists | `apps/sync` (cron) is the only server-side surface |

---

## Target repo layout

```
nerd/
├── apps/
│   ├── desktop/                    # Electron app (current src/ moves here)
│   │   ├── src/
│   │   │   ├── main/               # Electron main process — RAG, audio, hotkey, services
│   │   │   ├── preload/
│   │   │   └── renderer/           # React overlay
│   │   ├── electron.vite.config.ts
│   │   ├── electron-builder.yml
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── sync/                       # EC2 cron job (no HTTP server)
│       ├── src/
│       │   ├── cron.ts             # Entry point
│       │   └── connectors/         # gdocs, slack, notion, github, pitch
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared/                     # Types + IPC contracts; zero runtime deps
│   │   └── src/
│   │       ├── ipc.ts              # Channel names + payload types
│   │       ├── domain.ts           # Document, Chunk, Mode, BriefingResponse
│   │       └── index.ts
│   ├── chunker/                    # ~400-token paragraph-aware chunker
│   └── rag-clients/                # Thin wrappers around Qdrant, Supabase, OpenAI, Cohere, Deepgram
├── package.json                    # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── nerd_prd.md
├── nerd_erd.md
└── nerd_workplan.md
```

---

## Solo execution order

Each slice is sized to roughly 1–4 days. Earlier slices unblock later ones. The first demo-able product lands at slice 4.

| # | Slice | Output you can demo when done | Size |
|---|---|---|---|
| 1 | **Foundations** — pnpm workspace restructure (move `src/` → `apps/desktop/src/`), scaffold `apps/sync/`, create `packages/shared` + `packages/chunker` + `packages/rag-clients`, env loading, provision Supabase + Qdrant Cloud via dashboards, apply DDL, create Qdrant collection | Workspace builds cleanly; Supabase + Qdrant reachable from a test script | ½–1 day |
| 2 | **Overlay shell (macOS)** — `WindowService`: `alwaysOnTop`/`transparent`/`skipTaskbar`, capture exclusion (`sharingType=.none` via native addon), widget shell (collapsed pill ↔ expanded panel, drag, edge/corner resize, `Cmd+Arrow` corner docking), bounds + appearance persistence, IPC bridge stubs for every channel | Invisible floating overlay you can drag, snap to corners, resize — confirmed hidden in Zoom/Meet/Teams screenshares | 2–3 days |
| 3 | **EC2 cron + GDocs sync** — `apps/sync` cron skeleton, GDocs connector with manifest diff, chunker (~400 tokens / 50 overlap), embedding wrapper (`text-embedding-3-small`), upserts to Qdrant + Supabase, `sync_runs` logging, soft-delete handling. Provision t3.micro in `ap-south-1` later in the slice; until then run cron locally. | Real GDocs content in Qdrant; can query via a test script and get relevant chunks back | 2–3 days |
| 4 | **RAG core + Manual Q&A** — `RAGService` (rewrite via `gpt-5.4-mini`, embed, Qdrant hybrid search top 20, dedup + recency boost, Cohere rerank, score threshold, up to 8 chunks, `gpt-5.5` streaming generation with default system prompt from ERD), `ManualInputBar` in renderer, `AnswerPanel` with streaming + citation chips + list/paragraph toggle, abort-on-new-request | **First end-to-end demo: type a question in the overlay, get a real cited answer from GDocs in ~1.2s** | 3–4 days |
| 5 | **Pre-call briefing** — `PreCallBriefingService` (embed meeting description → retrieve top 20–40 → rerank → pack ~10k context → `gpt-5.5` higher reasoning effort → 200-word briefing + 3 anticipated Q&A pairs), `BriefingCard` in renderer with `context_age` + `sources_loaded` badges | Type meeting description → briefing + 3 Q&A cards appear in 4–8s | 1–2 days |
| 6 | **Audio + Deepgram transcript** — `AudioCaptureService` (mic + system via `electron-audio-loopback` on macOS), `TranscriptionService` (two Nova-3 WebSockets, `interim_results`, 60s rolling buffer), `TranscriptFeed` in renderer with "Them" highlight | Rolling live transcript appears in overlay while you talk on a real call | 2 days |
| 7 | **Hotkey-triggered RAG** — `HotkeyService` registers Cmd+Enter via Electron `globalShortcut`, slices last N seconds of transcript, fires RAG pipeline, streams answer to overlay; cancel-in-flight by request id | **Press Cmd+Enter mid-call → cited answer about what was just said** | 1–2 days |
| 8 | **Screen OCR grounding (macOS)** — `ScreenContextService` interface + macOS impl (`ScreenCaptureKit` + Vision `VNRecognizeText`), fires parallel to query rewrite/embed, injects as `SCREEN` block in generation prompt, KB-only degrade on failure | Answer grounds on a number visible in the counterparty's shared deck | 2 days |
| 9 | **Modes** — `ModeService` + local `modes.json` in Electron `userData`, CRUD UI, system-prompt swap in `generateAnswer` + briefing while keeping CONTEXT/SCREEN/TRANSCRIPT + format-instruction assembly | Switch between "terse leadership" vs "verbose junior" Modes; answer tone changes | 1 day |
| 10 | **Remaining connectors** — Slack (6h cron, 3 channels), Notion (6h, recursive from root page), GitHub (12h, 4 repos, text files only), Pitch (spike API first; export fallback if needed) | Full KB live; answers cite Slack threads + Notion pages + GitHub READMEs | 3–4 days |
| 11 | **Retrieval tuning + resilience** — 50-question BD-rep eval set, score-threshold tuning, dedup heuristic, recency/authoritative-source weighting, offline cached snapshot fallback, "last synced Xh ago" badge, billing/usage alerts | ≥90% factually correct + cited on eval set; overlay gracefully degrades when Qdrant/Supabase unreachable | 2–3 days |
| 12 | **Windows parity** — Windows capture exclusion (`WDA_EXCLUDEFROMCAPTURE`), Windows screen capture + OCR (`Windows.Graphics.Capture` + `Windows.Media.Ocr`), Windows audio loopback (resolve ERD `[Verify]` flag on path — WASAPI native addon vs `getDisplayMedia`) | App works end-to-end on Windows 10/11 | 3–4 days |
| 13 | **Hardening + internal beta** — cross-OS regression matrix (Zoom/Meet/Teams × macOS 12–15 × Win 10/11), cost guardrails verified live, AWS billing alerts, ops runbook, rep onboarding doc, internal beta with 3 Dex reps + one iteration cycle | Launch-ready v1 | 3–4 days |

**Total wall-clock to v1: ~5–6 weeks solo.** Demo-able product after slice 4 (week ~2).

---

## Open ERD decisions tracked here

| Decision | Status | Lands in |
|---|---|---|
| Authentication | **Deferred** to external distribution | Out of v1 scope |
| Multi-rep isolation | **Resolved** — single shared index | No work needed |
| Offline degraded mode | **In plan** | Slice 11 |
| Sync credentials on EC2 | **Resolved** — AWS SSM Parameter Store | Slice 1 (provisioning) + slice 3 (EC2 setup) |
| Pitch.com API | **Spike** | Slice 10 |
| Windows audio loopback path | **Spike** | Slice 12 |

---

## Working method

Each slice gets its own tech plan via `/create-a-tech-plan` before implementation starts; execution via `/execute-a-tech-plan`. Slices are sequential — do not start the next until the current one is demo-verified.
