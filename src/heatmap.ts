export type HeatMetric = 'tokens' | 'cost' | 'sessions';

export interface DayUsage {
  tokens: number;
  cost: number;
  sessions: number;
}

/** Intensity bucket 0..4. 0 = no usage; otherwise a quartile of the month's max
 * (a tiny non-zero day still reads as bucket 1, the max day as 4). */
export function intensityBucket(value: number, max: number): number {
  if (value <= 0 || max <= 0) {
    return 0;
  }
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));
}
