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

test('real 90-second delivery route succeeds, awards postcard, and replays cleanly', async ({ page }) => {
  test.setTimeout(isDarwin ? 180000 : 360000);
  const errors = collectErrors(page);
  await tapEngine(page);
  await open(page);

  await page.locator('#route-mode').selectOption('delivery');
  await page.locator('#difficulty').selectOption('easy');
  await page.locator('button.practice').click();

  await page.waitForFunction(() => window.__deliveryEngine?.state?.time > 0.5, { timeout: 30000 });

  // Real-time flight observation: stable cruise with simple centering and gentle target alignment
  let finished = false;
  const deadline = Date.now() + (isDarwin ? 160000 : 340000);
  while (!finished && Date.now() < deadline) {
    finished = await page.evaluate(() => {
      const eng = window.__deliveryEngine;
      if (!eng || !eng.state) return false;
      const s = eng.state;
      const d = s.delivery;
      const p = s.players[0];

      if (d && !s.over) {
        const moth = (d.targets || []).find(t => t.kind === 'moth' && t.completedAt === null && t.vulnerable && t.z < p.z && p.z - t.z < 60);
        const release = (d.releases || []).find(r => r.collectedAt === null && r.z < p.z && p.z - r.z < 40);
        const dest = (d.destination && d.destination.deliveredAt === null && d.destination.z < p.z && p.z - d.destination.z < 80) ? d.destination : null;
        const target = release || moth || dest;

        if (target) {
          const dx = target.x - p.x;
          eng.touch.x = Math.max(-0.6, Math.min(0.6, dx * 0.25));
          eng.actions.lift = target.y != null && (target.y > (p.y || 0) + 1.2);
        } else {
          // Stable simple centering
          eng.touch.x = Math.max(-0.4, Math.min(0.4, -p.x * 0.2));
          eng.actions.lift = false;
        }
      } else if (eng) {
        eng.touch.x = 0;
        eng.actions.lift = false;
      }
      return Boolean(s.over);
    });

    if (!finished) {
      await page.waitForTimeout(600);
    }
  }

  await page.waitForFunction(() => window.__deliveryEngine?.state?.over === true, { timeout: isDarwin ? 30000 : 60000 });

  const finalDelivery = await page.evaluate(() => {
    const s = window.__deliveryEngine?.state;
    return {
      restored: s?.delivery?.restored,
      recovered: s?.delivery?.recovered,
      delivered: s?.delivery?.delivered,
      grade: s?.delivery?.grade
    };
  });

  expect(finalDelivery.restored).toBe(true);
  expect(finalDelivery.delivered).toBeGreaterThanOrEqual(1);

  await expect(page.locator('.delivery-postcard')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.delivery-postcard figcaption')).toContainText('Nightjar Radio');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'PLAY AGAIN' })).toBeVisible();

  // Verify clean replay
  await page.getByRole('button', { name: 'PLAY AGAIN' }).click();
  await page.waitForFunction(() => window.__deliveryEngine?.state?.time > 0 && window.__deliveryEngine.state.time < 3, { timeout: 15000 });
  const replayed = await page.evaluate(() => ({
    recovered: window.__deliveryEngine.state.delivery.recovered,
    time: window.__deliveryEngine.state.time
  }));

  expect(replayed.recovered).toBe(0);
  expect(replayed.time).toBeLessThan(3);
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
