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
    // Project gravity into screen coordinates; Euler subtraction breaks near
    // landscape's gamma seam and when the phone is held upright.
    const beta = e.beta * Math.PI / 180, gamma = e.gamma * Math.PI / 180;
    const angle = orientation * Math.PI / 180;
    const gx = Math.cos(beta) * Math.sin(gamma), gy = Math.sin(beta);
    const screenX = gx * Math.cos(angle) + gy * Math.sin(angle);
    const screenZ = gy * Math.cos(angle) - gx * Math.sin(angle);
    if (!this.origin) { this.origin = { x: screenX, z: screenZ }; clearTimeout(this.timer); }
    const x = (screenX - this.origin.x) * 60, z = (screenZ - this.origin.z) * 60;
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
