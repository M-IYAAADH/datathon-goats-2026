import type { Journey } from '../data/planner';

// Placeholder with the agreed interface; replaced by task UR-B.
export function JourneyList({ journeys, searched }: { journeys: Journey[]; searched: boolean }) {
  if (!searched) return <p>Results will appear here.</p>;
  return <p>{journeys.length} journeys</p>;
}
