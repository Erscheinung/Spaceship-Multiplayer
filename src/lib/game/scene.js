import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeSkyline, disposeObject, outlined } from './procedural.js';
import { worldX, FLIGHT_SPEED, roadCenter } from './course.js';

export function createScene(container) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa5ddd6); scene.fog = new THREE.Fog(0xa5ddd6,80,260);
  const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5)); renderer.toneMapping=THREE.NoToneMapping;
  renderer.domElement.setAttribute('aria-label','Neon Wing illustrated 3D city flight'); container.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(65,1,.1,450);
  scene.add(new THREE.HemisphereLight(0xffffff,0x789597,2.2));
  const sun = new THREE.DirectionalLight(0xffefd3,2.4);sun.position.set(-35,60,-20);scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400,1400),new THREE.MeshToonMaterial({color:0x708f91})); ground.rotation.x=-Math.PI/2;ground.position.y=-4.2;scene.add(ground);
  // A continuous curved road ribbon, updated with the same coordinate map as combat.
  const vertices=new Float32Array(100*18), roadGeo=new THREE.BufferGeometry(); roadGeo.setAttribute('position',new THREE.BufferAttribute(vertices,3));
  const road=new THREE.Mesh(roadGeo,new THREE.MeshBasicMaterial({color:0x769397,side:THREE.DoubleSide}));road.frustumCulled=false;scene.add(road);
  const clouds=new THREE.Group();
  for(let i=0;i<22;i++){
    const c=outlined(new THREE.IcosahedronGeometry(1,1),0xeaf0d9);c.scale.set(9+i%4*3,2+i%3,4);c.position.set(Math.sin(i*23)*170,35+i%5*9,-80-i*12);clouds.add(c);
  }scene.add(clouds);
  const city=makeSkyline(scene);
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.16,.3,1.1);composer.addPass(bloom);const output=new OutputPass();composer.addPass(output);const antialias=new ShaderPass(FXAAShader);composer.addPass(antialias);
  let portrait=false, initialized=false;
  const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;camera.aspect=w/h;portrait=camera.aspect<.85;camera.fov=portrait?78:65;camera.updateProjectionMatrix();renderer.setSize(w,h);composer.setSize(w,h);const ratio=renderer.getPixelRatio();antialias.uniforms.resolution.value.set(1/(w*ratio),1/(h*ratio));};
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  const look=new THREE.Vector3(), desired=new THREE.Vector3();
  return {scene,renderer,camera,resetCamera(){initialized=false;},render(time,player={x:0,z:7},dt=1/60){
    city(time);
    for(let i=0;i<100;i++){
      const z=40-i*3.5,next=z-3.5,a=roadCenter(time*FLIGHT_SPEED-z),b=roadCenter(time*FLIGHT_SPEED-next);
      vertices.set([a-16,-4.12,z,a+16,-4.12,z,b-16,-4.12,next,a+16,-4.12,z,b+16,-4.12,next,b-16,-4.12,next],i*18);
    }roadGeo.attributes.position.needsUpdate=true;
    const px=worldX(player.x,player.z,time);
    desired.set(px,2.6,player.z+(portrait?10.5:12));
    camera.position.lerp(desired,initialized?1-Math.exp(-dt*7):1);
    look.set(px*.8+worldX(player.x,player.z-16,time)*.2,-2,player.z-16);
    camera.lookAt(look);initialized=true;composer.render();
  },dispose(){observer.disconnect();disposeObject(scene);bloom.dispose();output.dispose();antialias.dispose();composer.dispose();renderer.dispose();renderer.domElement.remove();}};
}
