import { chromium } from '@playwright/test';

// Start `npm run dev` first. Use --software for a portable correctness sample;
// native measurements on macOS use Metal. Values include a GPU readback fence.
const base = process.env.GRAPHICS_URL || 'http://127.0.0.1:5173';
const moduleRoot = process.env.GRAPHICS_MODULE_ROOT || '/src/lib/game';
const software = process.argv.includes('--software');
const args = software
  ? ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--enable-webgl', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])];
const browser = await chromium.launch({ headless: true, args });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text());
  });
  await page.route('**/__graphics-benchmark', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0"><div id="view" style="position:fixed;inset:0"></div>' }));
  await page.goto(new URL('/__graphics-benchmark', base).href);
  const report = await page.evaluate(async moduleRoot => {
    const { createScene } = await import(`${moduleRoot}/scene.js`);
    const { makeShip } = await import(`${moduleRoot}/procedural.js`);
    const { courseFrame, worldPosition, FLIGHT_SPEED } = await import(`${moduleRoot}/course.js`);
    const { waitForMaterialAtlas } = await import(`${moduleRoot}/storefronts.js`);
    const THREE = await import('/node_modules/three/build/three.module.js');
    let hour = 12;
    const world = createScene(document.querySelector('#view'), { clock: () => new Date(2026, 6, 10, hour) });
    // Image decode/upload must complete before the synchronous frame sample;
    // otherwise a tight render loop can accidentally measure fallback colors.
    if (waitForMaterialAtlas && !await waitForMaterialAtlas()) throw new Error('Material atlas did not load; refusing to benchmark fallback surfaces.');
    const ship = makeShip(0); world.scene.add(ship);
    const gl = world.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    world.renderer.info.autoReset = false;
    const pixel = new Uint8Array(4), right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3(), basis = new THREE.Matrix4();
    const results = [];
    for (const view of [
      { name: 'day street', hour: 12, time: 8, y: 0, z: 7, boost: 0 },
      { name: 'night street', hour: 23, time: 8, y: 0, z: 7, boost: 0 },
      { name: 'golden boost / turn', hour: 17, time: 24, y: 12, z: -80, boost: 35 },
      { name: 'night skyline', hour: 23, time: 80, y: 24, z: 7, boost: 35 }
    ]) {
      hour = view.hour; world.resetCamera(); const samples = [];
      for (let i = 0; i < 48; i++) {
        const time = view.time + i / 60, player = { x: 0, y: view.y, z: view.z - i / 60 * view.boost, boost: view.boost };
        world.renderer.info.reset(); const start = performance.now();
        const f = courseFrame(time * FLIGHT_SPEED - player.z), p = worldPosition(0, player.y, player.z, time);
        right.set(f.right.x, f.right.y, f.right.z); up.set(f.up.x, f.up.y, f.up.z); back.set(-f.forward.x, -f.forward.y, -f.forward.z);
        ship.position.set(p.x, p.y, p.z); ship.quaternion.setFromRotationMatrix(basis.makeBasis(right, up, back));
        world.render(time, player);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        if (i >= 8) samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      results.push({ name: view.name, medianMs: +samples[20].toFixed(2), p95Ms: +samples[38].toFixed(2), calls: world.renderer.info.render.calls, triangles: world.renderer.info.render.triangles, textures: world.renderer.info.memory.textures, geometries: world.renderer.info.memory.geometries });
    }
    world.dispose(); return { renderer, viewport: '1280x800 / DPR 1', results };
  }, moduleRoot);
  console.log(JSON.stringify({ ...report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
