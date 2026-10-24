import type { Stop } from '../data/load';
import './StopPicker.css';

export type PickRole = 'origin' | 'destination';

type Props = {
  stop: Stop;
  onPick: (role: PickRole) => void;
  onClose?: () => void;
};

// Content of the map popup (or the SVG fallback card) shown when an island is tapped.
export function StopPicker({ stop, onPick, onClose }: Props) {
  return (
    <div className="stop-picker" role="group" aria-label={`Use ${stop.name} in the planner`}>
      <div className="stop-picker-head">
        <p className="stop-picker-name">{stop.name}</p>
        {onClose && (
          <button
            type="button"
            className="btn btn-ghost stop-picker-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>
      <p className="stop-picker-meta">
        {stop.atoll} atoll{stop.kind === 'hub' ? ' · hub' : ''}
      </p>
      <div className="stop-picker-actions">
        <button type="button" className="btn" onClick={() => onPick('origin')}>
          Set as origin
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onPick('destination')}>
          Set as destination
        </button>
      </div>
    </div>
  );
}
