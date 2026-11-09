import { test, expect } from '@playwright/test';

const STEP = 1 / 60;

function collectErrors(page, errors) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text());
  });
}

async function tapEngine(page) {
  // The wrapper is test-only: it observes the Engine created by the route and
  // leaves production source and runtime APIs untouched.
  await page.route('**/src/lib/game/Engine.js*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const wrapper = `
;(() => {
  const start = Engine.prototype.start;
  Engine.prototype.start = function (...args) {
    window.__deliveryEngine = this;
    window.__deliveryStartCount = (window.__deliveryStartCount || 0) + 1;
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

function digest(delivery) {
  if (!delivery) return null;
  return {
    phase: delivery.phase,
    recovered: delivery.recovered,
    bulbs: delivery.bulbs,
    repaired: delivery.repaired,
    delivered: delivery.delivered,
    restored: delivery.restored,
    completed: delivery.completed,
    success: delivery.success,
    grade: delivery.grade,
    milestones: delivery.milestones,
    rack: delivery.rack,
    targets: (delivery.targets || []).map(target => ({ id: target.id, stage: target.stage, completedAt: target.completedAt, repairAt: target.repairAt })),
    releases: (delivery.releases || []).map(release => ({ id: release.id, collectedAt: release.collectedAt, collectedBy: release.collectedBy })),
    destination: delivery.destination && {
      id: delivery.destination.id,
      deliveredAt: delivery.destination.deliveredAt,
      failedAt: delivery.destination.failedAt
    }
  };
}

async function readDigest(page) {
  return page.evaluate(() => {
    const delivery = window.__deliveryEngine?.state?.delivery;
    if (!delivery) return null;
    return {
      time: window.__deliveryEngine.state.time,
      paused: Boolean(window.__deliveryEngine.paused),
      mail: {
        phase: delivery.phase,
        recovered: delivery.recovered,
        bulbs: delivery.bulbs,
        repaired: delivery.repaired,
        delivered: delivery.delivered,
        restored: delivery.restored,
        completed: delivery.completed,
        success: delivery.success,
        grade: delivery.grade,
        milestones: delivery.milestones,
        rack: delivery.rack,
        targets: (delivery.targets || []).map(target => ({ id: target.id, stage: target.stage, completedAt: target.completedAt, repairAt: target.repairAt })),
        releases: (delivery.releases || []).map(release => ({ id: release.id, collectedAt: release.collectedAt, collectedBy: release.collectedBy })),
        destination: delivery.destination && {
          id: delivery.destination.id,
          deliveredAt: delivery.destination.deliveredAt,
          failedAt: delivery.destination.failedAt
        }
      }
    };
  });
}

function mailOnly(state) {
  return state?.mail ?? null;
}

function assertUniqueIds(mail) {
  const ids = [...(mail?.targets || []).map(target => target.id), ...(mail?.releases || []).map(release => release.id)];
  expect(new Set(ids).size).toBe(ids.length);
}

async function accelerateDelivery(page) {
  return page.evaluate(step => {
    const engine = window.__deliveryEngine;
    const sim = engine?.sim;
    if (!engine || !sim?.state?.delivery) throw new Error('Host delivery simulation is unavailable.');

    // This is a real Simulation run, only clocked with fixed ticks rather than
    // wall time. Inputs are ordinary steering/climb/ cruise inputs. No target,
    // reward, health or delivery field is written by the harness.
    for (let tick = 0; tick < 6000 && !sim.state.over; tick++) {
      for (const pilot of sim.state.players) {
        if (!pilot.active || pilot.hp <= 0) continue;
        const targets = sim.state.delivery.targets
          .filter(target => target.vulnerable && target.completedAt === null)
          .sort((a, b) => Math.abs(a.z - pilot.z) - Math.abs(b.z - pilot.z));
        const target = targets[0] || sim.state.delivery.targets.find(candidate => candidate.completedAt === null);
        const x = target
          ? Math.max(-1, Math.min(1, (target.x - pilot.x) * 0.5))
          : Math.max(-1, Math.min(1, -pilot.x * 0.35));
        // The repair socket is an elevated interaction: keep the courier on
        // the upper, readable line so the real vertical contact check can
        // acquire the exposed crab rather than relying on low-flight aim.
        sim.setInput(pilot.id, { x, z: 0, cruise: true, lift: pilot.y < 20 });
      }
      sim.tick(step);
    }

    // Keep the ordinary host stream authoritative for the guest after the
    // accelerated run. The host Engine and Simulation share this state object.
    engine.state = sim.state;
    const snapshot = sim.snapshot();
    engine.network?.send({ type: 'snapshot', state: snapshot });
    return {
      time: sim.state.time,
      over: sim.state.over,
      mail: {
        recovered: sim.state.delivery.recovered,
        bulbs: sim.state.delivery.bulbs,
        repaired: sim.state.delivery.repaired,
        delivered: sim.state.delivery.delivered,
        restored: sim.state.delivery.restored,
        completed: sim.state.delivery.completed,
        success: sim.state.delivery.success
      }
    };
  }, STEP);
}

test('real delivery peers keep host mail canonical across pause, recovery and replay', async ({ browser }) => {
  const context = await browser.newContext({
    permissions: ['local-network-access'],
    viewport: { width: 800, height: 600 }
  });
  await context.route('**/api/ice', route => route.fulfill({ json: { iceServers: [] } }));
  await context.route(/\/@id\/.*env\/dynamic\/public/, route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export const env = { PUBLIC_PEER_HOST: "127.0.0.1", PUBLIC_PEER_PORT: "9000", PUBLIC_PEER_PATH: "/", PUBLIC_PEER_SECURE: "false" };'
  }));

  const host = await context.newPage();
  const guest = await context.newPage();
  const errors = [];
  collectErrors(host, errors); collectErrors(guest, errors);
  await tapEngine(host); await tapEngine(guest);

  try {
    await open(host); await open(guest);
    await host.getByRole('button', { name: 'CREATE A ROOM' }).click();
    await expect(host.locator('.room-code')).toHaveText(/^[A-Z0-9]{4}$/);
    const code = await host.locator('.room-code').textContent();
    await guest.getByRole('button', { name: 'JOIN WITH CODE' }).click();
    await guest.getByLabel('ROOM PASSCODE').fill(code);
    await guest.getByRole('button', { name: 'CONNECT & FLY' }).click();
    await expect(host.locator('.run-stats')).toBeVisible();
    await expect(guest.locator('.run-stats')).toBeVisible();
    await expect.poll(() => host.evaluate(() => Boolean(window.__deliveryEngine?.sim?.state?.delivery))).toBe(true);
    await expect.poll(() => guest.evaluate(() => Boolean(window.__deliveryEngine?.state?.delivery))).toBe(true);

    // The guest only renders the host snapshot; its delivery digest must match
    // the host's canonical state, including encounter/milestone collections.
    await expect.poll(async () => {
      const [h, g] = await Promise.all([readDigest(host), readDigest(guest)]);
      return JSON.stringify(mailOnly(h)) === JSON.stringify(mailOnly(g));
    }, { timeout: 15000 }).toBe(true);

    // Both local pause flags are held independently, while the host simulation
    // and guest snapshot remain frozen until both pilots resume.
    await guest.keyboard.press('Escape');
    await expect(host.getByRole('dialog')).toBeVisible();
    await expect(guest.getByRole('dialog')).toBeVisible();
    await expect.poll(() => host.evaluate(() => Boolean(window.__deliveryEngine?.paused))).toBe(true);
    await expect.poll(() => guest.evaluate(() => Boolean(window.__deliveryEngine?.paused))).toBe(true);
    const frozenHost = await readDigest(host);
    const frozenGuest = await readDigest(guest);
    await host.waitForTimeout(900);
    expect(await readDigest(host)).toEqual(frozenHost);
    expect(await readDigest(guest)).toEqual(frozenGuest);
    expect(mailOnly(frozenGuest)).toEqual(mailOnly(frozenHost));
    await host.keyboard.press('Escape');
    await guest.getByRole('button', { name: 'RESUME FLIGHT' }).click();
    await expect(guest.getByRole('button', { name: 'WAITING FOR WINGMATE' })).toBeVisible();
    await host.getByRole('button', { name: 'RESUME FLIGHT' }).click();
    await expect(host.getByRole('dialog')).toHaveCount(0);
    await expect(guest.getByRole('dialog')).toHaveCount(0);

    // Close the actual guest PeerConnection. Recovery keeps the existing run
    // and original peer admission; it must not award the same mail twice.
    const beforeRecovery = await readDigest(host);
    await guest.evaluate(() => window.__deliveryEngine.network.connection.peerConnection.close());
    await expect(guest.getByText('Restoring your route.', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect.poll(() => guest.evaluate(() => Boolean(window.__deliveryEngine?.network?.recovering))).toBe(true);
    await expect.poll(() => guest.evaluate(() => ({
      recovering: Boolean(window.__deliveryEngine?.network?.recovering),
      open: Boolean(window.__deliveryEngine?.network?.connection?.open),
      paused: Boolean(window.__deliveryEngine?.paused)
    })), { timeout: 25000 }).toEqual({ recovering: false, open: true, paused: false });
    await expect.poll(async () => {
      const [h, g] = await Promise.all([readDigest(host), readDigest(guest)]);
      return JSON.stringify(mailOnly(h)) === JSON.stringify(mailOnly(g));
    }, { timeout: 15000 }).toBe(true);
    const afterRecovery = await readDigest(host);
    expect(afterRecovery.mail.recovered).toBeGreaterThanOrEqual(beforeRecovery.mail.recovered);
    expect(afterRecovery.mail.bulbs).toBeGreaterThanOrEqual(beforeRecovery.mail.bulbs);
    expect(afterRecovery.mail.repaired).toBeGreaterThanOrEqual(beforeRecovery.mail.repaired);
    assertUniqueIds(afterRecovery.mail);

    // Reach the authored delivery endpoint with real fixed-step simulation
    // actions, then send that resulting host snapshot over the live channel.
    const completion = await accelerateDelivery(host);
    expect(completion.over).toBe(true);
    expect(completion.mail.restored).toBe(true);
    expect(completion.mail.recovered).toBeGreaterThan(0);
    expect(completion.mail.bulbs).toBeGreaterThan(0);
    expect(completion.mail.repaired).toBeGreaterThan(0);
    await expect.poll(() => guest.evaluate(() => Boolean(window.__deliveryEngine?.state?.delivery?.restored)), { timeout: 15000 }).toBe(true);
    await expect.poll(async () => {
      const [h, g] = await Promise.all([readDigest(host), readDigest(guest)]);
      return JSON.stringify(mailOnly(h)) === JSON.stringify(mailOnly(g));
    }, { timeout: 15000 }).toBe(true);
    assertUniqueIds((await readDigest(guest)).mail);

    const starts = await Promise.all([
      host.evaluate(() => window.__deliveryStartCount),
      guest.evaluate(() => window.__deliveryStartCount)
    ]);
    await host.getByRole('button', { name: 'PLAY AGAIN' }).click();
    // Replay is acknowledged through the idempotent replay id, so the stable
    // browser-level signal is exactly one fresh Engine.start on each pilot.
    await expect.poll(() => host.evaluate(() => window.__deliveryStartCount), { timeout: 10000 }).toBe(starts[0] + 1);
    await expect.poll(() => guest.evaluate(() => window.__deliveryStartCount), { timeout: 10000 }).toBe(starts[1] + 1);
    const [replayedHost, replayedGuest] = await Promise.all([readDigest(host), readDigest(guest)]);
    for (const replayed of [replayedHost, replayedGuest]) {
      expect(replayed.mail.recovered).toBe(0);
      expect(replayed.mail.bulbs).toBe(0);
      expect(replayed.mail.repaired).toBe(0);
      expect(replayed.mail.delivered).toBe(0);
      expect(replayed.mail.restored).toBe(false);
      expect(replayed.mail.completed).toBe(false);
      expect(replayed.mail.targets).toEqual([]);
      expect(replayed.mail.releases).toEqual([]);
      expect(replayed.mail.milestones).toEqual({ moths: [false, false, false], parcels: false, crab: false, destination: false });
    }
    expect(await host.evaluate(() => window.__deliveryStartCount)).toBe(starts[0] + 1);
    expect(await guest.evaluate(() => window.__deliveryStartCount)).toBe(starts[1] + 1);
    expect(errors).toEqual([]);
  } finally {
    await host.evaluate(() => window.__deliveryEngine?.network?.destroy()).catch(() => {});
    await guest.evaluate(() => window.__deliveryEngine?.network?.destroy()).catch(() => {});
    await context.close();
  }
});
