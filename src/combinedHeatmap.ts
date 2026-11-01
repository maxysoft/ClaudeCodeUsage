import { DayUsage } from './heatmap';
import { parseDayKey } from './dateKeys';

export type CombinedHeatmapRange = '30d' | '90d' | 'year';

export interface CombinedDayUsage {
  dateISO: string;
  claudeProcessed: number;
  codexProcessed: number;
  combinedProcessed: number;
}

export interface CombinedHeatmapTotals {
  claudeProcessed: number;
  codexProcessed: number;
  combinedProcessed: number;
  activeDays: number;
}

export interface CombinedHeatmapWindow {
  range: CombinedHeatmapRange;
  startDateISO: string;
  endDateISO: string;
  daily: Record<string, CombinedDayUsage>;
  totals: CombinedHeatmapTotals;
}

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function isCalendarDateKey(value: string): boolean {
  return Number.isFinite(parseDayKey(value));
}

/** UTC date-key arithmetic keeps an already timezone-bucketed day stable. */
export function addCalendarDays(dateISO: string, days: number): string {
  if (!isCalendarDateKey(dateISO)) {
    throw new Error(`Invalid calendar date: ${dateISO}`);
  }
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeCombinedHeatmapRange(value: unknown): CombinedHeatmapRange {
  return value === '30d' || value === '90d' || value === 'year' ? value : 'year';
}

export function combinedHeatmapRangeDays(range: CombinedHeatmapRange): number {
  return range === '30d' ? 30 : range === '90d' ? 90 : 366;
}

export function selectCombinedHeatmapWindow(
  daily: Readonly<Record<string, CombinedDayUsage>>,
  rangeInput: unknown,
  endDateISO: string,
): CombinedHeatmapWindow {
  if (!isCalendarDateKey(endDateISO)) {
    throw new Error(`Invalid heatmap end date: ${endDateISO}`);
  }
  const range = normalizeCombinedHeatmapRange(rangeInput);
  const startDateISO = addCalendarDays(
    endDateISO,
    -(combinedHeatmapRangeDays(range) - 1),
  );
  const selected: Record<string, CombinedDayUsage> = {};
  let claudeProcessed = 0;
  let codexProcessed = 0;
  let activeDays = 0;
  for (const dateISO of Object.keys(daily).sort((left, right) => left.localeCompare(right))) {
    if (dateISO < startDateISO || dateISO > endDateISO) {
      continue;
    }
    const source = daily[dateISO];
    const claudeValue = finiteNonNegative(source.claudeProcessed);
    const codexValue = finiteNonNegative(source.codexProcessed);
    const combinedProcessed = claudeValue + codexValue;
    selected[dateISO] = {
      dateISO,
      claudeProcessed: claudeValue,
      codexProcessed: codexValue,
      combinedProcessed,
    };
    claudeProcessed += claudeValue;
    codexProcessed += codexValue;
    if (combinedProcessed > 0) {
      activeDays += 1;
    }
  }
  return {
    range,
    startDateISO,
    endDateISO,
    daily: selected,
    totals: {
      claudeProcessed,
      codexProcessed,
      combinedProcessed: claudeProcessed + codexProcessed,
      activeDays,
    },
  };
}

export function combinedDailyAsHeatmapUsage(
  daily: Readonly<Record<string, CombinedDayUsage>>,
): Record<string, DayUsage> {
  return Object.fromEntries(
    Object.entries(daily).map(([dateISO, usage]) => [dateISO, {
      tokens: finiteNonNegative(usage.combinedProcessed),
      cost: 0,
      sessions: 0,
    }]),
  );
}

export function sanitizeCombinedHeatmapTitle(value: unknown, fallback: string): string {
  const cleaned = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    : '';
  return cleaned || fallback;
}
