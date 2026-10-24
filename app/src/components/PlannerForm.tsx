import { useId, useMemo, useState, type FormEvent } from 'react';
import type { Stop } from '../data/load';
import { parseHHMM, type JourneyQuery } from '../data/planner';
import './PlannerForm.css';

type Props = {
  stops: Stop[];
  defaultDate?: string;
  onSubmit: (q: JourneyQuery) => void;
  disabled?: boolean;
};

const DEFAULT_DATE = '2026-10-25';
const DEFAULT_TIME = '06:00';

export function PlannerForm({
  stops,
  defaultDate = DEFAULT_DATE,
  onSubmit,
  disabled = false,
}: Props) {
  const uid = useId();
  const ids = {
    origin: `${uid}-origin`,
    destination: `${uid}-destination`,
    date: `${uid}-date`,
    time: `${uid}-time`,
    error: `${uid}-error`,
  };

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [officialOnly, setOfficialOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => [...stops].sort((a, b) => a.name.localeCompare(b.name)), [stops]);

  function swap() {
    setOrigin(destination);
    setDestination(origin);
    setError(null);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!origin || !destination) {
      setError('Error: choose both an origin and a destination.');
      return;
    }
    if (origin === destination) {
      setError('Error: origin and destination must be different.');
      return;
    }
    if (!date) {
      setError('Error: choose a date.');
      return;
    }
    const earliestDep = parseHHMM(time);
    if (earliestDep === null) {
      setError('Error: enter an earliest departure time.');
      return;
    }
    setError(null);
    onSubmit({ origin, destination, date, earliestDep, officialOnly });
  }

  const options = sorted.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name}
    </option>
  ));

  return (
    <form className="planner-form" onSubmit={handleSubmit} noValidate>
      <div className="field planner-origin">
        <label className="field-label" htmlFor={ids.origin}>
          Origin
        </label>
        <select
          id={ids.origin}
          className="select"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          disabled={disabled}
          aria-describedby={error ? ids.error : undefined}
        >
          <option value="">Select origin</option>
          {options}
        </select>
      </div>

      <div className="planner-swap">
        <button
          type="button"
          className="btn btn-icon planner-swap-btn"
          onClick={swap}
          disabled={disabled}
          aria-label="Swap origin and destination"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M4 8h16M20 8l-4-4M20 8l-4 4" />
            <path d="M20 16H4M4 16l4-4M4 16l4 4" />
          </svg>
        </button>
      </div>

      <div className="field planner-destination">
        <label className="field-label" htmlFor={ids.destination}>
          Destination
        </label>
        <select
          id={ids.destination}
          className="select"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          disabled={disabled}
          aria-describedby={error ? ids.error : undefined}
        >
          <option value="">Select destination</option>
          {options}
        </select>
      </div>

      <div className="field planner-date">
        <label className="field-label" htmlFor={ids.date}>
          Date
        </label>
        <input
          id={ids.date}
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="field planner-time">
        <label className="field-label" htmlFor={ids.time}>
          Earliest departure
        </label>
        <input
          id={ids.time}
          className="input"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={disabled}
        />
      </div>

      <label className="field-label planner-official" style={{ gridColumn: '1 / -1' }}>
        <input
          type="checkbox"
          checked={officialOnly}
          onChange={(e) => setOfficialOnly(e.target.checked)}
          disabled={disabled}
        />{' '}
        Official MTCC ferries only
      </label>

      <button type="submit" className="btn btn-primary planner-submit" disabled={disabled}>
        Plan journey
      </button>

      {error && (
        <p className="form-error" id={ids.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
