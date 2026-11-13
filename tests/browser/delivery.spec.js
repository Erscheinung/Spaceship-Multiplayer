import { test, expect } from '@playwright/test';

const isDarwin = process.platform === 'darwin';

test.use({
  launchOptions: {
    args: isDarwin
      ? ['--enable-webgl', '--use-angle=metal']
      : ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  },
  viewport: isDarwin ? { width: 1440, height: 900 } : { width: 640, height: 360 }
});

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  return errors;
}

async function tapEngine(page) {
  await page.route('**/src/lib/game/Engine.js*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const wrapper = `
;(() => {
  const start = Engine.prototype.start;
  Engine.prototype.start = function (...args) {
    window.__deliveryEngine = this;
    window.flightEngine = this;
    return start.apply(this, args);
  };
})();`;
    await route.fulfill({ response, body: `${source}\n${wrapper}` });
  });
}

async function open(page) {
  await page.goto('/');
  await expect(page.locator('button.practice')).toBeEnabled({ timeout: 25000 });
}

test('solo courier sees all four random encounters and keeps flying beyond ninety seconds', async ({ page }) => {
  test.setTimeout(180000);
  const errors = collectErrors(page); await tapEngine(page); await open(page);
  await page.locator('button.practice').click();
  await page.waitForFunction(() => window.__deliveryEngine?.state?.time > .5);
  const seen = new Set();
  const until = Date.now() + 150000;
  let current;
  while (Date.now() < until) {
    current = await page.evaluate(() => {
      const e = window.__deliveryEngine, s = e.state, d = s.delivery, p = s.players[0];
      const target = d.releases.find(r => r.collectedAt === null && r.z < p.z && p.z-r.z < 50)
        || (d.destination && d.destination.z < p.z && p.z-d.destination.z < 100 ? d.destination : null)
        || d.targets.find(t => t.completedAt === null && t.z < p.z && p.z-t.z < 100);
      e.touch.x = Math.max(-.6, Math.min(.6, ((target?.x ?? 0)-p.x)*.25));
      e.actions.lift = Boolean(target && target.y > p.y+1);
      return {time:s.time, over:s.over, kinds:d.targets.map(t=>t.kind), recovered:d.recovered};
    });
    current.kinds.forEach(kind=>seen.add(kind));
    if (current.time > 94) break;
    await page.waitForTimeout(100);
  }
  expect(current.time).toBeGreaterThan(94);
  expect(current.over).toBe(false);
  expect([...seen].sort()).toEqual(['crab','moth','parcel','sorter']);
  expect(current.recovered).toBeGreaterThan(0);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeVisible();
  expect(errors).toEqual([]);
});

test('survival mode selectable, runs endless rocks, and verifies Escape pause/resume', async ({ page }) => {
  const errors = collectErrors(page);
  await tapEngine(page);
  await open(page);

  await page.locator('#route-mode').selectOption('survival');
  expect(await page.locator('#route-mode').inputValue()).toBe('survival');
  await page.locator('#difficulty').selectOption('easy');

  await page.locator('button.practice').click();
  await page.waitForFunction(() => window.__deliveryEngine?.state?.time > 0.5, { timeout: 30000 });

  const state = await page.evaluate(() => ({
    delivery: window.__deliveryEngine.state.delivery,
    hasRocks: Array.isArray(window.__deliveryEngine.state.rocks)
  }));
  expect(state.delivery).toBeNull();
  expect(state.hasRocks).toBe(true);

  await expect(page.locator('.run-stats strong')).not.toHaveText('00:00', { timeout: 10000 });
  await expect(page.locator('.run-stats span')).toHaveText(/SECTOR \d+/);

  // Test Escape pause
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();

  const frozenTime = await page.evaluate(() => window.__deliveryEngine.state.time);
  const frozenClock = await page.locator('.run-stats strong').textContent();
  await page.waitForTimeout(1000);

  const currentPausedTime = await page.evaluate(() => window.__deliveryEngine.state.time);
  expect(currentPausedTime).toBe(frozenTime);
  await expect(page.locator('.run-stats strong')).toHaveText(frozenClock);

  // Test resume
  await page.getByRole('button', { name: 'RESUME FLIGHT' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.waitForFunction(t => window.__deliveryEngine?.state?.time > t + 0.5, frozenTime, { timeout: 10000 });

  // Clean return to terminal
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'RETURN TO TERMINAL' }).click();
  await expect(page.locator('button.practice')).toBeEnabled({ timeout: 10000 });

  expect(errors).toEqual([]);
});
