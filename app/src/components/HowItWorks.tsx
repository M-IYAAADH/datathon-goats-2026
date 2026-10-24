import type { Config } from '../data/load';

// Placeholder with the agreed interface; replaced by task UR-D.
export function HowItWorks({ config }: { config: Config }) {
  return <p>Long wait threshold: {config.longWaitMin} min</p>;
}
