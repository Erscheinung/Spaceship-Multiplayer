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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5)); renderer.toneMapping=THREE.NoToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label','Neon Wing illustrated 3D city flight'); container.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(65,1,.1,450);
  scene.add(new THREE.HemisphereLight(0xffffff,0x789597,2.2));
  const sun = new THREE.DirectionalLight(0xffefd3,2.4);sun.position.set(-25,45,20);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-45,right:45,top:60,bottom:-60,near:1,far:180});sun.shadow.bias=-.0003;sun.shadow.normalBias=.05;scene.add(sun,sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400,1400),new THREE.MeshToonMaterial({color:0x708f91})); ground.receiveShadow=true;ground.rotation.x=-Math.PI/2;ground.position.y=-4.2;scene.add(ground);
  // A continuous curved road ribbon, updated with the same coordinate map as combat.
  const vertices=new Float32Array(100*18), roadGeo=new THREE.BufferGeometry(); roadGeo.setAttribute('position',new THREE.BufferAttribute(vertices,3));
  const road=new THREE.Mesh(roadGeo,new THREE.MeshToonMaterial({color:0x769397,side:THREE.DoubleSide}));road.receiveShadow=true;road.frustumCulled=false;scene.add(road);
  const clouds=new THREE.Group();
  for(let i=0;i<22;i++){
    const c=outlined(new THREE.IcosahedronGeometry(1,1),0xeaf0d9);c.scale.set(9+i%4*3,2+i%3,4);c.position.set(Math.sin(i*23)*170,35+i%5*9,-80-i*12);clouds.add(c);
  }scene.add(clouds);
  const sightGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.8,0,0),new THREE.Vector3(-.25,0,0),new THREE.Vector3(.25,0,0),new THREE.Vector3(.8,0,0),new THREE.Vector3(0,-.8,0),new THREE.Vector3(0,-.25,0),new THREE.Vector3(0,.25,0),new THREE.Vector3(0,.8,0)]);
  const sight=new THREE.LineSegments(sightGeometry,new THREE.LineBasicMaterial({color:0xfff4d9,depthTest:false,transparent:true,opacity:.9}));sight.renderOrder=10;scene.add(sight);
  const city=makeSkyline(scene);
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.16,.3,1.1);composer.addPass(bloom);const output=new OutputPass();composer.addPass(output);const antialias=new ShaderPass(FXAAShader);composer.addPass(antialias);
  let portrait=false, initialized=false;
  const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;camera.aspect=w/h;portrait=camera.aspect<.85;camera.fov=portrait?78:65;camera.updateProjectionMatrix();renderer.setSize(w,h);composer.setSize(w,h);const ratio=renderer.getPixelRatio();antialias.uniforms.resolution.value.set(1/(w*ratio),1/(h*ratio));};
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  const look=new THREE.Vector3(), desired=new THREE.Vector3();
  return {scene,renderer,camera,resetCamera(){initialized=false;},render(time,player={x:0,z:7},dt=1/60,brutal=false){
    city(time,player.z);ground.position.z=player.z;clouds.position.z=player.z;
    for(let i=0;i<100;i++){
      const z=player.z+40-i*3.5,next=z-3.5,a=roadCenter(time*FLIGHT_SPEED-z),b=roadCenter(time*FLIGHT_SPEED-next);
      vertices.set([a-16,-4.12,z,a+16,-4.12,z,b-16,-4.12,next,a+16,-4.12,z,b+16,-4.12,next,b-16,-4.12,next],i*18);
    }roadGeo.attributes.position.needsUpdate=true;roadGeo.computeVertexNormals();
    const px=worldX(player.x,player.z,time);
    desired.set(px,(player.y ?? 0)+2.6,player.z+(portrait?10.5:12));
    camera.position.lerp(desired,initialized?1-Math.exp(-dt*7):1);
    look.set(px*.8+worldX(player.x,player.z-16,time)*.2,(player.y ?? 0)-2,player.z-16);
    const fov=(portrait?78:65)+(player.boost ?? 0)*.25;
    camera.fov+= (fov-camera.fov)*(1-Math.exp(-dt*4));camera.updateProjectionMatrix();
    sun.position.set(px-25,45,player.z+20);sun.target.position.set(px,0,player.z-15);
    camera.lookAt(look);sight.visible=brutal;sight.position.set(worldX(player.x,player.z-35,time),player.y ?? 0,player.z-35);sight.quaternion.copy(camera.quaternion);initialized=true;composer.render();
  },dispose(){observer.disconnect();disposeObject(scene);sun.shadow.dispose();bloom.dispose();output.dispose();antialias.dispose();composer.dispose();renderer.dispose();renderer.domElement.remove();}};
}
