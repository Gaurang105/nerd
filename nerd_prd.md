# nerd — Product Requirements Document
### *"Know it all"*

| | |
|---|---|
| **Product** | nerd — real-time meeting copilot |
| **Type** | Internal tool (Business Ops) |
| **Surface** | Desktop floating overlay (macOS + Windows) |
| **Owner** | Pavit Sond (Design) |
| **Status** | Draft v1.0 — for build |
| **Audience for this doc** | Eng + Design build team |

---

## 0. How to read this doc

This PRD is organized so each section is self-contained. Sections 1–4 set the *why* and *who*. Sections 5–13 are the buildable spec — features, flows, requirements, and constraints. Sections 14–18 cover scope, metrics, risks, and phasing.

Anything marked **[Assumption]** is a decision made to keep the spec complete; flag it if it's wrong. Anything marked **[Open]** needs a call before that part is built.

---

## 1. TL;DR

nerd is a floating desktop widget that sits on top of any meeting (Google Meet, Zoom, in-person screen-share, etc.) and gives a Business Ops user real-time, context-aware answers *while they talk*. It listens to the conversation; when the user presses a hotkey (`⌘+Enter`), nerd takes the recent conversation as the question and surfaces the right metric, fact, or talking point with near-zero latency — so the user never gets caught without the number.

The differentiator: it is **private to the user**. The widget can run in a hidden mode that is fully visible to the user but invisible to anyone they are screen-sharing with. The user can pick a "Mode" — a custom system prompt that shapes how nerd answers — and nerd does the rest live, grounded in Headout's synced internal knowledge base.

---

## 2. The problem

Business Ops walks into high-stakes conversations — selling partners, pitch meetings, investors — where the other side asks pointed, data-specific questions: *"What's your repeat rate on this category?" "How did GMV move last quarter?" "What does activation look like for partners like us?"*

Today the user either:
1. **Knows it cold** (rare, and risky to rely on), or
2. **Stalls** — "let me get back to you on that" — which kills momentum and credibility, or
3. **Fumbles through tabs and decks** while the other person watches.

The cost is real: lost deal velocity, weaker negotiating position, and a junior team that can't be sent into rooms unsupervised because they don't have the recall a senior person does.

**nerd removes the gap between "being asked" and "having the answer ready."**

---

## 3. Goals & non-goals

### Goals
- Deliver the right answer to a live question in **under ~2 seconds**, in the format the user wants.
- Let users **prepare once** (Modes) and reuse across recurring meetings.
- Be **invisible to the other party** when the user is screen-sharing.
- Make a **junior rep perform like a senior rep** by giving fuller, lower-risk outputs when needed.
- Pull from **real internal data and documents**, not generic knowledge.

### Non-goals (v1)
- Not a meeting recorder / minutes tool. (Transcript is a means, not the deliverable.)
- Not a CRM, deal tracker, or note-storage product.
- Not an externally shared / customer-facing product.
- Not a replacement for the user's own judgment — it assists, it doesn't autopilot the meeting.
- Not mobile (desktop overlay only in v1).

---

## 4. Users & personas

| Persona | Who | What they need from nerd |
|---|---|---|
| **Senior Ops / Leadership** | Knows the narrative, improvises well | Tight **pointers** — just the number / the hook. Low visual noise. |
| **Junior / New Ops** | Strong on hustle, light on recall | **Fully paraphrased answers** they can read near-verbatim, low chance of error. |
| **The counterparty** *(not a user)* | Partner / investor / pitch audience | Must **never** see nerd when screen is shared. |

The same product serves senior and junior via the **output mode** (pointers vs. full prose) — see §8.

---

## 5. Product principles

1. **Invisible by default to others, effortless for the user.** The user's edge is private.
2. **Prep moves the work off the live moment.** The heavy lifting happens *before* the meeting — the pre-call briefing (§10) and Mode selection — so the live surface stays calm.
3. **Latency is the feature.** A correct answer that arrives after the user has moved on is a failure.
4. **The meeting surface is sacred.** No settings, no clutter, no config visible while a meeting is running. Only answers.
5. **Grounded, not guessed.** Answers come from the synced internal knowledge base plus the live screen captured at the hotkey first; the model fills gaps, clearly.

---

## 6. The floating widget — placement & shell

### 6.1 Behaviour
- nerd renders as a **floating, always-on-top window** independent of any meeting app.
- It can be **docked to a screen corner**: top-left, top-right, bottom-right (and bottom-left). **[Assumption]** Bottom-left added for symmetry; confirm if you want only the three you named.
- **Keyboard control:** `⌘ + Arrow` (Cmd + ↑/←/→/↓) snaps the widget to the corresponding corner. Arrow icons in the widget header offer the same via click.
- Widget has two primary states:
  - **Collapsed** — a compact pill / icon (minimal footprint, just shows nerd is live).
  - **Expanded** — the answer panel (default working state).

### 6.2 Appearance customization (set pre-meeting)
- **Background transparency / translucency** — slider from solid → frosted/translucent → near-transparent.
- **[Assumption]** Also expose: blur amount, light/dark theme, font size, and panel accent. These are cheap and make the overlay readable against varied backgrounds.
- Appearance changes are **live-previewable** in settings, not changed mid-meeting.

### 6.3 Resize & reposition (live)
- **Hover** over the panel reveals **drag handles**.
- **Drag the body** to move the widget anywhere on screen (free position; snaps to corners when near one).
- **Drag edges/corners** to resize: left↔right to widen, top↕bottom to grow taller.
- The **answer content reflows** to fill whatever size the user sets — the user is sizing the *reading space*, and content fills it.
- Last position + size persist per Mode / per session. **[Assumption]**

---

## 7. Capture & permissions

nerd needs to perceive the meeting. Three capabilities, with explicit consent:

| Capability | Default | Purpose |
|---|---|---|
| **Screen access** | **On by default** | Two purposes: (1) content-protection for hidden mode (§7.1), and (2) on-demand grounding — at `⌘+Enter`, read the active display (shared decks, the counterparty's screen, the user's own tabs) via native OCR to ground the answer. Captured at trigger only, not streamed. |
| **Audio access** | **Core (on for calls)** | Capture spoken conversation — mic ("Me") + system audio ("Them") as two transcription streams. Load-bearing for the hotkey answer flow. |
| **Hidden mode** | Toggle (see §7.1) | Make nerd invisible to screen-share viewers. |

- Each permission is requested with a plain-language prompt and can be revoked anytime.
- **System audio capture** (hearing the *other* person through the call) and **mic capture** (hearing the user) are both used during a call; the mic/system split lets nerd attribute speakers and still works whether the meeting is in-person or remote.

### 7.1 Hidden / Stealth mode — the key feature
- When **Hidden mode is ON**, the user sees the nerd widget normally, but it is **excluded from screen capture and screen-share** — the counterparty sees a clean screen.
- Technical approach (for build):
  - **macOS:** render nerd in an `NSWindow` with `sharingType = .none` (content protection), so it's omitted from `ScreenCaptureKit` / share streams.
  - **Windows:** apply `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` so the window is excluded from capture/share.
  - Verify against Meet, Zoom, native screen-share, and OS-level capture on both platforms.
- A small, **persistent local-only indicator** confirms to the user whether they are currently hidden or visible, so they never guess wrong. **[Open]** Exact indicator design.

---

## 8. Live experience — transcription → answer

This is the core loop, and it must feel instant.

### 8.1 What happens as the user talks
1. Audio streams in; nerd also reads the screen on demand at trigger time (§7) to ground answers.
2. nerd **transcribes the conversation live**, attributing speech to **the user vs. the counterparty** (speaker separation), keeping a rolling buffer of the last N seconds.
3. When the user wants an answer, they **press `⌘+Enter`**. nerd takes the **last N seconds of transcript** as the question context — there is no auto-detection; the user stays in control of when nerd answers.
4. nerd **retrieves** the answer from the synced internal knowledge base (plus the live screen text captured at the hotkey) and **generates the response** in the user's chosen format, applying the active Mode's custom system prompt.
5. The answer renders in the panel near-instantly, so the user can read or speak it without breaking conversation flow.

### 8.2 A hot transcript buffer removes latency
nerd keeps the last N seconds of transcript live in memory, so the moment the user presses `⌘+Enter` the question context is already assembled — no cold capture step. Retrieval runs against the always-fresh synced knowledge base.

### 8.3 Output mode — list vs. paragraph
A live toggle:

- **List / Pointers mode** → terse bullets. For senior users who just need the number and will improvise the delivery.
- **Paragraph mode** → fully paraphrased, ready-to-speak prose. For junior users who want low-risk, near-verbatim answers.

### 8.4 Manual chat
Beyond the hotkey-triggered answer, the user can **type a question directly** to nerd at any time (e.g., to pull a number proactively). Same retrieval + format rules apply. Answers appear in the same resizable panel (§6.3).

---

## 9. Modes — custom system prompts

A **Mode** is a saved, named **custom system prompt** that replaces nerd's default generation prompt — it shapes *how* nerd answers (tone, persona, framing) for a given kind of meeting. Modes are authored **before** a meeting and **never appear on the in-meeting surface**; the user just picks the active Mode.

### 9.1 What a Mode contains
| Field | Description |
|---|---|
| **Name** | e.g. "Partner Pitch — Activities," "VP Sync," "Investor Update." |
| **Custom system prompt** | Free-text prompt that replaces nerd's default system prompt for answer generation — e.g. "Answer crisp and formal for a VP" or "Be casual and punchy." This is where tone, persona, and framing live. |
| **Default Mode flag** | Marks the Mode applied when the user hasn't picked another. |

### 9.2 Data sources are global, not per-Mode
Modes do **not** scope data sources. nerd grounds every answer on a single, shared internal knowledge base synced from Headout's sources (Slack, Notion, GitHub, Google Docs, Pitch) plus the live screen at trigger time. The sync architecture lives in the technical doc (`nerd_erd.md`), not here. Output format (list vs. paragraph) is the separate live toggle in §8.3, not a Mode field.

### 9.3 Reuse & defaults
- A Mode marked **default** is used when the user hasn't selected another.
- Modes are **saved and reusable** — author once, pick whenever the meeting type recurs.

---

## 10. Pre-call briefing

Before joining a call, the user can get nerd to **prep them in one step** — this is the heavy work that happens off the live moment (§5).

### 10.1 How it works
1. The user types a **free-form meeting description** (e.g. "meeting MakeMyTrip SP, they want to talk API reliability and payout timelines").
2. nerd searches the **full synced knowledge base** against that description and generates a **~200-word briefing**: the **3 most likely questions** the counterparty will ask, each with a **defensible, sourced answer**.
3. The briefing shows as a **card at the top of the overlay**; the retrieved context is held in memory and primes the live answer flow for the call.

### 10.2 Properties
- Takes a few seconds (**~4–8s**) — completes while the user is clicking "join."
- **Optional:** the live hotkey flow (§8) works with or without a briefing.
- Grounded in the same global knowledge base; no per-Mode data scoping.

---

## 11. Settings architecture — the hard separation

This is a structural rule, not a nice-to-have:

- **Pre-meeting (Config) surface:** Mode builder, appearance, permissions, defaults. Full-featured, can be busy.
- **In-meeting (Live) surface:** *only* the answer panel, the question feed, the list/paragraph toggle, move/resize handles, and the hidden/visible indicator. **No settings, no Mode editing, no config visible here.**
- Transitions between the two should be obvious and one action away, but they are **distinct surfaces**.

---

## 12. Key user flows

### Flow A — First-time setup
1. Install → grant screen permission → grant audio permission.
2. Create first Mode: name + custom system prompt; optionally mark it default.

### Flow B — Prep a specific meeting
1. Open Config → create/duplicate a Mode for this meeting type.
2. Author the custom system prompt (tone, persona, framing) → optionally set as default.

### Flow C — Live meeting (the money flow)
1. Before joining → user picks a Mode (or the default applies) and optionally types a meeting description to get a **pre-call briefing** (§10).
2. User confirms **Hidden mode ON** (sees indicator).
3. Conversation runs; when the user wants an answer they press `⌘+Enter` → nerd answers from the recent transcript in the panel, in the chosen format.
4. User reads pointer (senior) or speaks the paraphrase (junior); optionally types a manual query.
5. User drags/resizes the panel to a comfortable reading space; repositions via `⌘+Arrow` as needed.

---

## 13. Functional & non-functional requirements

### 13.1 Functional (prioritized)
| ID | Requirement | Priority |
|---|---|---|
| F1 | Always-on-top floating widget, dock to 4 corners via `⌘+Arrow` and header icons | P0 |
| F2 | Collapsed / expanded states | P0 |
| F3 | Hidden mode (excluded from screen capture) + local visibility indicator | P0 |
| F4 | Screen capture (default on) | P0 |
| F5 | Live audio transcription with user/counterparty separation | P0 |
| F6 | Hotkey-triggered (`⌘+Enter`) grounded answer from recent transcript | P0 |
| F7 | List vs. paragraph output toggle | P0 |
| F8 | Drag-to-move, hover handles, edge/corner resize with content reflow | P0 |
| F9 | Manual typed query | P0 |
| F10 | Mode builder: name + custom system prompt + default flag | P1 |
| F11 | Global synced knowledge base (Slack, Notion, GitHub, Google Docs, Pitch), shared across Modes | P1 |
| F12 | Knowledge base kept current via scheduled sync | P1 |
| F13 | Appearance: transparency/translucency (+ theme, blur, font size) | P1 |
| F14 | Audio capture (mic + system audio) for live transcription | P0 |
| F15 | Default Mode + reuse | P1 |
| F16 | Pre-call briefing: meeting description → top-3 anticipated Q&A + sourced answers | P1 |
| F17 | Per-Mode persisted widget position/size | P2 |

### 13.2 Non-functional
- **Latency:** hotkey pressed → answer rendered **≤ 2s p50, ≤ 4s p95**. The hot transcript buffer should make it feel instant.
- **Reliability:** graceful degradation if audio/screen/data source drops — never block the panel.
- **Footprint:** lightweight; must not visibly tax the machine during a live call.
- **Cross-app:** hidden mode verified on Meet, Zoom, native share, OS capture — on both macOS and Windows.
- **Persistence:** Modes and appearance survive restart.

---

## 14. Privacy, security & consent — read before building

Because nerd captures the **counterparty's** voice and the user's screen, this section is mandatory, not optional.

- **Recording/consent:** Capturing another party's audio has legal/consent implications that vary by region. Define whether nerd ever *stores* audio/transcript vs. processes ephemerally. **Default to ephemeral, in-session only.** **[Open]** legal review + consent policy.
- **Hidden mode ethics:** It is invisible to the *screen-share view*, not a covert recorder. Be explicit internally about the boundary; this is a recall aid, not surveillance.
- **Data handling:** Slack/Drive/internal metrics are sensitive. Scope access appropriately, encrypt at rest/in transit, and don't leak the knowledge base across unauthorized users.
- **Indicator:** the user must always know whether nerd is hidden or visible, capturing audio or not.
- **[Open]** Retention policy, admin controls, and which internal data sources are sanctioned for v1.

---

## 15. Edge cases
- No internet / knowledge base unreachable → nerd surfaces "context unavailable" rather than guessing; it never hangs the panel. (No local KB cache in v1; the overlay also shows "last synced Xh ago.")
- Multiple counterparties / crosstalk → best-effort speaker separation; degrade to single-stream.
- Transcription errors → user can edit/retype the question.
- Counterparty asks to see the user's full screen → hidden mode keeps nerd off the share.
- Sensitive number requested that isn't in context → nerd says it doesn't have it rather than guessing.

---

## 16. Success metrics
- **Time-to-answer** (question → on-screen) — primary.
- **% of counterparty questions answered confidently** (user-rated thumbs / post-meeting).
- **Stall rate reduction** ("let me get back to you") vs. baseline.
- **Adoption:** weekly active Ops users; meetings with nerd attached.
- **Mode reuse rate** (built once, run many).
- **Downstream:** partner activation / deal-progression lift for nerd-assisted meetings. **[Assumption]** harder to attribute; track directionally.

---

## 17. Assumptions & open questions (consolidated)
**Assumptions**
- Desktop-only (macOS + Windows) for v1.
- Bottom-left corner included alongside the three named.
- "decks space" = internal metrics/dashboards; appearance extras (theme/blur/font) included.
- Ephemeral, in-session processing by default.

**Open**
- Sanctioned internal data sources for v1 (Mixpanel? internal BI? Slides?).
- Consent + retention + admin policy (legal).
- Hidden/visible indicator design.

---

## 18. Phasing

| Phase | Scope |
|---|---|
| **P0 — MVP** | Floating widget + corner snapping, screen capture, **hidden mode**, live transcription + speaker separation, audio capture (mic + system), hotkey-triggered grounded answers, list/paragraph toggle, move/resize, manual query. |
| **P1 — Modes & data** | Mode builder (name + custom system prompt), global synced knowledge base (Slack, Notion, GitHub, Google Docs, Pitch) with scheduled refresh, pre-call briefing, appearance customization, default Mode + reuse. |
| **P2 — Automation** | Per-Mode persisted layout, analytics/success-metric instrumentation. |

---

*End of PRD — nerd, "Know it all."*
