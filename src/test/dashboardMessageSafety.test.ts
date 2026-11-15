import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import Module = require('node:module');
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let handler: (message: Record<string, unknown>) => Promise<void>;
const dialogs: string[] = [];
const warnings: string[] = [];
const trashed: string[] = [];
const terminals: Array<{ cwd: unknown; text: string }> = [];
const commands: unknown[][] = [];
const posted: Record<string, unknown>[] = [];
let answer: (items: string[]) => unknown = () => undefined;
const vscode: any = {
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
  ViewColumn: { One: 1 },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  env: { language: 'en', uriScheme: 'vscode' },
  commands: { executeCommand: async (...args: unknown[]) => { commands.push(args); } },
  extensions: { getExtension: () => undefined },
  window: {
    activeColorTheme: { kind: 1 },
    createWebviewPanel: () => ({
      webview: {
        html: '',
        onDidReceiveMessage: (value: typeof handler) => { handler = value; return { dispose() {} }; },
        postMessage: async (message: Record<string, unknown>) => { posted.push(message); return true; },
      },
      reveal() {}, onDidDispose: () => ({ dispose() {} }),
    }),
    createTerminal: (options: { cwd?: unknown }) => {
      const entry = { cwd: options.cwd, text: '' };
      terminals.push(entry);
      return { show() {}, sendText(text: string) { entry.text = text; } };
    },
    showWarningMessage: async (message: string, options?: { modal?: boolean; detail?: string }, ...items: string[]) => {
      if (!options?.modal) { warnings.push(message); return undefined; }
      dialogs.push(message + '\n' + (options.detail ?? ''));
      return answer(items);
    },
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback, update: async () => undefined }),
    fs: { delete: async (uri: { fsPath: string }) => { trashed.push(uri.fsPath); } },
  },
};
const originalLoad = (Module as any)._load;
(Module as any)._load = function(request: string, parent: unknown, isMain: boolean) {
  return request === 'vscode' ? vscode : originalLoad.call(this, request, parent, isMain);
};
const { UsageWebviewProvider } = require('../webview') as typeof import('../webview');
const { SETTINGS } = require('../settings') as typeof import('../settings');
const { I18n } = require('../i18n') as typeof import('../i18n');
const { ClaudeDataLoader } = require('../dataLoader') as typeof import('../dataLoader');
(Module as any)._load = originalLoad;
ClaudeDataLoader.getClaudePaths = () => [];

const UUID = '0b6f1c9e-3d2a-4c11-9f7e-1a2b3c4d5e6f';

function provider(): any {
  dialogs.length = 0; warnings.length = 0; trashed.length = 0; terminals.length = 0; commands.length = 0; posted.length = 0;
  answer = () => undefined;
  const value = new UsageWebviewProvider({ globalState: { get: () => undefined, update: async () => undefined } } as any) as any;
  value.show();
  value.sessionBreakdown = [{ sessionId: UUID, title: 'Real title', projectPath: '/work/real' }];
  return value;
}

function sessionTree(): { root: string; projects: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-session-files-'));
  const projects = path.join(root, 'projects');
  for (const project of ['a', 'b']) {
    fs.mkdirSync(path.join(projects, project, 'memory'), { recursive: true });
    fs.writeFileSync(path.join(projects, project, 'memory', 'MEMORY.md'), '- note\n');
  }
  fs.writeFileSync(path.join(projects, 'a', UUID + '.jsonl'), '{}\n');
  fs.mkdirSync(path.join(projects, 'a', UUID, 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(projects, 'a', UUID, 'subagents', 'agent-1.jsonl'), '{}\n');
  fs.mkdirSync(path.join(projects, 'b', UUID), { recursive: true });
  return { root, projects };
}

function settingsFake(current: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const def = (key: string) => {
    const row = SETTINGS.find((d) => d.key === key);
    if (!row) throw new Error('Unknown setting: ' + key);
    return row;
  };
  return {
    calls,
    get: (key: string) => (key in current ? current[key] : def(key).default),
    set: async (key: string, value: unknown) => { def(key); calls.push('set ' + key + '=' + String(value)); },
    reset: async (key: string) => { calls.push('reset ' + key); },
  };
}

test('session lookup never matches a named folder such as Claude Code memory', async () => {
  const { root, projects } = sessionTree();
  try {
    assert.deepEqual(await ClaudeDataLoader.findSessionFiles('memory', root), []);
    fs.writeFileSync(path.join(projects, 'a', 'memory.jsonl'), '{}\n');
    assert.deepEqual(await ClaudeDataLoader.findSessionFiles('memory', root), [path.join(projects, 'a', 'memory.jsonl')]);
    assert.deepEqual(
      (await ClaudeDataLoader.findSessionFiles(UUID, root)).sort(),
      [path.join(projects, 'a', UUID), path.join(projects, 'a', UUID + '.jsonl')].sort(),
      'a session sub-agent folder matches only beside its own log',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('delete names the session from extension data and asks only when something matches', async () => {
  const { root, projects } = sessionTree();
  const p = provider();
  p.dataDirectory = root;
  try {
    await handler({ command: 'deleteSession', sessionId: 'memory', title: 'Spoofed' });
    assert.equal(dialogs.length, 0);
    assert.deepEqual(trashed, []);
    assert.deepEqual(warnings, [I18n.t.popup.deleteSessionNotFound]);

    fs.writeFileSync(path.join(projects, 'a', 'memory.jsonl'), '{}\n');
    dialogs.length = 0; warnings.length = 0;
    answer = (items) => items[0];
    await handler({ command: 'deleteSession', sessionId: 'memory', title: 'Spoofed' });
    assert.equal(dialogs.length, 1);
    assert.ok(dialogs[0].startsWith(I18n.t.popup.deleteSessionConfirm.replace('{name}', 'memory')));
    assert.ok(!dialogs[0].includes('Spoofed'));
    assert.deepEqual(trashed, [path.join(projects, 'a', 'memory.jsonl')]);

    dialogs.length = 0; trashed.length = 0;
    await handler({ command: 'deleteSession', sessionId: UUID, title: 'Spoofed' });
    assert.ok(dialogs[0].startsWith(I18n.t.popup.deleteSessionConfirm.replace('{name}', 'Real title')));
    assert.ok(dialogs[0].includes(path.join(projects, 'a', UUID + '.jsonl')), 'the dialog lists what moves to the trash');
    assert.deepEqual(trashed.sort(), [path.join(projects, 'a', UUID), path.join(projects, 'a', UUID + '.jsonl')].sort());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('conversation viewer titles come from extension data, never the message', async () => {
  const p = provider();
  const opened: string[][] = [];
  p.openConversationViewer = async (id: string, title: string) => { opened.push([id, title]); };
  await handler({ command: 'viewConversation', sessionId: UUID, title: 'Spoofed' });
  await handler({ command: 'viewConversation', sessionId: 'other', title: 'Spoofed' });
  assert.deepEqual(opened, [[UUID, 'Real title'], ['other', 'other']]);
});

test('resume takes the folder from extension session data, never from the message', async () => {
  const p = provider();
  p.sessionBreakdown.push({ sessionId: 'encoded', projectPath: '-work-real' });
  const folders = vscode.workspace.workspaceFolders;
  const getExtension = vscode.extensions.getExtension;
  try {
    await handler({ command: 'resumeSession', sessionId: UUID, cwd: '/evil' });
    await handler({ command: 'resumeSession', sessionId: 'unknown-id', cwd: '/evil' });
    assert.deepEqual(terminals, [
      { cwd: '/work/real', text: 'claude --resume ' + UUID },
      { cwd: undefined, text: 'claude --resume unknown-id' },
    ]);

    terminals.length = 0;
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/work/real' } }];
    vscode.extensions.getExtension = () => ({ isActive: true });
    await handler({ command: 'resumeSession', sessionId: 'encoded', cwd: '/elsewhere' });
    assert.deepEqual(commands, [['claude-vscode.editor.open', 'encoded']]);
    assert.deepEqual(terminals, []);
    await handler({ command: 'resumeSession', sessionId: 'unknown-id', cwd: '/work/real' });
    assert.equal(commands.length, 1, 'a message cwd cannot claim the current project');
    assert.deepEqual(terminals, [{ cwd: undefined, text: 'claude --resume unknown-id' }]);
  } finally {
    vscode.workspace.workspaceFolders = folders;
    vscode.extensions.getExtension = getExtension;
  }
});

test('dashboard cannot repoint AI advice to another host without a host-side confirm', async () => {
  const p = provider();
  const changed: unknown[] = [];
  p.onSettingsChanged = (key?: string) => { changed.push(key); };
  let s = settingsFake();
  p.settings = s;
  const evil = { command: 'updateSetting', key: 'advice.apiUrl', value: 'https://evil.example/v1/chat/completions' };
  await handler(evil);
  assert.equal(dialogs.length, 1);
  assert.ok(dialogs[0].startsWith(I18n.t.popup.adviceHostConfirm.replace('{host}', 'evil.example')));
  assert.deepEqual(s.calls, []);
  assert.deepEqual(changed, [undefined], 'declining re-renders so the control reverts');

  answer = (items) => items[0];
  await handler(evil);
  assert.deepEqual(s.calls, ['set advice.apiUrl=' + evil.value]);

  dialogs.length = 0; s.calls.length = 0;
  answer = () => undefined;
  await handler({ command: 'updateSetting', key: 'advice.apiUrl', value: 'https://api.deepseek.com/anthropic/v1/messages' });
  await handler({ command: 'updateSetting', key: 'advice.apiFormat', value: 'anthropic' });
  assert.equal(dialogs.length, 0);
  assert.equal(s.calls.length, 2);

  s = settingsFake({ 'advice.apiUrl': 'https://proxy.example/v1/messages' });
  p.settings = s;
  await handler({ command: 'resetSetting', key: 'advice.apiUrl' });
  await handler({ command: 'resetAllSettings', keys: ['advice.apiUrl', 'dashboardAutoRefresh'] });
  assert.equal(dialogs.length, 2);
  assert.ok(dialogs.every((d) => d.startsWith(I18n.t.popup.adviceHostConfirm.replace('{host}', 'api.deepseek.com'))));
  assert.deepEqual(s.calls, ['reset dashboardAutoRefresh']);
});

test('dashboard cannot delete a stored API key without a host-side confirm', async () => {
  const p = provider();
  const s = settingsFake();
  p.settings = s;
  await handler({ command: 'updateSetting', key: 'advice.apiKey', value: '  ' });
  await handler({ command: 'resetSetting', key: 'openrouter.apiKey' });
  assert.equal(dialogs.length, 2);
  assert.ok(dialogs[0].startsWith(I18n.t.popup.secretDeleteConfirm.replace('{name}', 'advice.apiKey')));
  assert.ok(dialogs[1].startsWith(I18n.t.popup.secretDeleteConfirm.replace('{name}', 'openrouter.apiKey')));
  assert.deepEqual(s.calls, []);

  answer = (items) => items[0];
  dialogs.length = 0;
  await handler({ command: 'resetSetting', key: 'openrouter.apiKey' });
  await handler({ command: 'updateSetting', key: 'advice.apiKey', value: 'sk-new' });
  assert.equal(dialogs.length, 1, 'storing a key needs no confirm');
  assert.deepEqual(s.calls, ['reset openrouter.apiKey', 'set advice.apiKey=sk-new']);
});

test('a setting message with an unknown key cannot reject the dashboard handler', async () => {
  const p = provider();
  p.settings = settingsFake();
  await assert.doesNotReject(handler({ command: 'updateSetting', key: 'no.such.key', value: 1 }));
  await assert.doesNotReject(handler({ command: 'resetSetting', key: 'no.such.key' }));
});

test('dashboard cannot replace a stored API key without a host-side confirm', async () => {
  const p = provider();
  const s = settingsFake({ 'advice.apiKey': 'sk-stored' });
  p.settings = s;
  await handler({ command: 'updateSetting', key: 'advice.apiKey', value: 'sk-attacker' });
  await handler({ command: 'updateSetting', key: 'advice.apiKey', value: ' sk-stored ' });
  assert.equal(dialogs.length, 1);
  assert.ok(dialogs[0].startsWith(I18n.t.popup.secretReplaceConfirm.replace('{name}', 'advice.apiKey')));
  assert.deepEqual(s.calls, ['set advice.apiKey= sk-stored ']);
});

test('setting messages run one at a time around the confirm modal', async () => {
  const p = provider();
  const s = settingsFake();
  p.settings = s;
  let decide: (value: unknown) => void = () => undefined;
  answer = () => new Promise((resolve) => { decide = resolve; });
  const evil = { command: 'updateSetting', key: 'advice.apiUrl', value: 'https://evil.example/v1/chat/completions' };
  const first = handler(evil);
  const second = handler({ command: 'updateSetting', key: 'advice.apiUrl', value: 'https://api.deepseek.com/v2/chat/completions' });
  const third = handler(evil);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 1, 'modals never stack');
  assert.deepEqual(s.calls, [], 'a same-host write waits for the open modal');
  decide(undefined);
  await Promise.all([first, second]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 2);
  decide(undefined);
  await third;
  assert.deepEqual(s.calls, ['set advice.apiUrl=https://api.deepseek.com/v2/chat/completions']);
});

test('clearing advice data from the dashboard goes through the extension-side confirm', async () => {
  const p = provider();
  const actions: unknown[] = [];
  let cleared = 0;
  p.clearAdviceLocalData = async () => { cleared++; return true; };
  let result: Record<string, unknown> = { ok: false, cancelled: true, message: 'cancelled' };
  p.onRunLocalDataAction = async (action: unknown) => { actions.push(action); return result; };
  await handler({ command: 'clearAdviceLocalData' });
  result = { ok: true, message: 'cleared' };
  await handler({ command: 'clearAdviceLocalData' });
  assert.deepEqual(actions, ['clear-advice-data', 'clear-advice-data']);
  assert.equal(cleared, 0, 'the message alone never clears');
  assert.deepEqual(posted.filter((m) => m.command === 'adviceClearResult'), [
    { command: 'adviceClearResult', ok: false },
    { command: 'adviceClearResult', ok: true },
  ]);
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'webview.ts'), 'utf8');
  assert.doesNotMatch(source, /window\.confirm\(__adviceCopy/, 'the user is asked once, by the extension');
});
