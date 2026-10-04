import { expect, test } from '@playwright/test';

import { openClaude, openOpenRouter } from './support/app.mjs';

// Every locator list is proved non-empty before it is iterated, and every
// toBeHidden()/toHaveCount(0) assertion names an element that exists in some
// other fixture — this fork has shipped specs that could not fail.

test('the OpenRouter panel shows credits, observed spend and its disclosure', async ({ page }) => {
  await openOpenRouter(page);

  const panel = page.locator('#provider-panel');
  await expect(panel.locator('[data-openrouter-used]')).toHaveText(/\d/);
  await expect(panel.locator('[data-openrouter-remaining]')).toHaveText(/\d/);

  // History begins when tracking was enabled and OpenRouter offers no backfill.
  const disclosure = panel.locator('[data-openrouter-disclosure]');
  await expect(disclosure).toHaveCount(1);
  await expect(disclosure).toContainText('lifetime totals only');
  await expect(disclosure).toContainText('cannot be back-filled');

  const bars = panel.locator('.hc-col[data-openrouter-day]');
  const barCount = await bars.count();
  expect(barCount).toBeGreaterThan(0);
  const days = await bars.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-openrouter-day')),
  );
  expect(days.length).toBeGreaterThan(0);
  for (const day of days) {
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  expect(new Set(days).size).toBe(days.length);
});

test('a lifetime-total decrease is flagged, never drawn as negative spend', async ({ page }) => {
  await openOpenRouter(page);

  const flagged = page.locator('.hc-col[data-openrouter-discontinuity="true"]');
  await expect(flagged).toHaveCount(1);
  await expect(page.locator('[data-openrouter-discontinuity-note]')).toHaveCount(1);

  const heights = await page.locator('.hc-col[data-openrouter-day] .chart-bar').evaluateAll(
    (nodes) => nodes.map((node) => Number.parseFloat(node.style.height)),
  );
  expect(heights.length).toBeGreaterThan(0);
  for (const height of heights) {
    expect(height).toBeGreaterThanOrEqual(0);
  }
});

test.describe('each empty state is distinct and actionable', () => {
  const cases = [
    ['openrouter-disabled', /tracking is off/i, 'Settings'],
    ['openrouter-no-key', /No OpenRouter key is stored/i, 'SecretStorage'],
    ['openrouter-forbidden', /requires a management key/i, 'management key'],
    ['openrouter-no-observations', /No readings yet/i, 'next refresh'],
  ];

  for (const [fixture, pattern, actionable] of cases) {
    test(fixture, async ({ page }) => {
      await openOpenRouter(page, { fixture });
      const empty = page.locator('[data-openrouter-empty]');
      await expect(empty).toHaveCount(1);
      await expect(empty).toContainText(pattern);
      await expect(empty).toContainText(actionable);
    });
  }

  test('the four states do not share copy', async ({ page }) => {
    const messages = [];
    for (const [fixture] of cases) {
      await openOpenRouter(page, { fixture });
      const empty = page.locator('[data-openrouter-empty]');
      await expect(empty).toHaveCount(1);
      messages.push((await empty.textContent()).trim());
    }
    expect(messages.length).toBe(cases.length);
    expect(new Set(messages).size).toBe(cases.length);
  });

  test('a key without credit permission hides the credit figures', async ({ page }) => {
    await openOpenRouter(page, { fixture: 'openrouter-forbidden' });
    await expect(page.locator('[data-openrouter-used]')).toHaveCount(0);
    await expect(page.locator('[data-openrouter-remaining]')).toHaveCount(0);
    // The disclosure stays, so the user still learns why there is no history.
    await expect(page.locator('[data-openrouter-disclosure]')).toHaveCount(1);
  });
});

test('OpenRouter never appears inside the Claude dashboard', async ({ page }) => {
  await openOpenRouter(page);
  await expect(page.locator('#provider-tab-openrouter')).toHaveCount(1);

  await openClaude(page);
  await expect(page.locator('#provider-tab-openrouter')).toHaveCount(0);
  await expect(page.locator('[data-openrouter-used]')).toHaveCount(0);
  const claudeTabs = page.locator('.tabs [role="tab"]');
  const tabCount = await claudeTabs.count();
  expect(tabCount).toBeGreaterThan(0);
  const names = await claudeTabs.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-dashboard-tab')),
  );
  expect(names.length).toBeGreaterThan(0);
  expect(names.includes('openrouter')).toBe(false);
});
