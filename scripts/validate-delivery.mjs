import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.GRAPHICS_URL || 'http://127.0.0.1:5185';
const shotsDir = path.resolve('docs/screenshots');
const resultsDir = path.resolve('test-results');
const reportPath = path.join(resultsDir, 'delivery-visual-report.json');

await mkdir(shotsDir, { recursive: true });
await mkdir(resultsDir, { recursive: true });

const software = process.argv.includes('--software');
const args = [
  '--enable-webgl',
  ...(software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal'])
];

const browser = await chromium.launch({ headless: true, args });
const reports = [];

try {
  const runs = [
    { name: 'desktop', width: 1440, height: 900, preset: 'day' },
    { name: 'portrait', width: 402, height: 874, preset: 'night' }
  ];

  for (const { name, width, height, preset } of runs) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) {
        errors.push(message.text());
      }
    });

    // Test-only engine interception
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

    await page.goto(base);
    await page.locator('button.practice').waitFor();
    await page.waitForFunction(() => !document.querySelector('button.practice').disabled);

    await page.locator('#route-mode').selectOption('delivery');
    await page.locator('#difficulty').selectOption('easy');
    await page.locator('#lighting-preset').selectOption(preset);

    await page.screenshot({ path: path.join(shotsDir, `mail-menu-${name}.png`), fullPage: true });

    await page.locator('button.practice').click();
    await page.waitForFunction(() => (window.__deliveryEngine?.state?.time ?? 0) > 1);

    // Frame pacing sampler
    await page.evaluate(() => {
      window.intervals = [];
      let last = performance.now();
      function sample(now) {
        window.intervals.push(now - last);
        last = now;
        window.frameSample = requestAnimationFrame(sample);
      }
      window.frameSample = requestAnimationFrame(sample);
    });

    // Pause / resume verification
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor();
    const frozen = await page.evaluate(() => window.__deliveryEngine.state.time);
    await page.waitForTimeout(500);
    const pausedTime = await page.evaluate(() => window.__deliveryEngine.state.time);
    if (pausedTime !== frozen) throw new Error(`Pause changed mission time on ${name}`);

    await page.getByRole('button', { name: 'RESUME FLIGHT' }).click();
    await page.waitForFunction(() => !document.querySelector('.pause-panel'));

    const seen = new Set();
    const counts = [];
    let boostDone = false;

    for (let tick = 0; tick < 140; tick++) {
      await page.waitForTimeout(750);

      // Observe real state and drive gentle autopilot (only normal touch.x and actions.lift/boost)
      const state = await page.evaluate(() => {
        const eng = window.__deliveryEngine;
        if (!eng || !eng.state) return null;
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
            eng.touch.x = Math.max(-0.4, Math.min(0.4, -p.x * 0.2));
            eng.actions.lift = false;
          }
        } else if (eng) {
          eng.touch.x = 0;
          eng.actions.lift = false;
        }

        return {
          time: s.time,
          over: s.over,
          phase: d?.phase,
          recovered: d?.recovered ?? 0,
          bulbs: d?.bulbs ?? 0,
          repaired: d?.repaired ?? 0,
          restored: d?.restored ?? false,
          delivered: d?.delivered ?? 0,
          grade: d?.grade ?? null,
          targets: (d?.targets ?? []).map(t => ({
            kind: t.kind,
            stage: t.stage,
            forward: p.z - t.z,
            open: t.open,
            vulnerable: t.vulnerable
          })),
          destination: d?.destination ? {
            forward: p.z - d.destination.z,
            deliveredAt: d.destination.deliveredAt
          } : null,
          player: { x: p.x, y: p.y, z: p.z, boost: p.boost }
        };
      });

      if (!state) continue;

      counts.push({
        time: state.time,
        recovered: state.recovered,
        bulbs: state.bulbs,
        repaired: state.repaired,
        phase: state.phase
      });

      // Portrait boost capture
      if (name === 'portrait' && !boostDone && state.time > 25 && state.time < 28) {
        await page.keyboard.down('ShiftLeft');
        await page.keyboard.down('Space');
        await page.waitForTimeout(1400);
        await page.keyboard.up('Space');
        await page.waitForTimeout(600);
        await page.keyboard.up('ShiftLeft');
        boostDone = true;
        await page.screenshot({ path: path.join(shotsDir, `mail-boost-${name}.png`) });
      }

      // Target encounters
      for (const kind of ['moth', 'parcel', 'crab']) {
        if (!seen.has(kind) && state.targets.some(t => t.kind === kind && t.forward > 3 && t.forward < 48)) {
          await page.screenshot({ path: path.join(shotsDir, `mail-flight-${kind}-${name}.png`) });
          seen.add(kind);
        }
      }

      // Approach & arrival
      if (state.destination && !seen.has('approach') && !state.restored && state.time > 78) {
        await page.screenshot({ path: path.join(shotsDir, `mail-approach-${name}.png`) });
        seen.add('approach');
      }

      if (state.restored && !state.over && !seen.has('arrival')) {
        await page.screenshot({ path: path.join(shotsDir, `mail-arrival-${name}.png`) });
        seen.add('arrival');
      }

      // Route completion
      if (state.over) {
        await page.screenshot({ path: path.join(shotsDir, `mail-postcard-${name}.png`) });
        const frames = await page.evaluate(() => {
          if (window.frameSample) cancelAnimationFrame(window.frameSample);
          return window.intervals || [];
        });
        frames.sort((a, b) => a - b);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

        reports.push({
          name,
          result: state,
          seen: [...seen],
          errors: [...errors],
          overflow,
          frameMedianMs: frames.length ? Number(frames[Math.floor(frames.length * 0.5)].toFixed(2)) : null,
          frameP95Ms: frames.length ? Number(frames[Math.floor(frames.length * 0.95)].toFixed(2)) : null,
          samples: frames.length,
          progress: counts,
          pauseResumeVerified: true
        });
        break;
      }
    }

    if (!reports.some(r => r.name === name)) {
      throw new Error(`No completed route recorded for ${name}`);
    }

    // Verify success postcard UI
    await page.locator('.delivery-postcard').waitFor({ timeout: 5000 });

    // Verify clean replay
    await page.getByRole('button', { name: 'PLAY AGAIN' }).click();
    await page.waitForFunction(() => (window.__deliveryEngine?.state?.time ?? 0) > 0 && window.__deliveryEngine.state.time < 3);
    const replayRecovered = await page.evaluate(() => window.__deliveryEngine.state.delivery.recovered);
    if (replayRecovered !== 0) throw new Error(`Replay retained mail on ${name}`);

    await page.close();
  }

  await writeFile(reportPath, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports.map(({ progress, ...r }) => r), null, 2));

  if (reports.some(r => r.errors.length || r.overflow || !r.result.restored)) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
