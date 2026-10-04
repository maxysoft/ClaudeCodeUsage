import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  appendOpenRouterObservation,
  normalizeOpenRouterHistory,
  openRouterDailySpend,
  OpenRouterObservation,
  OPEN_ROUTER_HISTORY_LIMIT,
} from '../providers/openrouter/openRouterHistory';

const ZONE = 'Asia/Hong_Kong';

function observation(
  isoTimestamp: string,
  totalUsage: number,
  totalCredits = 100,
): OpenRouterObservation {
  return { observedAt: Date.parse(isoTimestamp), totalCredits, totalUsage };
}

test('the first reading is a baseline and contributes no spend', () => {
  const series = openRouterDailySpend([observation('2026-07-20T01:00:00Z', 10)], ZONE);
  assert.deepEqual(series, []);
});

test('spend is the difference between consecutive lifetime totals, bucketed by day', () => {
  const series = openRouterDailySpend(
    [
      observation('2026-07-19T01:00:00Z', 10),
      observation('2026-07-20T01:00:00Z', 12.5),
      observation('2026-07-21T01:00:00Z', 15),
    ],
    ZONE,
  );
  assert.deepEqual(series, [
    { day: '2026-07-20', spendUsd: 2.5, discontinuity: false },
    { day: '2026-07-21', spendUsd: 2.5, discontinuity: false },
  ]);
});

test('two readings on the same civil day sum into one bucket', () => {
  const series = openRouterDailySpend(
    [
      observation('2026-07-19T23:00:00Z', 10),
      // Both of these are 2026-07-20 in Asia/Hong_Kong.
      observation('2026-07-20T02:00:00Z', 11),
      observation('2026-07-20T10:00:00Z', 14),
    ],
    ZONE,
  );
  assert.equal(series.length, 1);
  assert.equal(series[0].day, '2026-07-20');
  assert.equal(series[0].spendUsd, 4);
});

test('the civil day comes from the configured zone, not UTC', () => {
  const readings = [
    observation('2026-07-19T12:00:00Z', 10),
    observation('2026-07-19T17:00:00Z', 13),
  ];
  assert.equal(openRouterDailySpend(readings, ZONE)[0].day, '2026-07-20');
  assert.equal(openRouterDailySpend(readings, 'UTC')[0].day, '2026-07-19');
});

test('a decrease in the lifetime total is clamped and flags the day', () => {
  const series = openRouterDailySpend(
    [
      observation('2026-07-19T01:00:00Z', 40),
      // Account reset / credit purchase: the counter moves backwards.
      observation('2026-07-20T01:00:00Z', 5),
      observation('2026-07-20T09:00:00Z', 7),
    ],
    ZONE,
  );
  assert.equal(series.length, 1);
  assert.equal(series[0].day, '2026-07-20');
  assert.equal(series[0].spendUsd, 2, 'the negative delta contributes zero, not -35');
  assert.equal(series[0].discontinuity, true);
  assert.ok(series.every((row) => row.spendUsd >= 0));
});

test('an identical consecutive reading is not appended and keeps the array identity', () => {
  const history = [observation('2026-07-20T01:00:00Z', 10, 100)];
  const next = appendOpenRouterObservation(history, observation('2026-07-20T03:00:00Z', 10, 100));
  assert.equal(next, history, 'an unchanged reading must not invalidate the panel cache');

  const changed = appendOpenRouterObservation(history, observation('2026-07-20T05:00:00Z', 11, 100));
  assert.notEqual(changed, history);
  assert.equal(changed.length, 2);
});

test('a changed credit balance at the same usage is still a new reading', () => {
  const history = [observation('2026-07-20T01:00:00Z', 10, 100)];
  const next = appendOpenRouterObservation(history, observation('2026-07-20T03:00:00Z', 10, 150));
  assert.equal(next.length, 2);
});

test('the series is capped to the most recent points', () => {
  let history: OpenRouterObservation[] = [];
  for (let index = 0; index < OPEN_ROUTER_HISTORY_LIMIT + 25; index += 1) {
    history = appendOpenRouterObservation(history, {
      observedAt: Date.parse('2026-01-01T00:00:00Z') + index * 60_000,
      totalCredits: 1000,
      totalUsage: index,
    });
  }
  assert.equal(history.length, OPEN_ROUTER_HISTORY_LIMIT);
  assert.equal(history[history.length - 1].totalUsage, OPEN_ROUTER_HISTORY_LIMIT + 24);
  assert.equal(history[0].totalUsage, 25, 'the oldest points are pruned, not the newest');
});

test('persisted history is validated, ordered, deduped and capped on load', () => {
  const restored = normalizeOpenRouterHistory(
    [
      observation('2026-07-21T01:00:00Z', 12),
      { observedAt: 'not a number', totalCredits: 1, totalUsage: 1 },
      { observedAt: Date.parse('2026-07-20T01:00:00Z'), totalCredits: 100 },
      observation('2026-07-20T01:00:00Z', 10),
      observation('2026-07-20T02:00:00Z', 10),
      null,
    ],
    10,
  );
  assert.deepEqual(
    restored.map((item) => item.totalUsage),
    [10, 12],
  );
  assert.equal(normalizeOpenRouterHistory(undefined).length, 0);
  assert.equal(normalizeOpenRouterHistory({ not: 'an array' }).length, 0);
});
