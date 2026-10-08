import { makeStore } from './index';

export const store = makeStore();

if (import.meta.hot) import.meta.hot.accept(() => import.meta.hot!.invalidate());
