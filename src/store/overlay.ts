import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Deal, Stage } from '@/api/contract';
import { viewingAsChanged } from './ui';

export interface Overlay {
  deal: Deal;
  fromStage: Stage;
  toStage: Stage;
  ifStage?: Stage;
  revert?: boolean;
  seq: number;
  status: 'saving' | 'failed';
  conflict: { by: string; stage: Stage } | null;
}

export interface MovePayload {
  deal: Deal;
  toStage: Stage;
  ifStage?: Stage;
  revert?: boolean;
  seq: number;
  record: boolean;
}

let seqCounter = 0;

const overlaySlice = createSlice({
  name: 'overlay',
  initialState: {} as Record<number, Overlay>,
  reducers: {
    dealMoved: {
      reducer(state, { payload }: PayloadAction<MovePayload>) {
        const prev = state[payload.deal.id];
        state[payload.deal.id] = {
          deal: payload.deal,
          fromStage: prev?.fromStage ?? payload.deal.stage,
          toStage: payload.toStage,
          ifStage: payload.ifStage,
          revert: payload.revert,
          seq: payload.seq,
          status: 'saving',
          conflict: prev?.conflict ?? null,
        };
      },
      prepare: (deal: Deal, toStage: Stage, opts: { ifStage?: Stage; revert?: boolean; record?: boolean } = {}) => ({
        payload: { deal, toStage, ...opts, seq: ++seqCounter, record: opts.record ?? true },
      }),
    },
    saveSucceeded(state, { payload }: PayloadAction<{ id: number; seq: number }>) {
      if (state[payload.id]?.seq === payload.seq) delete state[payload.id];
    },
    saveFailed(
      state,
      { payload }: PayloadAction<{ id: number; seq: number; conflict?: { by: string; stage: Stage } }>,
    ) {
      const o = state[payload.id];
      if (o?.seq !== payload.seq) return;
      o.status = 'failed';
      if (payload.conflict) o.conflict = payload.conflict;
    },
    overlayConflict(state, { payload }: PayloadAction<{ id: number; by: string; stage: Stage }>) {
      const o = state[payload.id];
      if (o) o.conflict = { by: payload.by, stage: payload.stage };
    },
    overlayDiscarded(state, { payload }: PayloadAction<{ id: number; seq: number }>) {
      if (state[payload.id]?.seq === payload.seq) delete state[payload.id];
    },
  },
  extraReducers: (b) => {
    b.addCase(viewingAsChanged, () => ({}));
  },
});

export const { dealMoved, saveSucceeded, saveFailed, overlayConflict, overlayDiscarded } = overlaySlice.actions;
export const overlayReducer = overlaySlice.reducer;

export const failedOverlays = (overlay: Record<number, Overlay>): Overlay[] =>
  Object.values(overlay).filter((o) => o.status === 'failed');
