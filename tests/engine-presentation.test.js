import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { STEP } from '../src/lib/game/simulation.js';
import { FLIGHT_SPEED } from '../src/lib/game/course.js';

const source = readFileSync(new URL('../src/lib/game/Engine.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export class Engine', 'globalThis.Engine = class Engine');
const context = vm.createContext({ STEP, FLIGHT_SPEED });
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
