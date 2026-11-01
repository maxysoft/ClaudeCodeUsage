import { after, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type ApiModule = typeof import('../claudeApiClient');

function loadApiModule(): ApiModule {
  const moduleLoader = require('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  const vscodeStub: any = new Proxy(function () {}, {
    get: (_target, property) => property === 'then' ? undefined : vscodeStub,
    apply: () => vscodeStub,
    construct: () => vscodeStub,
  });
  moduleLoader._load = function (request, parent, isMain): unknown {
    if (request === 'vscode') return vscodeStub;
    return Reflect.apply(originalLoad, this, [request, parent, isMain]);
  };
  try {
    return require('../claudeApiClient') as ApiModule;
  } finally {
    moduleLoader._load = originalLoad;
  }
}

const {
  ClaudeApiClient,
  claudeQuotaIdentitySignal,
  resolveClaudeProfile,
} = loadApiModule();
const tempRoots: string[] = [];

after(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit dataDirectory wins over CLAUDE_CONFIG_DIR', () => {
  const resolved = resolveClaudeProfile(
    '/profiles/explicit',
    { CLAUDE_CONFIG_DIR: '/profiles/environment' },
    '/users/test',
    () => true,
  );
  assert.equal(resolved.configDirectory, path.resolve('/profiles/explicit'));
  assert.equal(resolved.source, 'explicit');
  assert.equal(resolved.allowKeychainFallback, false);
});

test('the first valid CLAUDE_CONFIG_DIR entry wins before the default profile', () => {
  const valid = path.resolve('/profiles/valid');
  const resolved = resolveClaudeProfile(
    '',
    { CLAUDE_CONFIG_DIR: `/profiles/missing, ${valid}, /profiles/later` },
    '/users/test',
    (candidate) => candidate === valid,
  );
  assert.equal(resolved.configDirectory, valid);
  assert.equal(resolved.source, 'environment');
  assert.equal(resolved.allowKeychainFallback, false);
});

test('the default profile retains the macOS Keychain fallback', () => {
  const resolved = resolveClaudeProfile('', {}, '/users/test', () => false);
  assert.equal(resolved.configDirectory, path.resolve('/users/test/.claude'));
  assert.equal(resolved.source, 'default');
  assert.equal(resolved.allowKeychainFallback, true);
});

test('quota identity follows refresh-token continuity without exposing the token', () => {
  const first = claudeQuotaIdentitySignal('machine-salt', 'refresh-token-a');
  const repeated = claudeQuotaIdentitySignal('machine-salt', 'refresh-token-a');
  const rotated = claudeQuotaIdentitySignal('machine-salt', 'refresh-token-b');

  assert.equal(first, repeated);
  assert.notEqual(first, rotated);
  assert.equal(first.includes('refresh-token-a'), false);
});

test('successful quota fetch records only the safe account continuity signal', async () => {
  const client = new ClaudeApiClient(null, undefined, 'machine-salt') as any;
  client.getValidCredentials = async () => ({
    claudeAiOauth: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
    },
  });
  client.callUsageApi = async () => ({
    status: 200,
    body: JSON.stringify({
      seven_day: {
        utilization: 25,
        resets_at: '2026-09-07T03:24:00.000Z',
      },
    }),
  });

  assert.ok(await client.fetchUsageLimits());
  assert.equal(
    client.getLastQuotaIdentitySignal(),
    claudeQuotaIdentitySignal('machine-salt', 'refresh-token'),
  );
  assert.equal(client.getLastQuotaIdentitySignal().includes('refresh-token'), false);
});

test('a custom profile without a credentials file never falls back to Keychain', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-profile-'));
  tempRoots.push(profile);
  const client = new ClaudeApiClient(null, profile) as any;
  let keychainReads = 0;
  client.loadCredentialsFromKeychain = () => {
    keychainReads += 1;
    return {
      claudeAiOauth: { accessToken: 'wrong-account', refreshToken: 'wrong', expiresAt: Date.now() + 60_000 },
    };
  };

  assert.equal(await client.getValidCredentials(), null);
  assert.equal(keychainReads, 0);
});

test('expired credentials are never refreshed or written; a Claude Code refresh is picked up', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-profile-expired-'));
  tempRoots.push(profile);
  const credentialsPath = path.join(profile, '.credentials.json');
  const expired = JSON.stringify({
    claudeAiOauth: { accessToken: 'expired-access', refreshToken: 'fixture-refresh', expiresAt: Date.now() - 1_000 },
  });
  fs.writeFileSync(credentialsPath, expired);
  const client = new ClaudeApiClient(null, profile) as any;
  const loadCredentials = client.loadCredentials.bind(client);
  let reads = 0;
  client.loadCredentials = () => { reads += 1; return loadCredentials(); };
  const requests: string[] = [];
  client.request = async (url: string) => {
    requests.push(url);
    return { status: 200, body: '{}' };
  };

  assert.equal(await client.fetchUsageLimits(), null);
  assert.equal(requests.length, 0, requests.join(','));
  assert.equal(reads, 1, 'one credential read per fetch');
  assert.equal(fs.readFileSync(credentialsPath, 'utf8'), expired);

  const refreshedByClaudeCode = JSON.stringify({
    claudeAiOauth: { accessToken: 'fresh-access', refreshToken: 'fixture-refresh-2', expiresAt: Date.now() + 3_600_000 },
  });
  fs.writeFileSync(credentialsPath, refreshedByClaudeCode);
  client.request = async (_url: string, opts: { headers: Record<string, string> }) => {
    requests.push(opts.headers.Authorization);
    return { status: 200, body: JSON.stringify({ five_hour: { utilization: 5, resets_at: null } }) };
  };
  assert.ok(await client.fetchUsageLimits());
  assert.deepEqual(requests, ['Bearer fresh-access']);
  assert.equal(fs.readFileSync(credentialsPath, 'utf8'), refreshedByClaudeCode);
});

test('a 401 quota response is not retried with a token refresh', async () => {
  const client = new ClaudeApiClient(null) as any;
  client.getValidCredentials = async () => ({
    claudeAiOauth: { accessToken: 'revoked-access', refreshToken: 'fixture-refresh', expiresAt: Date.now() + 60_000 },
  });
  let requests = 0;
  client.request = async () => {
    requests += 1;
    return { status: 401, body: '' };
  };

  assert.equal(await client.fetchUsageLimits(), null);
  assert.equal(requests, 1);
});

test('the fetch transport carries a 15 second timeout', async () => {
  const http = require('../httpClient') as { requestViaFetch: (...args: unknown[]) => Promise<unknown> };
  const realFetch = http.requestViaFetch;
  let timeoutMs: unknown;
  http.requestViaFetch = async (_url: unknown, opts: unknown) => {
    timeoutMs = (opts as { timeoutMs?: number }).timeoutMs;
    return { status: 200, body: '{}' };
  };
  try {
    await (new ClaudeApiClient(null) as any).request('https://example.invalid/', { method: 'GET' });
  } finally {
    http.requestViaFetch = realFetch;
  }
  assert.equal(timeoutMs, 15_000);
});

async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
}

test('Keychain credentials are read asynchronously and overlapping reads share one process', async () => {
  const childProcess = require('child_process');
  const realExecFile = childProcess.execFile;
  const realExecFileSync = childProcess.execFileSync;
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-keychain-'));
  tempRoots.push(profile);
  let reads = 0;
  let finish: (() => void) | undefined;
  childProcess.execFileSync = () => assert.fail('a Keychain read must not block the extension host');
  childProcess.execFile = (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string) => void) => {
    reads += 1;
    finish = () => callback(null, JSON.stringify({
      claudeAiOauth: { accessToken: 'keychain-access', refreshToken: 'fixture-refresh', expiresAt: Date.now() + 3_600_000 },
    }));
  };
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  try {
    const client = new ClaudeApiClient(null, profile) as any;
    client.credentialsPath = path.join(profile, 'missing', '.credentials.json');
    client.allowKeychainFallback = true;
    const first = client.loadCredentials();
    const second = client.loadCredentials();
    await until(() => reads >= 1);
    assert.equal(reads, 1);
    finish?.();
    assert.equal((await first)?.claudeAiOauth.accessToken, 'keychain-access');
    assert.equal((await second)?.claudeAiOauth.accessToken, 'keychain-access');
    const third = client.loadCredentials();
    await until(() => reads >= 2);
    assert.equal(reads, 2, 'a settled read is not cached forever');
    finish?.();
    await third;
  } finally {
    Object.defineProperty(process, 'platform', platform);
    childProcess.execFile = realExecFile;
    childProcess.execFileSync = realExecFileSync;
  }
});

test('quota fetch forwards caller cancellation through the active request', async () => {
  const client = new ClaudeApiClient(null) as any;
  const controller = new AbortController();
  let observedSignal: AbortSignal | undefined;
  client.getValidCredentials = async () => ({
    claudeAiOauth: {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 60_000,
    },
  });
  client.callUsageApi = (_token: string, signal?: AbortSignal) =>
    new Promise((_resolve, reject) => {
      observedSignal = signal;
      signal?.addEventListener(
        'abort',
        () => reject(new Error('Request cancelled')),
        { once: true },
      );
    });

  const pending = client.fetchUsageLimits(controller.signal);
  await Promise.resolve();
  controller.abort();

  assert.equal(await pending, null);
  assert.strictEqual(observedSignal, controller.signal);
  assert.equal(observedSignal?.aborted, true);
});

test('an expired or missing credential is reported as unavailable, not as a quota failure', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-profile-unavailable-'));
  tempRoots.push(profile);
  const credentialsPath = path.join(profile, '.credentials.json');
  const write = (expiresAt: number) => fs.writeFileSync(credentialsPath, JSON.stringify({
    claudeAiOauth: { accessToken: 'a', refreshToken: 'r', expiresAt },
  }));
  const client = new ClaudeApiClient(null, profile) as any;
  let requests = 0;
  client.callUsageApi = async () => {
    requests += 1;
    return { status: 200, body: JSON.stringify({ seven_day: { utilization: 1, resets_at: '2026-09-07T03:24:00.000Z' } }) };
  };
  assert.equal(await client.fetchUsageLimits(), null);
  assert.equal(client.lastFetchCredentialsUnavailable, true, 'missing file');
  write(Date.now() - 1_000);
  assert.equal(await client.fetchUsageLimits(), null);
  assert.equal(client.lastFetchCredentialsUnavailable, true, 'expired token');
  assert.equal(requests, 0);
  write(Date.now() + 3_600_000);
  assert.ok(await client.fetchUsageLimits());
  assert.equal(client.lastFetchCredentialsUnavailable, false);
  client.callUsageApi = async () => ({ status: 500, body: '' });
  assert.equal(await client.fetchUsageLimits(), null);
  assert.equal(client.lastFetchCredentialsUnavailable, false, 'HTTP failure stays a real failure');
});

type ExecFileCallback = (error: Error | null, stdout?: string) => void;
type FakeExecFile = (file: string, args: string[], options: { signal?: AbortSignal }, callback: ExecFileCallback) => void;

async function withFakeKeychain(
  execFile: FakeExecFile,
  run: (client: any) => Promise<void>,
  out: unknown = null,
): Promise<void> {
  const childProcess = require('node:child_process') as { execFile: unknown };
  const originalExecFile = childProcess.execFile;
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  childProcess.execFile = execFile;
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  try {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-profile-keychain-'));
    tempRoots.push(profile);
    const client = new ClaudeApiClient(out as any, profile) as any;
    client.credentialsPath = path.join(profile, '.credentials.json');
    client.allowKeychainFallback = true;
    await run(client);
  } finally {
    childProcess.execFile = originalExecFile;
    Object.defineProperty(process, 'platform', platform);
  }
}

test('an aborted quota fetch stops waiting for the Keychain read without killing it', async () => {
  let spawns = 0;
  let childSignal: AbortSignal | undefined;
  let finish!: (stdout: string) => void;
  await withFakeKeychain((_file, _args, options, callback) => {
    spawns += 1;
    childSignal = options.signal;
    finish = (stdout) => callback(null, stdout);
    options.signal?.addEventListener('abort', () => callback(new Error('killed')), { once: true });
  }, async (client) => {
    const tokens: string[] = [];
    client.callUsageApi = async (token: string) => {
      tokens.push(token);
      return { status: 200, body: '{}' };
    };
    const blur = new AbortController();
    const first = client.fetchUsageLimits(blur.signal);
    await until(() => spawns >= 1);
    blur.abort();
    const outcome = await Promise.race([
      first,
      new Promise((resolve) => setTimeout(() => resolve('hung'), 500)),
    ]);
    assert.equal(outcome, null);
    assert.equal(childSignal?.aborted, false, 'window blur must not dismiss the Keychain prompt');

    const second = client.fetchUsageLimits(new AbortController().signal);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(spawns, 1, 'the next refresh reuses the pending read');
    finish(JSON.stringify({
      claudeAiOauth: { accessToken: 'keychain-access', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 },
    }));
    assert.ok(await second);
    assert.deepEqual(tokens, ['keychain-access'], 'the aborted fetch made no request');

    const third = client.fetchUsageLimits();
    await until(() => spawns >= 2);
    assert.equal(spawns, 2);
    client.cancelCredentialRead();
    assert.equal(childSignal?.aborted, true, 'clear, dispose and profile change kill the read');
    await third;
  });
});

test('credential read failures never log token excerpts or subprocess output', async () => {
  const lines: string[] = [];
  const out = { appendLine: (line: string) => lines.push(line) };
  const malformed = '{"claudeAiOauth":{"accessToken":sk-SECRET-token}}';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-profile-malformed-'));
  tempRoots.push(profile);
  fs.writeFileSync(path.join(profile, '.credentials.json'), malformed);
  assert.equal(await (new ClaudeApiClient(out as any, profile) as any).loadCredentials(), null);
  const responses: Array<(callback: ExecFileCallback) => void> = [
    (callback) => callback(Object.assign(new Error('Command failed: security\nsk-SECRET-token'), { code: 51 })),
    (callback) => callback(null, malformed),
  ];
  for (const respond of responses) {
    await withFakeKeychain((_file, _args, _options, callback) => respond(callback), async (client) => {
      assert.equal(await client.loadCredentials(), null);
    }, out);
  }
  assert.ok(lines.length >= 3, lines.join('\n'));
  assert.equal(lines.some((line) => line.includes('SECRET')), false, lines.join('\n'));
});

test('authoritative credential absence drops the cached token; a transient read failure keeps it', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-profile-absence-'));
  tempRoots.push(profile);
  const credentialsPath = path.join(profile, '.credentials.json');
  const valid = JSON.stringify({
    claudeAiOauth: { accessToken: 'cached-access', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 },
  });
  const client = new ClaudeApiClient(null, profile) as any;
  const token = async (c: any) => (await c.getValidCredentials())?.claudeAiOauth.accessToken ?? null;

  fs.writeFileSync(credentialsPath, valid);
  assert.equal(await token(client), 'cached-access');
  fs.writeFileSync(credentialsPath, '{"claudeAiOauth":');
  assert.equal(await token(client), 'cached-access', 'a half-written file is transient');
  fs.writeFileSync(credentialsPath, '{}');
  assert.equal(await token(client), null, 'logged out');
  fs.writeFileSync(credentialsPath, valid);
  assert.equal(await token(client), 'cached-access');
  fs.rmSync(credentialsPath);
  assert.equal(await token(client), null, 'file removed');

  const keychainCases: Array<[string, (callback: ExecFileCallback) => void, string | null]> = [
    ['transient Keychain failure', (callback) => callback(Object.assign(new Error('security'), { code: 51 })), 'cached-access'],
    ['Keychain item not found', (callback) => callback(Object.assign(new Error('security'), { code: 44 })), null],
    ['Keychain item without a token', (callback) => callback(null, '{}'), null],
  ];
  for (const [label, respond, expected] of keychainCases) {
    await withFakeKeychain((_file, _args, _options, callback) => respond(callback), async (keychainClient) => {
      keychainClient.credentials = JSON.parse(valid);
      assert.equal(await token(keychainClient), expected, label);
    });
  }
});

test('an unreadable credentials directory keeps the cached token instead of logging out', async (t) => {
  if (process.getuid?.() === 0) return t.skip('root ignores directory permissions');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-profile-eacces-'));
  tempRoots.push(profile);
  const dir = path.join(profile, 'locked');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({
    claudeAiOauth: { accessToken: 'cached-access', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 },
  }));
  const client = new ClaudeApiClient(null, dir) as any;
  const token = async () => (await client.getValidCredentials())?.claudeAiOauth.accessToken ?? null;
  assert.equal(await token(), 'cached-access');
  fs.chmodSync(dir, 0o000);
  try {
    assert.equal(await token(), 'cached-access');
  } finally {
    fs.chmodSync(dir, 0o700);
  }
});

test('the shared-quota identity read forwards its abort signal to the credential read', async () => {
  const client = Object.create(ClaudeApiClient.prototype) as any;
  client.quotaIdentitySalt = 'salt';
  const controller = new AbortController();
  let seen: AbortSignal | undefined;
  client.loadCredentials = async (signal?: AbortSignal) => {
    seen = signal;
    return { claudeAiOauth: { accessToken: 'a', refreshToken: 'r' } };
  };
  assert.ok(await client.currentQuotaIdentitySignal(controller.signal));
  assert.equal(seen, controller.signal);
});
