import { test, expect } from '@playwright/test';

test('local sky transitions, textured city and long boosted views render on desktop and portrait', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text());
  });
  // Isolate the renderer so the terminal's animation cannot skew this sample.
  await page.route('**/__lighting-lab', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0"><div id="view" style="position:fixed;inset:0"></div>' }));
  await page.goto('/__lighting-lab');
  const samples = await page.evaluate(async () => {
    const { createScene } = await import('/src/lib/game/scene.js');
    const { surfaceLight } = await import('/src/lib/game/surfaces.js');
    const { waitForMaterialAtlas } = await import('/src/lib/game/storefronts.js');
    let hour = 12;
    const world = createScene(document.querySelector('#view'), { clock: () => new Date(2026, 6, 10, hour) });
    if (!await waitForMaterialAtlas()) throw new Error('Authored material atlas failed to load.');
    window.lightingLab = { world, setHour: value => { hour = value; } };
    world.renderer.info.autoReset = false;
    const result = [];
    for (const [time, h] of [[8, 12], [8, 17], [8, 23], [24, 6], [80, 12], [180, 23]]) {
      hour = h; world.resetCamera(); world.renderer.info.reset();
      world.render(time, { x: 0, y: 8, z: -time * 35, boost: 35 });
      const gl = world.renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      result.push({ hour, night: surfaceLight.night.value, calls: world.renderer.info.render.calls, textures: world.renderer.info.memory.textures, geometries: world.renderer.info.memory.geometries });
    }
    hour = 17; world.resetCamera(); world.render(8, { x: 0, y: 0, z: 7 });
    return result;
  });
  expect(samples[0].night).toBe(0); expect(samples[2].night).toBe(1);
  expect(samples[3].night).toBeGreaterThan(0); expect(samples[3].night).toBeLessThan(1);
  for (const sample of samples) {
    expect(sample.calls).toBeLessThan(140);
    expect(sample.textures).toBe(samples[0].textures);
    // Geometry first uploads when it enters view; the rolling kit stays bounded.
    expect(sample.geometries).toBeLessThan(100);
  }
  await page.screenshot({ path: 'test-results/lighting-sunset.png' });
  await page.setViewportSize({ width: 402, height: 874 });
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const { world, setHour } = window.lightingLab; setHour(23); world.resetCamera();
    world.render(24, { x: 0, y: 0, z: 7 });
  });
  await page.screenshot({ path: 'test-results/lighting-night-portrait.png' });
  expect(errors).toEqual([]);
  await page.evaluate(() => window.lightingLab.world.dispose());
});
