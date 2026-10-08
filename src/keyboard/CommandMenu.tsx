import { useMemo, useState } from 'react';
import { useAppDispatch } from '@/store';
import { panelOpened } from '@/store/ui';
import { commands } from './commands';

export default function CommandMenu() {
  const dispatch = useAppDispatch();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const items = useMemo(
    () => commands.filter((c) => c.id !== 'command' && c.label.toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  const close = (): void => void dispatch(panelOpened(null));
  const run = (i: number): void => {
    const c = items[i];
    if (!c) return;
    close();
    setTimeout(c.run, 0);
  };
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" role="dialog" aria-label="Command menu" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Type a command…"
          aria-label="Command"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') run(active);
            else if (e.key === 'Escape') close();
          }}
        />
        <ul role="listbox" className="cmd-list">
          {items.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : ''}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(i)}
            >
              <span>{c.label}</span>
              <kbd>{c.keys}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
