import { dayKeyInZone } from '../../dateKeys';
import { OpenRouterCredits, OpenRouterErrorCode } from './openRouterClient';

export const OPEN_ROUTER_HISTORY_STATE_KEY = 'ccu.openrouter.creditHistory.v1';
export const OPEN_ROUTER_HISTORY_LIMIT = 400;

export interface OpenRouterObservation {
  observedAt: number;
  totalCredits: number;
  totalUsage: number;
}

export interface OpenRouterDaySpend {
  day: string;
  spendUsd: number;
  /** The lifetime usage counter fell inside this day, so the real spend is at
   * least the clamped figure. */
  discontinuity: boolean;
}

export interface OpenRouterDashboardView {
  enabled: boolean;
  keyConfigured: boolean;
  credits: OpenRouterCredits | null;
  error: OpenRouterErrorCode | null;
  observedAt: number | null;
  observationCount: number;
  daily: OpenRouterDaySpend[];
  trackingSince: number | null;
}

function isObservation(value: unknown): value is OpenRouterObservation {
  const candidate = value as Partial<OpenRouterObservation> | null;
  return (
    !!candidate &&
    typeof candidate.observedAt === 'number' &&
    Number.isFinite(candidate.observedAt) &&
    candidate.observedAt > 0 &&
    typeof candidate.totalCredits === 'number' &&
    Number.isFinite(candidate.totalCredits) &&
    typeof candidate.totalUsage === 'number' &&
    Number.isFinite(candidate.totalUsage)
  );
}

/** Drop consecutive duplicate readings and keep at most `limit` points. */
export function pruneOpenRouterHistory(
  history: readonly OpenRouterObservation[],
  limit: number = OPEN_ROUTER_HISTORY_LIMIT,
): OpenRouterObservation[] {
  const ordered = [...history].sort((left, right) => left.observedAt - right.observedAt);
  const deduped: OpenRouterObservation[] = [];
  for (const observation of ordered) {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      previous.totalCredits === observation.totalCredits &&
      previous.totalUsage === observation.totalUsage
    ) {
      continue;
    }
    deduped.push({
      observedAt: observation.observedAt,
      totalCredits: observation.totalCredits,
      totalUsage: observation.totalUsage,
    });
  }
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : OPEN_ROUTER_HISTORY_LIMIT;
  return deduped.length > cap ? deduped.slice(deduped.length - cap) : deduped;
}

export function normalizeOpenRouterHistory(
  raw: unknown,
  limit: number = OPEN_ROUTER_HISTORY_LIMIT,
): OpenRouterObservation[] {
  if (!Array.isArray(raw)) return [];
  return pruneOpenRouterHistory(raw.filter(isObservation), limit);
}

/** Returns the same array reference when the reading repeats the last one, so
 * the dashboard's identity-compared panel cache survives an idle poll. */
export function appendOpenRouterObservation(
  history: readonly OpenRouterObservation[],
  observation: OpenRouterObservation,
  limit: number = OPEN_ROUTER_HISTORY_LIMIT,
): OpenRouterObservation[] {
  const previous = history[history.length - 1];
  if (
    previous &&
    previous.totalCredits === observation.totalCredits &&
    previous.totalUsage === observation.totalUsage
  ) {
    return history as OpenRouterObservation[];
  }
  return pruneOpenRouterHistory([...history, observation], limit);
}

/**
 * Per-day spend differenced from consecutive lifetime `total_usage` readings and
 * bucketed on the day of the *later* reading. The first observation establishes
 * the baseline and contributes nothing. A decrease means the account's lifetime
 * counter moved backwards (reset, credit purchase, key change); it contributes
 * zero rather than a negative figure and marks the day as a discontinuity.
 */
export function openRouterDailySpend(
  history: readonly OpenRouterObservation[],
  timeZone: string,
): OpenRouterDaySpend[] {
  const ordered = [...history].sort((left, right) => left.observedAt - right.observedAt);
  const byDay = new Map<string, OpenRouterDaySpend>();
  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index];
    const day = dayKeyInZone(new Date(current.observedAt), timeZone);
    if (!day) continue;
    const bucket = byDay.get(day) ?? { day, spendUsd: 0, discontinuity: false };
    const delta = current.totalUsage - ordered[index - 1].totalUsage;
    if (delta < 0) bucket.discontinuity = true;
    else bucket.spendUsd += delta;
    byDay.set(day, bucket);
  }
  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day));
}
