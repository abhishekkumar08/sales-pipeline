# Sales Pipeline

A pipeline screen for 20 reps sharing ~50,000 deals: a prioritised **Today** list, visible save state, live teammate edits that never move things under you, bulk moves by filter, and a fully keyboard-driven UI. There is no backend — a fake API (MSW) simulates latency, failures and teammates.

```bash
npm start          # one command: installs, starts and opens http://localhost:5173
```

```bash
npm test           # 61 unit/integration tests: query engine, bulk jobs, save queue + undo over MSW, reducers, live-event logic
npm run e2e        # 12 Playwright specs in Chromium against the real app + MSW (fetches Chromium on first run)
npm run build      # typecheck + production build
```

Needs Node 20.19+ or 22.12+. Everything is in the browser; the fake database (50,000 seeded deals) lives in memory and resets on reload.

## Try it (3-minute tour)

| Do this | See this |
|---|---|
| Open the app | **Today**: your open deals that are stuck, or changed by a teammate. Each row says why. |
| `j` / `k`, then `3` | Focused deal moves to Demo Done, shows `Saving…`, row stays put. |
| Dev panel → write failure rate 100 %, move a deal | Retries twice silently, then `Not saved · Retry · Undo`, listed under **Unsaved**, counted in the header. Set rate back, press `r`. |
| Dev panel → teammate edits 600/min | A quiet `N updates · Show` pill grows. The list never reorders. Press `.` to apply. |
| Dev panel → read failure rate 100 %, scroll far down | One "Couldn't load these rows · Retry" for the block that failed. Set it back, press `r`. |
| Dev panel → **Drop live connection** | "Live updates paused — reconnecting…", then "Reconnected · Show latest". |
| `a`, click **Proposal Sent**, set "In stage ≥" 90 | The quarter-end set. |
| `Shift+A` → **Select all N matching** → `7` | Server job with progress: `Moving 1,584 → Lost`. Keep working. Result has skipped (teammate changed) / failed counts. |
| `u` | Undo the whole bulk move; deals a teammate touched since are skipped and reported. |
| `B`, `Cmd+K`, `?` | Board (lazy chunk), command menu showing shortcuts, shortcut help. |

DevTools → Network shows the real `PATCH` 500s and 409s.

## Where things are

```
src/
  api/        typed client + the one zod contract shared by client and fake server
  mocks/      fake backend: db.ts (seeded 50k deals, query engine, snapshots, bulk jobs), MSW handlers, teammate simulator
  store/      Redux Toolkit: unsaved overlay, selection, held updates, history, UI
  sync/       save queue (listener middleware), live feed (WebSocket), cache patching
  deals/      list, rows, stage strip, filters, Today's Unsaved section
  bulk/       bulk bar + job actions        board/  lazy board view
  keyboard/   command registry, hotkeys, command menu, help
  dev-panel/  latency, failure rate, teammate rate, "viewing as"
docs/specs/   design spec (decisions with options considered) — the source of truth
docs/WRITEUP.md   the 1–2 page write-up
```

To use a real backend: delete `src/mocks/` and the `startMocks()` call in `main.tsx`; the app already speaks HTTP + WebSocket against `/api/*`.
# sales-pipeline
