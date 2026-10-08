import { STAGES, isOpen, stageIndex, type Stage } from '@/api/contract';
import { editValue, getDb, patchDeal, view } from './db';
import { broadcast } from './live';
import { getSettings } from './settings';

const pickRep = (exclude: string): string => {
  for (;;) {
    const id = `r${Math.floor(Math.random() * 20) + 1}`;
    if (id !== exclude) return id;
  }
};

function nextStage(from: Stage): Stage {
  const r = Math.random();
  if (r < 0.12) return 'lost';
  if (r < 0.2) return 'won';
  if (r < 0.9) return STAGES[Math.min(stageIndex(from) + 1, 4)]!;
  return STAGES[Math.max(stageIndex(from) - 1, 0)]!;
}

export function teammateEdit(): void {
  const db = getDb();
  const { viewingAs } = getSettings();
  const actor = pickRep(viewingAs);
  const mine = db.byOwner.get(viewingAs) ?? [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const id =
      Math.random() < 0.4 && mine.length
        ? mine[Math.floor(Math.random() * mine.length)]!
        : Math.floor(Math.random() * db.deals.length) + 1;
    const d = db.deals[id - 1]!;
    if (!isOpen(d.stage)) continue;
    const change =
      Math.random() < 0.75
        ? patchDeal(db, id, { stage: nextStage(d.stage) }, actor)
        : (() => {
            const c = editValue(
              db,
              id,
              Math.max(1000, Math.round((d.value * (0.7 + Math.random() * 0.6)) / 100) * 100),
              actor,
            );
            return c ? { ok: true as const, change: c, deal: view(db, d, actor) } : undefined;
          })();
    if (change?.ok && change.change) {
      const { before, after } = change.change;
      broadcast({ type: 'deal_changed', before: { ...before, seenVersion: 0 }, after: { ...after, seenVersion: 0 } });
      return;
    }
  }
}

export function startTeammates(): () => void {
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  const loop = (): void => {
    const s = getSettings();
    if (!s.teammatesPaused && s.teammateEditsPerMin > 0) teammateEdit();
    const mean = 60_000 / Math.max(1, s.teammateEditsPerMin);
    if (!stopped) timer = setTimeout(loop, mean * (0.5 + Math.random()));
  };
  timer = setTimeout(loop, 2000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
