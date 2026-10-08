import type { Deal } from '@/api/contract';
import { getViewApi } from '@/deals/viewRegistry';
import type { AppDispatch, RootState } from '@/store';
import { dealMoved, failedOverlays, overlayDiscarded, type Overlay } from '@/store/overlay';
import { viewRefreshed } from '@/store/ui';

export const retrySave = (dispatch: AppDispatch, o: Overlay): void => {
  dispatch(
    dealMoved(o.deal, o.toStage, { ifStage: o.conflict ? undefined : o.ifStage, revert: o.revert, record: false }),
  );
};

export const discardSave = (dispatch: AppDispatch, o: Overlay): void => {
  dispatch(overlayDiscarded({ id: o.deal.id, seq: o.seq }));
};

export const effectiveStage = (state: RootState, deal: Deal) => state.overlay[deal.id]?.toStage ?? deal.stage;

export const applyUpdates = (dispatch: AppDispatch): void => {
  dispatch(viewRefreshed({ anchorId: getViewApi()?.getFocused()?.id }));
};

export const retryAllFailed = (dispatch: AppDispatch, state: RootState): number => {
  const failed = failedOverlays(state.overlay);
  failed.forEach((o) => retrySave(dispatch, o));
  return failed.length;
};
