import { useAppDispatch, useAppSelector } from '@/store';
import { failedOverlays } from '@/store/overlay';
import { filterChanged, panelOpened, viewToggled } from '@/store/ui';
import { applyUpdates } from '@/sync/actions';

export function Header() {
  const dispatch = useAppDispatch();
  const preset = useAppSelector((s) => s.ui.filter.preset);
  const view = useAppSelector((s) => s.ui.view);
  const pending = useAppSelector((s) => Object.keys(s.ui.pending).length);
  const liveStatus = useAppSelector((s) => s.ui.liveStatus);
  const missed = useAppSelector((s) => s.ui.mayHaveMissedUpdates);
  const pillLabel = pending > 0 ? `${pending} update${pending === 1 ? '' : 's'} · Show` : 'Reconnected · Show latest';
  const unsaved = useAppSelector((s) => failedOverlays(s.overlay).length);

  return (
    <header className="header">
      <h1>Sales Pipeline</h1>
      <div className="tabs" role="tablist" aria-label="Preset">
        <button
          role="tab"
          aria-selected={preset === 'today'}
          onClick={() => dispatch(filterChanged({ preset: 'today' }))}
        >
          Today <kbd>t</kbd>
        </button>
        <button role="tab" aria-selected={preset === 'all'} onClick={() => dispatch(filterChanged({ preset: 'all' }))}>
          All deals <kbd>a</kbd>
        </button>
      </div>
      <button type="button" aria-pressed={view === 'board'} onClick={() => dispatch(viewToggled())}>
        {view === 'board' ? 'Board' : 'List'} <kbd>B</kbd>
      </button>
      <span className="spacer" />
      {liveStatus === 'reconnecting' && (
        <span className="live-off" role="status">
          Live updates paused — reconnecting…
        </span>
      )}
      {(pending > 0 || missed) && (
        <button type="button" className="pill" onClick={() => applyUpdates(dispatch)}>
          {pillLabel} <kbd>.</kbd>
        </button>
      )}
      {unsaved > 0 && (
        <button type="button" className="unsaved-count" onClick={() => dispatch(filterChanged({ preset: 'today' }))}>
          {unsaved} unsaved
        </button>
      )}
      <button type="button" onClick={() => dispatch(panelOpened('command'))}>
        Commands <kbd>⌘K</kbd>
      </button>
      <button type="button" onClick={() => dispatch(panelOpened('help'))} aria-label="Keyboard shortcuts">
        <kbd>?</kbd>
      </button>
    </header>
  );
}
