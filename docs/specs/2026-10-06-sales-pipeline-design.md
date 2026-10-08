# Sales Pipeline — Design

Status: approved in brainstorm, 2026-10-06. Implemented 2026-10-06 — see "Implementation deltas" at the end for where the build differs from this design.

## Problem

20 reps share one pipeline of ~50,000 deals across 7 stages (New Lead → Contacted → Demo Done → Proposal Sent → Negotiation → Won / Lost); some stages hold 10,000 deals. Their five complaints map to five requirements:

| Complaint | Requirement |
|---|---|
| "I don't know which deals to work on today" | A prioritised, explained "Today" view |
| "I moved a deal, but it didn't save, and nobody told me" | Every save visibly tracked; failures impossible to miss |
| "Deals keep jumping around because teammates are editing" | Live updates that never move things under the user |
| "At quarter end I need to move thousands of deals to Lost" | Bulk move by filter, at thousands-scale |
| "I can't use a mouse for long" | Every action reachable from the keyboard |

Network: saves take 0.3–1.5 s and ~1 in 10 fail. No backend — a fake API simulates delay, failure and teammates, all adjustable at runtime.

## Goals

- Smooth at 50,000 deals (scroll, filter, select-all, bulk).
- Move one deal or thousands; no silent loss of a save.
- Teammates' changes visible but never disruptive.
- Fully keyboard-operable.
- Runs with one command.

## Non-goals

Login, real backend, extra pages, visual polish, close dates, activities/tasks, offline persistence, presence avatars, saved views, mobile layout.

## Chosen approach

**List-first, with a board toggle over the same data.**

Research across 7 CRMs and 4 work apps (sources at the end) showed every product ships both a list and a board over the same filters, and that boards never carry large volume: Salesforce's opportunity Kanban caps at 200 records and has no mass actions; Jira and Trello cap boards at 5,000 cards. Large volume and bulk work are pushed to the list.

**Options considered**

| Option | Verdict | Why |
|---|---|---|
| List by default + board toggle, "Today" as a list preset | **Chosen** | Matches Linear / Salesforce / HubSpot; list carries volume and bulk, board keeps stage flow; one data layer, one keyboard model. |
| Board as the default view (Pipedrive, Copper) | Rejected | A 10,000-card column is a wall, not a priority list; bulk-selecting thousands on a board is unworkable; cards moving between columns *is* the "jumping around" complaint. |
| List only | Fallback | Viable and cheaper, but loses the at-a-glance stage flow reps expect. The board is built last and cut if behind schedule. |
| "Today" queue as the only screen (Superhuman / Close Inbox style) | Rejected | Answers complaint 1 but cannot do quarter-end bulk or a pipeline overview. Kept as a preset of the list instead. |

## Product behaviour

### Main screen

- **Stage strip** across the top: each stage with deal count and ₹ total; clicking a stage filters to it.
- **List** (default): virtualised rows — company, licences, value, owner, stage, days in stage, status chips. Filters: owner, stage, days-in-stage threshold, text search.
- **Board** (`B` toggles): one virtualised column per stage, same filters. Cards ordered failed-first, then value descending. Single-deal moves only (keys, or drag); **bulk lives in the list**.
- **"Viewing as"** picker selects which of the 20 reps the user is.

### Today

A preset of the list.

- **Who:** the current rep's open deals (not Won/Lost).
- **Enters Today when any of:**
  1. my save on it failed;
  2. a teammate changed it since I last saw it;
  3. it has been in its current stage longer than that stage's threshold (e.g. New Lead 3 d, Negotiation 7 d).
- **Order:** failed saves pinned first; then later stage first; then higher value first.
- **Shape:** an **"Unsaved (N)" section pinned above** the list holds trigger 1 — only the browser knows a save failed, since the server never received it. The paged list below is a server query for triggers 2 and 3 ("seen" is a per-user read marker on the server).
- **Each row shows why** it is here as a chip: `Save failed` · `Changed by Rahul` · `Stuck 21d`.
- **Leaves Today** when acted on: moved, retried/discarded, or seen — the row receives focus — (for the teammate-change trigger).

Every trigger is grounded in the brief; close dates and next activities are not in the brief and are deliberately not invented.

**Options considered**

| Option | Verdict | Why |
|---|---|---|
| Three brief-backed triggers (failed save, teammate change, stuck), ordered stage → value | **Chosen** | Each trigger traces to a line in the brief; visible rules beat a hidden score (Pipedrive, Close). |
| Add an invented close-date trigger | Rejected | Richer demo, but adds a field the brief does not have; reads as padding. Deferred. |
| Drop "changed by teammate" as a trigger, show it only as a row highlight | Rejected | Complaint 3 is about being surprised by teammates; surfacing it in Today answers it directly. |
| Weighted priority score | Rejected | Opaque — reps can't tell why a deal is ranked where it is. |

### Saving a change

| Phase | What the user sees |
|---|---|
| Immediately | Change applied on screen; a small "saving" mark on the deal. |
| Failure 1–2 | Retried silently with backoff. A move is "set stage = X", so resending is safe. At a 10 % failure rate two retries leave ~0.1 % visible failures. |
| Still failing | Deal **stays where the user put it**, marked `Not saved · Retry · Undo`, pinned at the top of Today. A global "N unsaved" counter appears in the header. |
| Superseded | If the user changes the same deal again while a save is in flight, only the latest intent is sent. |

**Options considered**

| Option | Verdict | Why |
|---|---|---|
| B. Auto-retry twice, then deal **stays put**, marked `Not saved · Retry · Undo`, pinned in Today, global counter | **Chosen** | Nothing moves without the user acting; the failure persists until resolved. No researched CRM shows per-deal save failure — this is the gap. |
| A. Auto-retry, then **snap back** to server truth with a toast + Retry (Linear) | Rejected | Moves the deal away from where the user is looking (more "jumping"); a vanishing toast recreates "nobody told me". |
| No auto-retry — surface every failure immediately | Rejected | At 10 % failure the user is interrupted constantly for failures a retry would have fixed. |

### Teammates' changes

Last write wins, per field, decided by the server.

| Incoming change | Behaviour |
|---|---|
| Field change on a deal I can see | Update in place, brief highlight, `Changed by X` chip. |
| Change to a deal I have a pending save on | My value stays on screen (no flicker). If my save succeeds, mine wins. If it ultimately fails, the badge becomes a choice: `X moved this to Lost · Keep mine / Take theirs`. |
| Deal leaves my current view | Row stays, greyed, labelled `Moved to Negotiation by X`. |
| Deal enters my current view | Held back. |
| Either of the above | Counted in a quiet `N updates · Show` pill; clicking it or pressing `.` applies them. The focused row never moves or disappears. My own edits never count toward the pill. |

**Options considered** (for deals entering/leaving the current view)

| Option | Verdict | Why |
|---|---|---|
| A. Quiet pill — leaving rows ghost, arrivals held, user applies | **Chosen** | The only option where "without disturbing the user" holds strictly; ghost rows explain what changed instead of things vanishing. Twitter's "N new posts" pattern. |
| B. Apply live, freeze only the focused row and its neighbours | Rejected | Rows still move in peripheral vision — a milder form of the complaint. |
| C. Hold while the user is active, auto-apply after a few seconds idle | Rejected | Unpredictable; the rule is hidden in a timer and hard to explain. |
| Jira-style "Board updated — Refresh" banner | Rejected as-is | Users complain it fires for their own edits too; ours counts teammates only. |

### Bulk move

1. Filter (e.g. Stage = Proposal Sent, days in stage > 90, owner = anyone).
2. `x` selects rows; `Shift+A` selects the visible page, then a banner offers **"Select all 3,412 matching"**.
3. `s` (or `1`–`7`) picks the target stage. No confirmation dialog — undo replaces it.
4. Runs in the background with a progress bar: `Moving 3,412 → Lost · 2,104 done · 0 failed`. The user keeps working.
5. Result: `3,390 moved · 8 skipped (changed by teammates) · 14 failed` with **Select failed**, **Retry**, **Undo**.

**Conflict rule:** each deal moves only if it is still in the stage it had when selected; otherwise it is skipped and reported. This protects a teammate's Won from being silently overwritten to Lost. Single-deal moves stay plain last-write-wins, because the user is looking at that deal.

**Undo** restores each moved deal to its own previous stage, under the same rule: a deal a teammate changed after the bulk is skipped and reported.

**Options considered**

| Decision | Option | Verdict | Why |
|---|---|---|---|
| Conflict during bulk | A. Skip deals changed since selection, report them | **Chosen** | Protects a teammate's Won from silently becoming Lost. |
| | B. Last write wins (Salesforce, Attio) | Rejected | Silently overwrites teammates — "nobody told me", but for them. |
| Safety net | Undo, no confirm dialog | **Chosen** | "Never use a warning when you mean undo"; Linear undoes batches. |
| | Confirmation dialog | Rejected | Users click through it; Pipedrive's bulk edit can't be undone at all. |
| Selection scale | Gmail-style "Select all N matching" | **Chosen** | Thousands in one step. |
| | Page-only selection / fixed cap | Rejected | Salesforce caps at 200, Pipedrive at 100 — the exact "few at a time" complaint. |
| Where bulk lives | List only | **Chosen** | Salesforce also blocks mass actions on Kanban; lassoing thousands of cards is unworkable. |
| | Board too | Deferred | Cost without matching value. |

### Keyboard

| Key | Action |
|---|---|
| `j` / `k`, arrows | Move focus |
| `x` | Toggle select focused deal |
| `Shift+A` | Select page (then offer select-all-matching) |
| `Esc` | Clear selection / close menus |
| `s` | Change stage of focused or selected deals |
| `1`–`7` | Move focused or selected deals to that stage |
| `r` | Retry failed save on focused deal |
| `u` | Undo last action |
| `.` | Apply pending teammate updates |
| `/` | Focus filter/search |
| `t` / `a` | Today / All deals |
| `B` | Toggle list ↔ board |
| `Cmd+K` | Command menu; every entry shows its shortcut |
| `?` | Shortcut help |

Focus is always visible. Screen-reader basics: rows are focusable with an accessible label; status chips have text, not colour alone.

**Options considered**

| Option | Verdict | Why |
|---|---|---|
| Linear / Close / Gmail conventions (`j/k`, `x`, single-key actions, `Cmd+K` showing shortcuts) | **Chosen** | Already familiar to many users; the command menu teaches shortcuts as it's used. |
| Arrow keys + Enter menus only | Rejected | Every action becomes several keystrokes — fails "can't use a mouse for long". |
| Custom scheme | Rejected | Nothing to gain over established conventions. |

### Dev panel

Collapsible, always available:

- Save latency range (default 0.3–1.5 s)
- Write failure rate: saves, bulk start, undo, "seen" (default 10 %)
- Read failure rate: rows, counts, bulk progress (default 0 %)
- Teammate edits per minute, plus a "pause teammates" switch
- "Drop live connection (5 s)" button
- "Viewing as" rep picker

## Technical design

### Scalability targets

The architecture is shaped for four kinds of growth. "Designed for" means the seam exists and is documented; "built" means it runs in the demo.

| Growth | Designed for | Built |
|---|---|---|
| Data volume (50k → 500k+ deals) | Server-side filter / sort / paging; the browser holds only visible pages | ✅ against the fake server |
| Team / codebase | Feature folders, one typed API contract, clear state ownership (server vs client) | ✅ |
| Real backend swap | App speaks real HTTP + WebSocket; the fake is deleted, not rewritten | ✅ via MSW |
| Concurrent users (20 → 500 reps) | Versioned deals, batched event handling, conflict rules enforced server-side | ✅ at simulated rates |

### Stack at a glance

| Concern | Choice |
|---|---|
| Rendering | CSR — Vite + React + TypeScript (strict) |
| Server state | TanStack Query (React Query) |
| Client state | Redux Toolkit |
| Fake API | Mock Service Worker (REST + mocked WebSocket) |
| Paging | Offset over a server snapshot |
| Virtualisation | TanStack Virtual |
| Response validation | zod, one shared contract |
| Tests | Vitest, reusing the MSW handlers |
| Styling | Plain CSS modules |

### Rendering: CSR

| Option | Verdict | Why |
|---|---|---|
| **CSR — Vite SPA** | **Chosen** | Authenticated internal tool, highly interactive, live data — the profile of Linear, Figma, Jira boards. Scales via code-splitting, a static shell on a CDN, and server-side paging. |
| SSR — Next.js App Router | Rejected | SSR's gains (SEO, first paint for anonymous visitors) don't apply. A virtual list can't be meaningfully server-rendered (window height unknown), live data changes right after hydration, and both stores need hydration wiring. Puts the fake API on a server, against the brief ("fake API inside the app"). |
| Hybrid — server shell, client list | Rejected | Hydration complexity for a shell that renders in milliseconds anyway. |

Board view and command menu are lazy-loaded chunks.

### State: React Query for server state, Redux Toolkit for client state

Each library owns different data, so there is no second copy of the deals.

| Owner | Holds |
|---|---|
| **React Query** | Deal pages per `(filter, sort, snapshotId)`; stage counts; bulk-job status. `staleTime: Infinity` — freshness comes from the push feed, not refetching. |
| **Redux Toolkit** | My unsaved overlay (saving / failed per deal), selection (explicit IDs or "all matching filter"), focus, filters, held-updates count, dev-panel settings. |

The overlay is the one deliberate exception to "server data lives in React Query": it sits in Redux on top of React Query's data because it must outlive both virtualised rows (unmounted on scroll) and evicted cache pages.

| Option | Verdict | Why |
|---|---|---|
| **React Query + Redux Toolkit, split by ownership** | **Chosen** | With server paging, React Query's per-key caching is exactly the job; Redux holds the cross-cutting client state and the save queue. |
| Redux Toolkit only (plain slices) | Rejected | Fine when the browser holds all deals; with server paging we'd hand-write page caching, eviction and per-filter keys. |
| RTK Query instead of React Query | Rejected | Same model, lives inside Redux; no advantage over React Query for paged windows, and the user preferred React Query. |
| React Query only, `useMutation` for saves | Rejected | `useMutation` ties save status to the component that started it; virtualised rows unmount on scroll, so a failed save's state disappears — complaint 2 again. Its default model is roll-back-on-error; we chose stay-put. |
| Framework-free TypeScript sync core | Rejected | Most testable, but the user chose a mainstream, reviewer-familiar stack. |

### Saves

Redux listener middleware owns the save queue:

1. Action `dealMoved(id, toStage)` → overlay marks the deal `saving`.
2. Listener sends `PATCH /api/deals/:id` with `{stage, ifStage?, revert?}` (see deltas: no `version`).
3. Success → patch matching React Query cache entries (`setQueriesData`), clear overlay.
4. HTTP 500 → retry up to twice with backoff → then overlay marks `failed` (stays put).
5. A newer intent for the same deal supersedes the queued one (latest intent only).

### Fake API (MSW)

The app calls real `fetch` and a real WebSocket URL; MSW intercepts both in the browser.

| Endpoint | Purpose |
|---|---|
| `GET /api/deals?filter&sort&snapshotId&offset&limit` | Page of deals + total + `snapshotId` |
| `GET /api/stage-counts?filter` | Count and ₹ total per stage |
| `PATCH /api/deals/:id` | Single move; last write wins; returns new `version` |
| `POST /api/deals/:id/seen` | Per-user read marker (Today trigger 2) |
| `POST /api/bulk-jobs` | `{filter, snapshotId, toStage}` → job id |
| `POST /api/bulk-jobs/:id/undo` | Undo as a job |
| `WS /api/live` | Teammate changes, bulk progress |

Failures are real HTTP: **500** for the random failure rate, **409 Conflict** when a conditional move finds the deal changed. The in-memory database is generated from a fixed seed (50k deals). A teammate simulator inside the mock writes through the same database and broadcasts over the WebSocket.

| Option | Verdict | Why |
|---|---|---|
| **MSW** | **Chosen** | Swapping in a real backend = delete MSW, point at a URL. Real 500/409 visible in DevTools during the demo. Same handlers reused in tests. |
| In-app module behind an interface | Rejected | No network boundary; the swap means rewriting the client. |
| Web Worker fake server | Rejected | Best raw performance (off main thread), but message transport instead of HTTP; the swap means rewriting the transport. |

**Known ceiling:** MSW handlers run on the page's main thread. Fine at 50k with a cached sort index; at 500k the fake's query engine would move to a Web Worker — a real backend does this work server-side anyway.

**To verify in planning:** MSW's WebSocket mocking fits the live feed. Fallback: Server-Sent Events, or polling `GET /api/changes?since=<version>`.

### Paging: offset over a server snapshot

The first query for a filter returns a `snapshotId`; the server freezes the **ordered list of IDs** for it. Later pages read that frozen order, while deal **fields** are always current. "Show updates" requests a new snapshot.

| Option | Verdict | Why |
|---|---|---|
| **Offset + snapshot** | **Chosen** | Implements the product rule — order frozen, values live — at the API level. Total is known, so dragging the scrollbar to row 8,000 works. Production analogue: Elasticsearch point-in-time, or ID lists cached in Redis. |
| Cursor (keyset) infinite scroll | Rejected | Stable and database-friendly, but no random access across 10k rows. |
| Plain offset | Rejected | Teammate edits between page loads cause skipped and duplicated rows — "jumping around" caused by our own paging. |

The fake keeps the last few snapshots (50k IDs ≈ 200 KB each).

### Virtualisation: TanStack Virtual

The list is sized to the query's total; visible rows map to page offsets, fetched on demand.

| Option | Verdict | Why |
|---|---|---|
| **TanStack Virtual** | **Chosen** | Headless — one hook for the list and each board column; full control of focus and ARIA, which `j/k` scroll-into-view needs. |
| react-virtuoso | Rejected | Heavier; variable-height features we don't need. |
| react-window | Rejected | Fixed component shapes fit seven board columns poorly. |
| Hand-rolled | Rejected | Scroll-into-view, overscan and resize are easy to get subtly wrong. |

### Teammate events and concurrency

- Every deal has a server-incremented `version`. The client ignores events older than the version it holds, which protects against out-of-order delivery.
- Events are batched and applied once per ~100 ms, not one render per event.
- A field change on a cached deal patches it in place. A change that alters membership of the current view (enters or leaves) increments the pill count; "Show" fetches a new snapshot.
- Deals with a pending or failed overlay are not visually overwritten (see product rules).

### Bulk jobs

`POST /api/bulk-jobs {filter, snapshotId, toStage}`. The server walks the snapshot's IDs; each deal moves only if its stage still equals its stage in the snapshot, otherwise it is recorded as skipped. Random failures apply per deal. Progress streams over the WebSocket; the result lists moved / skipped / failed IDs. Undo is a job that restores each moved deal's previous stage under the same rule.

| Option | Verdict | Why |
|---|---|---|
| **Server-side job by filter** | **Chosen** | One request regardless of size; conflict check happens where the data lives; survives the user navigating away. |
| Client loop over IDs | Rejected | 3,412 requests from a browser; dies with the tab; conflict check races. |

### Code organisation

Feature folders: `deals/` (list, board, Today), `sync/` (save queue, live feed), `bulk/`, `keyboard/`, `dev-panel/`, `api/` (typed client + zod contract), `mocks/` (MSW handlers, database, teammate simulator). API responses are validated with zod against one contract shared by client and handlers.

### Smaller choices

| Concern | Choice | Considered |
|---|---|---|
| Board drag | Native HTML5 drag, single card; keyboard is the primary path | dnd-kit — fuller featured, unnecessary for single-card moves |
| Styling | Plain CSS modules | Tailwind — the brief says skip visual polish |
| Fake data | Seeded PRNG, same 50k deals every run | Faker — a dependency for names we can list in a few lines |

## Testing strategy

- **Unit (Vitest):** overlay reducer and save-queue listener (retry, failed, latest-intent), selection reducer, fake-server query engine (filter, sort, snapshot stability), bulk job (conditional skip, undo skip), version-based event ignoring.
- **Integration (Vitest + MSW handlers):** save fails twice then succeeds; save fails permanently and stays put; bulk with a concurrent teammate change reports a skip.
- **E2E (Playwright, Chromium, real MSW):** one spec per brief requirement — 50k virtualised + jump to last row; failed save stays put and `r` saves it; teammate edits don't move rows and `.` keeps focus; select-all-matching → Lost → undo with exact counts; keyboard-only flow; board markers and live counts; recovery after the browser stops the service worker (verified to fail with the fix disabled); a perf budget (50k scroll and a 12k bulk: frame times, long tasks, duration). Stable over repeated runs.
- **Performance check:** scroll the 50k list smoothly; select-all-matching on 10k plus bulk keeps the UI responsive.
- **Manual demo script:** failure rate at 50 %, teammates at a high rate, quarter-end bulk with conflicts, DevTools Network tab showing 500 / 409.

## Success criteria

- No silent loss: every change ends as saved, or visibly failed with retry/undo.
- With teammates editing at a high rate, the focused row never moves and the list never reorders without the user asking.
- A bulk move of 10,000 deals completes with the UI usable throughout and an exact moved/skipped/failed count.
- Every action in this spec is reachable without a mouse.

## Assumptions

- "Stuck" thresholds per stage are invented defaults and adjustable in code.
- One fake user session; "Viewing as" stands in for login.
- The fake server is the single source of truth; there is no offline mode.
- Per-user "seen" markers live in the fake server's memory; a real backend persists them.

## Deferred — "with more time"

Close dates and next activities as Today triggers · offline mode with a stored save queue · presence avatars · saved views · bulk actions on the board · manual reordering within a stage · Web Worker query engine for 500k · WebSocket reconnect with resync from last version · CDN deployment.

## Implementation deltas

Where the build differs from, or settles, the design above. Each is a decision, not an accident.

| Area | Design said | Built | Why |
|---|---|---|---|
| Sort | `sort` query param | No param. Order is fixed per preset: Today = later stage → value; All = value desc (`compareDeals` in `api/contract.ts`) | No requirement needs user-chosen sort; the seam is one function. Deferred. |
| Styling | CSS modules | One plain stylesheet (`src/styles.css`) | Brief says skip polish; modules add files without adding behaviour. |
| Unsaved section | Pinned above the list when there are failures | A **fixed-height region** always present in Today, internally scrolling | A region that appears on failure pushes the list down — itself a "jump". Reserving the space makes the guarantee hold. |
| Concurrent saves to one deal | "Latest intent only" | Saves for one deal are **serialised** (each waits for the previous to settle) and superseded ones are never sent | With 0.3–1.5 s random latency a slower older request could land after the newer one and win on the server. |
| Single-move undo | Not specified | Conditional `PATCH {stage: from, ifStage: to}`; a 409 becomes `Keep mine / Take theirs` | Same conflict rule as bulk undo; gives 409 a real, visible use. |
| Held-update pill | Count of membership changes | A **set of deal ids that toggles**: leaving then returning cancels out | Avoids double counting. Approximation: for deals not in the browser cache, the "was it in the view?" check assumes the previous version was seen. The count is an upper bound; the next snapshot is exact. |
| Own bulk job | Not specified | On completion the view takes a new snapshot immediately | It is the user's own action; rows leaving the filter is the expected result, not a surprise. |
| Bulk failures | "Random failures apply per deal" | Per-deal failure rate = dev-panel failure rate ÷ 10; **undo jobs never fail randomly** | 10 % per deal would fail 1,200 of 12,000; a failed undo would have no recovery path. |
| Select all matching | `Shift+A`, then a banner offers it | Same, plus pressing `Shift+A` again selects all matching | Keeps the whole flow on the keyboard. |
| "Changed since seen" | Row receives focus | Row has focus for 700 ms | Flicking through rows with `j` should not mark everything seen. |
| Board | Failed-first, then value | Value only; cards show a `→ Stage` note while a move is pending or failed; `h`/`l` switch column | Board is the cut-if-behind item. A failed card stays in its column, marked. |
| MSW WebSocket | "To verify in planning" | **Verified**: MSW 3 `ws.link('*/api/live')` carries live events and bulk progress | No fallback needed. |
| Dev settings | Dev panel | Settings and "viewing as" live in a small client-side module the fake server reads | The only code that is fake-only by construction; deleted with the mocks. |
| Bundle | Mocks as separate chunk | Mocks are in the main chunk | Simpler; they are deleted for a real backend. Board, command menu and help are lazy chunks. |
| PATCH body | Sends the deal's `version` | Sends `{stage, ifStage?, revert?}`, no `version` | Single moves are last-write-wins, so a version changes nothing; `ifStage` carries the only conditional check (undo). |
| Undo history | Recorded when a save succeeds | Recorded **when the move is made**; `u` on a still-saving move reverts that move; `u` on a running bulk says "still running" instead of undoing something older | Found in review: with 0.3–1.5 s saves, `u` pressed right after a move undid the previous bulk. |
| Undo of a single move | Moves the stage back | Moves it back **and restores how long it had been in that stage** (`revert: true`) | Otherwise an accidental `3` + `u` reset "Stuck 47d" to 0d and quietly dropped the deal out of Today. |
| Owner filter in Today | Not specified | Today ignores the All-deals owner filter (Today is always "my deals") | Found in review: Owner = Arjun in All, then `t`, emptied Today with a disabled "Me" box and no way to clear it. |
| Refresh and focus | "Focused row never moves" | `.`, the pill and own-bulk completion send the focused deal's id; the server returns its index in the new snapshot and focus follows it. The list keeps showing old rows until the new snapshot arrives. A finished bulk keeps the selection. | Found in review: refresh blanked the list and left focus on whatever deal now sat at the old index. |
| Bulk result | moved / skipped / failed | Adds **unchanged** ("already in Lost"); a job can be undone **once**; undo removes its own history entry; progress that arrives before the 202 is kept; the client polls the job as a fallback | Found in review: small jobs could stick at "running", and repeated undo was possible. |
| Board | Value order, `→ Stage` while pending | A card whose stage no longer matches its column stays put, marked `→ Stage · by X` (you or a teammate); teammate stage moves count toward the pill; headers show live counts; the stage strip focuses a column; `x` / `Shift+A` explain that selection lives in the list (selection clears and focus returns to the top on `B`) | Found in review: saved moves left cards in the old column unmarked, and board-side bulk could move a whole filter. |
| Conflict badge | Any teammate change while my save is pending | Only a teammate **stage** change that differs from mine | A value edit was shown as "Rahul moved this…". |
| `r` | Retry the focused failed deal | Same; with no focused failure it retries **all** unsaved changes | Failed deals outside the current list were otherwise unreachable from the keyboard. |
| Switching "viewing as" | Not specified | Clears the previous rep's unsaved changes, undo history and bulk job | Logging in as someone else must not inherit their state. |
| Row controls and screen readers | "Rows are focusable with an accessible label" | Each row's checkbox and stage menu are `aria-hidden` mouse shortcuts (already out of the Tab order); the row's label, `aria-selected` and the keys carry the same information | Found by E2E: the stage menu inside every `role="option"` row exposed seven nested options per row to assistive tech. |
| Running it | "Runs with one command" | `npm start` installs, starts and opens the app; `npm run e2e` fetches Chromium itself on first run; `engines` pins Node 20.19+/22.12+ | The brief asks for one command; `npm i && npm run dev` is two. |
| Failures beyond saves | Only saves could fail | Every call can fail on demand: a "Write failure rate" slider covers saves, bulk start, undo and "seen"; a new "Read failure rate" slider covers rows, counts and bulk progress; a button drops the live connection for 5 s. The UI answers each: rows that fail to load show one "Couldn't load these rows · Retry" (also `r`, and automatic when scrolled back); a dropped connection shows "Live updates paused — reconnecting…", then refreshes values in place and offers "Reconnected · Show latest" (order stays frozen); a failed bulk start keeps the selection, and an expired one asks to re-select; a failed bulk undo keeps its history entry so `u` can try again; a failed "seen" is harmless and retried next focus | Found in an audit: three paths were broken (rows stuck loading forever, an undo lost after one failure, a silent stale feed after a drop) and none could be shown to an evaluator. |
| Rows just off-screen | Pages fetched for the visible range | Pages are fetched for the virtualiser's overscan rows too | The buffer rows above and below the viewport were never requested, so they sat as placeholders until scrolled into view. |
| Search box on load | Not specified | Sends a search only when the typed text differs from the current filter | Found by E2E: under React StrictMode the old "skip first run" ref fired an empty search 250 ms after load, which re-snapshotted the list, reset focus and cleared the selection. |
| Refresh placeholder | Not specified | Old rows stay on screen only while the **same** filter refreshes; a new filter shows "Loading deals…" | Found by E2E: keeping the previous filter's rows let a fast keypress act on deals from the wrong view. |
| MSW keep-alive | Not specified | The page re-sends MSW's activation message on tab focus/visibility and every 4 s, and **immediately** when a response comes back as HTML; that response is treated as a network error, so React Query's next retry succeeds | Found live: after ~3 idle minutes the browser restarted the service worker, which forgot the page and passed every request to Vite ("Could not load deals"). Fake-only; disappears with the mocks. |

## Research sources

- Salesforce Kanban limits (200 records, no mass actions): https://help.salesforce.com/s/articleView?id=xcloud.kanban_considerations.htm&language=en_US&type=5
- Salesforce list mass-edit cap (200): https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.basics_list_views_lex_considerations.htm
- Jira board 5,000-issue cap: https://community.atlassian.com/forums/Jira-articles/Jira-boards-and-backlogs-can-now-show-5-000-issues-in-company/ba-p/2708797
- Trello 5,000 open cards: https://developer.atlassian.com/cloud/trello/guides/rest-api/limits/
- Pipedrive next-activity ordering: https://support.pipedrive.com/hc/en-us/articles/115001107229
- Pipedrive rotting deals: https://support.pipedrive.com/en/article/the-rotting-feature
- Pipedrive bulk edit cannot be undone: https://support.pipedrive.com/en/article/bulk-editing-and-filtering
- Close Inbox / Needs attention: https://help.close.com/feature-guide/inbox · https://help.close.com/feature-guide/opportunities/opportunity-pipeline-view
- Close keyboard shortcuts: https://help.close.com/best-practices/keyboard-shortcuts
- Attio real-time updates: https://attio.com/help/reference/productivity-collaborating/real-time-updates
- Linear board/list toggle: https://linear.app/docs/board-layout
- Linear selection and bulk: https://linear.app/docs/select-issues · undo: https://linear.app/changelog/undo-actions
- Linear sync engine (optimistic updates, rollback): https://github.com/wzhudev/reverse-linear-sync-engine
- Figma ignoring server updates over unacknowledged local edits: https://www.figma.com/blog/how-figmas-multiplayer-technology-works/
- Airtable freezing row position during edit: https://community.airtable.com/other-questions-13/instant-sort-filter-conflict-with-data-entry-20689
- Jira refresh banner complaints: https://jira.atlassian.com/browse/JRACLOUD-64161
- "Never use a warning when you mean undo": https://alistapart.com/article/neveruseawarning/
- Superhuman 100 ms rule: https://blog.superhuman.com/superhuman-is-built-for-speed/
