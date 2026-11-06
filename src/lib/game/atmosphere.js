import * as THREE from 'three';
import { surfaceLight } from './surfaces.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Civil-clock art direction, deliberately independent of simulation and location.
// getHours uses the device timezone and its DST rules. No location permission.
export function localLighting(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const elevation = Math.sin((hour - 6) * Math.PI / 12);
  const day = smooth(-.14, .18, elevation);
  const gold = (1 - smooth(.08, .5, Math.abs(elevation))) * day;
  const angle = (hour - 6) * Math.PI / 12;
  return { hour, day, night: 1 - day, gold, elevation, direction: [Math.cos(angle) * .85, elevation, -.45] };
}

export function createAtmosphere(scene, hemisphere, sun, bloom, clock = () => new Date()) {
  const uniforms = {
    zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    sunDirection: { value: new THREE.Vector3() }, night: { value: 0 }, gold: { value: 0 }
  };
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms,
    vertexShader: `varying vec3 skyDirection; void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: /* glsl */`
      varying vec3 skyDirection;
      uniform vec3 zenith,horizon,sunDirection;
      uniform float night,gold;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      void main(){
        vec3 d=normalize(skyDirection), s=normalize(sunDirection);
        float height=clamp(d.y,0.0,1.0);
        vec3 color=mix(horizon,zenith,pow(height,.55));
        float sd=max(dot(d,s),0.0), md=max(dot(d,-s),0.0);
        float halo=pow(sd,14.0)*.25+pow(sd,100.0)*.38;
        // Angular rays live on the sky: opaque architecture occludes them.
        vec3 tangent=normalize(cross(s,vec3(0,1,0)));
        vec3 bitangent=cross(s,tangent);
        float angle=atan(dot(d,bitangent),dot(d,tangent));
        float rays=pow(abs(sin(angle*6.0+.4)),14.0)*pow(sd,34.0)*.14;
        color+=vec3(1.0,.61,.25)*(halo+rays)*(1.0-night);
        float disk=smoothstep(.99935,.99965,sd);
        color+=vec3(2.4,1.7,.8)*disk*(1.0-night);
        float moon=smoothstep(.99925,.99955,md);
        vec2 moonUv=vec2(dot(d,tangent),dot(d,bitangent))*30.0;
        float crater=1.0-.14*(1.0-smoothstep(.12,.28,length(moonUv-vec2(.26,.12))));
        crater-=.09*(1.0-smoothstep(.1,.22,length(moonUv-vec2(-.3,-.22))));
        crater-=.06*(1.0-smoothstep(.08,.18,length(moonUv-vec2(.08,-.4))));
        color+=vec3(.7,.85,1.15)*moon*crater*night;
        color+=vec3(.16,.23,.4)*pow(md,36.0)*night;
        vec3 cell=floor(d*340.0); float star=step(.9985,hash(cell));
        color+=vec3(.6,.75,1.0)*star*night*smoothstep(.04,.3,height);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(390,32,16),skyMaterial);
  sky.frustumCulled=false; sky.renderOrder=-100; scene.add(sky);
  const dayZenith=new THREE.Color(0x418cae), nightZenith=new THREE.Color(0x0b1537);
  const dayHorizon=new THREE.Color(0xc8e1d5), nightHorizon=new THREE.Color(0x3b4269), sunset=new THREE.Color(0xf0ae78);
  const warmSun=new THREE.Color(0xffb572), noonSun=new THREE.Color(0xfff0d2), moonSun=new THREE.Color(0x9db9ed);
  const lightDirection=new THREE.Vector3(), warmGround=new THREE.Color(0x686879), dayGround=new THREE.Color(0x8b9f96);
  let lastSecond=-1, lighting;
  function update(camera, point) {
    const date=clock(), second=Math.floor(date.getTime()/1000);
    if(second!==lastSecond){
      lastSecond=second; lighting=localLighting(date);
      const {day,night,gold,direction}=lighting;
      surfaceLight.night.value=night; uniforms.night.value=night; uniforms.gold.value=gold;
      uniforms.sunDirection.value.set(...direction).normalize();
      uniforms.zenith.value.copy(nightZenith).lerp(dayZenith,day);
      uniforms.horizon.value.copy(nightHorizon).lerp(dayHorizon,day).lerp(sunset,gold*.8);
      scene.fog.color.copy(uniforms.horizon.value); scene.fog.near=65; scene.fog.far=night> .8?230:300;
      hemisphere.color.setHex(0xa1b9ef).lerp(new THREE.Color(0xfff4e0),day);
      hemisphere.groundColor.copy(warmGround).lerp(dayGround,day);
      hemisphere.intensity=.85+day*.9;
      sun.color.copy(moonSun).lerp(noonSun,day).lerp(warmSun,gold*.9);
      sun.intensity=(.55+day*1.6)*(.12+.88*smooth(.02,.3,Math.abs(lighting.elevation)));
      bloom.strength=.18+night*.14;
    }
    sky.position.copy(camera.position);
    lightDirection.copy(uniforms.sunDirection.value);
    // Crossfade the sun/moon azimuth near blue hour instead of flipping shadows.
    const polarity=2*lighting.day-1;
    lightDirection.x*=polarity;lightDirection.z*=polarity;
    lightDirection.y=Math.max(.18,Math.abs(lightDirection.y));lightDirection.normalize();
    sun.position.copy(point).addScaledVector(lightDirection,70);sun.target.position.copy(point);
    return lighting;
  }
  return { update, sky };
}
