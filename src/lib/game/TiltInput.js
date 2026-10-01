export class TiltInput {
  constructor(update) {
    this.update = update; this.enabled = false; this.origin = null; this.value = { x: 0, z: 0 }; this.requestId = 0;
    this.onOrientation = this.onOrientation.bind(this); this.onRotation = this.onRotation.bind(this);
  }
  // Call directly from a button click: Safari's permission prompt requires
  // user activation, which a native select's change event may not retain.
  async enable() {
    this.disable();
    const request = this.requestId;
    if (!window.isSecureContext) throw new Error('Tilt needs HTTPS. Drag steering works on this connection.');
    const orientation = window.DeviceOrientationEvent;
    if (!orientation) throw new Error('This device does not provide tilt controls. Use drag steering.');
    if (typeof orientation.requestPermission === 'function') {
      let permission;
      try { permission = await orientation.requestPermission(); }
      catch { throw new Error('Tap ENABLE TILT to allow Motion and Orientation access in Safari.'); }
      if (request !== this.requestId) return false;
      if (permission !== 'granted') throw new Error('Motion access is blocked. Allow Motion and Orientation access in browser settings, reload, then tap ENABLE TILT.');
    }
    if (request !== this.requestId) return false;
    this.enabled = true; this.angle = this.screenAngle(); this.lastSignal = 0;
    window.addEventListener('deviceorientation', this.onOrientation);
    window.addEventListener('deviceorientationabsolute', this.onOrientation);
    window.addEventListener('orientationchange', this.onRotation);
    window.screen?.orientation?.addEventListener?.('change', this.onRotation);
    this.timer = setTimeout(() => {
      if (this.enabled && !this.origin) { this.disable(); this.update(null, 'No tilt signal. Check Motion and Orientation access in browser settings, then try ENABLE TILT again.'); }
    }, 7000);
    return true;
  }
  screenAngle() { return window.screen?.orientation?.angle ?? window.orientation ?? 0; }
  onRotation() { this.angle = this.screenAngle(); this.calibrate(); }
  onOrientation(e) {
    if (!this.enabled || !Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
    const orientation = this.screenAngle();
    if (this.angle !== orientation) this.onRotation();
    // Subtract neutral angles before rotating into screen space. Normalizing
    // the delta prevents the +/-180-degree seam from producing full steering.
    if (!this.origin) { this.origin = { beta: e.beta, gamma: e.gamma }; clearTimeout(this.timer); }
    const delta = (a, b) => ((a - b + 540) % 360) - 180;
    const beta = delta(e.beta, this.origin.beta), gamma = delta(e.gamma, this.origin.gamma), angle = orientation * Math.PI / 180;
    const x = gamma * Math.cos(angle) + beta * Math.sin(angle), z = beta * Math.cos(angle) - gamma * Math.sin(angle);
    const axis = n => Math.abs(n) < 2 ? 0 : Math.max(-1, Math.min(1, (n - Math.sign(n) * 2) / 20));
    const now = performance.now(), blend = this.lastSignal ? 1 - Math.exp(-Math.min(.1, (now - this.lastSignal) / 1000) * 20) : 1;
    this.lastSignal = now;
    this.value.x += (axis(x) - this.value.x) * blend; this.value.z += (axis(z) - this.value.z) * blend;
    this.update({ ...this.value });
  }
  calibrate() { this.origin = null; this.lastSignal = 0; this.value = { x: 0, z: 0 }; this.update({ ...this.value }); }
  disable() {
    this.requestId++; this.enabled = false; clearTimeout(this.timer);
    window.removeEventListener('deviceorientation', this.onOrientation); window.removeEventListener('deviceorientationabsolute', this.onOrientation);
    window.removeEventListener('orientationchange', this.onRotation); window.screen?.orientation?.removeEventListener?.('change', this.onRotation);
    this.calibrate();
  }
}
