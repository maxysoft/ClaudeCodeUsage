import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import type { AchievementId } from '../achievements';
import { ACHIEVEMENT_IMAGE_FILES, achievementImageDataUrl } from '../achievementIcons';

test('badge data URLs live in a small least-recently-used cache, one entry per file', (t) => {
  const reads = t.mock.method(fs, 'readFileSync');
  const ids = [...new Map(Object.entries(ACHIEVEMENT_IMAGE_FILES).map(([id, file]) => [file, id])).values()] as AchievementId[];
  for (const id of ids.slice(0, 13)) achievementImageDataUrl(id);
  assert.equal(reads.mock.callCount(), 13);
  achievementImageDataUrl(ids[12]);
  assert.equal(reads.mock.callCount(), 13, 'the most recent file stays cached');
  achievementImageDataUrl(ids[0]);
  assert.equal(reads.mock.callCount(), 14, 'the least recently used file was evicted');
});
