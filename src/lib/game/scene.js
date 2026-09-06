import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeSkyline, disposeObject } from './procedural.js';

export function createScene(container) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x080611); scene.fog = new THREE.FogExp2(0x10091e, 0.012);
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.domElement.setAttribute('aria-label', 'Neon Wing 3D flight arena'); container.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(53, 1, 0.1, 300); camera.position.set(0, 28, 34); camera.lookAt(0, 0, -9);
  scene.add(new THREE.AmbientLight(0x7186c9, 2)); const light = new THREE.DirectionalLight(0xffa3db, 3); light.position.set(8, 20, 10); scene.add(light);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x070611, metalness: 0.7, roughness: 0.5 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -4.1; scene.add(ground);
  const grid = new THREE.GridHelper(300, 100, 0xe51b91, 0x52205a); grid.position.y = -4; scene.add(grid);
  const lane = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(29, 0.01, 29)), new THREE.LineBasicMaterial({ color: 0x1bc9e7, transparent: true, opacity: 0.32 })); lane.position.set(0, -3.8, 0); scene.add(lane);
  const sun = new THREE.Group();
  for (let i = 0; i < 15; i++) {
    const y = (i - 7) * 1.7; const width = Math.sqrt(Math.max(0, 14 * 14 - y * y)) * 2;
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.02 + i * 0.004, 1, 0.55).multiplyScalar(1.7), fog: false })); stripe.position.set(0, y, 0); sun.add(stripe);
  }
  sun.position.set(0, 9, -75); scene.add(sun);
  const stars = new Float32Array(1100 * 3);
  for (let i = 0; i < stars.length; i += 3) { stars[i] = (Math.random() - 0.5) * 300; stars[i + 1] = Math.random() * 100 + 8; stars[i + 2] = -Math.random() * 200; }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3)); scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xbbc5ff, size: 0.18 })));
  const city = makeSkyline(scene);
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.1, 0.55, 0.45); composer.addPass(bloom); const output = new OutputPass(); composer.addPass(output);
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
    camera.aspect = w / h; camera.position.set(0, 28, 34);
    if (camera.aspect < 1.15) camera.position.multiplyScalar(1.15 / camera.aspect);
    camera.lookAt(0, 0, -9); camera.updateProjectionMatrix(); renderer.setSize(w, h); composer.setSize(w, h);
  };
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  return { scene, renderer, camera, render(time) { city(time); grid.position.z = (time * 7) % 3; composer.render(); }, dispose() { observer.disconnect(); disposeObject(scene); bloom.dispose(); output.dispose(); composer.dispose(); renderer.dispose(); renderer.domElement.remove(); } };
}
