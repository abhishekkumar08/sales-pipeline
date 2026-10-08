import { LiveEventSchema, type BulkJob, type LiveEvent } from '@/api/contract';
import { queryClient } from '@/api/queryClient';
import { finishIfDone } from '@/bulk/actions';
import type { AppStore } from '@/store';
import { bulkProgress } from '@/store/bulk';
import { overlayConflict } from '@/store/overlay';
import { liveStatusChanged, membershipChanged } from '@/store/ui';
import { findCached, patchDealInCache } from './cache';
import { VersionGate, classifyChange, stageConflict } from './liveLogic';

const FLUSH_MS = 100;
const COUNTS_THROTTLE_MS = 1000;

export function startLiveFeed(store: AppStore): () => void {
  const gate = new VersionGate();
  let buffer: LiveEvent[] = [];
  let socket: WebSocket | null = null;
  let closed = false;
  let lastCounts = 0;
  let reconnect: ReturnType<typeof setTimeout>;

  const flush = (): void => {
    if (!buffer.length) return;
    const batch = buffer;
    buffer = [];
    const jobs = new Map<string, BulkJob>();
    let touched = false;

    for (const ev of batch) {
      if (ev.type === 'bulk_progress') {
        jobs.set(ev.job.id, ev.job);
        continue;
      }
      const cached = findCached(ev.after.id);
      if (!gate.accept(ev.after.id, ev.after.version, cached?.version)) continue;
      touched = true;
      const state = store.getState();
      const { mine, membership: filterMembership } = classifyChange(ev.before, ev.after, cached?.seenVersion, {
        filter: state.ui.filter,
        rep: state.ui.viewingAs,
        now: Date.now(),
      });
      const leftColumn = state.ui.view === 'board' && ev.before.stage !== ev.after.stage;
      const membership = leftColumn ? 'leave' : filterMembership;
      patchDealInCache(ev.after);
      if (mine) continue;
      if (membership) {
        store.dispatch(
          membershipChanged({
            id: ev.after.id,
            ghost:
              membership === 'leave' ? { by: ev.after.lastEdit?.by ?? 'a teammate', stage: ev.after.stage } : undefined,
          }),
        );
      }
      if (stageConflict(ev.before, ev.after, state.overlay[ev.after.id])) {
        store.dispatch(
          overlayConflict({ id: ev.after.id, by: ev.after.lastEdit?.by ?? 'a teammate', stage: ev.after.stage }),
        );
      }
    }

    for (const job of jobs.values()) {
      store.dispatch(bulkProgress(job));
      finishIfDone(store, job.id);
    }

    if (touched && Date.now() - lastCounts > COUNTS_THROTTLE_MS) {
      lastCounts = Date.now();
      void queryClient.invalidateQueries({ queryKey: ['counts'] });
    }
  };

  const connect = (): void => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live`;
    socket = new WebSocket(url);
    socket.onopen = () => {
      if (store.getState().ui.liveStatus === 'live') return;
      store.dispatch(liveStatusChanged('live'));
      void queryClient.invalidateQueries({ queryKey: ['page'] });
      void queryClient.invalidateQueries({ queryKey: ['counts'] });
    };
    socket.onmessage = (m) => {
      const parsed = LiveEventSchema.safeParse(JSON.parse(String(m.data)));
      if (parsed.success) buffer.push(parsed.data);
    };
    socket.onclose = () => {
      if (closed) return;
      if (store.getState().ui.liveStatus === 'live') store.dispatch(liveStatusChanged('reconnecting'));
      reconnect = setTimeout(connect, 1000);
    };
  };

  connect();
  const timer = setInterval(flush, FLUSH_MS);
  return () => {
    closed = true;
    clearInterval(timer);
    clearTimeout(reconnect);
    socket?.close();
  };
}
