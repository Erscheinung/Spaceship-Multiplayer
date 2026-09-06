import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, STEP, BOUNDS } from '../src/lib/game/simulation.js';

test('untrusted movement is normalized, invalid coordinates ignored, arena bounds enforced', () => {
  const sim = new Simulation({ solo: true });
  sim.setInput(0, { x: 10000, z: 10000 });
  assert.ok(Math.abs(Math.hypot(sim.inputs[0].x, sim.inputs[0].z) - 1) < 1e-8);
  sim.setInput(0, { x: NaN, z: Infinity });
  assert.ok(Number.isFinite(sim.inputs[0].x));
  sim.spawnClock = Infinity;
  for (let i = 0; i < 600; i++) sim.tick();
  assert.equal(sim.state.players[0].x, BOUNDS.x); assert.equal(sim.state.players[0].z, BOUNDS.zMax);
});
test('host projectile collision scores once and creates an authoritative upgrade', () => {
  const sim = new Simulation({ random: () => 0.1 }); sim.spawnClock = Infinity;
  sim.state.players.forEach(p => p.cooldown = 10);
  sim.state.rocks.push({ id: 10, x: 0, z: 0, r: 1, hp: 1, speed: 0 });
  sim.state.bullets.push({ id: 11, x: 0, z: 0, vx: 0, vz: 0, life: 1 });
  sim.tick();
  assert.equal(sim.state.score, 100); assert.equal(sim.state.rocks.length, 0); assert.equal(sim.state.bullets.length, 0); assert.equal(sim.state.pickups.length, 1);
  sim.tick(); assert.equal(sim.state.score, 100);
});
test('upgrades are picked up once, affect fire rate/spread and respect caps', () => {
  const sim = new Simulation(); sim.spawnClock = Infinity; const p = sim.state.players[0]; p.rate = 8; p.spread = 1;
  sim.state.pickups = [{ id: 1, x: p.x, z: p.z, type: 'rate', life: 5 }, { id: 2, x: p.x, z: p.z, type: 'spread', life: 5 }];
  sim.tick(); assert.equal(p.rate, 8); assert.equal(p.spread, 2); assert.equal(sim.state.pickups.length, 0);
  sim.state.rocks.push({ id: 10, x: 0, z: -10, r: 1, hp: 100, speed: 0 });
  sim.state.players[1].cooldown = 10; sim.tick(); assert.equal(sim.state.bullets.length, 5); assert.ok(p.cooldown < 0.15);
});
test('damage grants invulnerability, solo ends when pilot dies, final state is frozen', () => {
  const sim = new Simulation({ solo: true }); sim.spawnClock = Infinity; const p = sim.state.players[0]; p.invulnerable = 0; p.hp = 2; p.cooldown = 10;
  const rock = id => ({ id, x: p.x, z: p.z, r: 1, hp: 2, speed: 0 });
  sim.state.rocks = [rock(1), rock(2)]; sim.tick(); assert.equal(p.hp, 1); assert.equal(sim.state.over, false);
  sim.tick(); assert.equal(p.hp, 1); p.invulnerable = 0; sim.tick(); assert.equal(sim.state.over, true);
  const snapshot = sim.snapshot(); sim.tick(); assert.deepEqual(sim.state, snapshot);
});
test('one downed co-op pilot does not end the run', () => {
  const sim = new Simulation(); sim.state.players[0].hp = 0; sim.tick(); assert.equal(sim.state.over, false);
  sim.state.players[1].hp = 0; sim.tick(); assert.equal(sim.state.over, true);
});
test('difficulty scales and snapshots cannot mutate host state', () => {
  const sim = new Simulation({ random: () => 0.5 }); sim.state.time = 100; sim.tick();
  assert.equal(sim.state.wave, 5); assert.ok(sim.spawnClock < 0.6); assert.ok(sim.state.rocks[0].speed > 7);
  const snapshot = sim.snapshot(); snapshot.players[0].hp = 0; assert.equal(sim.state.players[0].hp, 5);
});
test('long run stays bounded and finite', () => {
  const sim = new Simulation({ random: () => 0.6 });
  for (let i = 0; i < 60 * 180; i++) {
    sim.state.players.forEach(p => { p.invulnerable = 10; p.rate = 8; p.spread = 2; }); sim.tick(STEP);
    assert.ok(sim.state.rocks.length <= 60); assert.ok(sim.state.bullets.length < 200);
  }
  assert.ok(sim.state.time > 179); assert.ok(Number.isFinite(sim.state.score));
});
