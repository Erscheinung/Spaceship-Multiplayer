import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceDelivery,
  collectDelivery,
  createDeliveryState,
  deliveryAimTargets,
  finishDelivery,
  hitDeliveryTargets
} from '../src/lib/game/delivery.js';
import { FLIGHT_SPEED } from '../src/lib/game/course.js';
import { cityObstacles } from '../src/lib/game/course.js';
import { Simulation, STEP } from '../src/lib/game/simulation.js';
import { deliverySightlineClear } from '../src/lib/game/delivery.js';

const pilots = () => [
  { id: 0, active: true, hp: 5, x: -4, y: 0, z: 8 },
  { id: 1, active: true, hp: 5, x: 4, y: 0, z: 8 }
];

const callbacks = () => ({ score() {}, effect() {} });

function sweepShot(target) {
  const bullet = { id: 101, x: target.x, y: target.y, z: target.z - 8, life: 1 };
  return {
    bullet,
    starts: new Map([[bullet.id, { x: target.x, y: target.y, z: target.z + 8 }]])
  };
}

test('delivery mode is canonical while survival keeps the endless rock simulation', () => {
  const survival = new Simulation({ solo: true, random: () => .5 });
  assert.equal(survival.state.delivery, null);
  survival.tick();
  assert.equal(survival.state.rocks.length, 1);

  const delivery = new Simulation({ solo: false, settings: { mode: 'delivery' }, random: () => .5 });
  assert.equal(delivery.state.delivery.phase, 'intro');
  assert.equal(delivery.state.delivery.deadline, 90);
  for (let index = 0; index < 60; index++) delivery.tick();
  assert.equal(delivery.state.rocks.length, 0);
  const snapshot = delivery.snapshot();
  snapshot.delivery.recovered = 99;
  assert.equal(delivery.state.delivery.recovered, 0);
});

test('first moth tell and natural shot stay in a clear city lane instead of behind the poster tower', () => {
  const sim = new Simulation({ solo: false, settings: { mode: 'delivery' } });
  sim.setInput(0, { x: 0, z: 0, cruise: true });
  let moth = null;
  while (sim.state.time < 11 && moth?.completedAt == null) {
    sim.tick();
    moth = sim.state.delivery.targets.find(target => target.id === 'mail-moth-1') ?? null;
    if (!moth || moth.completedAt !== null) continue;
    const pilot = sim.state.players[0];
    assert.equal(deliverySightlineClear(pilot, moth, cityObstacles(sim.state.time, [pilot])), true,
      `moth occluded during ${moth.stage} at ${sim.state.time.toFixed(2)}s`);
  }
  assert.ok(moth?.completedAt !== null, 'the unobstructed natural assisted shot should release the first moth');
  assert.equal(sim.state.delivery.releases.filter(release => release.sourceId === moth.id).length, 2);
});

test('moths telegraph before vulnerability and a swept shot unfolds mail and bulb releases', () => {
  const delivery = createDeliveryState();
  const players = pilots();
  let motion = advanceDelivery(delivery, { time: 8, dt: STEP, players, callbacks: callbacks() });
  const moth = delivery.targets.find(target => target.kind === 'moth');
  assert.equal(moth.stage, 'folded');
  assert.equal(moth.vulnerable, false);
  const early = sweepShot(moth);
  hitDeliveryTargets(delivery, { bullets: [early.bullet], bulletStarts: early.starts, targetStarts: motion.targetStarts, time: 8, callbacks: callbacks() });
  assert.equal(moth.completedAt, null);
  assert.equal(early.bullet.life, 1);

  motion = advanceDelivery(delivery, { time: 9.5, dt: 1.5, players, callbacks: callbacks() });
  assert.equal(moth.stage, 'exposed');
  assert.equal(deliveryAimTargets(delivery).length, 1);
  const shot = sweepShot(moth);
  hitDeliveryTargets(delivery, { bullets: [shot.bullet], bulletStarts: shot.starts, targetStarts: motion.targetStarts, time: 9.5, callbacks: callbacks() });
  assert.equal(shot.bullet.life, 0);
  assert.equal(moth.stage, 'released');
  assert.deepEqual(delivery.releases.map(release => release.kind).sort(), ['bulb', 'letter']);
  assert.ok(delivery.releases.every(release => release.sourceId === moth.id));
});

test('one leading seal hit starts the four-parcel authored domino and releases each letter once', () => {
  const delivery = createDeliveryState();
  const players = pilots();
  advanceDelivery(delivery, { time: 34, dt: STEP, players, callbacks: callbacks() });
  let motion = advanceDelivery(delivery, { time: 35, dt: 1, players, callbacks: callbacks() });
  const parcels = delivery.targets.filter(target => target.kind === 'parcel');
  assert.equal(parcels.length, 4);
  assert.equal(parcels.filter(target => target.vulnerable).length, 1);
  assert.equal(parcels[0].chainIndex, 0);

  const shot = sweepShot(parcels[0]);
  hitDeliveryTargets(delivery, { bullets: [shot.bullet], bulletStarts: shot.starts, targetStarts: motion.targetStarts, time: 35, callbacks: callbacks() });
  assert.ok(parcels.every(target => target.stage === 'opening' && target.vulnerable === false));
  for (const time of [35.01, 35.2, 35.4, 35.6]) {
    motion = advanceDelivery(delivery, { time, dt: .2, players, callbacks: callbacks() });
  }
  assert.ok(parcels.every(target => target.stage === 'released' && target.completedAt !== null));
  assert.equal(delivery.releases.filter(release => release.kind === 'letter').length, 4);
  advanceDelivery(delivery, { time: 36, dt: .4, players, callbacks: callbacks() });
  assert.equal(new Set(delivery.releases.map(release => release.id)).size, 4);
});

test('clockwork crab exposes a socket, repairs after a swept hit, and never becomes a destroyed target', () => {
  const delivery = createDeliveryState();
  const players = pilots();
  advanceDelivery(delivery, { time: 60, dt: STEP, players, callbacks: callbacks() });
  const crab = delivery.targets.find(target => target.kind === 'crab');
  assert.equal(crab.stage, 'guarded');
  assert.equal(crab.vulnerable, false);
  const motion = advanceDelivery(delivery, { time: 61.8, dt: 1.8, players, callbacks: callbacks() });
  assert.equal(crab.stage, 'exposed');
  const shot = sweepShot(crab);
  hitDeliveryTargets(delivery, { bullets: [shot.bullet], bulletStarts: shot.starts, targetStarts: new Map([[crab.id, { x: crab.x, y: crab.y, z: crab.z }]]), time: 61.8, callbacks: callbacks() });
  assert.equal(crab.stage, 'repairing');
  assert.equal(delivery.repaired, 0);
  advanceDelivery(delivery, { time: 62.4, dt: .6, players, callbacks: callbacks() });
  assert.equal(crab.stage, 'repaired');
  assert.equal(delivery.repaired, 1);
  assert.equal(delivery.releases.filter(release => release.sourceId === crab.id).length, 0);
});

test('low flight safely bypasses crab auto-repair while a deliberate climb acquires its socket', () => {
  const sim = new Simulation({ solo: false, settings: { mode: 'delivery' } });
  const delivery = sim.state.delivery;
  const pilot = sim.state.players[0];
  delivery.milestones = { moths: [true, true, true], parcels: true, crab: true, destination: true };
  const crab = {
    id: 'mail-crab-test', kind: 'crab', encounter: 'sign-crab', x: pilot.x, y: 8, z: pilot.z - 30,
    r: 2.1, hp: 1, maxHp: 1, routeDistance: 30 - pilot.z, spawnedAt: -2,
    stage: 'exposed', open: true, vulnerable: true, tell: 1, completedAt: null,
    baseX: pilot.x, baseY: 8, repairAt: null
  };
  delivery.targets = [crab];
  pilot.cooldown = 0;
  for (let index = 0; index < 20; index++) sim.tick();
  assert.equal(sim.state.bullets.length, 0);
  assert.equal(delivery.repaired, 0);
  assert.equal(crab.stage, 'exposed');

  pilot.y = 8;
  pilot.vy = 0;
  pilot.cooldown = 0;
  sim.tick();
  assert.equal(sim.state.bullets.length, 1);
  for (let index = 0; index < 90 && delivery.repaired === 0; index++) sim.tick();
  assert.equal(delivery.repaired, 1);
  assert.equal(crab.stage, 'repaired');
});

test('assisted delivery fire remains forward-only and ignores vulnerable targets behind the hull', () => {
  const sim = new Simulation({ solo: false, settings: { mode: 'delivery' } });
  sim.state.time = 9.5;
  const delivery = sim.state.delivery;
  const p = sim.state.players[0];
  p.y = 28;
  advanceDelivery(delivery, { time: sim.state.time, dt: 0, players: sim.state.players, callbacks: callbacks() });
  const moth = delivery.targets.find(target => target.kind === 'moth');
  moth.spawnedAt = sim.state.time - 2;
  moth.baseX = p.x;
  moth.baseY = 24;
  moth.routeDistance = sim.state.time * FLIGHT_SPEED - (p.z + 20);
  p.cooldown = 0;
  sim.tick();
  assert.equal(sim.state.bullets.length, 0);

  moth.routeDistance = sim.state.time * FLIGHT_SPEED - (p.z - 30);
  moth.spawnedAt = sim.state.time - 2;
  p.cooldown = 0;
  sim.tick();
  assert.equal(sim.state.bullets.length, 1);
  assert.ok(sim.state.bullets[0].vz < 0);
});

test('swept collection is shared, stable-idempotent in co-op, and delivery can complete through either survivor', () => {
  const delivery = createDeliveryState();
  const players = pilots();
  players[0].z = -10;
  players[1].z = -10;
  const release = {
    id: 'shared-letter', kind: 'letter', sourceId: 'mail-moth-1', x: 0, y: 0, z: 0, r: .85,
    life: 10, routeDistance: 0, spawnedAt: 1, collectedAt: null, collectedBy: null
  };
  delivery.releases.push(release);
  const playerStarts = [{ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 10 }];
  collectDelivery(delivery, {
    players,
    playerStarts,
    releaseStarts: new Map([[release.id, { x: 0, y: 0, z: 0 }]]),
    destinationStart: null,
    time: 10,
    dt: STEP,
    callbacks: callbacks()
  });
  assert.equal(delivery.recovered, 1);
  assert.equal(delivery.rack[0].letters + delivery.rack[1].letters, 1);
  const collector = release.collectedBy;
  collectDelivery(delivery, { players, playerStarts, releaseStarts: new Map(), destinationStart: null, time: 10.1, dt: STEP, callbacks: callbacks() });
  assert.equal(delivery.recovered, 1);
  assert.equal(release.collectedBy, collector);

  players[0].hp = 0;
  players[1] = { ...players[1], x: 0, y: 4, z: -12 };
  delivery.destination = {
    id: 'mail-destination', shop: 'nightjar-radio', x: 0, y: 4, z: 0, r: 12,
    routeDistance: 0, spawnedAt: 75, open: true, deliveredAt: null, failedAt: null
  };
  let awards = 0;
  collectDelivery(delivery, {
    players,
    playerStarts: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 4, z: 12 }],
    releaseStarts: new Map(),
    destinationStart: { x: 0, y: 4, z: 0 },
    time: 87,
    dt: STEP,
    callbacks: { score: points => { awards += points; }, effect() {} }
  });
  assert.equal(delivery.delivered, 1);
  assert.equal(delivery.restored, true);
  assert.equal(delivery.success, true);
  const firstAward = awards;
  collectDelivery(delivery, {
    players,
    playerStarts: players,
    releaseStarts: new Map(),
    destinationStart: delivery.destination,
    time: 87.1,
    dt: STEP,
    callbacks: { score: points => { awards += points; }, effect() {} }
  });
  assert.equal(awards, firstAward);
});

test('successful arrival remains visible until the nominal finish, then freezes a complete result', () => {
  const sim = new Simulation({ solo: false, settings: { mode: 'delivery' } });
  const delivery = sim.state.delivery;
  const pilot = sim.state.players[0];
  sim.state.time = 86.9;
  delivery.recovered = 1;
  delivery.rack[0].letters = 1;
  delivery.milestones.destination = true;
  const routeDistance = sim.state.time * FLIGHT_SPEED - pilot.z;
  delivery.destination = {
    id: 'mail-destination', shop: 'nightjar-radio', x: pilot.x, y: pilot.y, z: pilot.z, r: 12,
    routeDistance, spawnedAt: 75, open: true, deliveredAt: null, failedAt: null
  };
  pilot.cooldown = 10;
  sim.tick();
  assert.equal(delivery.restored, true);
  assert.equal(delivery.completed, false);
  assert.equal(sim.state.over, false);
  while (!sim.state.over) sim.tick();
  assert.equal(delivery.phase, 'complete');
  assert.deepEqual(delivery.result, {
    success: true, reason: 'delivered', recovered: 1, bulbs: 0, repaired: 0, delivered: 1, grade: 'C'
  });
  assert.ok(delivery.completedAt >= 90);
  const frozen = sim.snapshot();
  sim.tick();
  assert.deepEqual(sim.state, frozen);
});

test('zero recovered mail fails explicitly at the deadline and never restores the shop', () => {
  const sim = new Simulation({ solo: false, settings: { mode: 'delivery' } });
  const delivery = sim.state.delivery;
  const pilot = sim.state.players[0];
  sim.state.time = 86.9;
  delivery.milestones.destination = true;
  const routeDistance = sim.state.time * FLIGHT_SPEED - pilot.z;
  delivery.destination = {
    id: 'mail-destination', shop: 'nightjar-radio', x: pilot.x, y: pilot.y, z: pilot.z, r: 12,
    routeDistance, spawnedAt: 75, open: true, deliveredAt: null, failedAt: null
  };
  pilot.cooldown = 10;
  sim.tick();
  assert.equal(delivery.destination.failedAt !== null, true);
  assert.equal(delivery.restored, false);
  while (!sim.state.over) sim.tick();
  assert.equal(delivery.phase, 'failed');
  assert.equal(delivery.result.success, false);
  assert.equal(delivery.result.reason, 'no-mail');
  assert.equal(delivery.delivered, 0);
  assert.equal(delivery.restored, false);
});

test('a lost co-op mission reports failure once, while one surviving pilot keeps it live', () => {
  const delivery = createDeliveryState();
  assert.equal(finishDelivery(delivery, { time: 20, allPilotsLost: false }), false);
  assert.equal(delivery.completed, false);
  assert.equal(finishDelivery(delivery, { time: 21, allPilotsLost: true }), true);
  assert.equal(delivery.result.reason, 'lost');
  const result = structuredClone(delivery.result);
  assert.equal(finishDelivery(delivery, { time: 22, allPilotsLost: true }), true);
  assert.deepEqual(delivery.result, result);
});
