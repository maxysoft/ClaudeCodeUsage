import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

import { requestViaCurl } from '../httpClient';
import { sendPreparedModelRequest } from '../advisor';
import { prepareAiInvocation } from '../adviceEffectiveness/preparedRequest';

const posixOnly = { skip: process.platform === 'win32', timeout: 20_000 };
const SECRET = 'sk-fake-test-key-0123456789';

interface FakeCurlRecord {
  argv: string[];
  config: string;
  pid: number;
  bodyPath?: string;
  bodyMode?: number;
  body?: string;
}

async function withFakeCurl<T>(
  options: { hang?: boolean },
  run: (ctx: { log: string; tmp: string; read: () => FakeCurlRecord | undefined }) => Promise<T>,
): Promise<T> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-fake-curl-test-'));
  const bin = path.join(root, 'bin');
  const tmp = path.join(root, 'tmp');
  fs.mkdirSync(bin);
  fs.mkdirSync(tmp);
  const log = path.join(root, 'curl-log.json');
  fs.writeFileSync(path.join(bin, 'curl'), [
    `#!${process.execPath}`,
    "const fs = require('fs');",
    'const chunks = [];',
    "process.stdin.on('data', (c) => chunks.push(c));",
    "process.stdin.on('end', () => {",
    "  const config = Buffer.concat(chunks).toString('utf8');",
    "  const line = config.split('\\n').find((item) => item.startsWith('data-binary = '));",
    "  const record = { argv: process.argv.slice(2), config, pid: process.pid };",
    '  if (line) {',
    "    record.bodyPath = JSON.parse(line.slice('data-binary = '.length)).slice(1);",
    '    record.bodyMode = fs.statSync(record.bodyPath).mode & 0o777;',
    "    record.body = fs.readFileSync(record.bodyPath, 'utf8');",
    '  }',
    '  fs.writeFileSync(process.env.FAKE_CURL_LOG, JSON.stringify(record));',
    '  if (process.env.FAKE_CURL_HANG) { setTimeout(() => {}, 8000); return; }',
    "  process.stdout.write('{\"ok\":true}\\n__CCU_STATUS__200');",
    '});',
    '',
  ].join('\n'), { mode: 0o755 });
  const saved = {
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    FAKE_CURL_LOG: process.env.FAKE_CURL_LOG,
    FAKE_CURL_HANG: process.env.FAKE_CURL_HANG,
  };
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ''}`;
  process.env.TMPDIR = tmp;
  process.env.FAKE_CURL_LOG = log;
  if (options.hang) process.env.FAKE_CURL_HANG = '1';
  else delete process.env.FAKE_CURL_HANG;
  try {
    return await run({
      log,
      tmp,
      read: () => (fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : undefined),
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 250 && !check(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(check(), 'condition was not reached in time');
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('curl receives headers and body through a stdin config, never on argv', posixOnly, async () => {
  await withFakeCurl({}, async ({ read, tmp }) => {
    const response = await requestViaCurl('https://api.example.invalid/v1/usage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SECRET}`,
        'x-quoted': 'a "quoted" \\ value',
      },
      body: '{"refresh_token":"fake-refresh"}',
    });
    assert.deepEqual(response, { status: 200, body: '{"ok":true}' });
    const record = read();
    assert.ok(record);
    assert.equal(record.argv[0], '-q', '-q must be the first argument or .curlrc is read');
    assert.deepEqual(record.argv.slice(1, 3), ['-K', '-']);
    assert.ok(record.argv.includes('--max-redirs'));
    assert.equal(record.argv[record.argv.indexOf('--max-redirs') + 1], '0');
    assert.doesNotMatch(record.argv.join(' '), /fake-test-key|fake-refresh|Bearer/);
    assert.match(record.config, new RegExp(`^header = "Authorization: Bearer ${SECRET}"$`, 'm'));
    assert.match(record.config, /^header = "x-quoted: a \\"quoted\\" \\\\ value"$/m);
    assert.equal(record.body, '{"refresh_token":"fake-refresh"}');
    assert.equal(record.bodyMode, 0o600);
    assert.ok(record.bodyPath && record.bodyPath.startsWith(tmp));
    assert.deepEqual(fs.readdirSync(tmp), [], 'the body temp dir must be removed');
  });
});

test('curl config rejects CR/LF in header names or values before spawning', posixOnly, async () => {
  await withFakeCurl({}, async ({ read, tmp }) => {
    for (const headers of [
      { Authorization: `Bearer ${SECRET}\nurl = "https://evil.example.invalid"` } as Record<string, string>,
      { 'x-evil\r\nheader': 'value' },
    ]) {
      await assert.rejects(
        requestViaCurl('https://api.example.invalid/v1/usage', { headers, body: 'x' }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.doesNotMatch(error.message, /fake-test-key/);
          return true;
        },
      );
    }
    assert.equal(read(), undefined, 'curl must not be spawned');
    assert.deepEqual(fs.readdirSync(tmp), []);
  });
});

test('abort kills the curl child and deletes the body temp file', posixOnly, async () => {
  await withFakeCurl({ hang: true }, async ({ read, tmp }) => {
    const controller = new AbortController();
    const pending = requestViaCurl('https://api.example.invalid/v1/usage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}` },
      body: 'secret-body',
      signal: controller.signal,
    });
    await waitFor(() => read() !== undefined);
    controller.abort();
    await assert.rejects(pending, /cancelled/);
    assert.equal(processAlive(read()!.pid), false);
    assert.deepEqual(fs.readdirSync(tmp), []);
  });
});

test('a hung curl child is killed after its timeout', posixOnly, async () => {
  await withFakeCurl({ hang: true }, async ({ read, tmp }) => {
    await assert.rejects(
      requestViaCurl('https://api.example.invalid/v1/usage', {
        headers: { Authorization: `Bearer ${SECRET}` },
        body: 'secret-body',
        timeoutSec: 1,
      }),
      /timed out/,
    );
    assert.equal(processAlive(read()!.pid), false);
    assert.deepEqual(fs.readdirSync(tmp), []);
  });
});

test('a curl spawn error still deletes the body temp file', posixOnly, async () => {
  await withFakeCurl({}, async ({ tmp }) => {
    const savedPath = process.env.PATH;
    process.env.PATH = path.join(tmp, 'missing-bin');
    try {
      await assert.rejects(requestViaCurl('https://api.example.invalid/v1/usage', { body: 'secret-body' }));
    } finally {
      process.env.PATH = savedPath;
    }
    assert.deepEqual(fs.readdirSync(tmp), []);
  });
});

const realCurl = process.platform !== 'win32' && spawnSync('curl', ['--version']).status === 0;

test('the stdin config is understood by the real curl binary', { skip: !realCurl, timeout: 20_000 }, async () => {
  const seen: { auth?: string; body?: string; method?: string } = {};
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      seen.auth = req.headers.authorization;
      seen.method = req.method;
      seen.body = Buffer.concat(chunks).toString('utf8');
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as { port: number };
    const response = await requestViaCurl(`http://127.0.0.1:${port}/v1/usage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: '{"a":"b \\" c"}',
    });
    assert.deepEqual(response, { status: 200, body: '{"ok":true}' });
    assert.deepEqual(seen, { auth: `Bearer ${SECRET}`, method: 'POST', body: '{"a":"b \\" c"}' });
  } finally {
    server.close();
  }
});

function optimizerInvocation(timeoutMs?: number) {
  return prepareAiInvocation({
    kind: 'optimizer',
    apiFormat: 'openai',
    apiUrl: 'https://proxy.example.invalid/v1',
    model: 'fixture-model',
    systemPrompt: 'Rewrite the draft.',
    userContent: 'draft',
    dataMode: 'user-draft-only',
    sourceRevision: 'draft-1',
    consentGeneration: 1,
    createdAtEpochMs: 1_000,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

type FetchCall = { url: string; init: { redirect?: string; signal?: AbortSignal } };

async function withFetch<T>(
  impl: (call: FetchCall, index: number) => Promise<unknown>,
  run: (calls: FetchCall[]) => Promise<T>,
): Promise<T> {
  const g = globalThis as unknown as { fetch: unknown };
  const original = g.fetch;
  const calls: FetchCall[] = [];
  g.fetch = (url: string, init: FetchCall['init']) => {
    const call = { url, init };
    calls.push(call);
    return impl(call, calls.length - 1);
  };
  try {
    return await run(calls);
  } finally {
    g.fetch = original;
  }
}

const okReply = {
  status: 200,
  text: async () => JSON.stringify({ choices: [{ message: { content: 'rewritten' } }] }),
};

function fetchFailure(message: string, code?: string): Error {
  return Object.assign(new TypeError(message), code ? { cause: Object.assign(new Error(code), { code }) } : {});
}

test('BYOK send retries a connect-phase failure once, without redirects', posixOnly, async () => {
  await withFakeCurl({}, async ({ read }) => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT']) {
      await withFetch(
        async (_call, index) => {
          if (index === 0) throw fetchFailure('fetch failed', code);
          return okReply;
        },
        async (calls) => {
          assert.equal(await sendPreparedModelRequest(optimizerInvocation(), SECRET), 'rewritten');
          assert.equal(calls.length, 2, code);
          assert.deepEqual(calls.map((call) => call.init.redirect), ['error', 'error']);
        },
      );
    }
    assert.equal(read(), undefined, 'BYOK sends never use curl');
  });
});

test('BYOK send never retries or falls back to curl after the request may have reached the model', posixOnly, async () => {
  await withFakeCurl({}, async ({ read }) => {
    for (const failure of [
      fetchFailure('terminated', 'UND_ERR_SOCKET'),
      fetchFailure('fetch failed', 'ECONNRESET'),
      fetchFailure('fetch failed'),
    ]) {
      await withFetch(
        async () => {
          throw failure;
        },
        async (calls) => {
          await assert.rejects(sendPreparedModelRequest(optimizerInvocation(), SECRET));
          assert.equal(calls.length, 1, failure.message);
        },
      );
    }
    await withFetch(
      (call) =>
        new Promise((_resolve, reject) => {
          call.init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
      async (calls) => {
        await assert.rejects(sendPreparedModelRequest(optimizerInvocation(1_000), SECRET), /timed out/);
        assert.equal(calls.length, 1);
      },
    );
    await withFetch(
      async () => ({ status: 403, text: async () => '{"error":"Request not allowed"}' }),
      async (calls) => {
        await assert.rejects(sendPreparedModelRequest(optimizerInvocation(), SECRET), /API 403/);
        assert.equal(calls.length, 1);
      },
    );
    assert.equal(read(), undefined, 'BYOK sends never use curl');
  });
});
