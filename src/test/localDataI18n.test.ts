import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { LOCAL_DATA_COPY } from '../i18n';
import { isLocalDataAction } from '../localDataControls';

const LOCALES = ['en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id'] as const;
const NEUTRAL = new Set(['rows.P8.locationClass']);

function leaves(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]];
  if (typeof value === 'function') {
    return [[prefix, (value as (...args: unknown[]) => string)(...['Codex', 2, 7].slice(0, value.length))]];
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, `${prefix}.${index}`));
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]) => leaves(item, prefix ? `${prefix}.${key}` : key));
}

test('local-data host copy has every key in all 8 locales and differs from English', () => {
  assert.deepEqual(Object.keys(LOCAL_DATA_COPY).sort(), [...LOCALES].sort());
  const english = new Map(leaves(LOCAL_DATA_COPY.en));
  assert.ok(english.size > 50);
  for (const locale of LOCALES.filter((item) => item !== 'en')) {
    const localized = new Map(leaves(LOCAL_DATA_COPY[locale]));
    assert.deepEqual([...localized.keys()], [...english.keys()], locale);
    for (const [key, text] of localized) {
      assert.ok(text.length > 0, `${locale} ${key} empty`);
      if (NEUTRAL.has(key)) continue;
      assert.notEqual(text, english.get(key), `${locale} ${key} is still English`);
    }
  }
});

test('local-data host copy interpolates counts and keys per locale', () => {
  for (const locale of LOCALES) {
    const copy = LOCAL_DATA_COPY[locale];
    assert.match(copy.allQuota(7), /7/);
    assert.match(copy.providerQuota('Codex', 3), /Codex.*3|3.*Codex/);
    assert.match(copy.epochQuota('Claude', 2, 5), /2/);
    assert.match(copy.quotaPickDescription(9), /9/);
    assert.ok(copy.preflight('claudeCodeUsage.x').includes('claudeCodeUsage.x'));
  }
});

test('local-data action titles cover every action in every UI locale', () => {
  for (const locale of LOCALES) {
    const actions = Object.keys(LOCAL_DATA_COPY[locale].actionTitles);
    assert.equal(actions.length, 7, locale);
    assert.ok(actions.every(isLocalDataAction), locale);
  }
});

test('host local-data flow keeps no inline CJK copy', () => {
  const root = path.resolve(__dirname, '..', '..', 'src');
  for (const file of ['extension.ts', 'localDataControls.ts']) {
    assert.doesNotMatch(readFileSync(path.join(root, file), 'utf8'), /[一-鿿]/, file);
  }
});
