import { test, expect } from '@playwright/test';

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text()); });
  return errors;
}
async function open(page) { await page.goto('/'); await expect(page.getByRole('button', { name: 'Solo practice' })).toBeEnabled({ timeout: 25000 }); }

test('procedural WebGL scene, solo play, Escape freeze/resume, clean return', async ({ page }) => {
  const errors = collectErrors(page); await open(page);
  await page.screenshot({ path: 'test-results/menu-desktop.png' });
  await page.getByRole('button', { name: 'Solo practice' }).click();
  await expect(page.locator('.run-stats strong')).not.toHaveText('00:00', { timeout: 15000 });
  await page.keyboard.down('KeyD'); await page.waitForTimeout(250); await page.keyboard.up('KeyD');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeVisible();
  const pausedTime = await page.locator('.run-stats strong').textContent();
  await page.waitForTimeout(1300); await expect(page.locator('.run-stats strong')).toHaveText(pausedTime);
  await page.getByRole('button', { name: 'RESUME FLIGHT' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.run-stats strong')).not.toHaveText(pausedTime);
  await page.screenshot({ path: 'test-results/flight-desktop.png' });
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'RETURN TO TERMINAL' }).click();
  await expect(page.getByRole('button', { name: 'CREATE A ROOM' })).toBeEnabled();
  expect(await page.locator('canvas').count()).toBe(1); expect(errors).toEqual([]);
});

test('two real peers join, receive state, pause from either side and detect disconnect', async ({ browser }) => {
  const context = await browser.newContext(); const host = await context.newPage(); const guest = await context.newPage();
  const errors = collectErrors(host); const guestErrors = collectErrors(guest);
  try {
    await open(host); await open(guest);
    await host.getByRole('button', { name: 'CREATE A ROOM' }).click();
    await expect(host.locator('.room-code')).toHaveText(/^[A-Z0-9]{4}$/);
    const code = await host.locator('.room-code').textContent();
    await guest.getByRole('button', { name: 'JOIN WITH CODE' }).click();
    await guest.getByLabel('ROOM PASSCODE').fill(code); await guest.getByRole('button', { name: 'CONNECT & FLY' }).click();
    await expect(host.locator('.run-stats')).toBeVisible(); await expect(guest.locator('.run-stats')).toBeVisible();
    await expect(guest.locator('.run-stats strong')).not.toHaveText('00:00', { timeout: 15000 });
    await guest.keyboard.press('Escape');
    await expect(host.getByRole('dialog')).toBeVisible(); await expect(guest.getByRole('dialog')).toBeVisible();
    const frozen = await host.locator('.run-stats strong').textContent();
    await host.keyboard.press('Escape'); // Both pilots now own a pause flag.
    await guest.getByRole('button', { name: 'RESUME FLIGHT' }).click();
    await expect(guest.getByRole('button', { name: 'WAITING FOR WINGMATE' })).toBeVisible();
    await host.waitForTimeout(1200); await expect(host.locator('.run-stats strong')).toHaveText(frozen);
    await host.getByRole('button', { name: 'RESUME FLIGHT' }).click();
    await expect(host.getByRole('dialog')).toHaveCount(0); await expect(guest.getByRole('dialog')).toHaveCount(0);
    await expect(guest.locator('.run-stats strong')).not.toHaveText(frozen);
    await host.keyboard.press('Escape'); await expect(guest.getByRole('dialog')).toBeVisible();
    await host.getByRole('button', { name: 'RESUME FLIGHT' }).click(); await expect(guest.getByRole('dialog')).toHaveCount(0);
    await host.close(); await expect(guest.getByText('Signal lost.', { exact: true })).toBeVisible({ timeout: 15000 });
    expect(errors.concat(guestErrors)).toEqual([]);
  } finally { await context.close(); }
});

test('mobile terminal fits and touch steering is available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const errors = collectErrors(page); await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/menu-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Solo practice' }).click(); await expect(page.getByRole('button', { name: 'Drag to steer' })).toBeVisible();
  await page.screenshot({ path: 'test-results/flight-mobile.png' }); expect(errors).toEqual([]);
});
