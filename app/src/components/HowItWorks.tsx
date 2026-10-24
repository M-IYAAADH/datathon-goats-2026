import type { Config } from '../data/load';
import './HowItWorks.css';

export function HowItWorks({ config }: { config: Config }) {
  return (
    <details className="how-it-works card">
      <summary className="how-it-works__summary">
        <span>How this works</span>
        <span className="how-it-works__chevron" aria-hidden="true" />
      </summary>
      <div className="how-it-works__body">
        <section>
          <h3>Data sources</h3>
          <ul>
            <li>
              <strong>Official:</strong> the MTCC timetable 2026, with exact times.
            </li>
            <li>
              <strong>Inferred:</strong> private services estimated from anonymised device movements
              (Aug 2025). They are shown only when seen on at least {config.minDevices} devices and{' '}
              {config.minDays} days, and their times are ranges.
            </li>
          </ul>
        </section>
        <section>
          <h3>Transfer rules</h3>
          <ul>
            <li>
              Buffer: {config.bufferOfficialMin} min between two official legs,{' '}
              {config.bufferInferredMin} min if either leg is inferred.
            </li>
            <li>
              <strong>Safe:</strong> latest arrival + buffer is at or before the earliest departure.
            </li>
            <li>
              <strong>Possible:</strong> earliest arrival + buffer is at or before the latest
              departure.
            </li>
            <li>
              <strong>Missed:</strong> anything else. Missed connections are never offered.
            </li>
            <li>A long wait is flagged at {config.longWaitMin} min or more.</li>
            <li>
              Up to {config.maxTransfers} transfers within a {config.horizonHours} h horizon.
            </li>
          </ul>
        </section>
        <section>
          <h3>Disruption</h3>
          <ul>
            <li>Cancellations are simulated.</li>
            <li>
              Timetable shift proposals use {config.shiftStepMin}-minute steps up to{' '}
              {config.maxShiftMin} min.
            </li>
            <li>Recommendation for MTCC to approve. Nothing changes automatically.</li>
          </ul>
        </section>
        <section>
          <h3>Assumptions</h3>
          <ul>
            <li>The buffers and thresholds above are assumptions, not measured values.</li>
            <li>The time zone and speed unit of the source data are unconfirmed.</li>
            <li>There are no fares, capacity or passenger counts.</li>
          </ul>
        </section>
      </div>
    </details>
  );
}
