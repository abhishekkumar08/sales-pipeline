export function LoadFailedNote({ what, onRetry }: { what: 'rows' | 'cards'; onRetry: () => void }) {
  return (
    <>
      <span className="cell-company">Couldn't load these {what}.</span>
      <button type="button" tabIndex={-1} onClick={onRetry}>
        Retry <kbd>r</kbd>
      </button>
    </>
  );
}
