import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Deal, Stage } from '@/api/contract';
import { overlayDiscarded } from './overlay';
import { viewingAsChanged } from './ui';

export type HistoryEntry =
  { kind: 'move'; id: number; from: Stage; to: Stage; deal: Deal; seq: number } | { kind: 'bulk'; jobId: string };

const slice = createSlice({
  name: 'history',
  initialState: [] as HistoryEntry[],
  reducers: {
    pushed(state, { payload }: PayloadAction<HistoryEntry>) {
      state.push(payload);
      if (state.length > 50) state.shift();
    },
    popped(state) {
      state.pop();
    },
    historyRemoved(state, { payload }: PayloadAction<{ jobId: string }>) {
      return state.filter((e) => !(e.kind === 'bulk' && e.jobId === payload.jobId));
    },
  },
  extraReducers: (b) => {
    b.addCase(viewingAsChanged, () => []);
    b.addCase(overlayDiscarded, (state, { payload }) =>
      state.filter((e) => !(e.kind === 'move' && e.id === payload.id && e.seq === payload.seq)),
    );
  },
});

export const { pushed, popped, historyRemoved } = slice.actions;
export const historyReducer = slice.reducer;
