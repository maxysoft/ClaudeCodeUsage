import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { buildProjectUsageMatrixSnapshot } from '../projectUsageMatrix';

test('project matrix keeps one sparse 90-day source and combines duplicate project days', () => {
  const snapshot = buildProjectUsageMatrixSnapshot('codex', [
    { projectKey: 'a', projectName: 'Alpha', day: '2026-09-09', tokens: 10, coverage: 'complete' },
    { projectKey: 'a', projectName: 'Alpha', day: '2026-09-09', tokens: 5, coverage: 'partial' },
    { projectKey: 'old', projectName: 'Old', day: '2026-01-01', tokens: 999, coverage: 'complete' },
  ], {
    asOfDay: '2026-09-10',
    timeZone: 'Asia/Shanghai',
    coverage: 'partial',
  });

  assert.equal(snapshot.days.length, 90);
  assert.equal(snapshot.days[snapshot.days.length - 1], '2026-09-10');
  assert.deepEqual(snapshot.points, [{
    projectKey: 'a',
    projectName: 'Alpha',
    day: '2026-09-09',
    tokens: 15,
    coverage: 'partial',
  }]);
});
