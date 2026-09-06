import { DIFFICULTIES, flightSettings } from './settings.js';
import { cityObstacles, hitsBuilding, courseFrame, FLIGHT_SPEED } from './course.js';
export const BOUNDS = { x: 13, zMin: -12, zMax: 13 };
export const STEP = 1 / 60;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, (a.y ?? 0) - (b.y ?? 0));
const player = (id, active) => ({ id, active, x: id ? 4 : -4, z: 8, y: 0, vy: 0, vx: 0, boost: 0, travel: 0, hp: 5, rate: 0, spread: 0, cooldown: 0, invulnerable: 2 });

// Shared movement for authoritative steps and guest visual prediction.
export function advanceFlight(p, input, dt, time) {
  const length = Math.max(1, Math.hypot(input.x, input.z));
  p.boost += ((input.boost ? 25 : 0) - p.boost) * (1 - Math.exp(-dt * (input.boost ? 2.4 : 1.1)));
  p.travel += p.boost * dt;
  const curve = courseFrame(time * FLIGHT_SPEED - p.z).curvature;
  const drift = -curve * (FLIGHT_SPEED + p.boost) ** 2 * .16;
  p.vx += (input.x / length * 12 + drift - p.vx) * (1 - Math.exp(-dt * 10));
  p.x += p.vx * dt;
  const boundary = Math.abs(p.x) > BOUNDS.x;
  if (boundary) { p.x = Math.sign(p.x) * (BOUNDS.x - .15); p.vx *= -.4; p.boost *= .75; }
  p.z = clamp(p.z + input.z / length * 11 * dt - p.boost * dt, BOUNDS.zMin - p.travel, BOUNDS.zMax - p.travel);
  p.vy += ((input.lift ? 10 : -6) - p.vy) * (1 - Math.exp(-dt * 3.5));
  p.y = clamp(p.y + p.vy * dt, 0, 28);
  if (p.y === 0 || p.y === 28) p.vy = 0;
  return boundary;
}

// This module has no browser dependencies. Only the host advances it.
export class Simulation {
  constructor({ solo = false, random = Math.random, settings = {} } = {}) {
    this.settings = flightSettings(settings); this.difficulty = DIFFICULTIES[this.settings.difficulty];
    this.random = random; this.nextId = 1; this.spawnClock = 0;
    this.inputs = [{ x: 0, z: 0 }, { x: 0, z: 0 }];
    this.state = { settings: this.settings, time: 0, score: 0, wave: 1, over: false, players: [player(0, true), player(1, !solo)], rocks: [], bullets: [], pickups: [], effects: [], obstacles: cityObstacles(0) };
  }
  setInput(id, input) {
    if (!this.inputs[id] || !input || !Number.isFinite(input.x) || !Number.isFinite(input.z)) return;
    const length = Math.max(1, Math.hypot(input.x, input.z));
    this.inputs[id] = { x: input.x / length, z: input.z / length, boost: input.boost === true, lift: input.lift === true };
  }
  spawnRock() {
    if (this.state.rocks.length >= 60) return;
    const pilots = this.state.players.filter(p => p.active && p.hp > 0);
    const pilot = pilots[Math.floor(this.random() * pilots.length)] ?? this.state.players[0];
    const r = 0.65 + this.random() * 0.85;
    this.state.rocks.push({ id: this.nextId++, x: (this.random() * 2 - 1) * 13, z: pilot.z - 65, y: Math.max(0, Math.min(28, pilot.y + (this.random() - .5) * 10)), r, hp: Math.ceil(r * 2), speed: (5 + this.state.wave * .75 + this.random() * 2) * this.difficulty.speed, seed: Math.floor(this.random() * 100000), spin: this.random() * 2 - 1 });
  }
  burst(x, z, color, y = 0) { this.state.effects.push({ id: this.nextId++, x, z, y, color, life: 0.45 }); }
  tick(dt = STEP) {
    const s = this.state;
    if (s.over) return;
    s.time += dt; s.obstacles = cityObstacles(s.time, s.players.filter(p => p.active && p.hp > 0)); s.wave = 1 + Math.floor(s.time / 25);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) { this.spawnRock(); this.spawnClock = Math.max(0.12, this.difficulty.spawn - s.time * 0.004); }
    for (const p of s.players) {
      if (!p.active || p.hp <= 0) continue;
      const input = this.inputs[p.id];
      const boundary = advanceFlight(p, input, dt, s.time);
      if (boundary && p.invulnerable <= 0) {
        p.hp = Math.max(0, p.hp - this.difficulty.damage); p.invulnerable = 1.5;
        this.burst(p.x, p.z, p.id ? 'magenta' : 'cyan', p.y);
      }
      p.invulnerable = Math.max(0, p.invulnerable - dt); p.cooldown -= dt;
      const target = s.rocks.reduce((best, r) => !best || distance(p, r) < distance(p, best) ? r : best, null);
      if ((target || !this.difficulty.aim) && p.cooldown <= 0) {
        p.cooldown = Math.max(0.11, 0.48 * Math.pow(0.83, p.rate));
        const direction = this.difficulty.aim && target ? { x: target.x-p.x, y: (target.y ?? 0)-p.y, z: target.z-p.z } : { x:0, y:0, z:-1 };
        const length = Math.max(.001, Math.hypot(direction.x,direction.y,direction.z));
        const count = 1 + p.spread * 2;
        for (let i = 0; i < count; i++) {
          const a = (i - (count - 1) / 2) * .14;
          const vx = direction.x/length, vz = direction.z/length;
          s.bullets.push({ id:this.nextId++, owner:p.id, x:p.x, y:p.y, z:p.z,
            vx:(vx*Math.cos(a)-vz*Math.sin(a))*46, vy:direction.y/length*46, vz:(vx*Math.sin(a)+vz*Math.cos(a))*46-p.boost, life:2 });
        }
      }
    }
    for (const r of s.rocks) r.z += r.speed * dt;
    for (const b of s.bullets) {
      b.y = (b.y ?? 0) + (b.vy ?? 0) * dt; b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      if (s.obstacles.some(building => hitsBuilding(b, building, .17))) { b.life = 0; continue; }
      for (const r of s.rocks) {
        if (r.hp <= 0 || distance(b, r) > r.r + 0.25) continue;
        r.hp--; b.life = 0;
        if (r.hp <= 0) {
          s.score += 100; this.burst(r.x, r.z, 'orange', r.y);
          if (this.random() < 0.42) s.pickups.push({ id: this.nextId++, x: r.x, y: r.y ?? 0, z: r.z, type: this.random() < 0.5 ? 'rate' : 'spread', life: 16 });
        }
        break;
      }
    }
    for (const p of s.players) {
      if (!p.active || p.hp <= 0) continue;
      for (const r of s.rocks) {
        if (r.hp > 0 && p.invulnerable <= 0 && distance(p, r) < r.r + 0.65) {
          p.hp = Math.max(0, p.hp - this.difficulty.damage); p.invulnerable = 1.5; r.hp = 0; this.burst(p.x, p.z, p.id ? 'magenta' : 'cyan', p.y);
        }
      }
      for (const building of s.obstacles) {
        if (hitsBuilding(p, building)) {
          if (p.invulnerable <= 0) { p.hp = Math.max(0, p.hp - this.difficulty.damage); p.invulnerable = 1.5; this.burst(p.x, p.z, p.id ? 'magenta' : 'cyan', p.y); }
          p.boost *= .4;
          if (building.kind === 'gate') {
            p.y = clamp(building.y + (p.y < building.y ? -1 : 1) * (building.height / 2 + .8), 0, 28); p.vy = 0;
          } else {
            const direction = p.x < building.x ? -1 : 1;
            p.x = clamp(building.x + direction * (building.width / 2 + 1), -BOUNDS.x, BOUNDS.x); p.vx = direction * 4;
          }
        }
      }
      for (const drop of s.pickups) {
        if (drop.life <= 0) continue;
        const d = distance(p, drop);
        if (d < 5) { drop.x += (p.x - drop.x) * dt * 4; drop.z += (p.z - drop.z) * dt * 4; drop.y = (drop.y ?? 0) + (p.y - (drop.y ?? 0)) * dt * 4; }
        if (d < 1.3) { p[drop.type] = Math.min(drop.type === 'rate' ? 8 : 2, p[drop.type] + 1); drop.life = 0; this.burst(drop.x, drop.z, 'cyan', drop.y); }
      }
    }
    for (const d of s.pickups) { d.z += dt * 1.8; d.life -= dt; }
    for (const e of s.effects) e.life -= dt;
    const nearby = e => s.players.some(p => p.active && p.hp > 0 && e.z < p.z + 40 && e.z > p.z - 220);
    s.rocks = s.rocks.filter(r => r.hp > 0 && nearby(r));
    s.bullets = s.bullets.filter(b => b.life > 0);
    s.pickups = s.pickups.filter(d => d.life > 0 && nearby(d));
    s.effects = s.effects.filter(e => e.life > 0);
    s.over = s.players.every(p => !p.active || p.hp <= 0);
  }
  snapshot() { return structuredClone(this.state); }
}
