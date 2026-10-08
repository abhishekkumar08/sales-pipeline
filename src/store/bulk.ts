import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { BulkJob } from '@/api/contract';
import { viewingAsChanged } from './ui';

export const jobProcessed = (j: BulkJob): number => j.moved + j.skipped + j.failed + j.unchanged;
const processed = (j: BulkJob): number => (j.status === 'done' ? Infinity : jobProcessed(j));
const newer = (a: BulkJob | undefined, b: BulkJob): BulkJob => (a && processed(a) >= processed(b) ? a : b);

const slice = createSlice({
  name: 'bulk',
  initialState: { job: null as BulkJob | null, early: {} as Record<string, BulkJob> },
  reducers: {
    bulkStarted(state, { payload }: PayloadAction<BulkJob>) {
      state.job = newer(state.early[payload.id], payload);
      state.early = {};
    },
    bulkProgress(state, { payload }: PayloadAction<BulkJob>) {
      if (state.job?.id === payload.id) state.job = newer(state.job, payload);
      else state.early[payload.id] = newer(state.early[payload.id], payload);
    },
    bulkDismissed(state) {
      state.job = null;
    },
  },
  extraReducers: (b) => {
    b.addCase(viewingAsChanged, () => ({ job: null, early: {} }));
  },
});

export const { bulkStarted, bulkProgress, bulkDismissed } = slice.actions;
export const bulkReducer = slice.reducer;
