import { STAGES, STAGE_LABEL, type Stage } from '@/api/contract';
import { startBulkMove } from '@/bulk/actions';
import { SEARCH_ID } from '@/deals/FilterBar';
import { getViewApi } from '@/deals/viewRegistry';
import { store } from '@/store/instance';
import { dealMoved } from '@/store/overlay';
import { allMatchingSelected, pageSelected, selectedCount, selectionCleared, toggled } from '@/store/selection';
import { boardColumnMoved, filterChanged, focusMoved, panelOpened, toasted, viewToggled } from '@/store/ui';
import { applyUpdates, retryAllFailed, retrySave } from '@/sync/actions';
import { undoLast } from '@/sync/undo';
import { queryClient } from '@/api/queryClient';
import type { Snapshot } from '@/deals/queries';
import { filterKey } from '@/api/contract';

export interface Command {
  id: string;
  label: string;
  keys: string;
  run: () => void;
}

const { dispatch, getState } = store;

function moveTo(stage: Stage): void {
  const state = getState();
  if (selectedCount(state.selection) > 0) {
    void dispatch(startBulkMove(stage));
    return;
  }
  const deal = getViewApi()?.getFocused();
  if (!deal || (state.overlay[deal.id]?.toStage ?? deal.stage) === stage) return;
  dispatch(dealMoved(deal, stage));
}

function nav(delta: number): void {
  const api = getViewApi();
  const { focusIndex } = getState().ui;
  if (api) dispatch(focusMoved(Math.min(Math.max(0, focusIndex + delta), Math.max(0, api.count() - 1))));
}

const undo = (): void => undoLast(store, getViewApi()?.getFocused()?.id);

function retry(): void {
  const focused = getViewApi()?.getFocused();
  const o = focused ? getState().overlay[focused.id] : undefined;
  if (o?.status === 'failed') return retrySave(dispatch, o);
  if (getViewApi()?.retryFailed?.()) return void dispatch(toasted('Retrying the rows that did not load'));
  const n = retryAllFailed(dispatch, getState());
  dispatch(toasted(n ? `Retrying ${n} unsaved change${n === 1 ? '' : 's'}` : 'Nothing to retry'));
}

const blockedOnBoard = (): boolean => {
  if (getState().ui.view !== 'board') return false;
  dispatch(toasted('Selecting several deals works in the list view — press B'));
  return true;
};

function selectPage(): void {
  const visible = getViewApi()?.getVisible() ?? [];
  dispatch(pageSelected(visible));
  const { ui } = getState();
  const snap = queryClient.getQueryData<Snapshot>(['snapshot', ui.viewingAs, filterKey(ui.filter), ui.epoch]);
  if (snap && snap.total > visible.length)
    dispatch(toasted(`Page selected. Press Shift+A again for all ${snap.total.toLocaleString()} matching`));
}

function selectAllMatching(): void {
  const { ui } = getState();
  const snap = queryClient.getQueryData<Snapshot>(['snapshot', ui.viewingAs, filterKey(ui.filter), ui.epoch]);
  if (snap) dispatch(allMatchingSelected(snap));
}

export const commands: Command[] = [
  { id: 'next', label: 'Next deal', keys: 'j', run: () => nav(1) },
  { id: 'prev', label: 'Previous deal', keys: 'k', run: () => nav(-1) },
  {
    id: 'toggle-select',
    label: 'Select / deselect focused deal',
    keys: 'x',
    run: () => {
      if (blockedOnBoard()) return;
      const d = getViewApi()?.getFocused();
      if (d) dispatch(toggled({ id: d.id, stage: d.stage }));
    },
  },
  {
    id: 'select-page',
    label: 'Select visible page (again: all matching)',
    keys: 'Shift+A',
    run: () => {
      if (blockedOnBoard()) return;
      const { selection } = getState();
      if (selection.mode === 'ids' && selection.lastPage) selectAllMatching();
      else selectPage();
    },
  },
  { id: 'clear', label: 'Clear selection / close', keys: 'Esc', run: () => dispatch(selectionCleared()) },
  { id: 'stage-menu', label: 'Change stage…', keys: 's', run: () => dispatch(panelOpened('stage')) },
  ...STAGES.map<Command>((s, i) => ({
    id: `move-${s}`,
    label: `Move to ${STAGE_LABEL[s]}`,
    keys: String(i + 1),
    run: () => moveTo(s),
  })),
  { id: 'retry', label: 'Retry failed save', keys: 'r', run: retry },
  { id: 'undo', label: 'Undo last action', keys: 'u', run: undo },
  {
    id: 'apply',
    label: 'Apply pending teammate updates',
    keys: '.',
    run: () => applyUpdates(dispatch),
  },
  {
    id: 'search',
    label: 'Focus search',
    keys: '/',
    run: () => document.getElementById(SEARCH_ID)?.focus(),
  },
  { id: 'today', label: 'Show Today', keys: 't', run: () => dispatch(filterChanged({ preset: 'today' })) },
  { id: 'all', label: 'Show all deals', keys: 'a', run: () => dispatch(filterChanged({ preset: 'all' })) },
  { id: 'board', label: 'Toggle list / board', keys: 'B', run: () => dispatch(viewToggled()) },
  { id: 'col-prev', label: 'Board: previous column', keys: 'h', run: () => boardStep(-1) },
  { id: 'col-next', label: 'Board: next column', keys: 'l', run: () => boardStep(1) },
  { id: 'command', label: 'Command menu', keys: '⌘K', run: () => dispatch(panelOpened('command')) },
  { id: 'help', label: 'Keyboard shortcuts', keys: '?', run: () => dispatch(panelOpened('help')) },
];

function boardStep(delta: number): void {
  const { ui } = getState();
  if (ui.view !== 'board') return;
  dispatch(boardColumnMoved(Math.min(STAGES.length - 1, Math.max(0, ui.boardColumn + delta))));
  dispatch(focusMoved(0));
}

const KEY_TO_COMMAND: Record<string, string> = {
  j: 'next',
  ArrowDown: 'next',
  k: 'prev',
  ArrowUp: 'prev',
  x: 'toggle-select',
  A: 'select-page',
  Escape: 'clear',
  s: 'stage-menu',
  r: 'retry',
  u: 'undo',
  '.': 'apply',
  '/': 'search',
  t: 'today',
  a: 'all',
  b: 'board',
  B: 'board',
  h: 'col-prev',
  l: 'col-next',
  '?': 'help',
  ...Object.fromEntries(STAGES.map((s, i) => [String(i + 1), `move-${s}`])),
};

export const commandForKey = (key: string): Command | undefined => {
  const id = KEY_TO_COMMAND[key];
  return id ? commands.find((c) => c.id === id) : undefined;
};
