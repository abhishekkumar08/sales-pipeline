import { createListenerMiddleware } from '@reduxjs/toolkit';
import { z } from 'zod';
import { DealSchema } from '@/api/contract';
import { ApiError, api } from '@/api/client';
import { dealMoved, saveFailed, saveSucceeded } from '@/store/overlay';
import type { RootState } from '@/store';
import { pushed } from '@/store/history';
import { effectiveStage } from './actions';
import { patchDealInCache } from './cache';

export const saveConfig = { backoffMs: [400, 1200] };

export const saveQueue = createListenerMiddleware();

const chains = new Map<number, Promise<void>>();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const ConflictBody = z.object({ deal: DealSchema });

saveQueue.startListening({
  actionCreator: dealMoved,
  effect: (action, { dispatch, getState, getOriginalState }) => {
    const p = action.payload;
    const id = p.deal.id;
    const current = (): boolean => (getState() as RootState).overlay[id]?.seq === p.seq;
    const from = effectiveStage(getOriginalState() as RootState, p.deal);
    if (p.record && from !== p.toStage)
      dispatch(pushed({ kind: 'move', id, from, to: p.toStage, deal: p.deal, seq: p.seq }));

    const run = async (): Promise<void> => {
      for (let attempt = 0; current(); attempt++) {
        try {
          const saved = await api.moveDeal(id, { stage: p.toStage, ifStage: p.ifStage, revert: p.revert });
          patchDealInCache(saved);
          if (!current()) return;
          dispatch(saveSucceeded({ id, seq: p.seq }));
          return;
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            const body = ConflictBody.safeParse(err.body);
            const theirs = body.success ? body.data.deal : null;
            dispatch(
              saveFailed({
                id,
                seq: p.seq,
                conflict: theirs ? { by: theirs.lastEdit?.by ?? 'a teammate', stage: theirs.stage } : undefined,
              }),
            );
            return;
          }
          const wait = saveConfig.backoffMs[attempt];
          if (wait === undefined) {
            dispatch(saveFailed({ id, seq: p.seq }));
            return;
          }
          await sleep(wait);
        }
      }
    };

    const chained = (chains.get(id) ?? Promise.resolve()).then(run);
    chains.set(id, chained);
    return chained.finally(() => {
      if (chains.get(id) === chained) chains.delete(id);
    });
  },
});
