import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WindowActivityGate } from '../refreshPolicy';
import { ResourceOwnershipRegistry } from '../resourceOwnership';

type ExtensionModule = typeof import('../extension');

function loadExtensionModule(): ExtensionModule {
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
    if (request === 'vscode') {
      return vscodeStub;
    }
    return Reflect.apply(originalLoad, this, [request, parent, isMain]);
  };
  try {
    return require('../extension') as ExtensionModule;
  } finally {
    moduleLoader._load = originalLoad;
  }
}

const { ClaudeCodeUsageExtension } = loadExtensionModule();

function bareExtension(): any {
  const extension = Object.create(ClaudeCodeUsageExtension.prototype) as any;
  extension.resourceOwnership = new ResourceOwnershipRegistry();
  extension.codexWatcherLeases = new Map();
  extension.pendingResourceStops = new Set();
  extension.resourceStopFailure = null;
  extension.codexWatcherGeneration = 0;
  extension.disposed = false;
  return extension;
}

test('Claude watcher refresh stays Claude-only while manual refresh updates both providers', async () => {
  const extension = bareExtension();
  const calls: string[] = [];
  extension.coalescedTriggersSinceRefresh = 0;
  extension.refreshGate = {
    request: (_forceReload: boolean, trigger: string) => {
      calls.push(`claude:${trigger}`);
      return null;
    },
  };
  extension.refreshCodexData = async (trigger: string) => {
    calls.push(`codex:${trigger}`);
  };

  await extension.refreshData(false, 'watch');
  assert.deepEqual(calls, ['claude:watch']);

  calls.length = 0;
  await extension.refreshData(true, 'manual');
  assert.deepEqual(calls, ['codex:manual', 'claude:manual']);
});

test('Codex watcher still schedules its own Codex-only refresh', () => {
  const extension = bareExtension();
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-codex-watch-'));
  fs.mkdirSync(path.join(codexHome, 'sessions'));
  const callbacks: Array<(event: string, filename: string) => void> = [];
  const originalWatch = fs.watch;
  const calls: string[] = [];

  extension.codexWatchers = [];
  extension.codexWatchedHome = null;
  extension.windowActivity = new WindowActivityGate(true);
  extension.codexWatchDebounce = {
    clear: () => undefined,
    push: (_ms: number, callback: () => void) => callback(),
  };
  extension.getConfiguration = () => ({
    codexEnabled: true,
    codexFileWatchSeconds: 120,
  });
  extension.codexHome = () => codexHome;
  extension.refreshCodexData = (trigger: string) => {
    calls.push(`codex:${trigger}`);
    return Promise.resolve();
  };

  (fs as any).watch = (
    _directory: string,
    _options: unknown,
    callback: (event: string, filename: string) => void,
  ) => {
    callbacks.push(callback);
    return {
      close: () => undefined,
      on: () => undefined,
    };
  };
  try {
    extension.startCodexWatching();
    assert.equal(callbacks.length, 1);
    callbacks[0]('change', 'rollout.jsonl');
    assert.deepEqual(calls, ['codex:watch']);
  } finally {
    extension.stopCodexWatching();
    (fs as any).watch = originalWatch;
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
});

test('Codex watcher diagnostics count matching events and quiet-debounce coalescing', () => {
  const extension = bareExtension();
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-codex-watch-counters-'));
  fs.mkdirSync(path.join(codexHome, 'sessions'));
  const callbacks: Array<(event: string, filename: string) => void> = [];
  const delayed: Array<() => void> = [];
  const originalWatch = fs.watch;
  const calls: string[] = [];

  extension.codexWatchers = [];
  extension.codexWatchedHome = null;
  extension.codexWatcherEventsSinceRefresh = 0;
  extension.codexCoalescedTriggersSinceRefresh = 0;
  extension.codexWatchDebouncePending = false;
  extension.windowActivity = new WindowActivityGate(true);
  extension.codexWatchDebounce = {
    clear: () => { delayed.length = 0; },
    push: (_ms: number, callback: () => void) => {
      delayed[0] = callback;
    },
  };
  extension.getConfiguration = () => ({
    codexEnabled: true,
    codexFileWatchSeconds: 120,
  });
  extension.codexHome = () => codexHome;
  extension.refreshCodexData = (trigger: string) => {
    calls.push(`codex:${trigger}`);
    return Promise.resolve();
  };
  (fs as any).watch = (
    _directory: string,
    _options: unknown,
    callback: (event: string, filename: string) => void,
  ) => {
    callbacks.push(callback);
    return {
      close: () => undefined,
      on: () => undefined,
    };
  };

  try {
    extension.startCodexWatching();
    callbacks[0]('change', 'first.jsonl');
    callbacks[0]('rename', 'second.jsonl');
    callbacks[0]('change', 'ignored.txt');

    assert.equal(extension.codexWatcherEventsSinceRefresh, 2);
    assert.equal(extension.codexCoalescedTriggersSinceRefresh, 1);
    assert.deepEqual(calls, []);

    delayed[0]();
    assert.deepEqual(calls, ['codex:watch']);
    assert.equal(extension.codexWatchDebouncePending, false);
  } finally {
    extension.stopCodexWatching();
    (fs as any).watch = originalWatch;
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
});
