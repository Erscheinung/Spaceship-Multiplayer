import * as THREE from 'three';
import { createScene } from './scene.js';
import { makeShip, makeRock, makePickup, disposeObject, COLORS } from './procedural.js';
import { Simulation, STEP } from './simulation.js';

export class Engine {
  constructor(container, { onHud, onPause, onError }) {
    this.world = createScene(container); this.onHud = onHud; this.onPause = onPause;
    this.objects = new Map(); this.keys = new Set(); this.touch = { x: 0, z: 0 }; this.state = null;
    this.mode = 'attract'; this.localId = 0; this.paused = false; this.destroyed = false; this.accumulator = 0; this.snapshotClock = 0; this.hudClock = 0; this.attractTime = 0;
    this.ships = [makeShip(0), makeShip(1)]; this.ships.forEach((s, i) => { s.position.set(i ? 4 : -4, 0, 7); this.world.scene.add(s); });
    this.keydown = e => {
      if (this.mode === 'attract' || /INPUT|TEXTAREA|BUTTON/.test(e.target?.tagName)) return;
      if (['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.code === 'Escape' && !e.repeat) this.onPause();
      this.keys.add(e.code);
    };
    this.keyup = e => this.keys.delete(e.code);
    this.blur = () => { this.keys.clear(); this.touch = { x: 0, z: 0 }; if (this.mode !== 'attract' && !this.paused && !this.state?.over) this.onPause(true); };
    this.visibility = () => { if (document.hidden) this.blur(); };
    this.contextLost = e => { e.preventDefault(); this.setPaused(true); onError('WebGL context lost. Reload the page to restore graphics.'); };
    window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup); window.addEventListener('blur', this.blur); document.addEventListener('visibilitychange', this.visibility);
    this.world.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.frame = this.frame.bind(this); this.last = performance.now(); this.raf = requestAnimationFrame(this.frame);
  }
  start({ host = true, solo = false, network = null }) {
    this.network = network; this.localId = host ? 0 : 1; this.mode = host ? 'host' : 'client'; this.sim = host ? new Simulation({ solo }) : null;
    this.state = this.sim?.state ?? null; this.accumulator = 0; this.keys.clear(); this.paused = false;
    this.inputTimer = setInterval(() => { if (this.mode === 'client') this.network?.send({ type: 'input', input: this.paused ? { x: 0, z: 0 } : this.input() }); }, 1000 / 30);
    this.last = performance.now();
  }
  input() { return { x: Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) + this.touch.x, z: Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) + this.touch.z }; }
  receiveInput(input) { this.sim?.setInput(1, input); this.remoteInputTime = performance.now(); }
  receiveSnapshot(state) {
    if (this.mode !== 'client' || !Array.isArray(state.rocks) || !Array.isArray(state.bullets) || !Array.isArray(state.pickups) || !Array.isArray(state.effects)) return;
    this.state = state; this.onHud(state);
    if (state.over) { this.draw(1 / 60); this.world.render(state.time); this.setPaused(true); }
  }
  setPaused(paused) {
    if (this.destroyed || this.paused === paused) return;
    this.paused = paused; this.keys.clear(); this.touch = { x: 0, z: 0 }; this.accumulator = 0;
    this.sim?.setInput(0, { x: 0, z: 0 }); this.sim?.setInput(1, { x: 0, z: 0 });
    if (paused) cancelAnimationFrame(this.raf);
    else { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  }
  frame(now) {
    if (this.paused || this.destroyed) return;
    const dt = Math.min((now - this.last) / 1000, 0.1); this.last = now;
    if (this.mode === 'host') {
      this.accumulator += dt; this.sim.setInput(0, this.input());
      if (now - (this.remoteInputTime ?? 0) > 300) this.sim.setInput(1, { x: 0, z: 0 });
      while (this.accumulator >= STEP) { this.sim.tick(); this.accumulator -= STEP; }
      this.state = this.sim.state; this.snapshotClock += dt; this.hudClock += dt;
      if (this.snapshotClock >= 0.05 || this.state.over) { this.network?.send({ type: 'snapshot', state: this.sim.snapshot() }); this.snapshotClock = 0; }
      if (this.hudClock >= 0.1 || this.state.over) { this.onHud(this.sim.snapshot()); this.hudClock = 0; }
    }
    this.attractTime += dt; this.draw(dt); this.world.render(this.state?.time ?? this.attractTime);
    if (this.state?.over) { this.setPaused(true); return; }
    this.raf = requestAnimationFrame(this.frame);
  }
  draw(dt) {
    const time = this.state?.time ?? this.attractTime;
    this.ships.forEach((ship, i) => {
      const p = this.state?.players[i]; ship.visible = !p || (p.active && p.hp > 0);
      const x = p?.x ?? (i ? 4 : -4), z = p?.z ?? 7;
      const smoothing = this.mode === 'client' ? 1 - Math.exp(-dt * 24) : 1;
      const dx = x - ship.position.x; ship.position.x += dx * smoothing; ship.position.z += (z - ship.position.z) * smoothing;
      ship.position.y = Math.sin(time * 4 + i) * 0.08; ship.rotation.z = THREE.MathUtils.lerp(ship.rotation.z, -dx * 0.2, 0.12);
      if (p?.active && p.hp > 0 && p.invulnerable > 0) ship.visible = Math.floor(time * 12) % 2 === 0;
      ship.children.filter(c => c.name === 'trail').forEach((c, j) => { c.position.x = Math.sin(time * 15 - j) * j * 0.012; c.scale.y = 0.8 + Math.sin(time * 30 + j) * 0.25; });
    });
    if (!this.state) return;
    const alive = new Set();
    const sync = (items, prefix, create, update) => {
      for (const entity of items) {
        const key = prefix + entity.id; alive.add(key); let object = this.objects.get(key);
        if (!object) { object = create(entity); object.position.set(entity.x, 0, entity.z); this.objects.set(key, object); this.world.scene.add(object); }
        const alpha = this.mode === 'client' ? 1 - Math.exp(-dt * 28) : 1;
        object.position.x += (entity.x - object.position.x) * alpha; object.position.z += (entity.z - object.position.z) * alpha; update(object, entity);
      }
    };
    sync(this.state.rocks, 'r', r => makeRock(r.seed), (o, r) => { o.scale.setScalar(r.r); o.rotation.set(time * r.spin, time * 0.3, time * r.spin * 0.4); });
    sync(this.state.pickups, 'p', p => makePickup(p.type), o => { o.rotation.set(time, time * 1.5, Math.PI / 4); o.position.y = Math.sin(time * 4) * 0.35; });
    sync(this.state.bullets, 'b', b => new THREE.Mesh(new THREE.SphereGeometry(0.17, 5, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(b.owner ? COLORS.magenta : COLORS.cyan).multiplyScalar(5) })), (o, b) => { o.scale.set(1, 1, 3); o.rotation.y = Math.atan2(b.vx, b.vz); });
    sync(this.state.effects, 'e', e => {
      const o = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[e.color]).multiplyScalar(3), wireframe: true, transparent: true, depthWrite: false })); return o;
    }, (o, e) => { o.scale.setScalar((0.45 - e.life) * 7 + 0.4); o.material.opacity = e.life / 0.45; o.rotation.y = time * 2; });
    for (const [key, object] of this.objects) if (!alive.has(key)) { disposeObject(object); this.objects.delete(key); }
  }
  destroy() {
    this.destroyed = true; cancelAnimationFrame(this.raf); clearInterval(this.inputTimer);
    window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.blur); document.removeEventListener('visibilitychange', this.visibility);
    this.world.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost); this.world.dispose();
  }
}
