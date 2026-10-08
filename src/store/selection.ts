import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Deal, Stage } from '@/api/contract';
import { filterChanged, viewRefreshed, viewToggled, viewingAsChanged } from './ui';

export interface SelectionState {
  mode: 'ids' | 'all';
  ids: Record<number, Stage>;
  all: { snapshotId: string; total: number } | null;
  excluded: Record<number, true>;
  lastPage: boolean;
}

const empty: SelectionState = { mode: 'ids', ids: {}, all: null, excluded: {}, lastPage: false };

const slice = createSlice({
  name: 'selection',
  initialState: empty,
  reducers: {
    toggled(state, { payload: d }: PayloadAction<Pick<Deal, 'id' | 'stage'>>) {
      state.lastPage = false;
      if (state.mode === 'all') {
        if (state.excluded[d.id]) delete state.excluded[d.id];
        else state.excluded[d.id] = true;
        return;
      }
      if (state.ids[d.id]) delete state.ids[d.id];
      else state.ids[d.id] = d.stage;
    },
    pageSelected(state, { payload }: PayloadAction<Pick<Deal, 'id' | 'stage'>[]>) {
      if (state.mode === 'all') return;
      for (const d of payload) state.ids[d.id] = d.stage;
      state.lastPage = true;
    },
    allMatchingSelected(state, { payload }: PayloadAction<{ snapshotId: string; total: number }>) {
      state.mode = 'all';
      state.all = payload;
      state.excluded = {};
      state.ids = {};
      state.lastPage = false;
    },
    failedSelected(_state, { payload }: PayloadAction<{ id: number; stage: Stage }[]>) {
      return { ...empty, ids: Object.fromEntries(payload.map((i) => [i.id, i.stage])) };
    },
    selectionCleared: () => empty,
  },
  extraReducers: (b) => {
    b.addMatcher(
      (a) =>
        filterChanged.match(a) ||
        viewToggled.match(a) ||
        viewingAsChanged.match(a) ||
        (viewRefreshed.match(a) && !a.payload.keepSelection),
      () => empty,
    );
  },
});

export const { toggled, pageSelected, allMatchingSelected, failedSelected, selectionCleared } = slice.actions;
export const selectionReducer = slice.reducer;

export const selectedCount = (s: SelectionState): number =>
  s.mode === 'all' ? (s.all?.total ?? 0) - Object.keys(s.excluded).length : Object.keys(s.ids).length;

export const isSelected = (s: SelectionState, id: number): boolean =>
  s.mode === 'all' ? !s.excluded[id] : !!s.ids[id];
