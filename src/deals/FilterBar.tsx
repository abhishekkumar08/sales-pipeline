import { useEffect, useState } from 'react';
import { REPS } from '@/api/contract';
import { useAppDispatch, useAppSelector } from '@/store';
import { filterChanged } from '@/store/ui';

export const SEARCH_ID = 'deal-search';

export function FilterBar() {
  const dispatch = useAppDispatch();
  const filter = useAppSelector((s) => s.ui.filter);
  const [q, setQ] = useState(filter.q);

  useEffect(() => {
    if (q === filter.q) return undefined;
    const t = setTimeout(() => dispatch(filterChanged({ q })), 250);
    return () => clearTimeout(t);
  }, [q, filter.q, dispatch]);

  return (
    <div className="filters" role="search">
      <input
        id={SEARCH_ID}
        type="search"
        placeholder="Search company  ( / )"
        aria-label="Search company"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
      />
      <label>
        Owner
        <select
          value={filter.preset === 'today' ? '' : (filter.owner ?? '')}
          disabled={filter.preset === 'today'}
          onChange={(e) => dispatch(filterChanged({ owner: e.target.value || null }))}
        >
          <option value="">{filter.preset === 'today' ? 'Me' : 'Anyone'}</option>
          {REPS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        In stage ≥
        <input
          type="number"
          min={0}
          className="days"
          placeholder="days"
          value={filter.minDays ?? ''}
          onChange={(e) =>
            dispatch(filterChanged({ minDays: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))
          }
        />
        days
      </label>
    </div>
  );
}
