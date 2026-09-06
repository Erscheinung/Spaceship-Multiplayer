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
  await page.setViewportSize({ width: 402, height: 874 }); const errors = collectErrors(page); await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/menu-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Solo practice' }).click(); await expect(page.getByRole('button', { name: 'Drag to steer' })).toBeVisible();
  await expect(page.locator('.run-stats strong')).not.toHaveText('00:00');
  const cards = await page.locator('.hud > *').evaluateAll(nodes => nodes.map(n => {const r=n.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom};}));
  expect(cards[0].right).toBeLessThan(cards[1].left); expect(cards[1].right).toBeLessThan(cards[2].left);expect(cards[2].right).toBeLessThanOrEqual(402);
  expect(Math.max(...cards.map(c=>c.bottom))).toBeLessThan(160);
  const pad=await page.getByRole('button',{name:'Drag to steer'}).boundingBox();
  await page.mouse.move(pad.x+pad.width/2,pad.y+pad.height/2);await page.mouse.down();
  await page.mouse.move(pad.x+pad.width*.8,pad.y+pad.height*.4);await page.waitForTimeout(250);await page.mouse.up();
  await page.screenshot({ path: 'test-results/flight-mobile.png' });
  await page.setViewportSize({width:874,height:402});await page.screenshot({path:'test-results/flight-landscape.png'});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('chase camera keeps either pilot central in desktop, portrait and landscape', async ({ page }) => {
  await page.goto('/');
  const errors = collectErrors(page);
  const projections = await page.evaluate(async () => {
    const { createScene } = await import('/src/lib/game/scene.js');
    const { worldX } = await import('/src/lib/game/course.js');
    const holder = document.createElement('div'); holder.style.cssText='position:fixed;inset:0;z-index:100'; document.body.appendChild(holder);
    const result=[];
    for(const [w,h] of [[1440,900],[402,874],[874,402]]) {
      holder.style.width=w+'px';holder.style.height=h+'px';
      const world=createScene(holder);
      for(const x of [-13,4,13]) {
        const p={x,z:8};world.resetCamera();world.render(20,p);
        const v=world.camera.position.clone().set(worldX(x,8,20),0,8).project(world.camera);
        result.push({x:(v.x+1)/2,y:(1-v.y)/2});
      }
      world.dispose();
    }
    holder.remove();return result;
  });
  for(const p of projections) { expect(p.x).toBeGreaterThan(.4);expect(p.x).toBeLessThan(.6);expect(p.y).toBeGreaterThan(.45);expect(p.y).toBeLessThan(.65); }
  expect(errors).toEqual([]);
});
