import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  prepareAiInvocation,
  previewAiInvocation,
  sendPreparedAiInvocation,
} from '../adviceEffectiveness/preparedRequest';
import type { PrepareAiInvocationInput } from '../adviceEffectiveness/preparedRequest';

function invocationInput(overrides: Partial<PrepareAiInvocationInput> = {}): PrepareAiInvocationInput {
  return {
    kind: 'advice',
    apiFormat: 'openai',
    apiUrl: 'https://proxy.example.invalid/v1',
    model: 'fixture-model',
    systemPrompt: 'Return strict JSON only.',
    userContent: '{}',
    dataMode: 'aggregates-only',
    sourceRevision: 'destination-regression',
    consentGeneration: 1,
    createdAtEpochMs: 1_000,
    ...overrides,
  };
}

test('Anthropic format rejects the configured DeepSeek destination instead of switching hosts', () => {
  assert.throws(() => prepareAiInvocation(invocationInput({
    apiFormat: 'anthropic',
    apiUrl: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
  })), /incompatible/i);
});

test('protocol paths normalize without changing the configured host or proxy prefix', async (t) => {
  const cases = [
    ['anthropic', 'https://api.anthropic.com', 'https://api.anthropic.com/v1/messages'],
    ['anthropic', 'https://api.anthropic.com/v1', 'https://api.anthropic.com/v1/messages'],
    ['anthropic', 'https://api.anthropic.com/v1/messages/', 'https://api.anthropic.com/v1/messages'],
    ['anthropic', 'https://proxy.example.invalid/base', 'https://proxy.example.invalid/base/v1/messages'],
    ['anthropic', 'https://proxy.example.invalid/base/v1/', 'https://proxy.example.invalid/base/v1/messages'],
    ['anthropic', 'https://proxy.example.invalid/base/messages', 'https://proxy.example.invalid/base/messages'],
    ['anthropic', 'http://127.0.0.1:8080/base/v1/messages', 'http://127.0.0.1:8080/base/v1/messages'],
    ['openai', 'https://api.deepseek.com', 'https://api.deepseek.com/chat/completions'],
    ['openai', 'https://api.deepseek.com/v1', 'https://api.deepseek.com/v1/chat/completions'],
    ['openai', 'https://api.openai.com/v1/', 'https://api.openai.com/v1/chat/completions'],
    ['openai', 'https://proxy.example.invalid/base/v1/chat/completions/', 'https://proxy.example.invalid/base/v1/chat/completions'],
    ['openai', 'http://localhost:8080/base/v1', 'http://localhost:8080/base/v1/chat/completions'],
    ['anthropic', 'https://api.deepseek.com.proxy.invalid/v1', 'https://api.deepseek.com.proxy.invalid/v1/messages'],
  ] as const;
  for (const [apiFormat, apiUrl, endpoint] of cases) {
    await t.test(`${apiFormat}: ${apiUrl}`, () => {
      const prepared = prepareAiInvocation(invocationInput({ apiFormat, apiUrl }));
      assert.equal(prepared.endpoint, endpoint);
      assert.equal(new URL(prepared.endpoint).hostname, new URL(apiUrl).hostname);
    });
  }
});

test('incompatible Messages and Chat Completions paths fail before a request is prepared', () => {
  for (const apiUrl of [
    'https://proxy.example.invalid/chat/completions',
    'https://proxy.example.invalid/base/v1/chat/completions/',
  ]) {
    assert.throws(() => prepareAiInvocation(invocationInput({ apiFormat: 'anthropic', apiUrl })), /incompatible/i);
  }
  for (const apiUrl of [
    'https://proxy.example.invalid/messages',
    'https://proxy.example.invalid/base/v1/messages/',
  ]) {
    assert.throws(() => prepareAiInvocation(invocationInput({ apiFormat: 'openai', apiUrl })), /incompatible/i);
  }
});

test('known direct provider hosts reject the incompatible wire format even for base URLs', () => {
  for (const apiUrl of ['https://api.deepseek.com', 'https://api.openai.com/v1', 'https://API.DEEPSEEK.COM:443/v1']) {
    assert.throws(() => prepareAiInvocation(invocationInput({ apiFormat: 'anthropic', apiUrl })), /incompatible/i);
  }
  assert.throws(() => prepareAiInvocation(invocationInput({
    apiFormat: 'openai',
    apiUrl: 'https://api.anthropic.com/v1',
  })), /incompatible/i);
});

test('DeepSeek Anthropic compatibility uses its explicit prefix without rerouting to Anthropic', () => {
  const prepared = prepareAiInvocation(invocationInput({
    apiFormat: 'anthropic', apiUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-flash',
  }));
  assert.equal(prepared.endpoint, 'https://api.deepseek.com/anthropic/v1/messages');
  assert.throws(() => prepareAiInvocation(invocationInput({
    apiFormat: 'openai', apiUrl: 'https://api.deepseek.com/anthropic',
  })), /incompatible/i);
});

test('invalid or secret-bearing endpoint URLs are rejected without reflecting endpoint secrets', () => {
  for (const apiUrl of [
    '',
    '   ',
    '//proxy.example.invalid/v1',
    'file:///tmp/endpoint',
    'ftp://proxy.example.invalid/v1',
    'https://[',
    'https://URL_USER_SECRET:URL_PASSWORD_SECRET@proxy.example.invalid/v1',
    'https://proxy.example.invalid/v1?api_key=URL_QUERY_SECRET',
    'https://proxy.example.invalid/v1?token=URL_QUERY_SECRET',
    // No query parameters are previewed: arbitrary proxy keys can also be secrets.
    'https://proxy.example.invalid/v1?custom=URL_QUERY_SECRET',
    'https://proxy.example.invalid/v1#URL_FRAGMENT_SECRET',
    'https://proxy.exam\nple.invalid/v1',
  ]) {
    assert.throws(() => prepareAiInvocation(invocationInput({ apiUrl })), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /endpoint|URL/i);
      assert.doesNotMatch(error.message, /URL_(?:USER|PASSWORD|QUERY|FRAGMENT)_SECRET/);
      return true;
    });
  }
});

test('preview discloses the exact endpoint, API format, and model used by the sender', async () => {
  const prepared = prepareAiInvocation(invocationInput({ model: '  fixture-model  ' }));
  const preview = previewAiInvocation(prepared);
  const wireBody = JSON.parse(preview.body);

  assert.equal(preview.endpoint, 'https://proxy.example.invalid/v1/chat/completions');
  assert.equal(preview.endpoint, prepared.endpoint);
  assert.equal(preview.apiFormat, prepared.apiFormat);
  assert.equal(preview.model, prepared.model);
  assert.equal(preview.model, wireBody.model);
  assert.equal(wireBody.model, 'fixture-model');
  assert.doesNotMatch(JSON.stringify(preview), /fixture-byok-key/);

  await sendPreparedAiInvocation(prepared, { backend: 'api', apiKey: 'fixture-byok-key' }, async (request) => {
    assert.equal(request.endpoint, preview.endpoint);
    assert.equal(request.apiFormat, preview.apiFormat);
    assert.equal(JSON.parse(Buffer.from(request.canonicalBytes).toString('utf8')).model, preview.model);
    assert.strictEqual(request.canonicalBytes, prepared.canonicalBytes);
    assert.equal(Buffer.from(request.canonicalBytes).toString('utf8'), preview.body);
    return 'fixture-response';
  });
});

test('preview and send reject endpoint, API format, or model tampering without a transport call', async () => {
  let calls = 0;
  for (const [field, value] of [
    ['endpoint', 'https://changed.example.invalid/v1/chat/completions'],
    ['apiFormat', 'anthropic'],
    ['model', 'changed-model'],
  ] as const) {
    const prepared = prepareAiInvocation(invocationInput());
    previewAiInvocation(prepared);
    (prepared as unknown as Record<string, unknown>)[field] = value;
    assert.throws(() => previewAiInvocation(prepared), /integrity/);
    await assert.rejects(sendPreparedAiInvocation(prepared, { backend: 'api', apiKey: 'fixture-byok-key' }, async () => {
      calls += 1;
      return 'unexpected';
    }), /integrity/);
  }
  assert.equal(calls, 0);
});

test('a caller cannot reseal a changed model and wire body using the public body hash', async () => {
  const prepared = prepareAiInvocation(invocationInput());
  previewAiInvocation(prepared);
  const body = JSON.parse(prepared.serializedBody);
  body.model = 'changed-model';
  const serializedBody = JSON.stringify(body);
  const canonicalBytes = Buffer.from(serializedBody, 'utf8');
  Object.assign(prepared, {
    model: body.model,
    serializedBody,
    canonicalBytes,
    sha256: createHash('sha256').update(canonicalBytes).digest('hex'),
  });
  assert.throws(() => previewAiInvocation(prepared), /integrity/);
  await assert.rejects(sendPreparedAiInvocation(prepared, { backend: 'api', apiKey: 'fixture-byok-key' }, async () => {
    assert.fail('tampered invocation reached transport');
  }), /integrity/);
});

test('metadata mutation while transport is pending cannot silently change the response protocol', async () => {
  const prepared = prepareAiInvocation(invocationInput());
  previewAiInvocation(prepared);
  await assert.rejects(sendPreparedAiInvocation(prepared, { backend: 'api', apiKey: 'fixture-byok-key' }, async () => {
    (prepared as unknown as { apiFormat: string }).apiFormat = 'anthropic';
    return 'fixture-response';
  }), /integrity/);
});

test('accessor replacement cannot bypass the endpoint metadata seal', async () => {
  const prepared = prepareAiInvocation(invocationInput());
  const originalEndpoint = prepared.endpoint;
  let reads = 0;
  Object.defineProperty(prepared, 'endpoint', {
    get: () => reads++ === 0 ? originalEndpoint : 'https://changed.example.invalid/v1/chat/completions',
  });
  assert.throws(() => previewAiInvocation(prepared), /integrity/);
  await assert.rejects(sendPreparedAiInvocation(prepared, { backend: 'api', apiKey: 'fixture-byok-key' }, async () => {
    assert.fail('accessor-tampered invocation reached transport');
  }), /integrity/);
});

test('metadata mutation during authorization fails before transport dispatch', async () => {
  const prepared = prepareAiInvocation(invocationInput());
  previewAiInvocation(prepared);
  let calls = 0;
  await assert.rejects(sendPreparedAiInvocation(prepared, {
    backend: 'api',
    get apiKey() {
      (prepared as unknown as { endpoint: string }).endpoint = 'https://changed.example.invalid/v1/chat/completions';
      return 'fixture-byok-key';
    },
  }, async () => {
    calls += 1;
    return 'fixture-response';
  }), /integrity/);
  assert.equal(calls, 0, 'integrity must be checked again before transport, not only after sending');
});

test('Anthropic preview and sender consume the exact same canonical HTTP bytes', async () => {
  const prepared = prepareAiInvocation({
    kind: 'advice',
    apiFormat: 'anthropic',
    apiUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    systemPrompt: 'Return strict JSON only.',
    userContent: '{"evidence":"aggregate-only"}',
    dataMode: 'aggregates-only',
    sourceRevision: 'rev-42',
    consentGeneration: 3,
    createdAtEpochMs: 1_000,
  });
  const preview = previewAiInvocation(prepared);
  let networkCalls = 0;
  let sentBytes: Uint8Array | undefined;

  assert.equal(networkCalls, 0, 'preparing and previewing must not send');
  const result = await sendPreparedAiInvocation(
    prepared,
    { backend: 'api', apiKey: 'byok-secret' },
    async (request) => {
      networkCalls += 1;
      sentBytes = request.canonicalBytes;
      assert.equal(request.headers['x-api-key'], 'byok-secret');
      assert.equal(Object.values(request.headers).some((value) => preview.body.includes(value)), false);
      return 'ok';
    },
  );

  assert.equal(result, 'ok');
  assert.equal(networkCalls, 1);
  assert.strictEqual(sentBytes, prepared.canonicalBytes);
  assert.equal(Buffer.from(sentBytes!).toString('utf8'), preview.body);
  assert.equal(preview.utf8Bytes, prepared.canonicalBytes.byteLength);
  assert.match(preview.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(preview.body), {
    max_tokens: 16_000,
    messages: [{ content: '{"evidence":"aggregate-only"}', role: 'user' }],
    model: 'claude-sonnet-4-5',
    system: 'Return strict JSON only.',
  });
});

test('OpenAI-compatible optimizer uses the same boundary without advice parser fallback', async () => {
  const prepared = prepareAiInvocation({
    kind: 'optimizer',
    apiFormat: 'openai',
    apiUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    reasoningEffort: 'high',
    systemPrompt: 'Use the optimizer markers exactly.',
    userContent: 'User pasted draft only',
    dataMode: 'user-draft-only',
    sourceRevision: 'optimizer-draft-1',
    consentGeneration: 1,
    createdAtEpochMs: 2_000,
  });
  const preview = previewAiInvocation(prepared);
  const body = JSON.parse(preview.body);

  assert.equal(prepared.endpoint, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(body.messages[1].content, 'User pasted draft only');
  assert.equal(body.reasoning_effort, 'high');
  assert.equal(body.thinking, undefined);
  assert.equal(JSON.stringify(body).includes('byok-secret'), false);
});

test('OpenAI reasoning effort never emits the unsupported top-level thinking parameter', () => {
  const prepared = prepareAiInvocation({
    kind: 'optimizer',
    apiFormat: 'openai',
    apiUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'max',
    systemPrompt: 'Return the requested optimizer payload.',
    userContent: 'Draft request',
    dataMode: 'user-draft-only',
    sourceRevision: 'issue-94',
    consentGeneration: 1,
    createdAtEpochMs: 2_500,
  });
  const body = JSON.parse(previewAiInvocation(prepared).body);

  assert.equal(prepared.endpoint, 'https://api.openai.com/v1/chat/completions');
  assert.equal(body.reasoning_effort, 'max');
  assert.equal(body.thinking, undefined);
});

test('prepared request fails closed for subscription OAuth, missing BYOK, stale state, or tampering', async () => {
  const prepared = prepareAiInvocation({
    kind: 'advice',
    apiFormat: 'openai',
    apiUrl: 'https://example.invalid/v1',
    model: 'safe-model',
    systemPrompt: 'strict',
    userContent: '{}',
    dataMode: 'aggregates-only',
    sourceRevision: 'rev-safe',
    consentGeneration: 7,
    createdAtEpochMs: 10_000,
  });
  let calls = 0;
  const sender = async (): Promise<string> => {
    calls += 1;
    return 'unexpected';
  };

  await assert.rejects(
    sendPreparedAiInvocation(prepared, { backend: 'subscription', apiKey: 'x' } as never, sender),
    /BYOK API/,
  );
  await assert.rejects(
    sendPreparedAiInvocation(prepared, { backend: 'api', apiKey: '  ' }, sender),
    /API key/,
  );
  await assert.rejects(
    sendPreparedAiInvocation(
      prepared,
      { backend: 'api', apiKey: 'x', expectedSourceRevision: 'different' },
      sender,
    ),
    /stale/,
  );
  await assert.rejects(
    sendPreparedAiInvocation(
      prepared,
      { backend: 'api', apiKey: 'x', expectedConsentGeneration: 8 },
      sender,
    ),
    /stale/,
  );

  const mutated = prepared as unknown as { serializedBody: string };
  mutated.serializedBody = '{"changed":true}';
  await assert.rejects(
    sendPreparedAiInvocation(prepared, { backend: 'api', apiKey: 'x' }, sender),
    /integrity/,
  );
  assert.equal(calls, 0);
});

test('plain HTTP endpoints are accepted only for loopback hosts', () => {
  for (const apiUrl of [
    'http://localhost:8080/v1',
    'http://LOCALHOST/v1',
    'http://127.0.0.1/v1',
    'http://127.9.8.7:1234',
    'http://[::1]:8080/v1',
  ]) {
    assert.doesNotThrow(() => prepareAiInvocation(invocationInput({ apiUrl })), apiUrl);
  }
  for (const apiUrl of [
    'http://proxy.example.invalid/v1',
    'http://localhost.evil.example/v1',
    'http://127.0.0.1.evil.example/v1',
    'http://127.0.0.1@evil.example/v1',
    'http://10.0.0.1/v1',
    'http://0.0.0.0/v1',
    'http://[::2]/v1',
  ]) {
    assert.throws(() => prepareAiInvocation(invocationInput({ apiUrl })), /HTTPS|credentials/, apiUrl);
  }
});

const fixtureResponseSchema = {
  name: 'submit_fixture',
  schema: {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  },
};

function withResponseSchema(overrides: Partial<PrepareAiInvocationInput>): PrepareAiInvocationInput {
  return { ...invocationInput(overrides), responseSchema: fixtureResponseSchema } as unknown as PrepareAiInvocationInput;
}

test('Anthropic structured output forces one tool whose input_schema is the response schema', () => {
  const body = JSON.parse(previewAiInvocation(prepareAiInvocation(withResponseSchema({
    apiFormat: 'anthropic',
    apiUrl: 'https://api.anthropic.com',
  }))).body);
  assert.deepEqual(body.tools, [{ name: 'submit_fixture', input_schema: fixtureResponseSchema.schema }]);
  assert.deepEqual(body.tool_choice, { type: 'tool', name: 'submit_fixture' });
  assert.equal(body.thinking, undefined);
  assert.equal(body.response_format, undefined);
});

test('OpenAI-compatible structured output uses a strict json_schema response_format', () => {
  const body = JSON.parse(previewAiInvocation(prepareAiInvocation(withResponseSchema({}))).body);
  assert.deepEqual(body.response_format, {
    type: 'json_schema',
    json_schema: { name: 'submit_fixture', strict: true, schema: fixtureResponseSchema.schema },
  });
  assert.equal(body.tools, undefined);
});

test('the preview shows the schema-less fallback body and hash only when a fallback exists', () => {
  const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
  const preview = previewAiInvocation(prepareAiInvocation(withResponseSchema({}))) as any;
  assert.ok(preview.fallbackBody, 'fallback body previewed');
  assert.equal(JSON.parse(preview.fallbackBody).response_format, undefined);
  assert.equal(preview.fallbackSha256, sha(preview.fallbackBody));
  assert.equal(preview.fallbackUtf8Bytes, Buffer.byteLength(preview.fallbackBody, 'utf8'));
  const plain = previewAiInvocation(prepareAiInvocation(invocationInput())) as any;
  assert.equal(plain.fallbackBody, undefined);
  const anthropic = previewAiInvocation(prepareAiInvocation(withResponseSchema({
    apiFormat: 'anthropic',
    apiUrl: 'https://api.anthropic.com',
  }))) as any;
  assert.equal(anthropic.fallbackBody, undefined);
});

test('the fallback resend carries exactly the previewed fallback bytes and is integrity checked', async () => {
  const prepared = prepareAiInvocation(withResponseSchema({}));
  const preview = previewAiInvocation(prepared) as any;
  let sent: Uint8Array | undefined;
  await sendPreparedAiInvocation(prepared, { backend: 'api', apiKey: 'k' }, async (request) => {
    sent = request.fallbackCanonicalBytes;
  });
  assert.equal(Buffer.from(sent!).toString('utf8'), preview.fallbackBody);
  assert.equal(createHash('sha256').update(sent!).digest('hex'), preview.fallbackSha256);
  (prepared as any).fallbackCanonicalBytes[0] ^= 1;
  await assert.rejects(
    sendPreparedAiInvocation(prepared, { backend: 'api', apiKey: 'k' }, async () => undefined),
    /integrity/,
  );
});
