import { Suspense, lazy } from 'react';
import { BulkBar } from '@/bulk/BulkBar';
import { DealList } from '@/deals/DealList';
import { FilterBar } from '@/deals/FilterBar';
import { StageStrip } from '@/deals/StageStrip';
import { UnsavedSection } from '@/deals/UnsavedSection';
import { DevPanel } from '@/dev-panel/DevPanel';
import { StageMenu } from '@/keyboard/StageMenu';
import { useHotkeys } from '@/keyboard/useHotkeys';
import { useAppSelector } from '@/store';
import { Header } from './Header';
import { Toast } from './Toast';

const Board = lazy(() => import('@/board/Board'));
const CommandMenu = lazy(() => import('@/keyboard/CommandMenu'));
const Help = lazy(() => import('@/keyboard/Help'));

export function App() {
  useHotkeys();
  const view = useAppSelector((s) => s.ui.view);
  const panel = useAppSelector((s) => s.ui.overlayPanel);
  return (
    <div className="app">
      <Header />
      <StageStrip />
      <FilterBar />
      <BulkBar />
      <UnsavedSection />
      <main className="main">
        <Suspense fallback={<div className="empty">Loading…</div>}>
          {view === 'board' ? <Board /> : <DealList />}
        </Suspense>
      </main>
      <Suspense fallback={null}>
        {panel === 'command' && <CommandMenu />}
        {panel === 'help' && <Help />}
      </Suspense>
      {panel === 'stage' && <StageMenu />}
      <Toast />
      <DevPanel />
    </div>
  );
}
