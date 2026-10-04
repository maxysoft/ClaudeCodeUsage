import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  fetchOpenRouterCredits,
  mapOpenRouterCreditsResponse,
  OPEN_ROUTER_CREDITS_URL,
} from '../providers/openrouter/openRouterClient';

const OK_BODY = JSON.stringify({ data: { total_credits: 100.5, total_usage: 25.75 } });

test('a 200 credits response yields both lifetime totals', () => {
  const result = mapOpenRouterCreditsResponse(200, OK_BODY);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.credits, { totalCredits: 100.5, totalUsage: 25.75 });
});

test('each OpenRouter failure maps to its own actionable code', () => {
  const cases: [number, string, string][] = [
    [401, '{"error":{"code":401,"message":"No auth credentials found"}}', 'unauthorized'],
    [
      403,
      '{"error":{"code":403,"message":"Only management keys can perform this operation"}}',
      'forbidden-not-management-key',
    ],
    [429, '{"error":{"code":429}}', 'network'],
    [500, 'upstream failure', 'network'],
    [200, 'not json at all', 'malformed'],
    [200, '{"data":{}}', 'malformed'],
    [200, '{"data":{"total_credits":"100.5","total_usage":"25.75"}}', 'malformed'],
    [200, 'null', 'malformed'],
  ];
  for (const [status, body, expected] of cases) {
    const result = mapOpenRouterCreditsResponse(status, body);
    assert.equal(result.ok, false, `status ${status} must not be treated as a reading`);
    assert.equal(!result.ok && result.error, expected, `status ${status} body ${body}`);
  }
});

test('the credits request is a bearer GET to openrouter.ai and nothing else', async () => {
  const calls: { url: string; headers?: Record<string, string>; method?: string }[] = [];
  const result = await fetchOpenRouterCredits('synthetic-management-key', {
    request: async (url, opts) => {
      calls.push({ url, headers: opts.headers, method: opts.method });
      return { status: 200, body: OK_BODY };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, OPEN_ROUTER_CREDITS_URL);
  assert.equal(new URL(calls[0].url).host, 'openrouter.ai');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].headers?.Authorization, 'Bearer synthetic-management-key');
});

test('an empty key never reaches the network', async () => {
  let requested = 0;
  for (const key of ['', '   ']) {
    const result = await fetchOpenRouterCredits(key, {
      request: async () => {
        requested += 1;
        return { status: 200, body: OK_BODY };
      },
    });
    assert.equal(!result.ok && result.error, 'unauthorized');
  }
  assert.equal(requested, 0);
});

test('a transport exception is a network failure, never a thrown key', async () => {
  const result = await fetchOpenRouterCredits('synthetic-management-key', {
    request: async () => {
      throw new Error('Request timed out after 10s');
    },
  });
  assert.equal(!result.ok && result.error, 'network');
  assert.equal(JSON.stringify(result).includes('synthetic-management-key'), false);
});
