import { expect, test } from '@playwright/test';

import { openClaude, openCodex } from './support/app.mjs';

// The This Week tab is fork-exclusive and had no UI coverage at all, which is
// how several regressions reached a release: the markup kept rendering while
// the data behind it stopped arriving. These tests assert the data is present,
// not merely that the tab exists.

test('the week tab renders its billing window, charts and usage-tracking card', async ({ page }) => {
  await openClaude(page, { fixture: 'week-records' });
  await page.locator('#tab-week').click();

  const panel = page.locator('#week');
  await expect(panel).toHaveClass(/active/);

  // The reset banner only renders when weekResetsAt survives the plumbing.
  await expect(panel.locator('.week-reset-banner')).toBeVisible();

  // Summary figures come from weekData (positional slot 3 of updateData). A
  // shifted argument leaves this empty or throws during render.
  await expect(panel.locator('.summary-item .value.cost')).toHaveText(/\d/);

  // The shared daily-breakdown section, rendered with the 'week-' id prefix.
  await expect(panel.locator('#week-dailyChart')).toBeVisible();
  await expect(panel.locator('.chart-tab[data-metric="cost"]')).toHaveCount(1);
  await expect(panel.locator('.daily-table tbody tr.daily-row').first()).toBeVisible();

  // The fork's usage-tracking card, scoped to the billing window.
  await expect(panel.locator('.cbar-list')).toHaveCount(1);
});

test('week drilldown ids stay distinct from the 30-day tab', async ({ page }) => {
  await openClaude(page, { fixture: 'week-records' });

  // Only days with materialized hours get a drilldown container, so assert the
  // invariant that matters instead of requiring one for a specific date: every
  // container the week tab renders is namespaced, and the 30-day tab's are not.
  // Without the prefix the two tabs would collide on any shared date.
  const weekIds = await page.locator('#week .hourly-detail-container').evaluateAll(
    (nodes) => nodes.map((node) => node.id),
  );
  // Without this the loop below asserts nothing when the week tab renders no
  // containers at all — which is exactly the breakage this spec exists to catch.
  expect(weekIds.length).toBeGreaterThan(0);
  for (const id of weekIds) {
    expect(id).toMatch(/^hourly-detail-week-\d{4}-\d{2}-\d{2}$/);
  }

  const monthIds = await page.locator('#month .hourly-detail-container').evaluateAll(
    (nodes) => nodes.map((node) => node.id),
  );
  expect(monthIds.length).toBeGreaterThan(0);
  for (const id of monthIds) {
    expect(id).toMatch(/^hourly-detail-\d{4}-\d{2}-\d{2}$/);
  }
  expect(weekIds.filter((id) => monthIds.includes(id))).toEqual([]);
});

test('expanding a week day opens that tab own drilldown row', async ({ page }) => {
  await openClaude(page, { fixture: 'week-records' });
  await page.locator('#tab-week').click();

  // Only a day with materialized hours is expandable; the fixture supplies one.
  const row = page.locator('#week .daily-table tbody tr.daily-row').filter({
    has: page.locator('.detail-button'),
  }).first();
  const date = await row.getAttribute('data-date');
  const detail = page.locator(`#week .hourly-detail-row[data-date="${date}"]`);

  await expect(detail).toBeHidden();
  await row.locator('.detail-button').click();
  await expect(detail).toBeVisible();

  // toggleHourlyDetail scopes to the active tab, so the 30-day row for the same
  // date must stay closed.
  await page.locator('#tab-month').click();
  // toBeHidden() alone is satisfied by a missing element, so prove the row
  // exists before asserting it stayed closed.
  const monthRow = page.locator(`#month .hourly-detail-row[data-date="${date}"]`);
  await expect(monthRow).toHaveCount(1);
  await expect(monthRow).toBeHidden();
});

test('Codex never shows the Claude-only week tab', async ({ page }) => {
  await openCodex(page);
  await expect(page.locator('#tab-week')).toHaveCount(0);
  await expect(page.locator('#week')).toHaveCount(0);
});
