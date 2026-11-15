import { rollingDayKeysFromDayKey } from './dateKeys';

export type ProjectMatrixCoverage = 'complete' | 'partial' | 'none';

export interface ProjectDayPoint {
  projectKey: string;
  projectName: string;
  day: string;
  tokens: number;
  coverage: ProjectMatrixCoverage;
}

export interface ProjectUsageMatrixSnapshot {
  provider: 'claude' | 'codex';
  timeZone: string;
  asOfDay: string;
  /** One bounded sparse source supports both the 30- and 90-day projections. */
  days: string[];
  points: ProjectDayPoint[];
  coverage: ProjectMatrixCoverage;
}

function safeTokenCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function safeProjectName(value: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mergeCoverage(
  left: ProjectMatrixCoverage,
  right: ProjectMatrixCoverage,
): ProjectMatrixCoverage {
  if (left === right) return left;
  if (left === 'partial' || right === 'partial') return 'partial';
  return 'partial';
}

/** Build the single bounded sparse source consumed by both visual projections. */
export function buildProjectUsageMatrixSnapshot(
  provider: 'claude' | 'codex',
  points: Iterable<ProjectDayPoint>,
  options: {
    asOfDay: string;
    timeZone: string;
    coverage?: ProjectMatrixCoverage;
  },
): ProjectUsageMatrixSnapshot {
  const days = rollingDayKeysFromDayKey(options.asOfDay, 90);
  const allowedDays = new Set(days);
  const combined = new Map<string, ProjectDayPoint>();

  for (const point of points) {
    const projectKey = typeof point.projectKey === 'string'
      ? point.projectKey.trim()
      : '';
    if (!projectKey || !allowedDays.has(point.day)) continue;
    const key = `${projectKey}\0${point.day}`;
    const previous = combined.get(key);
    const projectName = safeProjectName(point.projectName) || previous?.projectName || '';
    combined.set(key, {
      projectKey,
      projectName,
      day: point.day,
      tokens: safeTokenCount(point.tokens) + (previous?.tokens ?? 0),
      coverage: previous
        ? mergeCoverage(previous.coverage, point.coverage)
        : point.coverage,
    });
  }

  return {
    provider,
    timeZone: options.timeZone,
    asOfDay: options.asOfDay,
    days,
    points: [...combined.values()].sort(
      (left, right) =>
        left.day.localeCompare(right.day) ||
        left.projectName.localeCompare(right.projectName) ||
        left.projectKey.localeCompare(right.projectKey),
    ),
    coverage: options.coverage ?? 'complete',
  };
}
