# Sales Pipeline — write-up

Full decision log with options considered: [`docs/specs/2026-10-06-sales-pipeline-design.md`](specs/2026-10-06-sales-pipeline-design.md). Run it with `npm i && npm run dev`.

## What the reps asked for, and what answers it

| Complaint | What I built | Why this and not the alternative |
|---|---|---|
| "Which deals do I work on today?" | **Today**: my open deals that are *stuck* (per-stage threshold), *changed by a teammate since I last looked*, or *failed to save*. Failed first, then later stage, then value. Every row says why (`Stuck 21d`, `Changed by Rahul`, `Not saved`). | Every trigger comes from the brief; no invented close dates. A visible rule beats a hidden score — reps can see why a deal is where it is. |
| "I moved a deal and it didn't save, nobody told me" | Optimistic move + `Saving…`; two silent retries; then the deal **stays where I put it**, marked `Not saved · Retry · Undo`, listed in a fixed-height **Unsaved** region, counted in the header. | Snapping back (Linear) moves the deal away from where the rep is looking, and a toast vanishes — that recreates "nobody told me". |
| "Deals keep jumping around" | Order is **frozen per view** (server snapshot); values update in place with a highlight. Rows entering/leaving the view are held behind a quiet `N updates · Show` pill; leavers stay as greyed `Moved to X by Y`. | "Apply live but freeze the focused row" still moves rows in peripheral vision. |
| "Quarter end: thousands to Lost" | Filter → `Select all 3,412 matching` → `7`. A **server job** with progress; each deal moves only if still in the stage it had when selected; result says moved / skipped / failed; **undo**, no confirm dialog. | A client loop is 3,412 requests that die with the tab; last-write-wins silently overwrites a teammate's Won. |
| "I can't use a mouse for long" | Every action has a key (`j k x s 1–7 r u . / t a B ⌘K ?`); focus is always visible; `⌘K` lists every command with its shortcut. | Follows Linear / Gmail / Close conventions reps may already know. |

## When things go wrong

Every call can be made to fail from the dev panel, so each row below can be shown live.

| Failure | What the user sees |
|---|---|
| Save fails (1 in 10 by default) | Two silent retries, then the deal stays put, marked `Not saved · Retry · Undo`, pinned in Unsaved and counted in the header |
| Teammate changed the same deal | `Rahul moved this to Lost · Keep mine / Take theirs` |
| Rows fail to load | One `Couldn't load these rows · Retry` for the failed block; `r` or scrolling back retries |
| Whole list fails to load | `Could not load deals · Retry` |
| Live connection drops | `Live updates paused — reconnecting…`; on return, values refresh in place and `Reconnected · Show latest` appears — nothing moves until asked |
| Bulk move can't start | "Nothing was changed", selection kept; if the list changed meanwhile, "please select again" |
| Some deals in a bulk fail or were changed by teammates | `moved · skipped · failed` with **Select failed** and **Retry failed** |
| Undo of a bulk fails | Entry kept — `u` tries again |
| Browser restarts the fake API's worker | Re-activated automatically (E2E-tested) |

## Architecture in one table

| Concern | Choice | Reason |
|---|---|---|
| Rendering | CSR — Vite + React + TypeScript (strict) | Logged-in, interactive, live tool; SSR's gains don't apply and a virtual list can't be server-rendered. |
| Server state | React Query: pages per `(snapshot, page)`, stage counts | Per-key caching is exactly the job with server paging. `staleTime: Infinity`; freshness comes from the push feed. |
| Client state | Redux Toolkit: unsaved overlay, selection, held updates, history | Must outlive virtualised rows and evicted cache pages — `useMutation` state dies when a row unmounts. |
| Fake API | MSW (real HTTP 500/409 + mocked WebSocket) | Swapping in a backend means deleting `src/mocks/`, not rewriting the client. |
| Paging | Offset over a server **snapshot** (frozen id order, live values) | Implements "frozen order, live values" at the API; the scrollbar can jump to row 8,000. |
| List | TanStack Virtual | ~40 DOM rows for 50,000. |

**Measured** (`e2e/perf.spec.ts`, headless Chromium, 3 runs): scrolling 50,000 rows — worst frame 17–18 ms (one 60 Hz frame), no main-thread task over 50 ms; a 12,000-deal bulk move — 3.9 s end to end, worst frame ≤ 17 ms, no long tasks. The spec fails if scroll frames exceed 100 ms or the bulk takes over 20 s.

## Designed for vs built

| Growth | Built and running | Designed for (seam exists, not built) |
|---|---|---|
| 50k → 500k deals | Server-side filter/sort/paging; the browser holds only visible pages | Fake query engine moves to a Web Worker; real DB uses keyset/PIT indexes |
| 20 → 500 reps | Versioned deals, out-of-order events ignored, batched ~100 ms, conflict rules enforced server-side | WebSocket reconnect with resync from last version; per-user "seen" persisted server-side |
| Team / codebase | Feature folders, one zod contract shared by client and fake server, 61 unit/integration tests + 12 Playwright E2E specs (incl. failure injection and a perf budget) | CODEOWNERS per folder, contract package |
| Real backend | App already speaks `/api/*` HTTP + WS | Auth, tenant scoping |

## Honest limits

| Limit | Impact |
|---|---|
| After a dropped connection, deals that entered or left the view while offline are not counted | Values on screen refresh at once; "Reconnected · Show latest" invites a fresh snapshot, which is exact. |
| Stage counts that fail to load keep their last value | They refresh on the next update; a deliberate quiet failure for a summary number. |
| Fake server runs on the page's main thread | Fine at 50k; the reason for the Web Worker note above. |
| Pill count is an upper bound for deals not in the browser cache | The next snapshot is exact. |
| Board is single-deal moves only, no failed-first ordering | Built last, deliberately minimal; bulk lives in the list (Salesforce does the same). |
| Stuck thresholds per stage are invented defaults | One constant (`STUCK_AFTER_DAYS`). |
| The fake API lives in a service worker | Browsers stop idle workers; the page re-activates MSW on focus and every 4 s. A real backend removes this. |
| No auth, offline queue, presence, saved views | Out of scope per the spec's non-goals. |

## Where a new requirement would land

| If the call asks for… | Change goes in |
|---|---|
| A new Today trigger (e.g. close date) | `matchesFilter` + `compareDeals` in `api/contract.ts` — server and client both read it. |
| Another bulk action (reassign owner) | `BulkRequest` + `stepJob` in `mocks/db.ts`; `bulk/actions.ts`. |
| Different failure UX | `store/overlay.ts` + `deals/SaveStatus.tsx`; the queue in `sync/saveQueue.ts` is unaffected. |
| Another shortcut | One entry in `keyboard/commands.ts`; it appears in `⌘K` and `?` automatically. |
