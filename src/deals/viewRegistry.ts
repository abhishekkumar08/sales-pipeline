import type { Deal } from '@/api/contract';

export interface ViewApi {
  getFocused(): Deal | undefined;
  getVisible(): Deal[];
  count(): number;
  retryFailed?(): boolean;
  focusSearch?(): void;
}

let current: ViewApi | null = null;

export const setViewApi = (api: ViewApi | null): void => {
  current = api;
};
export const getViewApi = (): ViewApi | null => current;
