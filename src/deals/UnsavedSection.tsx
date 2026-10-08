import { STAGE_LABEL } from '@/api/contract';
import { useAppSelector } from '@/store';
import { failedOverlays } from '@/store/overlay';
import { SaveStatus } from './SaveStatus';

export function UnsavedSection() {
  const preset = useAppSelector((s) => s.ui.filter.preset);
  const overlays = useAppSelector((s) => s.overlay);
  const failed = failedOverlays(overlays);
  if (preset !== 'today') return null;
  return (
    <section className={failed.length ? 'unsaved unsaved-on' : 'unsaved'} aria-label="Unsaved changes">
      <h2>Unsaved ({failed.length})</h2>
      {failed.length === 0 && <span className="muted">Every change you made is saved.</span>}
      {failed.map((o) => (
        <div key={o.deal.id} className="unsaved-row">
          <span className="cell-company">{o.deal.company}</span>
          <span>
            {STAGE_LABEL[o.fromStage]} → {STAGE_LABEL[o.toStage]}
          </span>
          <SaveStatus overlay={o} />
        </div>
      ))}
    </section>
  );
}
