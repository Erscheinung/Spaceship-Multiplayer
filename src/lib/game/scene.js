import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeSkyline, disposeObject, outlined } from './procedural.js';
import { worldPosition, courseFrame, FLIGHT_SPEED } from './course.js';

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
  const vertices=new Float32Array(160*18), roadGeo=new THREE.BufferGeometry(); roadGeo.setAttribute('position',new THREE.BufferAttribute(vertices,3));
  const road=new THREE.Mesh(roadGeo,new THREE.MeshToonMaterial({color:0x769397,side:THREE.DoubleSide}));road.receiveShadow=true;road.frustumCulled=false;scene.add(road);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(.45, 8, 1),new THREE.MeshToonMaterial({color:0xe3c56f}),320);
  rails.castShadow=true;rails.receiveShadow=true;rails.frustumCulled=false;scene.add(rails);
  const guards=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,24,1),new THREE.MeshBasicMaterial({color:0x19cddd,transparent:true,opacity:.08,depthWrite:false}),320);
  guards.frustumCulled=false;scene.add(guards);
  const railDummy=new THREE.Object3D();
  const clouds=new THREE.Group();
  for(let i=0;i<22;i++){
    const c=outlined(new THREE.IcosahedronGeometry(1,1),0xeaf0d9);c.scale.set(9+i%4*3,2+i%3,4);c.position.set(Math.sin(i*23)*170,35+i%5*9,-80-i*12);clouds.add(c);
  }scene.add(clouds);
  const sightGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.8,0,0),new THREE.Vector3(-.25,0,0),new THREE.Vector3(.25,0,0),new THREE.Vector3(.8,0,0),new THREE.Vector3(0,-.8,0),new THREE.Vector3(0,-.25,0),new THREE.Vector3(0,.25,0),new THREE.Vector3(0,.8,0)]);
  const sight=new THREE.LineSegments(sightGeometry,new THREE.LineBasicMaterial({color:0xfff4d9,depthTest:false,transparent:true,opacity:.9}));sight.renderOrder=10;scene.add(sight);
  const city=makeSkyline(scene);
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.16,.3,1.1);composer.addPass(bloom);const output=new OutputPass();composer.addPass(output);const antialias=new ShaderPass(FXAAShader);composer.addPass(antialias);
  let portrait=false, initialized=false, roadSection=null;
  const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;camera.aspect=w/h;portrait=camera.aspect<.85;camera.fov=portrait?78:65;camera.updateProjectionMatrix();renderer.setSize(w,h);composer.setSize(w,h);const ratio=renderer.getPixelRatio();antialias.uniforms.resolution.value.set(1/(w*ratio),1/(h*ratio));};
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  const look=new THREE.Vector3(), desired=new THREE.Vector3();
  return {scene,renderer,camera,resetCamera(){initialized=false;},render(time,player={x:0,z:7},dt=1/60,brutal=false){
    const frame=courseFrame(time*FLIGHT_SPEED-player.z), point=worldPosition(player.x,player.y ?? 0,player.z,time);
    city(time,player.z);ground.position.set(frame.x,-8,frame.z);clouds.position.set(frame.x,0,frame.z);
    const section=Math.floor((time*FLIGHT_SPEED-player.z)/2);
    if (section !== roadSection) {
    roadSection=section;
    for(let i=0;i<160;i++){
      const z=time*FLIGHT_SPEED-section*2+35-i*2,next=z-2;
      const a=worldPosition(-13.8,-4,z,time),b=worldPosition(13.8,-4,z,time),c=worldPosition(-13.8,-4,next,time),d=worldPosition(13.8,-4,next,time);
      vertices.set([a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,b.x,b.y,b.z,d.x,d.y,d.z,c.x,c.y,c.z],i*18);
      for(const [side,j] of [[-1,0],[1,1]]) {
        const start=worldPosition(side*13.8,0,z,time),end=worldPosition(side*13.8,0,next,time),f=courseFrame(time*FLIGHT_SPEED-(z+next)/2);
        railDummy.position.set((start.x+end.x)/2,(start.y+end.y)/2,(start.z+end.z)/2);
        railDummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(f.right.x,f.right.y,f.right.z),new THREE.Vector3(f.up.x,f.up.y,f.up.z),new THREE.Vector3(-f.forward.x,-f.forward.y,-f.forward.z)));
        railDummy.scale.z=Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)+.1;
        railDummy.updateMatrix();rails.setMatrixAt(i*2+j,railDummy.matrix);
        railDummy.position.addScaledVector(new THREE.Vector3(f.up.x,f.up.y,f.up.z),16);railDummy.updateMatrix();guards.setMatrixAt(i*2+j,railDummy.matrix);
      }
    }guards.instanceMatrix.needsUpdate=true;rails.instanceMatrix.needsUpdate=true;roadGeo.attributes.position.needsUpdate=true;roadGeo.computeVertexNormals();
    }
    const back=portrait?10.5:12;
    desired.set(point.x-frame.forward.x*back+frame.up.x*2.6,point.y-frame.forward.y*back+frame.up.y*2.6,point.z-frame.forward.z*back+frame.up.z*2.6);
    camera.position.lerp(desired,initialized?1-Math.exp(-dt*9):1);
    const ahead=worldPosition(player.x,(player.y ?? 0)-1,player.z-18,time);
    look.set(ahead.x,ahead.y,ahead.z);
    camera.up.lerp(new THREE.Vector3(frame.up.x,frame.up.y,frame.up.z),initialized?1-Math.exp(-dt*5):1).normalize();
    const fov=(portrait?78:65)+(player.boost ?? 0)*.25;
    camera.fov+=(fov-camera.fov)*(1-Math.exp(-dt*4));camera.updateProjectionMatrix();
    sun.position.set(point.x-25,point.y+45,point.z+20);sun.target.position.set(point.x,point.y-4,point.z);
    camera.lookAt(look);sight.visible=brutal;
    const aim=worldPosition(player.x,player.y ?? 0,player.z-35,time);sight.position.set(aim.x,aim.y,aim.z);sight.quaternion.copy(camera.quaternion);initialized=true;composer.render();
  },dispose(){observer.disconnect();disposeObject(scene);sun.shadow.dispose();bloom.dispose();output.dispose();antialias.dispose();composer.dispose();renderer.dispose();renderer.domElement.remove();}};
}
