// Seed test for the project's test suite (see issue #25).
//
// Approach: Node's built-in test runner (`node:test` + `node:assert`) against
// the *compiled* output — zero new runtime/dev dependencies. Tests live in
// `src/test/` so `tsc` (rootDir: src) emits them to `out/test/`, then the
// `test` script runs `node --test out/test/*.test.js` — a shell-expanded glob,
// so it works on Node 20 too (node's own glob support only landed in 21).
//
// Only pure, dependency-free modules belong here — anything importing the
// `vscode` API needs the heavier @vscode/test-electron harness instead. This
// one file is intentionally a single illustrative example; follow the same
// pattern to cover aggregation, quota-window handling, and i18n next.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { calculateCostFromTokens, calculateCostBreakdown, getModelPricing } from '../pricing';

test('calculateCostFromTokens prices a known model from its per-token rates', () => {
  // Opus current tier: $5 / $25 / $6.25 / $0.50 per million in/out/write/read.
  const cost = calculateCostFromTokens(
    {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    },
    'claude-opus-4-8'
  );

  // 5 + 25 + 6.25 + 0.5 = 36.75. Use a tolerance — per-token rates are floats.
  assert.ok(Math.abs(cost - 36.75) < 1e-9, `expected ~36.75, got ${cost}`);
});

test('cache-write pricing bills 1-hour writes at 2x input, 5-minute at 1.25x', () => {
  // Opus current tier: base input $5/MTok, so a 5m write is $6.25/MTok and a
  // 1h write is $10/MTok. Split 1M tokens evenly across the two TTLs.
  const breakdown = calculateCostBreakdown(
    {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 0,
      cache_creation: {
        ephemeral_1h_input_tokens: 500_000,
        ephemeral_5m_input_tokens: 500_000,
      },
    },
    'claude-opus-4-8'
  );
  // 0.5M * 10 + 0.5M * 6.25 = 5 + 3.125 = 8.125 (vs 6.25 if lumped at 5m).
  assert.ok(Math.abs(breakdown.cacheWrite - 8.125) < 1e-9, `expected ~8.125, got ${breakdown.cacheWrite}`);
});

test('cache-write pricing falls back to the 5-minute rate when no TTL split is present', () => {
  // Backward-compatible: a record with only the flat cache_creation_input_tokens
  // (older logs / proxies) is billed entirely at the 5-minute rate.
  const breakdown = calculateCostBreakdown(
    {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 0,
    },
    'claude-opus-4-8'
  );
  assert.ok(Math.abs(breakdown.cacheWrite - 6.25) < 1e-9, `expected ~6.25, got ${breakdown.cacheWrite}`);
});

test('getModelPricing resolves Opus 5 from the exact table, long-context variant included', () => {
  for (const model of ['claude-opus-5', 'claude-opus-5[1m]']) {
    const pricing = getModelPricing(model);
    assert.ok(pricing, `expected pricing for ${model}, got null`);
    assert.equal(pricing!.input_cost_per_token, 5 / 1_000_000, model);
    assert.equal(pricing!.output_cost_per_token, 25 / 1_000_000, model);
  }
});

test('getModelPricing falls back to the right family for an unknown snapshot', () => {
  // An unreleased Opus snapshot isn't in the exact table; it should still
  // resolve to the current Opus tier ($5/MTok input) rather than a wrong rate.
  const pricing = getModelPricing('claude-opus-4-9-20990101');
  assert.ok(pricing, 'expected a fallback pricing object, got null');
  assert.equal(pricing!.input_cost_per_token, 5 / 1_000_000);
});

test('Sonnet 5 bills introductory $2/$10 before 2026-09-01 and standard $3/$15 after', () => {
  const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
  const intro = calculateCostFromTokens(usage, 'claude-sonnet-5', Date.parse('2026-07-15T00:00:00Z'));
  const standard = calculateCostFromTokens(usage, 'claude-sonnet-5', Date.parse('2026-09-01T00:00:00Z'));
  assert.ok(Math.abs(intro - 12) < 1e-9, `expected ~12 (intro), got ${intro}`);
  assert.ok(Math.abs(standard - 18) < 1e-9, `expected ~18 (standard), got ${standard}`);
});

test('fast mode swaps Opus 4.8 to its premium $10/$50 tier', () => {
  const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000, speed: 'fast' };
  const fast = calculateCostFromTokens(usage, 'claude-opus-4-8');
  // 10 + 50 = 60 vs standard 5 + 25 = 30.
  assert.ok(Math.abs(fast - 60) < 1e-9, `expected ~60, got ${fast}`);
  // Unknown-fast-tier models keep standard rates (no fabricated premium).
  const noFastTier = calculateCostFromTokens(
    { input_tokens: 1_000_000, output_tokens: 0, speed: 'fast' },
    'claude-haiku-4-5'
  );
  assert.ok(Math.abs(noFastTier - 1) < 1e-9, `expected ~1, got ${noFastTier}`);
});

test('inference_geo "us" applies the 1.1x multiplier to every component', () => {
  const base = calculateCostFromTokens(
    { input_tokens: 1_000_000, output_tokens: 1_000_000, inference_geo: 'global' },
    'claude-opus-4-8'
  );
  const us = calculateCostFromTokens(
    { input_tokens: 1_000_000, output_tokens: 1_000_000, inference_geo: 'us' },
    'claude-opus-4-8'
  );
  assert.ok(Math.abs(us - base * 1.1) < 1e-9, `expected ${base * 1.1}, got ${us}`);
});
