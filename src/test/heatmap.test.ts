import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { intensityBucket } from '../heatmap';

test('intensityBucket: 0 for no usage, 1..4 by quartile of max', () => {
  assert.equal(intensityBucket(0, 100), 0);
  assert.equal(intensityBucket(-5, 100), 0);
  assert.equal(intensityBucket(10, 0), 0); // max 0 → 0
  assert.equal(intensityBucket(1, 100), 1); // tiny but non-zero
  assert.equal(intensityBucket(25, 100), 1);
  assert.equal(intensityBucket(26, 100), 2);
  assert.equal(intensityBucket(75, 100), 3);
  assert.equal(intensityBucket(100, 100), 4); // the max day
});
