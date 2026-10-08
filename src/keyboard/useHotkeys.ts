import { useEffect } from 'react';
import { store } from '@/store/instance';
import { panelOpened } from '@/store/ui';
import { selectionCleared } from '@/store/selection';
import { commandForKey } from './commands';

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'range', 'button']);

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLInputElement | null;
  if (!el) return false;
  if (el.tagName === 'INPUT') return !NON_TEXT_INPUTS.has(el.type);
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        store.dispatch(panelOpened('command'));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      const panel = store.getState().ui.overlayPanel;
      if (e.key === 'Escape') {
        if (panel) store.dispatch(panelOpened(null));
        else store.dispatch(selectionCleared());
        return;
      }
      if (panel === 'command') return;
      const cmd = commandForKey(e.shiftKey && e.key.toLowerCase() === 'a' ? 'A' : e.key);
      if (!cmd) return;
      if (panel === 'help') {
        if (cmd.id === 'help') store.dispatch(panelOpened(null));
        return;
      }
      if (panel === 'stage') {
        if (cmd.id.startsWith('move-')) {
          e.preventDefault();
          store.dispatch(panelOpened(null));
          cmd.run();
        }
        return;
      }
      e.preventDefault();
      cmd.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
