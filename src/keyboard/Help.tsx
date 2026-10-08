import { useAppDispatch } from '@/store';
import { panelOpened } from '@/store/ui';
import { commands } from './commands';

export default function Help() {
  const dispatch = useAppDispatch();
  return (
    <div className="modal-back" onClick={() => dispatch(panelOpened(null))}>
      <div className="modal" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <table>
          <tbody>
            {commands.map((c) => (
              <tr key={c.id}>
                <td>
                  <kbd>{c.keys}</kbd>
                </td>
                <td>{c.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" autoFocus onClick={() => dispatch(panelOpened(null))}>
          Close <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
