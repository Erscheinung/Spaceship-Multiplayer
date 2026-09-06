import { cityObstacles, hitsBuilding } from './course.js';
export const BOUNDS = { x: 13, zMin: -12, zMax: 13 };
export const STEP = 1 / 60;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const player = (id, active) => ({ id, active, x: id ? 4 : -4, z: 8, hp: 5, rate: 0, spread: 0, cooldown: 0, invulnerable: 2 });

// This module has no browser dependencies. Only the host advances it.
export class Simulation {
  constructor({ solo = false, random = Math.random } = {}) {
    this.random = random; this.nextId = 1; this.spawnClock = 0;
    this.inputs = [{ x: 0, z: 0 }, { x: 0, z: 0 }];
    this.state = { time: 0, score: 0, wave: 1, over: false, players: [player(0, true), player(1, !solo)], rocks: [], bullets: [], pickups: [], effects: [], obstacles: cityObstacles(0) };
  }
  setInput(id, input) {
    if (!this.inputs[id] || !input || !Number.isFinite(input.x) || !Number.isFinite(input.z)) return;
    const length = Math.max(1, Math.hypot(input.x, input.z));
    this.inputs[id] = { x: input.x / length, z: input.z / length };
  }
  spawnRock() {
    if (this.state.rocks.length >= 60) return;
    const r = 0.65 + this.random() * 0.85;
    this.state.rocks.push({ id: this.nextId++, x: (this.random() * 2 - 1) * 13, z: -29, r, hp: Math.ceil(r * 2), speed: 3.5 + this.state.wave * 0.55 + this.random() * 2, seed: Math.floor(this.random() * 100000), spin: this.random() * 2 - 1 });
  }
  burst(x, z, color) { this.state.effects.push({ id: this.nextId++, x, z, color, life: 0.45 }); }
  tick(dt = STEP) {
    const s = this.state;
    if (s.over) return;
    s.time += dt; s.obstacles = cityObstacles(s.time); s.wave = 1 + Math.floor(s.time / 25);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) { this.spawnRock(); this.spawnClock = Math.max(0.16, 1.1 - s.time * 0.006); }
    for (const p of s.players) {
      if (!p.active || p.hp <= 0) continue;
      const input = this.inputs[p.id];
      p.x = clamp(p.x + input.x * 11 * dt, -BOUNDS.x, BOUNDS.x);
      p.z = clamp(p.z + input.z * 11 * dt, BOUNDS.zMin, BOUNDS.zMax);
      p.invulnerable = Math.max(0, p.invulnerable - dt); p.cooldown -= dt;
      const target = s.rocks.reduce((best, r) => !best || distance(p, r) < distance(p, best) ? r : best, null);
      if (target && p.cooldown <= 0) {
        p.cooldown = Math.max(0.11, 0.48 * Math.pow(0.83, p.rate));
        const angle = Math.atan2(target.x - p.x, target.z - p.z);
        const count = 1 + p.spread * 2;
        for (let i = 0; i < count; i++) {
          const a = angle + (i - (count - 1) / 2) * 0.14;
          s.bullets.push({ id: this.nextId++, owner: p.id, x: p.x, z: p.z, vx: Math.sin(a) * 32, vz: Math.cos(a) * 32, life: 1.8 });
        }
      }
    }
    for (const r of s.rocks) r.z += r.speed * dt;
    for (const b of s.bullets) {
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      if (s.obstacles.some(building => hitsBuilding(b, building, .17))) { b.life = 0; continue; }
      for (const r of s.rocks) {
        if (r.hp <= 0 || distance(b, r) > r.r + 0.25) continue;
        r.hp--; b.life = 0;
        if (r.hp <= 0) {
          s.score += 100; this.burst(r.x, r.z, 'orange');
          if (this.random() < 0.42) s.pickups.push({ id: this.nextId++, x: r.x, z: r.z, type: this.random() < 0.5 ? 'rate' : 'spread', life: 16 });
        }
        break;
      }
    }
    for (const p of s.players) {
      if (!p.active || p.hp <= 0) continue;
      for (const r of s.rocks) {
        if (r.hp > 0 && p.invulnerable <= 0 && distance(p, r) < r.r + 0.65) {
          p.hp--; p.invulnerable = 1.5; r.hp = 0; this.burst(p.x, p.z, p.id ? 'magenta' : 'cyan');
        }
      }
      for (const building of s.obstacles) {
        if (hitsBuilding(p, building)) {
          if (p.invulnerable <= 0) { p.hp--; p.invulnerable = 1.5; this.burst(p.x, p.z, p.id ? 'magenta' : 'cyan'); }
          const direction = p.x < building.x ? -1 : 1;
          p.x = clamp(building.x + direction * (building.width / 2 + 1), -BOUNDS.x, BOUNDS.x);
        }
      }
      for (const drop of s.pickups) {
        if (drop.life <= 0) continue;
        const d = distance(p, drop);
        if (d < 5) { drop.x += (p.x - drop.x) * dt * 4; drop.z += (p.z - drop.z) * dt * 4; }
        if (d < 1.3) { p[drop.type] = Math.min(drop.type === 'rate' ? 8 : 2, p[drop.type] + 1); drop.life = 0; this.burst(drop.x, drop.z, 'cyan'); }
      }
    }
    for (const d of s.pickups) { d.z += dt * 1.8; d.life -= dt; }
    for (const e of s.effects) e.life -= dt;
    s.rocks = s.rocks.filter(r => r.hp > 0 && r.z < 22);
    s.bullets = s.bullets.filter(b => b.life > 0);
    s.pickups = s.pickups.filter(d => d.life > 0 && d.z < 22);
    s.effects = s.effects.filter(e => e.life > 0);
    s.over = s.players.every(p => !p.active || p.hp <= 0);
  }
  snapshot() { return structuredClone(this.state); }
}
