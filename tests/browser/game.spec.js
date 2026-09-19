import { test, expect } from '@playwright/test';

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text()); });
  return errors;
}
async function open(page) { await page.goto('/'); await expect(page.locator('button.practice')).toBeEnabled({ timeout: 25000 }); }

test('procedural WebGL scene, solo play, Escape freeze/resume, clean return', async ({ page }) => {
  const errors = collectErrors(page); await open(page);
  await page.screenshot({ path: 'test-results/menu-desktop.png' });
  await page.locator('button.practice').click();
  // Software WebGL can take a few seconds to leave the attract loop on a
  // busy CI host; the run must still advance once the flight loop is live.
  await expect(page.locator('.run-stats strong')).not.toHaveText('00:00', { timeout: 30000 });
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
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  // Local signaling coverage does not depend on the external credential service.
  await context.route('**/api/ice', route => route.fulfill({ json: { iceServers: [] } }));
  const host = await context.newPage(); const guest = await context.newPage();
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
    await host.close(); await expect(guest.getByText('Signal lost.', { exact: true })).toBeVisible({ timeout: 40000 });
    expect(errors.concat(guestErrors)).toEqual([]);
  } finally { await context.close(); }
});

test('mobile terminal fits and touch steering is available', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 }); const errors = collectErrors(page); await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/menu-mobile.png', fullPage: true });
  await page.locator('button.practice').click(); await expect(page.getByRole('button', { name: 'Drag to steer' })).toBeVisible();
  await expect(page.locator('.run-stats strong')).not.toHaveText('00:00');
  await expect(page.locator('.telemetry-strip')).toContainText('FPS', { timeout: 3000 });
  await expect(page.getByRole('button', { name: 'Hold to boost' })).toBeVisible();
  const cards = await page.locator('.hud > *').evaluateAll(nodes => nodes.map(n => {const r=n.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom};}));
  expect(cards[0].right).toBeLessThan(cards[1].left); expect(cards[1].right).toBeLessThan(cards[2].left);expect(cards[2].right).toBeLessThanOrEqual(402);
  expect(Math.max(...cards.map(c=>c.bottom))).toBeLessThan(160);
  const card = await page.locator('.pilot-card').boundingBox();
  expect(card.width).toBeLessThan(165); expect(card.height).toBeLessThan(90);
  const pad=await page.getByRole('button',{name:'Drag to steer'}).boundingBox();
  const cruiseSpeed = Number(await page.locator('[data-testid="speed"]').textContent());
  await page.mouse.move(pad.x+pad.width/2,pad.y+pad.height/2);await page.mouse.down();
  await page.mouse.move(pad.x+pad.width+18,pad.y+pad.height/2);await expect(page.locator('.touch-pad')).toHaveClass(/boost-active/);
  await expect(page.locator('.touch-boost-badge')).toHaveText('BOOST'); await page.waitForTimeout(400);
  const turboSpeed = Number(await page.locator('[data-testid="speed"]').textContent());
  expect(turboSpeed).toBeGreaterThan(cruiseSpeed);
  await page.mouse.up(); await expect(page.locator('.touch-pad')).not.toHaveClass(/boost-active/);
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
    const { worldPosition } = await import('/src/lib/game/course.js');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const holder = document.createElement('div'); holder.style.cssText='position:fixed;inset:0;z-index:100'; document.body.appendChild(holder);
    const result=[];
    for(const [w,h] of [[1440,900],[402,874],[874,402]]) {
      holder.style.width=w+'px';holder.style.height=h+'px';
      const world=createScene(holder);
      for(const x of [-13,4,13]) {
        const p={x,z:8};world.resetCamera();world.render(20,p);
        const point=worldPosition(x,0,8,20);
        const v=new THREE.Vector3(point.x,point.y,point.z).project(world.camera);
        result.push({x:(v.x+1)/2,y:(1-v.y)/2});
      }
      world.dispose();
    }
    holder.remove();return result;
  });
  for(const p of projections) { expect(p.x).toBeGreaterThan(.4);expect(p.x).toBeLessThan(.6);expect(p.y).toBeGreaterThan(.45);expect(p.y).toBeLessThan(.65); }
  expect(errors).toEqual([]);
});
