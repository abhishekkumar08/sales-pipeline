import { useState, useSyncExternalStore } from 'react';
import { REPS } from '@/api/contract';
import { session } from '@/api/session';
import { dropLive } from '@/mocks/live';
import { getSettings, subscribeSettings, updateSettings } from '@/mocks/settings';
import { useAppDispatch } from '@/store';
import { viewingAsChanged } from '@/store/ui';

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const s = useSyncExternalStore(subscribeSettings, getSettings);
  const dispatch = useAppDispatch();

  return (
    <aside className="dev" aria-label="Developer panel">
      <button type="button" className="dev-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Dev panel {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="dev-body">
          <label>
            Viewing as
            <select
              value={s.viewingAs}
              onChange={(e) => {
                session.repId = e.target.value;
                updateSettings({ viewingAs: e.target.value });
                dispatch(viewingAsChanged(e.target.value));
              }}
            >
              {REPS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Save latency min (ms)
            <input
              type="number"
              min={0}
              step={100}
              value={s.latencyMin}
              onChange={(e) => updateSettings({ latencyMin: Number(e.target.value) })}
            />
          </label>
          <label>
            Save latency max (ms)
            <input
              type="number"
              min={0}
              step={100}
              value={s.latencyMax}
              onChange={(e) => updateSettings({ latencyMax: Number(e.target.value) })}
            />
          </label>
          <label>
            Write failure rate: {Math.round(s.writeFailureRate * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.writeFailureRate}
              onChange={(e) => updateSettings({ writeFailureRate: Number(e.target.value) })}
            />
          </label>
          <label>
            Read failure rate: {Math.round(s.readFailureRate * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.readFailureRate}
              onChange={(e) => updateSettings({ readFailureRate: Number(e.target.value) })}
            />
          </label>
          <label>
            Teammate edits / min
            <input
              type="number"
              min={0}
              step={10}
              value={s.teammateEditsPerMin}
              onChange={(e) => updateSettings({ teammateEditsPerMin: Number(e.target.value) })}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.teammatesPaused}
              onChange={(e) => updateSettings({ teammatesPaused: e.target.checked })}
            />
            Pause teammates
          </label>
          <button type="button" onClick={() => dropLive(5000)}>
            Drop live connection (5 s)
          </button>
        </div>
      )}
    </aside>
  );
}
