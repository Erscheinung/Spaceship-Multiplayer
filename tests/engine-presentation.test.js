import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { STEP } from '../src/lib/game/simulation.js';
import { FLIGHT_SPEED } from '../src/lib/game/course.js';

const source = readFileSync(new URL('../src/lib/game/Engine.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export class Engine', 'globalThis.Engine = class Engine');
const context = vm.createContext({ STEP, FLIGHT_SPEED, performance: { now: () => 1000 } });
vm.runInContext(source, context);
const engine = () => Object.create(context.Engine.prototype);

test('host presentation moves between fixed ticks without mutating simulation', () => {
  const e = engine(); e.mode = 'host'; e.localId = 0;
  e.previousPlayers = [{ x: 0, y: 0, z: 0, vx: 2, vy: 0, boost: 25 }];
  e.state = { time: 1, players: [{ x: 2, y: 2, z: -2, vx: 2, vy: 0, boost: 25 }] };
  e.accumulator = STEP / 2;
  assert.equal(e.renderPlayer().x, 1); assert.equal(e.renderPlayer().z, -1);
  assert.ok(Math.abs(e.renderTime() - (1 - STEP / 2)) < 1e-12);
  assert.equal(e.state.players[0].x, 2);
});

test('remote presentation advances between packets in a consistent route frame', () => {
  const e = engine(); e.mode = 'client'; e.localId = 1;
  const p = { x: 0, y: 0, z: 0, vx: 10, vy: 0, boost: 25 };
  e.remoteSnapshots = [{ time: .8, players: [p] }, { time: 1, players: [{ ...p, x: 2, z: -5 }] }];
  e.state = { time: 1 }; e.clientTime = 1;
  const a = e.remotePlayer(0);
  e.clientTime += .02;
  const b = e.remotePlayer(0);
  assert.ok(b.x > a.x);
  // World route distance must advance by the actual cruise + boost pace.
  const distanceA = 1 * FLIGHT_SPEED - a.z;
  const distanceB = 1.02 * FLIGHT_SPEED - b.z;
  assert.ok(Math.abs(distanceB - distanceA - .02 * (FLIGHT_SPEED + 25)) < 1e-9);
});

test('remote presentation advances smoothly through bursty arrivals and caps gaps', () => {
  const e = engine(); e.mode = 'client'; e.localId = 1; e.state = { time: 10 };
  e.latestSnapshotTime = 10; e.latestSnapshotArrival = .9; e.remotePresentationTime = 9.9; e.remoteFrameTime = .9;
  for (let now = 916; now <= 1400; now += 16) {
    const before = e.remotePresentationTime;
    e.advanceRemotePresentation(now);
    assert.ok(e.remotePresentationTime >= before);
    assert.ok(e.remotePresentationTime - before <= .016 * 1.2 + 1e-9);
    assert.ok(e.remotePresentationTime <= 10.2);
  }
  assert.equal(e.remotePresentationTime, 10.2);
  e.latestSnapshotTime = 10.4; e.latestSnapshotArrival = 1.4;
  const before = e.remotePresentationTime;
  e.advanceRemotePresentation(1412);
  assert.ok(e.remotePresentationTime - before < .025, 'late snapshot must not jump the playback clock');
});

test('remote pilot uses velocity for a bounded late packet gap', () => {
  const e = engine(); e.mode = 'client'; e.localId = 1; e.clientTime = 1.2; e.state = { time: 1.1 };
  e.remotePresentationTime = 1.2;
  e.remoteSnapshots = [
    { time: 1, players: [{ x: 0, y: 2, z: 0, vx: 3, vy: 1, boost: 25 }] },
    { time: 1.1, players: [{ x: 1, y: 2.1, z: -4, vx: 3, vy: 1, boost: 25 }] }
  ];
  const p = e.remotePlayer(0);
  // One tenth of authoritative forward movement plus the route-frame
  // compensation for rendering at the local prediction clock.
  assert.ok(Math.abs(p.x - 1.3) < 1e-9);
  assert.ok(Math.abs(p.y - 2.2) < 1e-9);
  assert.ok(Math.abs(p.z - (-4 - 2.5)) < 1e-9);
});
