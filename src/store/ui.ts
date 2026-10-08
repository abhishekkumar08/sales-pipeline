import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_FILTER, type Filter, type Stage } from '@/api/contract';

export interface Ghost {
  by: string;
  stage: Stage;
}

export interface UiState {
  filter: Filter;
  view: 'list' | 'board';
  viewingAs: string;
  epoch: number;
  pending: Record<number, true>;
  ghosts: Record<number, Ghost>;
  focusIndex: number;
  anchorId: number | null;
  liveStatus: 'live' | 'reconnecting';
  mayHaveMissedUpdates: boolean;
  boardColumn: number;
  overlayPanel: null | 'help' | 'command' | 'stage';
  toast: string | null;
}

const initialState: UiState = {
  filter: { ...DEFAULT_FILTER, preset: 'today' },
  view: 'list',
  viewingAs: 'r1',
  epoch: 0,
  pending: {},
  ghosts: {},
  focusIndex: 0,
  anchorId: null,
  liveStatus: 'live',
  mayHaveMissedUpdates: false,
  boardColumn: 0,
  overlayPanel: null,
  toast: null,
};

export interface RefreshOpts {
  anchorId?: number;
  keepSelection?: boolean;
}

const refreshed = (s: UiState, anchorId: number | null = null): void => {
  s.epoch += 1;
  s.anchorId = anchorId;
  s.mayHaveMissedUpdates = false;
  s.pending = {};
  s.ghosts = {};
};

const slice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    filterChanged(s, { payload }: PayloadAction<Partial<Filter>>) {
      s.filter = { ...s.filter, ...payload };
      s.focusIndex = 0;
      refreshed(s);
    },
    viewToggled(s) {
      s.view = s.view === 'list' ? 'board' : 'list';
      s.focusIndex = 0;
    },
    viewingAsChanged(s, { payload }: PayloadAction<string>) {
      s.viewingAs = payload;
      s.focusIndex = 0;
      refreshed(s);
    },
    viewRefreshed: {
      reducer(s, { payload }: PayloadAction<RefreshOpts>) {
        refreshed(s, payload.anchorId ?? null);
      },
      prepare: (opts: RefreshOpts = {}) => ({ payload: opts }),
    },
    membershipChanged(s, { payload }: PayloadAction<{ id: number; ghost?: Ghost }>) {
      if (s.pending[payload.id]) {
        delete s.pending[payload.id];
        delete s.ghosts[payload.id];
      } else {
        s.pending[payload.id] = true;
        if (payload.ghost) s.ghosts[payload.id] = payload.ghost;
      }
    },
    liveStatusChanged(s, { payload }: PayloadAction<UiState['liveStatus']>) {
      if (payload === 'live' && s.liveStatus === 'reconnecting') s.mayHaveMissedUpdates = true;
      s.liveStatus = payload;
    },
    focusMoved(s, { payload }: PayloadAction<number>) {
      s.focusIndex = Math.max(0, payload);
    },
    boardColumnMoved(s, { payload }: PayloadAction<number>) {
      s.boardColumn = payload;
    },
    panelOpened(s, { payload }: PayloadAction<UiState['overlayPanel']>) {
      s.overlayPanel = payload;
    },
    toasted(s, { payload }: PayloadAction<string | null>) {
      s.toast = payload;
    },
  },
});

export const {
  filterChanged,
  viewToggled,
  viewingAsChanged,
  viewRefreshed,
  membershipChanged,
  liveStatusChanged,
  focusMoved,
  boardColumnMoved,
  panelOpened,
  toasted,
} = slice.actions;
export const uiReducer = slice.reducer;
