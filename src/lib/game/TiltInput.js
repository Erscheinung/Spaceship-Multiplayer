export class TiltInput {
  constructor(update) { this.update=update;this.enabled=false;this.origin=null;this.value={x:0,z:0};this.onOrientation=this.onOrientation.bind(this); }
  async enable() {
    if(!window.isSecureContext) throw new Error('Tilt needs HTTPS. Drag steering works on this connection.');
    if(!window.DeviceOrientationEvent) throw new Error('This device does not provide tilt controls. Use drag steering.');
    if(typeof DeviceOrientationEvent.requestPermission==='function' && await DeviceOrientationEvent.requestPermission()!=='granted') throw new Error('Motion permission was declined. Drag steering is still available.');
    this.enabled=true;this.origin=null;window.addEventListener('deviceorientation',this.onOrientation);
    clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!this.origin){this.disable();this.update(null,'No tilt signal. Use drag steering on this device.');}},3500);
  }
  onOrientation(e) {
    if(!this.enabled||!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return;
    const angle=(screen.orientation?.angle ?? window.orientation ?? 0)*Math.PI/180;
    if(this.angle !== angle){this.angle=angle;this.origin=null;this.value={x:0,z:0};}
    const x=e.gamma*Math.cos(angle)+e.beta*Math.sin(angle),z=e.beta*Math.cos(angle)-e.gamma*Math.sin(angle);
    if(!this.origin){this.origin={x,z};clearTimeout(this.timer);}
    const axis=n=>Math.abs(n)<2?0:Math.max(-1,Math.min(1,n/22));
    this.value.x+=(axis(x-this.origin.x)-this.value.x)*.3;this.value.z+=(axis(z-this.origin.z)-this.value.z)*.3;
    this.update({...this.value});
  }
  calibrate(){this.origin=null;this.value={x:0,z:0};this.update(this.value);}
  disable(){this.enabled=false;clearTimeout(this.timer);window.removeEventListener('deviceorientation',this.onOrientation);this.update({x:0,z:0});}
}
