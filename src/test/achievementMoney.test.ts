import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  getAchievementMoneyPricebook,
  normalizeAchievementMoneyModel,
  priceAchievementModelBucket,
  type AchievementMoneyModelBucket,
} from '../achievementMoney';
import { getModelPricing, setPricingBackend } from '../pricing';

const backend = 'anthropic' as const;
const claude = (model: string | undefined, usage: {
  input_tokens: number; output_tokens: number;
  cache_read_input_tokens?: number; cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
}): AchievementMoneyModelBucket => ({ provider: 'claude', model, usage });
const codex = (model = 'gpt-6.1-sol', inputTotal = 100, cachedInput = 20,
  outputTotal = 10, reasoningOutput = 5): AchievementMoneyModelBucket => ({
  provider: 'codex', model, tokens: { inputTotal, cachedInput, outputTotal, reasoningOutput },
});

test('frozen reference versions include backend and cannot follow dashboard mutations', () => {
  const book = getAchievementMoneyPricebook(backend);
  const aws = getAchievementMoneyPricebook('aws-bedrock-in-region');
  assert.notEqual(book.version, aws.version);
  assert.equal(book.referenceDate, '2026-10-09');
  assert.equal(book.backend, backend);
  assert.ok(Object.isFrozen(book) && Object.isFrozen(book.prices));
  assert.ok(Object.isFrozen(book.prices['claude-opus-5-5']));
  assert.ok(Object.isFrozen(book.aliases));
  assert.throws(() => { (book.prices['claude-opus-5-5'] as any).input = '999'; }, TypeError);
  const bucket = claude('claude-opus-5-5', { input_tokens: 100, output_tokens: 0 });
  const rate = getModelPricing('claude-opus-5-5')!;
  const original = rate.input_cost_per_token;
  try {
    rate.input_cost_per_token = 999; // Existing mutable dashboard table must be isolated.
    setPricingBackend('aws-bedrock-in-region');
    assert.equal(priceAchievementModelBucket(bucket, backend).microUsd, 400);
    assert.equal(priceAchievementModelBucket(bucket, 'aws-bedrock-in-region').microUsd, 440);
    assert.equal(getAchievementMoneyPricebook(backend), book);
  } finally {
    rate.input_cost_per_token = original;
    setPricingBackend(backend);
  }
});

test('normalization uses only explicit aliases, preserving real generations', () => {
  assert.equal(normalizeAchievementMoneyModel('openai/gpt-6.1-sol'), 'gpt-6.1-sol');
  assert.equal(normalizeAchievementMoneyModel('anthropic/claude-opus-5-5'), 'claude-opus-5-5');
  assert.equal(normalizeAchievementMoneyModel('claude-mythos-5-1'), 'claude-fable-5-1');
  assert.equal(normalizeAchievementMoneyModel('claude-opus-4-5-20251101'), 'claude-opus-4-5');
  assert.notEqual(normalizeAchievementMoneyModel('gpt-6-sol'), normalizeAchievementMoneyModel('gpt-6.1-sol'));
  for (const model of ['my-gpt-6.1-sol', 'gpt-6.1-sol-custom', 'claude-sonnet-99',
    'claude-opus-5-5[anything]', 'claude-opus-5-5-20991231', 'sonnet',
    ' GPT-6.1-SOL ', '__proto__', 'constructor', undefined]) {
    assert.equal(normalizeAchievementMoneyModel(model), null, String(model));
  }
});

test('unknown and invented labels retain observed tokens without a money estimate', () => {
  for (const model of [undefined, '<unknown>', 'my-claude-sonnet-5-5']) {
    const result = priceAchievementModelBucket(claude(model, {
      input_tokens: 2, output_tokens: 3, cache_read_input_tokens: 4,
      cache_creation_input_tokens: 5,
      cache_creation: { ephemeral_5m_input_tokens: 5 },
    }), backend);
    assert.equal(result.totalTokens, 14);
    assert.equal(result.pricedTokens, 0);
    assert.equal(result.microUsd, null);
    assert.equal(result.reason, 'unknown-model');
  }
});

test('Claude prices four independent buckets and each explicitly known write TTL', () => {
  const result = priceAchievementModelBucket(claude('claude-opus-4-8', {
    input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000,
    cache_creation_input_tokens: 1_000_000,
    cache_creation: { ephemeral_5m_input_tokens: 500_000, ephemeral_1h_input_tokens: 500_000 },
  }), backend);
  assert.equal(result.microUsd, 38_625_000);
  assert.equal(result.pricedTokens, 4_000_000);
  assert.equal(result.reason, null);
  const splitOnly = priceAchievementModelBucket(claude('claude-opus-5-5', {
    input_tokens: 0, output_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 100 },
  }), backend);
  assert.equal(splitOnly.totalTokens, 100);
  assert.equal(splitOnly.microUsd, 800);
});

test('missing or inconsistent aggregate TTL evidence is pending rather than defaulting to 5m', () => {
  for (const cache_creation of [undefined, { ephemeral_5m_input_tokens: 4 },
    { ephemeral_5m_input_tokens: 11 }]) {
    const result = priceAchievementModelBucket(claude('claude-opus-5-5', {
      input_tokens: 2, output_tokens: 3, cache_creation_input_tokens: 10, cache_creation,
    }), backend);
    assert.equal(result.reason, 'incomplete-cache-ttl');
    assert.equal(result.pricedTokens, 0);
    assert.equal(result.microUsd, null);
    assert.ok(result.totalTokens >= 15);
  }
});

test('missing a nonzero cache rate excludes the entire model', () => {
  // OpenAI publishes cached reads but no independent Claude write TTL prices.
  const result = priceAchievementModelBucket(claude('gpt-6.1-sol', {
    input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 1,
    cache_creation: { ephemeral_5m_input_tokens: 1 },
  }), backend);
  assert.equal(result.reason, 'missing-rate');
  assert.equal(result.pricedTokens, 0);
  assert.equal(result.totalTokens, 111);
  assert.equal(result.microUsd, null);
});

test('Codex fresh plus cached plus output excludes reasoning from both cost and token total', () => {
  const result = priceAchievementModelBucket(codex(), backend);
  assert.equal(result.microUsd, 262); // 80*2 + 20*0.1 + 10*10
  assert.equal(result.totalTokens, 110);
  assert.equal(result.pricedTokens, 110);
  assert.equal(priceAchievementModelBucket(codex('gpt-6.1-sol', 100, 20, 10, 0), backend).microUsd, 262);
  assert.equal(priceAchievementModelBucket(codex('gpt-6-sol'), backend).microUsd, 264);
});

test('amount overflow never yields a usable rounded number', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const result = priceAchievementModelBucket(codex('gpt-6.1-sol', max, 0, 0, 0), backend);
  assert.equal(result.microUsd, null);
  assert.equal(result.reason, 'overflow');
  assert.equal(result.totalTokens, max);
  assert.equal(result.pricedTokens, 0);
});

test('invalid and overflowing token counters are rejected without silently clamping subsets', () => {
  for (const count of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => priceAchievementModelBucket(codex('gpt-6.1-sol', count), backend), RangeError);
  }
  assert.throws(() => priceAchievementModelBucket(codex('gpt-6.1-sol', 1, 2), backend), RangeError);
  assert.throws(() => priceAchievementModelBucket(codex('gpt-6.1-sol', 1, 0, 1, 2), backend), RangeError);
  assert.throws(() => priceAchievementModelBucket(codex('gpt-6.1-sol', Number.MAX_SAFE_INTEGER, 0, 1, 0), backend), RangeError);
});

test('unsupported backend models remain unpriced without an Anthropic fallback', () => {
  const bucket = claude('claude-fable-5-1', { input_tokens: 100, output_tokens: 10 });
  assert.equal(priceAchievementModelBucket(bucket, backend).microUsd, 1500);
  const result = priceAchievementModelBucket(bucket, 'aws-bedrock-in-region');
  assert.equal(result.totalTokens, 110);
  assert.equal(result.reason, 'missing-rate');
  assert.equal(result.microUsd, null);
  assert.throws(() => getAchievementMoneyPricebook('invented' as any), RangeError);
});
