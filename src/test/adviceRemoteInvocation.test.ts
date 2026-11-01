import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import * as remoteAdvice from '../adviceEffectiveness/remoteAdvice';
import * as structuredOutput from '../adviceEffectiveness/structuredOutput';
import {
  prepareStructuredAdviceInvocation,
  requestStructuredAdvice,
} from '../adviceEffectiveness/remoteAdvice';
import { parseStructuredAdviceOutput } from '../adviceEffectiveness/structuredOutput';
import type { AdviceRecommendation } from '../adviceEffectiveness/contract';
import { prepareAdvicePayload } from '../adviceEffectiveness/payload';
import { previewAiInvocation } from '../adviceEffectiveness/preparedRequest';
import type { PreparedAiTransportRequest } from '../adviceEffectiveness/preparedRequest';
import { payloadInputFixture, structuredOutputFixture } from './adviceTestFixtures';

const config = {
  apiFormat: 'openai' as const,
  apiUrl: 'https://example.invalid/v1',
  model: 'private-model',
};
const references = {
  observationIds: ['observation-cache-share'],
  evidenceIds: ['evidence-cache-share'],
};
type SchemaNode = {
  type: string | string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
};
const responseSchema = (structuredOutput as unknown as {
  STRUCTURED_ADVICE_JSON_SCHEMA: SchemaNode;
}).STRUCTURED_ADVICE_JSON_SCHEMA;
const responseExample = (remoteAdvice as unknown as {
  STRUCTURED_ADVICE_EXAMPLE: { schemaVersion: 1; recommendations: AdviceRecommendation[] };
}).STRUCTURED_ADVICE_EXAMPLE;

function prepare(apiFormat: 'openai' | 'anthropic' = 'openai') {
  return prepareStructuredAdviceInvocation(prepareAdvicePayload(payloadInputFixture()), {
    ...config,
    apiFormat,
    apiUrl: apiFormat === 'openai' ? config.apiUrl : 'https://api.anthropic.com',
    sourceRevision: 'claude-index-42',
    consentGeneration: 3,
    createdAtEpochMs: 1_000,
  });
}

function wireBody(request: PreparedAiTransportRequest): Record<string, unknown> {
  return JSON.parse(Buffer.from(request.canonicalBytes).toString('utf8'));
}

function chatReply(content: string): string {
  return JSON.stringify({
    id: 'chatcmpl-fixture',
    object: 'chat.completion',
    model: 'private-model',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1_200 },
  });
}

function assertCompleteExample(value: unknown, node: SchemaNode, at: string): void {
  if (node.type === 'object') {
    const object = value as Record<string, unknown>;
    assert.deepEqual(Object.keys(object).sort(), Object.keys(node.properties!).sort(), at);
    for (const key of Object.keys(node.properties!)) {
      assertCompleteExample(object[key], node.properties![key], `${at}.${key}`);
    }
  } else if (node.type === 'array') {
    assert.ok(Array.isArray(value) && value.length > 0, `${at} needs at least one example item`);
    for (const item of value as unknown[]) assertCompleteExample(item, node.items!, `${at}[]`);
  }
}

test('structured advice preview is the complete provider body later sent byte-for-byte', async () => {
  const evidence = prepareAdvicePayload(payloadInputFixture());
  const prepared = prepareStructuredAdviceInvocation(evidence, {
    ...config,
    sourceRevision: 'claude-index-42',
    consentGeneration: 3,
    createdAtEpochMs: 1_000,
  });
  const preview = previewAiInvocation(prepared);
  const parsedBody = JSON.parse(preview.body);
  let sentBytes: Uint8Array | undefined;

  assert.equal(parsedBody.messages[1].content, evidence.serializedBody);
  assert.equal(parsedBody.messages[0].role, 'system');
  assert.equal(prepared.dataMode, 'aggregates-only');

  const result = await requestStructuredAdvice(prepared, references, {
    apiKey: 'PRIVATE_API_KEY',
    expectedSourceRevision: 'claude-index-42',
    expectedConsentGeneration: 3,
    transport: async (request) => {
      sentBytes = request.canonicalBytes;
      return { status: 200, body: chatReply(JSON.stringify(structuredOutputFixture())) };
    },
  });

  assert.equal(result.ok, true);
  assert.strictEqual(sentBytes, prepared.canonicalBytes);
  assert.equal(Buffer.from(sentBytes!).toString('utf8'), preview.body);
  assert.doesNotMatch(preview.body, /PRIVATE_API_KEY/);
});

test('structured advice fails closed on stale consent or malformed strict output', async () => {
  const prepared = prepare();
  let calls = 0;
  const stale = await requestStructuredAdvice(prepared, references, {
    apiKey: 'PRIVATE_API_KEY',
    expectedConsentGeneration: 4,
    transport: async () => {
      calls += 1;
      return { status: 200, body: '{}' };
    },
  });
  assert.deepEqual(stale, {
    ok: false,
    code: 'transport-error',
    issues: ['configured BYOK transport failed'],
  });
  assert.equal(calls, 0);

  for (const [content, code] of [
    ['I cannot produce advice for this data.', 'invalid-json'],
    ['```json\n{}\n```', 'invalid-schema'],
  ] as const) {
    const malformed = await requestStructuredAdvice(prepared, references, {
      apiKey: 'PRIVATE_API_KEY',
      expectedConsentGeneration: 3,
      transport: async () => ({ status: 200, body: chatReply(content) }),
    });
    assert.equal(malformed.ok, false);
    if (!malformed.ok) assert.equal(malformed.code, code);
  }
});

test('the system prompt carries the exact response schema and one complete example the parser accepts', () => {
  const system = JSON.parse(previewAiInvocation(prepare()).body).messages[0].content as string;
  assert.ok(responseSchema, 'the response schema must be exported');
  assert.ok(system.includes(JSON.stringify(responseSchema)));
  assert.ok(system.includes(JSON.stringify(responseExample)));
  assertCompleteExample(responseExample, responseSchema, '$');
  const recommendations = responseExample.recommendations;
  const parsed = parseStructuredAdviceOutput(JSON.stringify(responseExample), {
    evidenceIds: recommendations.flatMap((item) => [
      ...item.evidenceIds,
      ...item.conditionalActions.flatMap((action) => action.evidenceIds),
    ]),
    observationIds: recommendations.flatMap((item) => [
      ...item.explanation.proxyMetricObservationIds,
      ...item.successCriteria.map((criterion) => criterion.metricObservationId),
    ]),
  });
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
});

test('OpenAI-compatible request asks for strict json_schema output and accepts prose around fenced JSON', async () => {
  let body: Record<string, unknown> | undefined;
  const result = await requestStructuredAdvice(prepare('openai'), references, {
    apiKey: 'PRIVATE_API_KEY',
    transport: async (request) => {
      body = wireBody(request);
      return {
        status: 200,
        body: chatReply(
          'Here is the advice in the requested format:\n\n```json\n' +
            JSON.stringify(structuredOutputFixture(), null, 2) +
            '\n```\n\nLet me know if you want more detail.',
        ),
      };
    },
  });
  assert.deepEqual(body?.response_format, {
    type: 'json_schema',
    json_schema: { name: 'structured_advice', strict: true, schema: responseSchema },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) assert.deepEqual(result.value, structuredOutputFixture());
});

test('Anthropic request forces the advice tool and reads the tool_use block of the reply', async () => {
  let body: Record<string, unknown> | undefined;
  const result = await requestStructuredAdvice(prepare('anthropic'), references, {
    apiKey: 'PRIVATE_API_KEY',
    transport: async (request) => {
      body = wireBody(request);
      return {
        status: 200,
        body: JSON.stringify({
          id: 'msg_fixture',
          type: 'message',
          role: 'assistant',
          model: 'private-model',
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: 'I will submit the advice through the tool.' },
            {
              type: 'tool_use',
              id: 'toolu_fixture',
              name: 'structured_advice',
              input: structuredOutputFixture(),
            },
          ],
          usage: { input_tokens: 900, output_tokens: 300 },
        }),
      };
    },
  });
  assert.deepEqual(body?.tool_choice, { type: 'tool', name: 'structured_advice' });
  assert.deepEqual(body?.tools, [{ name: 'structured_advice', input_schema: responseSchema }]);
  assert.equal(body?.thinking, undefined);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) assert.deepEqual(result.value, structuredOutputFixture());
});

test('strict-schema output with a null stopCondition is accepted as an absent stop condition', async () => {
  const output = structuredOutputFixture() as { recommendations: AdviceRecommendation[] };
  (output.recommendations[0].conditionalActions[0] as unknown as Record<string, unknown>).stopCondition = null;
  const result = await requestStructuredAdvice(prepare('openai'), references, {
    apiKey: 'PRIVATE_API_KEY',
    transport: async () => ({ status: 200, body: chatReply(JSON.stringify(output)) }),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) {
    assert.equal('stopCondition' in result.value.recommendations[0].conditionalActions[0], false);
  }
});

test('an endpoint rejecting response_format with 400/422 gets exactly one retry without it', async () => {
  for (const status of [400, 422]) {
    const bodies: Record<string, unknown>[] = [];
    const result = await requestStructuredAdvice(prepare('openai'), references, {
      apiKey: 'PRIVATE_API_KEY',
      transport: async (request) => {
        bodies.push(wireBody(request));
        return bodies.length === 1
          ? { status, body: '{"error":{"message":"response_format is not supported"}}' }
          : { status: 200, body: chatReply(JSON.stringify(structuredOutputFixture())) };
      },
    });
    assert.equal(result.ok, true, `${status}: ${JSON.stringify(result)}`);
    assert.equal(bodies.length, 2);
    assert.ok(bodies[0].response_format);
    const { response_format: _omitted, ...withoutResponseFormat } = bodies[0];
    assert.deepEqual(bodies[1], withoutResponseFormat);
  }
  for (const status of [401, 429, 500]) {
    let calls = 0;
    const result = await requestStructuredAdvice(prepare('openai'), references, {
      apiKey: 'PRIVATE_API_KEY',
      transport: async () => {
        calls += 1;
        return { status, body: '{"error":"fixture"}' };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 1, `${status} must not be retried`);
  }
  let anthropicCalls = 0;
  await requestStructuredAdvice(prepare('anthropic'), references, {
    apiKey: 'PRIVATE_API_KEY',
    transport: async () => {
      anthropicCalls += 1;
      return { status: 400, body: '{"error":"fixture"}' };
    },
  });
  assert.equal(anthropicCalls, 1);
});
