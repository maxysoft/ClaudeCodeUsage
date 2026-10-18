import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const CHECKOUT_SHA = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';

function read(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

test('runner attributes the selected tier and posts only the trusted comment body', () => {
  const runner = read('.github/scripts/first-pass.mjs');
  assert.match(runner, /const TRANSPORT = 'anthropic-messages'/);
  assert.match(runner, /resolveGeneratorAttribution\(env\.CCU_BOT_GENERATOR, model, TRANSPORT\)/);
  assert.match(runner, /resolveGeneratorAttribution\(env\.CCU_BOT_GENERATOR_PRO, modelPro, TRANSPORT\)/);
  assert.match(runner, /parseFirstPassResponse/);
  assert.match(runner, /resolveFirstPassCandidates/);
  assert.match(runner, /formatAutomatedComment\(selected\.reply, \{/);
  assert.match(runner, /generator: selected\.generator/);
  assert.match(runner, /JSON\.stringify\(\{\s*body:\s*commentBody\s*\}\)/);
  assert.doesNotMatch(runner, /JSON\.stringify\(\{\s*body:\s*reply\s*\}\)/);
  assert.doesNotMatch(runner, /CCU_BOT_TRANSPORT|prompt-injection safe|injection-safe/i);
});

test('issue and PR opened events both use the hardened shared runner', () => {
  const issue = read('.github/workflows/issue-first-pass.yml');
  const pr = read('.github/workflows/pr-first-pass.yml');
  assert.match(issue, /issues:\s*\n\s+types: \[opened\]/);
  assert.match(pr, /pull_request_target:\s*\n\s+types: \[opened\]/);
  for (const workflow of [issue, pr]) {
    assert.match(workflow, /run: node \.github\/scripts\/first-pass\.mjs/);
  }
});

test('runner uses one bounded reader for AGENTS grounding and requested source', () => {
  const runner = read('.github/scripts/first-pass.mjs');
  assert.match(runner, /# AGENTS\.md/);
  assert.equal((runner.match(/createRepoReadSession\(/g) ?? []).length, 1);
  assert.ok((runner.match(/repoReader\.read\(/g) ?? []).length >= 2);
  assert.doesNotMatch(runner, /const ALLOWED_EXT|const readRepoFiles/);
});

test('automatic first pass defaults to English and is bilingual only for Chinese authors', () => {
  const runner = read('.github/scripts/first-pass.mjs');
  assert.match(runner, /Reply in English by default/i);
  assert.match(runner, /author wrote in Chinese/i);
  assert.match(runner, /English first/i);
  assert.doesNotMatch(runner, /Reply in the same language as the author/i);
  assert.doesNotMatch(runner, /\*\*TL;DR \/ 结论\*\*/);
});

test('comment-only workflows configure cheap and pro independently', () => {
  for (const workflow of [
    read('.github/workflows/issue-first-pass.yml'),
    read('.github/workflows/pr-first-pass.yml'),
  ]) {
    assert.match(workflow, /CCU_BOT_GENERATOR:/);
    assert.match(workflow, /CCU_BOT_GENERATOR_PRO:/);
    assert.match(workflow, /contents: read/);
    assert.doesNotMatch(workflow, /contents: write/);
    assert.doesNotMatch(workflow, /CCU_BOT_TRANSPORT/);
    assert.match(workflow, new RegExp(CHECKOUT_SHA));
  }
});

test('PR diff is required and public text is not overclaimed as injection safe', () => {
  const pr = read('.github/workflows/pr-first-pass.yml');
  const issue = read('.github/workflows/issue-first-pass.yml');
  assert.match(pr, /gh pr diff[^\n]+> \/tmp\/pr\.diff\n\s+test -s \/tmp\/pr\.diff/);
  assert.doesNotMatch(pr, /\|\| true/);
  assert.doesNotMatch(`${pr}\n${issue}`, /prompt-injection safe|injection-safe/i);
});

test('publish workflow tags, packages, and releases without any Marketplace/Open VSX publish step', () => {
  const workflow = read('.github/workflows/publish.yml');
  // Fork policy (CHANGELOG [2.2.0]): ship the .vsix as a GitHub Release asset
  // only, triggered by a push to a v* tag (or the auto-tag job on main) —
  // never publish to the VS Code Marketplace or Open VSX.
  assert.match(workflow, /tags:\s*\n\s+- 'v\*'/);
  assert.match(workflow, /name: Create version tag/);
  assert.match(workflow, /name: Build and package/);
  assert.match(workflow, /uses: actions\/checkout@[a-f0-9]+/);
  assert.match(workflow, /uses: actions\/setup-node@[a-f0-9]+/);
  assert.match(workflow, /uses: softprops\/action-gh-release@[a-f0-9]+/);
  assert.doesNotMatch(workflow, /VSCE_PAT|OVSX_PAT/);
  assert.doesNotMatch(workflow, /vsce publish|ovsx publish/);
  assert.doesNotMatch(workflow, /release:\s*\n\s+types: \[published\]/);
  // Fork-only hardening ported from upstream's release flow: the packaged
  // artifact is verified before it is attached, without any registry publish.
  assert.match(workflow, /node \.github\/scripts\/verify-vsix\.mjs/);
  assert.doesNotMatch(workflow, /\bnpx\b|@vscode\/vsce@/);
  assert.match(workflow, /npm ci[^\n]*--ignore-scripts/);
  assert.match(workflow, /npm audit[^\n]*--audit-level=high/);
  assert.match(workflow, /"\$CCU_RELEASE_TOOLS\/node_modules\/\.bin\/vsce" package/);
});

function releaseRouting(source) {
  const workflow = source.split('\n').filter(line => !/^\s*#/.test(line)).join('\n');
  assert.match(workflow, /^on:\n  push:\n    branches: \[main\]\n  pull_request_target:\n    branches: \[main\]\n    types: \[opened, reopened, synchronize, edited, closed\]\n\npermissions:/m);
  return ['autolabel', 'update_release_draft'].map(id => {
    const expression = workflow.match(new RegExp(`^  ${id}:\\n    if: >-\\n((?:      [^\\n]+\\n)+)`, 'm'))?.[1];
    assert.ok(expression, `missing condition for ${id}`);
    // Only this workflow's boolean/equality subset is evaluated, not arbitrary
    // Actions expressions. Fixtures use strings/booleans, avoiding coercion differences.
    const remainder = expression.replace(/github\.(?:event_name|ref|event\.action|event\.pull_request\.(?:merged|base\.ref))\b/g, '')
      .replace(/'[^'\n]*'|\btrue\b|\bfalse\b|==|!=|&&|\|\||[\s()]/g, '');
    assert.equal(remainder, '', 'unsupported condition syntax');
    return github => runInNewContext(expression, { github }, { timeout: 100 });
  });
}

function assertReleaseRouting(source) {
  const conditions = releaseRouting(source);
  const check = (event_name, action, merged, base, ref, expected) => {
    const github = { event_name, ref, event: { action, pull_request: { merged, base: { ref: base } } } };
    assert.deepEqual(conditions.map(condition => condition(github)), expected,
      `${event_name}/${action}/${merged}/${base}/${ref}`);
  };
  check('push', '', false, '', 'refs/heads/main', [false, true]);
  check('push', '', false, '', 'refs/heads/feature', [false, false]);
  check('push', '', false, '', 'refs/tags/v1.0.0', [false, false]);
  for (const event of ['pull_request_target', 'pull_request', 'workflow_dispatch']) {
    for (const base of ['main', 'feature']) {
      for (const action of ['opened', 'reopened', 'synchronize', 'edited', 'labeled', 'closed']) {
        for (const merged of [false, true]) {
          const allowed = event === 'pull_request_target' && base === 'main';
          check(event, action, merged, base, 'refs/heads/main', [
            allowed && ['opened', 'reopened', 'synchronize', 'edited'].includes(action),
            allowed && action === 'closed' && merged,
          ]);
        }
      }
    }
  }
  // Real push payloads do not contain a pull_request; conditions must short-circuit.
  assert.deepEqual(conditions.map(condition => condition({ event_name: 'push', ref: 'refs/heads/main', event: {} })), [false, true]);
}

test('v7 labels only active main-target PR events and drafts only main pushes or merged closures', () => {
  assertReleaseRouting(read('.github/workflows/release-drafter.yml'));
});

test('release routing rejects unmerged closure, wrong-target and broad-event regressions', () => {
  const source = read('.github/workflows/release-drafter.yml');
  for (const [before, after] of [
    ['github.event.pull_request.merged == true', 'true'],
    ["github.event.pull_request.base.ref == 'main'", 'true'],
    ["github.event.action == 'opened'", 'true'],
    ["github.ref == 'refs/heads/main'", 'true'],
  ]) {
    assert.ok(source.includes(before), `mutation anchor: ${before}`);
    assert.throws(() => assertReleaseRouting(source.replaceAll(before, after)), { code: 'ERR_ASSERTION' });
  }
});

test('maintainer-only mention workflow retains its privileged Claude boundary', () => {
  const privileged = read('.github/workflows/claude.yml');
  assert.match(privileged, /contents: write/);
  // Pinned by commit SHA, not by the mutable v1 tag: this workflow runs with
  // contents: write, so a retagged upstream release must not change what runs.
  assert.match(privileged, /anthropics\/claude-code-action@[0-9a-f]{40} # v1\b/);
  assert.match(privileged, /OWNER","MEMBER","COLLABORATOR/);
});

test('CONTRIBUTING distinguishes current automatic, reviewed Codex, and privileged agent text', () => {
  const contributing = read('CONTRIBUTING.md');
  assert.match(contributing, /### Controlled automatic first pass/);
  assert.match(contributing, /DeepSeek or Claude/);
  assert.match(contributing, /Codex automatic attribution is not enabled in v2\.2\.1/);
  assert.match(contributing, /Generated with \[OpenAI Codex\]/);
  assert.match(contributing, /### Maintainer-only mention agent/);
  assert.match(contributing, /does not migrate this privileged workflow to Codex/);
});

// Note: this fork keeps its own CHANGELOG.md (framed as "changes to this fork
// compared to upstream", see the file header) instead of upstream's
// Release-Drafter-managed "## [Unreleased]" section, so CI-automation
// changelog wording is not asserted here. The CI hardening itself is
// verified functionally by the tests above against first-pass.mjs and the
// workflow YAML files.

test('every workflow action is pinned to a commit SHA, never a mutable tag', () => {
  // A tag can be moved to point at new code; a commit SHA cannot. publish.yml
  // attaches release assets and claude.yml runs with contents: write, so an
  // upstream retag would otherwise change what executes here.
  const dir = resolve(REPO_ROOT, '.github', 'workflows');
  const offenders = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.yml'))) {
    const body = readFileSync(resolve(dir, file), 'utf8');
    for (const [, ref] of body.matchAll(/^\s*uses:\s*(\S+)/gm)) {
      if (ref.startsWith('./') || ref.startsWith('docker://')) {
        continue;
      }
      if (!/@[0-9a-f]{40}$/.test(ref)) {
        offenders.push(`${file}: ${ref}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
