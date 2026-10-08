import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { toasted } from '@/store/ui';

export function Toast() {
  const toast = useAppSelector((s) => s.ui.toast);
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => dispatch(toasted(null)), 4000);
    return () => clearTimeout(t);
  }, [toast, dispatch]);
  return (
    <div className="toast" role="status" aria-live="polite">
      {toast}
    </div>
  );
}
