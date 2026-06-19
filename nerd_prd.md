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

This PRD is organized so each section is self-contained. Sections 1–4 set the *why* and *who*. Sections 5–11 are the buildable spec — features, flows, requirements, and constraints. Sections 12–16 cover scope, metrics, risks, and phasing.

Anything marked **[Assumption]** is a decision made to keep the spec complete; flag it if it's wrong. Anything marked **[Open]** needs a call before that part is built.

---

## 1. TL;DR

nerd is a floating desktop widget that sits on top of any meeting (Google Meet, Zoom, in-person screen-share, etc.) and gives a user real-time, context-aware answers *while they talk*. It listens to the conversation; when the user presses a hotkey (`⌘+Enter`), nerd takes the recent conversation as the question and surfaces the right metric, fact, or talking point with near-zero latency — so the user never gets caught without the number.

The differentiator: it is **private to the user**. The widget can run in a hidden mode that is fully visible to the user but invisible to anyone they are screen-sharing with. nerd does the rest live, grounded in Headout's synced internal knowledge base.

---

## 2. The problem

Users walks into high-stakes conversations — selling partners, pitch meetings, investors — where the other side asks pointed, data-specific questions: *"What's your repeat rate on this category?" "How did GMV move last quarter?" "What does activation look like for partners like us?"*

Today the user either:
1. **Knows it cold** (rare, and risky to rely on), or
2. **Stalls** — "let me get back to you on that" — which kills momentum and credibility, or
3. **Fumbles through tabs and decks** while the other person watches.

The cost is real: lost deal velocity, weaker negotiating position, and a junior team that can't be sent into rooms unsupervised because they don't have the recall a senior person does.

**nerd removes the gap between "being asked" and "having the answer ready."**

---

## 3. Goals & non-goals

### Goals
- Deliver the right answer to a live question in **under ~2-3 seconds**, in the format the user wants.
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

The same product serves senior and junior via the **output format** (pointers vs. full prose) — see §8.

---

## 5. Product principles

1. **Invisible by default to others, effortless for the user.** The user's edge is private.
2. **The meeting surface is calm by design.** No prep ritual required — open nerd, join the call, and it's ready.
3. **Latency is the feature.** A correct answer that arrives after the user has moved on is a failure.
4. **The meeting surface is sacred.** No settings, no clutter, no config visible while a meeting is running. Only answers.
5. **Grounded where possible, general where not — always labelled.** Retrieval against the internal KB always runs first. If the question is Headout-related, the answer is grounded in internal data. If retrieval returns nothing relevant (generic question), the LLM answers from general knowledge — and the response is clearly marked so the user knows which it is.

---

## 6. The floating widget — placement & shell

### 6.1 Behaviour
- nerd renders as a **floating, always-on-top window** independent of any meeting app.
- It can be **docked to any of the four screen corners**: top-left, top-right, bottom-left, bottom-right.
- **Keyboard control:** `⌘ + Arrow` (Cmd + ↑/←/→/↓) snaps the widget to the corresponding corner. Arrow icons in the widget header offer the same via click.
- Widget has two primary states:
  - **Collapsed** — a compact pill / icon (minimal footprint, just shows nerd is live).
  - **Expanded** — the answer panel (default working state).

### 6.2 Appearance customization (set pre-meeting)
- **Background transparency / translucency** — slider from solid → frosted/translucent → near-transparent.
- Also expose: blur amount, light/dark theme, font size, and panel accent — these make the overlay readable against varied backgrounds.
- Appearance changes are **live-previewable** in settings, not changed mid-meeting.

### 6.3 Resize & reposition (live)
- **Hover** over the panel reveals **drag handles**.
- **Drag the body** to move the widget anywhere on screen (free position; snaps to corners when near one).
- **Drag edges/corners** to resize: left↔right to widen, top↕bottom to grow taller.
- The **answer content reflows** to fill whatever size the user sets — the user is sizing the *reading space*, and content fills it.
- Last position + size persist per session.

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
3. When the user wants an answer, they **press `⌘+Enter`**. nerd assembles the context window: the **last ~120 seconds of transcript (capped at 12 turns)** plus the **last 3 assistant answers (each truncated to ~200 characters)** to avoid repeating the same response. There is no auto-detection; the user stays in control of when nerd answers.
4. nerd **always runs retrieval first** against the internal knowledge base (plus the live screen text captured at the hotkey). If relevant internal context is found, the answer is grounded in it. If retrieval returns nothing relevant — i.e. the question is generic, not Headout-specific — the LLM answers from general knowledge. Either way, the response is **labelled** so the user can see whether the answer came from internal data or general knowledge.
5. The answer renders in the panel near-instantly, so the user can read or speak it without breaking conversation flow.

### 8.2 A hot transcript buffer removes latency
nerd keeps a rolling **120-second / 12-turn transcript buffer** live in memory, so the moment the user presses `⌘+Enter` the question context is already assembled — no cold capture step. The last 3 assistant answers are also held in a short-term memory (truncated to ~200 chars each) so the model can avoid repeating itself. Retrieval runs against the always-fresh synced knowledge base; the routing decision (internal vs. general) happens at generation time based on whether retrieval surfaces relevant context.

### 8.3 Output format — list vs. paragraph
A live toggle:

- **List / Pointers** → terse bullets. For senior users who just need the number and will improvise the delivery.
- **Paragraph** → fully paraphrased, ready-to-speak prose. For junior users who want low-risk, near-verbatim answers.

### 8.4 Manual chat
Beyond the hotkey-triggered answer, the user can **type a question directly** to nerd at any time (e.g., to pull a number proactively). Same retrieval + format rules apply. Answers appear in the same resizable panel (§6.3).

---

## 9. Settings architecture — the hard separation

This is a structural rule, not a nice-to-have:

- **Pre-meeting (Config) surface:** appearance, permissions, defaults. Full-featured, can be busy.
- **In-meeting (Live) surface:** *only* the answer panel, the question feed, the list/paragraph toggle, move/resize handles, and the hidden/visible indicator. **No settings, no config visible here.**
- Transitions between the two should be obvious and one action away, but they are **distinct surfaces**.

---

## 10. Key user flows

### Flow A — First-time setup
1. Install → grant screen permission → grant audio permission.

### Flow B — Live meeting (the money flow)
1. Before joining → user confirms **Hidden mode ON** (sees indicator).
2. Conversation runs; when the user wants an answer they press `⌘+Enter` → nerd answers from the recent transcript in the panel, in the chosen format.
3. User reads pointer (senior) or speaks the paraphrase (junior); optionally types a manual query.
4. User drags/resizes the panel to a comfortable reading space; repositions via `⌘+Arrow` as needed.

---

## 11. Functional & non-functional requirements

### 11.1 Functional (prioritized)
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
| F10 | Global synced knowledge base (Slack — all BizOps + Dex channels) | P1 |
| F11 | Knowledge base kept current via scheduled sync | P1 |
| F12 | Appearance: transparency/translucency (+ theme, blur, font size) | P1 |
| F13 | Audio capture (mic + system audio) for live transcription | P0 |
| F14 | Persisted widget position/size | P2 |

### 11.2 Non-functional
- **Latency:** hotkey pressed → answer rendered **≤ 2s p50, ≤ 4s p95**. The hot transcript buffer should make it feel instant.
- **Reliability:** graceful degradation if audio/screen/data source drops — never block the panel.
- **Footprint:** lightweight; must not visibly tax the machine during a live call.
- **Cross-app:** hidden mode verified on Meet, Zoom, native share, OS capture — on both macOS and Windows.
- **Persistence:** appearance settings survive restart.

---

## 12. Privacy, security & consent — read before building

Because nerd captures the **counterparty's** voice and the user's screen, this section is mandatory, not optional.

- **Recording/consent:** Capturing another party's audio has legal/consent implications that vary by region. Define whether nerd ever *stores* audio/transcript vs. processes ephemerally. **Default to ephemeral, in-session only.** **[Open]** legal review + consent policy.
- **Hidden mode ethics:** It is invisible to the *screen-share view*, not a covert recorder. Be explicit internally about the boundary; this is a recall aid, not surveillance.
- **Data handling:** Slack (all indexed channels) is sensitive internal data. Scope access appropriately, encrypt at rest/in transit, and don't leak the knowledge base across unauthorized users.
- **Indicator:** the user must always know whether nerd is hidden or visible, capturing audio or not.
- **[Open]** Retention policy, admin controls, and which internal data sources are sanctioned for v1.

---

## 13. Edge cases
- No internet / knowledge base unreachable → nerd surfaces "context unavailable" rather than guessing; it never hangs the panel. (No local KB cache in v1; the overlay also shows "last synced Xh ago.")
- Multiple counterparties / crosstalk → best-effort speaker separation; degrade to single-stream.
- Transcription errors → user can edit/retype the question.
- Counterparty asks to see the user's full screen → hidden mode keeps nerd off the share.
- Sensitive number requested that isn't in context → nerd says it doesn't have it rather than guessing.

---

## 14. Success metrics
- **Time-to-answer** (question → on-screen) — primary.
- **% of counterparty questions answered confidently** (user-rated thumbs / post-meeting).
- **Stall rate reduction** ("let me get back to you") vs. baseline.
- **Adoption:** weekly active Ops users; meetings with nerd attached.
- **Downstream:** partner activation / deal-progression lift for nerd-assisted meetings — harder to attribute; track directionally.

---

## 15. Assumptions & open questions (consolidated)
**Assumptions / decisions**
- Desktop-only (macOS + Windows) for v1.
- All four corners supported for docking (top-left, top-right, bottom-left, bottom-right) via `⌘+Arrow` and header icons.
- Appearance customization covers transparency plus theme, blur, and font size.
- No audio or transcript is persisted — everything is processed in memory during the session and discarded after.
- Data source for v1 is Slack only (all BizOps + Dex channels) — see the ERD.

**Open**
- Hidden/visible indicator design — the exact look of the local-only badge (§7.1) that tells the user whether nerd is currently hidden from screen-share.

---

## 16. Phasing

| Phase | Scope |
|---|---|
| **P0 — MVP** | Floating widget + corner snapping, screen capture, **hidden mode**, live transcription + speaker separation, audio capture (mic + system), hotkey-triggered grounded answers, list/paragraph toggle, move/resize, manual query. |
| **P1 — Data** | Global synced knowledge base (Slack — all BizOps + Dex channels) with scheduled refresh, appearance customization. |
| **P2 — Automation** | Persisted layout, analytics/success-metric instrumentation. |

---

*End of PRD — nerd, "Know it all."*
