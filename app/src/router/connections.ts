// Transfer rules, SRS section 5.3.
import type { Config, Occurrence, TransferAssessment } from './model';

/** Assess changing from arriving occurrence `a` to departing occurrence `d`. */
export function assessTransfer(a: Occurrence, d: Occurrence, config: Config): TransferAssessment {
  const official = a.leg.source === 'mtcc' && d.leg.source === 'mtcc';
  const bufferMin = official ? config.bufferOfficialMin : config.bufferInferredMin;
  const status =
    a.arr.max + bufferMin <= d.dep.min
      ? 'safe'
      : a.arr.min + bufferMin <= d.dep.max
        ? 'possible'
        : 'missed';
  const lo = Math.max(0, d.dep.min - a.arr.max);
  const hi = Math.max(lo, d.dep.max - a.arr.min);
  // Flag only a wait that is long even in the best case.
  return { status, waitMin: [lo, hi], long: lo >= config.longWaitMin, bufferMin };
}
