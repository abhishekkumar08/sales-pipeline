import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import { bulkReducer } from './bulk';
import { historyReducer } from './history';
import { overlayReducer } from './overlay';
import { selectionReducer } from './selection';
import { uiReducer } from './ui';
import { saveQueue } from '@/sync/saveQueue';

export function makeStore() {
  return configureStore({
    reducer: {
      ui: uiReducer,
      overlay: overlayReducer,
      selection: selectionReducer,
      bulk: bulkReducer,
      history: historyReducer,
    },
    middleware: (gdm) => gdm().prepend(saveQueue.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
export type StoreLike = Pick<AppStore, 'dispatch' | 'getState'>;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
