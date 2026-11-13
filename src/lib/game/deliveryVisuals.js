import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { courseFrame, FLIGHT_SPEED, worldPosition } from './course.js';

const INK = 0x24364d;
const IVORY = 0xf3ead2;
const CORAL = 0xe97870;
const TEAL = 0x55b6b1;
const COPPER = 0xb8734e;
const WARM = 0xffc96b;
const NIGHT = 0x17283d;
const RELEASE_LIMIT = 16;

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

function makeAtlasTexture() {
  if (typeof document === 'undefined') {
    const data = new Uint8Array([36, 54, 77, 255, 243, 234, 210, 255, 233, 120, 112, 255, 255, 201, 107, 255]);
    const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
    return texture;
  }
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = '#17283d'; context.fillRect(0, 0, 1024, 256);

  // The one runtime canvas carries every delivery mark. The broad Nightjar
  // lettering is deliberately readable from the low chase camera, while the
  // remaining panels provide parcel, workshop and mailbox pictograms.
  context.strokeStyle = '#b8734e'; context.lineWidth = 12; context.strokeRect(12, 12, 488, 232);
  context.fillStyle = '#f3ead2'; context.font = '800 72px system-ui, sans-serif'; context.textAlign = 'left';
  context.fillText('NIGHTJAR', 42, 105); context.fillStyle = '#ffc96b'; context.font = '700 58px system-ui, sans-serif'; context.fillText('RADIO', 42, 185);
  context.strokeStyle = '#55b6b1'; context.lineWidth = 9;
  for (const radius of [30, 53, 76]) { context.beginPath(); context.arc(430, 151, radius, -1.05, 1.05); context.stroke(); }
  context.fillStyle = '#e97870'; context.beginPath(); context.moveTo(391, 126); context.lineTo(430, 151); context.lineTo(391, 176); context.closePath(); context.fill();

  context.fillStyle = '#f3ead2'; context.fillRect(522, 18, 166, 220);
  context.fillStyle = '#e97870'; context.beginPath(); context.arc(605, 128, 66, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#24364d'; context.lineWidth = 10; context.strokeStyle = '#24364d';
  context.beginPath(); context.moveTo(566, 132); context.lineTo(596, 161); context.lineTo(649, 96); context.stroke();
  context.font = '800 22px system-ui, sans-serif'; context.textAlign = 'center'; context.fillText('AIR MAIL', 605, 211);

  context.fillStyle = '#31556a'; context.fillRect(704, 18, 176, 220);
  context.strokeStyle = '#ffc96b'; context.lineWidth = 13;
  context.beginPath(); context.arc(792, 106, 50, .25, 2.75); context.stroke();
  context.beginPath(); context.moveTo(755, 141); context.lineTo(727, 192); context.moveTo(828, 141); context.lineTo(856, 192); context.stroke();
  context.fillStyle = '#f3ead2'; context.font = '800 25px system-ui, sans-serif'; context.fillText('MEND', 792, 218);

  context.fillStyle = '#e97870'; context.fillRect(896, 18, 116, 220);
  context.fillStyle = '#f3ead2'; context.fillRect(917, 65, 74, 109);
  context.fillStyle = '#24364d'; context.beginPath(); context.moveTo(917, 65); context.lineTo(954, 124); context.lineTo(991, 65); context.closePath(); context.fill();
  context.strokeStyle = '#ffc96b'; context.lineWidth = 9; context.beginPath(); context.moveTo(954, 174); context.lineTo(954, 226); context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Create the complete delivery-mode render layer.
 *
 * Isolated harness API:
 *   const layer = createDeliveryVisuals(scene, { reducedMotion: false });
 *   layer.update({ delivery, players, time, dt });
 *   layer.metrics();
 *   layer.dispose();
 *
 * `players` should contain the same presented/interpolated pilot positions
 * used to draw the ships. All delivery coordinates remain route-relative.
 */
export function createDeliveryVisuals(scene, { reducedMotion } = {}) {
  const root = new THREE.Group(); root.name = 'delivery-visuals'; root.visible = false; scene.add(root);
  const geometries = new Set(), materials = new Set();
  const geometry = value => { geometries.add(value); return value; };
  const material = value => { materials.add(value); return value; };
  const boxGeometry = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphereGeometry = geometry(new THREE.SphereGeometry(1, 7, 5));
  const cylinderGeometry = geometry(new THREE.CylinderGeometry(1, 1, 1, 7));
  const warmMaterial = material(new THREE.MeshBasicMaterial({ color: WARM, toneMapped: false }));
  const ivoryMaterial = material(new THREE.MeshToonMaterial({ color: IVORY }));
  const coralMaterial = material(new THREE.MeshToonMaterial({ color: CORAL }));
  const inkMaterial = material(new THREE.MeshToonMaterial({ color: INK }));
  const tealMaterial = material(new THREE.MeshToonMaterial({ color: TEAL }));
  const copperMaterial = material(new THREE.MeshToonMaterial({ color: COPPER }));
  const nightMaterial = material(new THREE.MeshToonMaterial({ color: NIGHT }));
  const stationIndigoMaterial = material(new THREE.MeshToonMaterial({ color: 0x3b4c70 }));
  const glassDarkMaterial = material(new THREE.MeshBasicMaterial({ color: 0x152638, toneMapped: false }));
  const glassWarmMaterial = material(new THREE.MeshBasicMaterial({ color: 0xffb95d, toneMapped: false }));
  const ribbonMaterial = material(new THREE.MeshBasicMaterial({ color: 0xf7d399, side: THREE.DoubleSide }));
  const lineMaterial = material(new THREE.LineBasicMaterial({ color: INK }));
  const chevronMaterial = material(new THREE.MeshBasicMaterial({ color: 0x9affed, transparent: true, opacity: .92, toneMapped: false, side: THREE.DoubleSide }));
  const atlas = makeAtlasTexture();
  const atlasBrightMaterial = material(new THREE.MeshBasicMaterial({ map: atlas, color: 0xffffff, toneMapped: false }));
  const atlasDimMaterial = material(new THREE.MeshBasicMaterial({ map: atlas, color: 0x35445b, toneMapped: false }));

  const cube = (parent, mat, position, scale, rotation) => {
    const item = new THREE.Mesh(boxGeometry, mat); item.position.set(...position); item.scale.set(...scale);
    if (rotation) item.rotation.set(...rotation); parent.add(item); return item;
  };
  const orb = (parent, mat, position, scale) => {
    const item = new THREE.Mesh(sphereGeometry, mat); item.position.set(...position); item.scale.set(...scale); parent.add(item); return item;
  };
  const atlasPlaneGeometry = (width, height, u0, u1) => {
    const result = new THREE.PlaneGeometry(width, height);
    const uv = result.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, mix(u0, u1, uv.getX(i)));
    uv.needsUpdate = true; return geometry(result);
  };
  // Compact two-line fascia fits the clear curb strip between the flight
  // boundary and normal property fronts, so the full name survives portrait
  // framing without disappearing into the neighbouring facade.
  const nightjarSignGeometry = atlasPlaneGeometry(3, 2.9, 0, .5);
  const sealGeometry = atlasPlaneGeometry(1.1, 1.1, .5, .6875);
  const mendGeometry = atlasPlaneGeometry(2.4, 1.25, .6875, .875);
  const mailboxGeometry = atlasPlaneGeometry(1.25, 2, .875, 1);

  const mergedBoxes = parts => {
    const temp = [];
    for (const part of parts) {
      const [x, y, z, w, h, d, rx = 0, ry = 0, rz = 0] = part;
      const copy = boxGeometry.clone();
      const transform = new THREE.Matrix4();
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
      transform.compose(new THREE.Vector3(x, y, z), rotation, new THREE.Vector3(w, h, d)); copy.applyMatrix4(transform); temp.push(copy);
    }
    const result = mergeGeometries(temp); temp.forEach(item => item.dispose()); return geometry(result);
  };

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(2.5, 1.35); wingShape.lineTo(3.35, .2); wingShape.lineTo(2.35, -1.5); wingShape.lineTo(.45, -.55); wingShape.closePath();
  const wingGeometry = geometry(new THREE.ShapeGeometry(wingShape));
  const wingEdgesGeometry = geometry(new THREE.EdgesGeometry(wingGeometry));
  const envelopeGeometry = geometry(new THREE.BufferGeometry());
  envelopeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1, .65, 0, 0, -.15, .2, -1, -.65, 0,
     1, .65, 0, 1, -.65, 0, 0, -.15, .2,
    -1, .65, -.03, 1, .65, -.03, 0, -.15, .2
  ], 3)); envelopeGeometry.computeVertexNormals();

  let reduceMotion = Boolean(reducedMotion);
  let motionQuery = null; let motionListener = null;
  if (reducedMotion === undefined && typeof matchMedia === 'function') {
    motionQuery = matchMedia('(prefers-reduced-motion: reduce)'); reduceMotion = motionQuery.matches;
    motionListener = event => { reduceMotion = event.matches; };
    motionQuery.addEventListener?.('change', motionListener);
  }

  const basis = new THREE.Matrix4(), frameRight = new THREE.Vector3(), frameUp = new THREE.Vector3(), frameBack = new THREE.Vector3();
  const routeZ = (item, time) => Number.isFinite(item?.routeDistance) ? time * FLIGHT_SPEED - item.routeDistance : (item?.z ?? 0);
  const place = (object, x, y, z, time) => {
    const point = worldPosition(x, y, z, time); object.position.set(point.x, point.y, point.z);
    const frame = courseFrame(time * FLIGHT_SPEED - z);
    frameRight.set(frame.right.x, frame.right.y, frame.right.z); frameUp.set(frame.up.x, frame.up.y, frame.up.z); frameBack.set(-frame.forward.x, -frame.forward.y, -frame.forward.z);
    object.quaternion.setFromRotationMatrix(basis.makeBasis(frameRight, frameUp, frameBack));
  };

  function createMoth() {
    const group = new THREE.Group();
    const wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.scale.x = side; group.add(pivot);
      const outer = new THREE.Mesh(wingGeometry, side < 0 ? ivoryMaterial : coralMaterial); pivot.add(outer);
      const inset = new THREE.Mesh(wingGeometry, tealMaterial); inset.scale.set(.58, .58, 1); inset.position.set(.18, -.02, .025); pivot.add(inset);
      pivot.add(new THREE.LineSegments(wingEdgesGeometry, lineMaterial)); wings.push(pivot);
    }
    const body = new THREE.Mesh(cylinderGeometry, inkMaterial); body.scale.set(.22, 1.6, .22); group.add(body);
    orb(group, inkMaterial, [0, 1.15, 0], [.38, .38, .3]);
    const bulb = cube(group, warmMaterial, [0, -.18, .28], [.46, .58, .26]);
    group.userData = { wings, bulb }; return group;
  }

  function createParcel() {
    const group = new THREE.Group();
    const body = cube(group, ivoryMaterial, [0, 0, 0], [2.15, 1.35, 1.5]);
    cube(group, inkMaterial, [0, 0, .79], [.34, 1.42, .08]); cube(group, inkMaterial, [0, .73, 0], [.34, .09, 1.58]);
    const seal = new THREE.Mesh(sealGeometry, atlasBrightMaterial); seal.position.set(0, 0, .835); group.add(seal);
    const flaps = [];
    for (const side of [-1, 1]) {
      const flap = new THREE.Group(); flap.position.set(side * 1.08, .72, 0); cube(flap, side < 0 ? coralMaterial : ivoryMaterial, [-side * .54, 0, 0], [1.04, .1, 1.45]); group.add(flap); flaps.push(flap);
    }
    const ribbon = cube(group, ribbonMaterial, [0, 1.1, 0], [.17, 1, .1]); ribbon.visible = false;
    group.userData = { body, flaps, ribbon }; return group;
  }

  const crabLegGeometry = mergedBoxes([
    [-1.6, -.35, 0, 1.8, .18, .22, 0, 0, .55], [-2.45, -1.05, 0, 1.45, .18, .22, 0, 0, -.48],
    [1.6, -.35, 0, 1.8, .18, .22, 0, 0, -.55], [2.45, -1.05, 0, 1.45, .18, .22, 0, 0, .48],
    [-1.55, .15, -.18, 1.5, .16, .2, 0, 0, .32], [-2.25, -.25, -.18, 1.2, .16, .2, 0, 0, -.58],
    [1.55, .15, -.18, 1.5, .16, .2, 0, 0, -.32], [2.25, -.25, -.18, 1.2, .16, .2, 0, 0, .58]
  ]);

  function createCrab() {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(crabLegGeometry, copperMaterial));
    cube(group, inkMaterial, [0, .25, 0], [2.8, 1.65, 1.5]); cube(group, tealMaterial, [0, .65, .79], [1.55, .5, .08]);
    const sign = new THREE.Mesh(mendGeometry, atlasBrightMaterial); sign.position.set(0, 1.65, .2); group.add(sign);
    const antennae = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * .75, 1.08, 0); cube(pivot, copperMaterial, [side * .35, .65, 0], [.12, 1.4, .12], [0, 0, side * -.45]); orb(pivot, warmMaterial, [side * .65, 1.25, 0], [.18, .18, .18]); group.add(pivot); antennae.push(pivot);
    }
    const shutters = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * .78, .15, .86);
      cube(pivot, ivoryMaterial, [-side * .38, 0, 0], [.75, 1.15, .12]); group.add(pivot); shutters.push(pivot);
    }
    const socket = cube(group, warmMaterial, [0, .15, .83], [1.1, .72, .1]);
    const tray = new THREE.Group(); tray.position.set(0, -.45, .9); cube(tray, coralMaterial, [0, 0, .35], [1.7, .12, .75]); group.add(tray);
    const tools = [cube(group, warmMaterial, [-.38, -.16, 1.02], [.14, .65, .12], [0, 0, -.25]), cube(group, tealMaterial, [.36, -.16, 1.02], [.14, .65, .12], [0, 0, .25])];
    group.userData = { antennae, shutters, socket, tray, tools }; return group;
  }

  function createRelease(kind) {
    const group = new THREE.Group();
    if (kind === 'letter') {
      group.add(new THREE.Mesh(envelopeGeometry, ivoryMaterial));
      orb(group, coralMaterial, [0, -.1, .24], [.2, .2, .08]);
      group.userData.fold = true;
    } else {
      cube(group, warmMaterial, [0, 0, 0], [.5, .68, .34]);
      const trail = cube(group, ribbonMaterial, [0, -.85, -.05], [.1, 1, .08]); group.userData.trail = trail;
    }
    return group;
  }

  function createSorter() {
    const group = new THREE.Group();
    // Wide post-office carriage, three real drawers and a toothed bellows roof.
    cube(group, inkMaterial, [0, 0, 0], [7.5, 3.2, 2.4]);
    cube(group, coralMaterial, [0, 1.85, 0], [8.2, .4, 2.8]);
    for (let i = -3; i <= 3; i++) cube(group, copperMaterial, [i, 2.35, 0], [.35, .7, 2]);
    const drawers = [];
    for (let i = 0; i < 3; i++) {
      const drawer = new THREE.Group(); drawer.position.set((i - 1) * 2.35, 0, 1.3); group.add(drawer);
      cube(drawer, ivoryMaterial, [0, 0, 0], [2.1, 2.4, .4]);
      cube(drawer, warmMaterial, [0, .1, .25], [1.2, .3, .15]);
      const letter = new THREE.Mesh(envelopeGeometry, coralMaterial); letter.scale.setScalar(.65); letter.position.set(0, -.5, .3); drawer.add(letter);
      drawers.push(drawer);
    }
    for (const side of [-1, 1]) orb(group, tealMaterial, [side * 3, -1.8, 0], [.8, .8, .55]);
    group.userData.drawers = drawers; return group;
  }

  const sorterMap = new Map(), sorterPool = [];
  const mothMap = new Map(), parcelMap = new Map(), crabMap = new Map(), releaseMap = new Map();
  const mothPool = [], parcelPool = [], crabPool = [], letterPool = [], bulbPool = [];
  const racks = []; // Cargo is counted in the compact HUD; no floating hammer silhouette.

  const landmark = new THREE.Group(); landmark.name = 'nightjar-radio'; root.add(landmark);
  // Short roadside brackets mark the threshold without putting a beam or a
  // solid support inside the flight envelope. The inhabited radio shop sits
  // in asymmetric cabinets at the curb, grounded at local y=-4.
  const shellGeometry = mergedBoxes([
    [-14.8, -1.55, -.1, .7, 4.5, 1.25], [14.8, -1.55, -.1, .7, 4.5, 1.25],
    [-14, .52, -.1, 1.7, .38, 1.25], [14, .52, -.1, 1.7, .38, 1.25]
  ]);
  const cabinetGeometry = mergedBoxes([
    [-16.8, -.25, -.08, 4.8, 7.1, 1.9], [16.3, -1.15, -.08, 3.8, 5.3, 1.9]
  ]);
  const trimGeometry = mergedBoxes([
    [14.9, 3.1, .9, .12, 3.4, .12], [17.7, 3.1, .9, .12, 3.4, .12],
    [-16.8, -3.72, .02, 5.2, .25, 2.12], [-16.8, 3.32, .02, 5.2, .28, 2.12],
    [16.3, -3.72, .02, 4.2, .25, 2.12], [16.3, 1.45, .02, 4.2, .28, 2.12],
    [-18.95, -.25, .93, .18, 7.1, .18], [-14.65, -.25, .93, .18, 7.1, .18],
    [14.6, -1.15, .93, .18, 5.3, .18], [18, -1.15, .93, .18, 5.3, .18],
    [-16.8, 1.58, .94, 4, .15, .18], [-16.8, -1.27, .94, 4, .15, .18],
    [16.3, .34, .94, 3.1, .15, .18], [16.3, -1.72, .94, 3.1, .15, .18],
    [-14.8, 5.25, .55, .94, .2, .22], [14.8, 5.25, .55, .94, .2, .22],
    [-16.8, -1.68, 1.3, 3.8, .24, .9], [16.3, .65, 1.22, 3.35, .18, .75], [14.65, -3.62, .35, 1.9, .18, 1.05]
  ]);
  const ivoryDetailGeometry = mergedBoxes([
    [-16.8, .12, 1.01, .1, 2.55, .07], [16.3, -.68, 1.01, .1, 1.9, .07],
    [-16.8, 1.62, 1.72, 4.25, .38, .12], [-16.8, -2.75, .98, 3.75, 1.55, .1], [16.3, -2.68, .98, 3.05, 1.65, .1]
  ]);
  const coralDetailGeometry = mergedBoxes([
    [-16.8, 1.82, 1.22, 4.25, .18, 1.15, -.12, 0, 0], [14.65, -2.18, .7, 1.6, 2.35, .72]
  ]);
  const aerialGeometry = mergedBoxes([
    [0, 2.2, 0, .18, 4.5, .18], [0, 1.1, 0, 2.1, .1, .1], [0, 2.2, 0, 1.8, .1, .1], [0, 3.3, 0, 1.48, .1, .1]
  ]);
  landmark.add(new THREE.Mesh(shellGeometry, nightMaterial));
  landmark.add(new THREE.Mesh(cabinetGeometry, stationIndigoMaterial));
  landmark.add(new THREE.Mesh(trimGeometry, copperMaterial));
  landmark.add(new THREE.Mesh(ivoryDetailGeometry, ivoryMaterial));
  landmark.add(new THREE.Mesh(coralDetailGeometry, coralMaterial));
  landmark.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  const sign = new THREE.Mesh(nightjarSignGeometry, atlasDimMaterial); sign.position.set(16.3, 3.2, 1.02); landmark.add(sign);
  const windows = [];
  for (const spec of [{ x: -16.8, y: .12, w: 3.9, h: 2.55 }, { x: 16.3, y: -.68, w: 3, h: 1.9 }]) {
    const window = cube(landmark, glassDarkMaterial, [spec.x, spec.y, .96], [spec.w, spec.h, .08]); windows.push(window);
  }
  // A striped-looking service hood and deep counter give the left cabinet a
  // working frontage; the lower ivory kick panels keep both masses legible at
  // night without introducing emissive windows or extra lights.
  // The envelope panel is mounted on a physical street mailbox rather than a
  // floating icon. Its dark slot and copper foot remain readable before the
  // restored warm windows switch on.
  const mailbox = new THREE.Mesh(mailboxGeometry, atlasBrightMaterial); mailbox.position.set(14.65, -2.08, 1.08); mailbox.scale.set(.76, .76, .76); landmark.add(mailbox);
  cube(landmark, inkMaterial, [14.65, -1.52, 1.12], [.8, .12, .08]);

  const aerial = new THREE.Group(); aerial.position.set(16.3, 4.8, 0); aerial.add(new THREE.Mesh(aerialGeometry, copperMaterial)); landmark.add(aerial);
  const chevronPositions = [], chevronIndices = [];
  const chevronArm = (x1, z1, x2, z2) => {
    const length = Math.hypot(x2 - x1, z2 - z1), width = .17;
    const ox = -(z2 - z1) / length * width, oz = (x2 - x1) / length * width, start = chevronPositions.length / 3;
    chevronPositions.push(x1 + ox, 0, z1 + oz, x1 - ox, 0, z1 - oz, x2 - ox, 0, z2 - oz, x2 + ox, 0, z2 + oz);
    chevronIndices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  chevronArm(-2.15, .9, 0, -.9); chevronArm(0, -.9, 2.15, .9);
  const chevronGeometry = geometry(new THREE.BufferGeometry());
  chevronGeometry.setAttribute('position', new THREE.Float32BufferAttribute(chevronPositions, 3)); chevronGeometry.setIndex(chevronIndices); chevronGeometry.computeVertexNormals();
  const chevrons = [];
  for (let i = 0; i < 3; i++) { const mark = new THREE.Mesh(chevronGeometry, chevronMaterial); mark.position.set(0, -3.68, 8 + i * 8); mark.scale.setScalar(1 + i * .12); landmark.add(mark); chevrons.push(mark); }
  const coffee = new THREE.Group(); coffee.position.set(16.3, 5.5, 0); landmark.add(coffee);
  const cup = new THREE.Mesh(cylinderGeometry, ivoryMaterial); cup.scale.set(1.1, 1.7, 1.1); coffee.add(cup);
  const handle = new THREE.Mesh(geometry(new THREE.TorusGeometry(.6, .16, 5, 10)), copperMaterial); handle.position.x = 1.2; coffee.add(handle);
  const flower = new THREE.Group(); flower.position.set(16.3, 5.75, 0); landmark.add(flower);
  for(let i=0;i<6;i++) orb(flower, coralMaterial, [Math.cos(i*Math.PI/3)*1.1, Math.sin(i*Math.PI/3)*1.1, 0], [.8,.8,.25]);
  orb(flower, warmMaterial, [0,0,.3], [.65,.65,.3]);
  landmark.visible = false;

  const syncPool = (items, map, pool, create, update, poolLimit = 8) => {
    const alive = new Set();
    for (const item of items) {
      alive.add(item.id); let object = map.get(item.id);
      if (!object) { object = pool.pop() ?? create(item); map.set(item.id, object); root.add(object); }
      object.visible = true; update(object, item);
    }
    for (const [id, object] of map) if (!alive.has(id)) {
      map.delete(id); object.removeFromParent(); object.visible = false; if (pool.length < poolLimit) pool.push(object);
    }
  };

  const targetProgress = (target, time, duration = .65) => {
    // Simulation tells are authoritative and, for the parcel domino, begin
    // shortly before triggerAt. Falling back to the timestamp keeps staged
    // harness objects convenient without skipping the anticipation pose.
    if (Number.isFinite(target.tell)) return smooth(target.tell);
    if (Number.isFinite(target.triggerAt)) return smooth((time - target.triggerAt) / duration);
    return 0;
  };

  let lastDistrict = -1;
  let lastDebug = { active: false, moths: 0, parcels: 0, crabs: 0, releases: 0, restored: false };
  function update({ delivery, players = [], time = 0, dt = 1 / 60 } = {}) {
    root.visible = Boolean(delivery);
    if (!delivery) {
      landmark.visible = false; racks.forEach(item => { item.visible = false; });
      syncPool([], sorterMap, sorterPool, createSorter, () => {});
      syncPool([], mothMap, mothPool, createMoth, () => {}); syncPool([], parcelMap, parcelPool, createParcel, () => {}); syncPool([], crabMap, crabPool, createCrab, () => {});
      for (const [id, object] of releaseMap) { releaseMap.delete(id); object.removeFromParent(); (object.userData.fold ? letterPool : bulbPool).push(object); }
      lastDebug = { active: false, moths: 0, parcels: 0, crabs: 0, releases: 0, restored: false }; return;
    }

    const targets = Array.isArray(delivery.targets) ? delivery.targets : [];
    syncPool(targets.filter(item => item.kind === 'sorter'), sorterMap, sorterPool, createSorter, (object, target) => {
      place(object, target.x, target.y, routeZ(target, time), time);
      object.userData.drawers.forEach((drawer, i) => {
        drawer.position.z = i < target.drawers ? 2.5 : 1.3;
        drawer.rotation.x = i < target.drawers ? -.3 : 0;
        drawer.children[1].material = i === target.drawers ? warmMaterial : tealMaterial;
      });
      object.scale.setScalar(target.completedAt == null ? 1 : Math.max(.05, 1 - Math.max(0, time - target.completedAt - 1.8) / .7));
    });
    const moths = targets.filter(item => item.kind === 'moth');
    const parcels = targets.filter(item => item.kind === 'parcel');
    const crabs = targets.filter(item => item.kind === 'crab');
    syncPool(moths, mothMap, mothPool, createMoth, (object, target) => {
      const z = routeZ(target, time); place(object, target.x, target.y ?? 0, z, time);
      const open = target.stage === 'folded' ? .08 : target.stage === 'opening' ? targetProgress(target, time) : 1;
      const flutter = reduceMotion ? 0 : Math.sin(time * 7 + (target.id?.length ?? 0)) * .07 * open;
      object.userData.wings[0].rotation.y = (1 - open) * 1.34 + flutter; object.userData.wings[1].rotation.y = -(1 - open) * 1.34 - flutter;
      object.userData.bulb.scale.setScalar(.9 + (reduceMotion ? 0 : Math.sin(time * 8) * .08));
      const release = target.stage === 'released' && Number.isFinite(target.completedAt) ? clamp01((time - target.completedAt) / .7) : 0;
      object.scale.setScalar(Math.max(.04, mix(Math.max(.65, Math.min(1.25, (target.r ?? 1.4) / 1.4)), .04, release)));
      if (!reduceMotion) object.rotateZ(Math.sin(time * 2.1 + (target.baseX ?? target.x)) * .04);
    });
    syncPool(parcels, parcelMap, parcelPool, createParcel, (object, target) => {
      const z = routeZ(target, time); place(object, target.x, target.y ?? 0, z, time);
      object.userData.body.material = (target.chainIndex ?? 0) % 2 ? coralMaterial : ivoryMaterial;
      const open = target.stage === 'sealed' ? 0 : target.stage === 'opening' ? targetProgress(target, time, .55) : 1;
      object.userData.flaps[0].rotation.z = -open * 1.24; object.userData.flaps[1].rotation.z = open * 1.24;
      object.userData.ribbon.visible = open > .18; object.userData.ribbon.scale.y = Math.max(.01, open * 2.3); object.userData.ribbon.position.y = .9 + open * 1.1;
      const release = target.stage === 'released' && Number.isFinite(target.completedAt) ? clamp01((time - target.completedAt) / .7) : 0;
      object.scale.setScalar(Math.max(.04, mix(.9 + (target.r ?? 1) * .08, .04, release)));
      if (!reduceMotion) object.rotateY(Math.sin(time * 1.7 + (target.chainIndex ?? 0)) * .035);
    });
    syncPool(crabs, crabMap, crabPool, createCrab, (object, target) => {
      const z = routeZ(target, time); place(object, target.x, target.y ?? 0, z, time);
      const open = target.stage === 'guarded' ? 0 : target.stage === 'opening' ? targetProgress(target, time, .8) : 1;
      object.userData.shutters[0].rotation.y = -open * 1.38; object.userData.shutters[1].rotation.y = open * 1.38;
      object.userData.tray.rotation.x = -open * 1.2; object.userData.socket.visible = open > .3;
      object.userData.tools.forEach((tool, index) => { tool.visible = open > .72; tool.rotation.z += reduceMotion ? 0 : Math.sin(time * 5 + index) * dt * .08; });
      object.userData.antennae.forEach((antenna, index) => { antenna.rotation.z = reduceMotion ? 0 : Math.sin(time * 3.2 + index * 2) * .08; });
      const repaired = target.stage === 'repaired'; object.userData.socket.material = repaired ? warmMaterial : tealMaterial;
      const release = repaired && Number.isFinite(target.completedAt) ? clamp01((time - target.completedAt - 1.8) / .7) : 0;
      object.scale.setScalar(Math.max(.04, mix(Math.max(.8, Math.min(1.2, (target.r ?? 2.5) / 2.5)), .04, release)));
    });

    const releases = (Array.isArray(delivery.releases) ? delivery.releases : []).slice(-RELEASE_LIMIT);
    // Both release kinds share a single map so an id cannot briefly duplicate
    // when a snapshot advances from loose to collected.
    const activeReleaseIds = new Set(releases.map(item => item.id));
    for (const [id, object] of releaseMap) if (!activeReleaseIds.has(id)) { releaseMap.delete(id); object.removeFromParent(); (object.userData.fold ? letterPool : bulbPool).push(object); }
    for (const item of releases) {
      let object = releaseMap.get(item.id);
      if (!object) { const pool = item.kind === 'letter' ? letterPool : bulbPool; object = pool.pop() ?? createRelease(item.kind); releaseMap.set(item.id, object); root.add(object); }
      const sourceZ = routeZ(item, time); let x = item.x, y = item.y ?? 0, z = sourceZ;
      let collected = 0;
      if (item.collectedAt != null && players[item.collectedBy] && Number.isFinite(item.collectedAt)) {
        collected = smooth((time - item.collectedAt) / .7); const pilot = players[item.collectedBy];
        x = mix(x, pilot.x, collected); y = mix(y, (pilot.y ?? 0) + .45, collected); z = mix(z, pilot.z + 2.1, collected);
      }
      place(object, x, y + (reduceMotion ? 0 : Math.sin(time * 5 + String(item.id).length) * .08 * (1 - collected)), z, time);
      object.scale.setScalar(Math.max(.06, mix(item.kind === 'letter' ? .72 : .8, .18, collected)));
      if (!reduceMotion) object.rotateZ(item.kind === 'letter' ? Math.sin(time * 4) * .12 : time * .7);
      if (object.userData.trail) object.userData.trail.scale.y = .65 + (reduceMotion ? 0 : Math.sin(time * 9) * .18);
    }

    racks.forEach((rack, index) => {
      const pilot = players[index], cargo = delivery.rack?.[index]; rack.visible = Boolean(pilot?.active && pilot.hp > 0 && cargo);
      if (!rack.visible) return;
      place(rack, pilot.x, (pilot.y ?? 0) + .48, pilot.z + 2.25, time);
      rack.rotateZ(-(pilot.vx ?? 0) * .025);
      rack.userData.letters.forEach((letter, letterIndex) => { letter.visible = letterIndex < Math.min(3, Math.max(0, cargo.letters ?? 0)); });
      rack.userData.bulbs.forEach((bulb, bulbIndex) => { bulb.visible = bulbIndex < Math.min(3, Math.max(0, cargo.bulbs ?? 0)); });
    });

    const district = delivery.district ?? 0;
    coffee.visible = district === 1; flower.visible = district === 2; aerial.visible = district === 0;
    if (!reduceMotion) flower.rotation.z = delivery.restored ? Math.sin(time) * .12 : 0;
    if (district !== lastDistrict && atlas.image?.getContext) {
      lastDistrict = district;
      const ctx = atlas.image.getContext('2d');
      ctx.fillStyle = ['#17283d', '#633e46', '#214b49'][district]; ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = '#ffc96b'; ctx.lineWidth = 10; ctx.strokeRect(12, 12, 488, 232);
      ctx.textAlign = 'center'; ctx.fillStyle = '#f3ead2'; ctx.font = '800 65px system-ui';
      ctx.fillText(['NIGHTJAR', 'COMET', 'MOSS &'][district], 256, 108);
      ctx.fillStyle = '#ffc96b'; ctx.fillText(['RADIO', 'COFFEE', 'MOON'][district], 256, 192);
      atlas.needsUpdate = true;
    }
    const destination = delivery.destination;
    landmark.visible = Boolean(destination);
    if (destination) {
      const actualZ = routeZ(destination, time);
      let restored = Boolean(delivery.restored || destination.deliveredAt != null);
      let restoreProgress = restored ? 1 : 0;
      let holdProgress = restoreProgress;
      if (restored && Number.isFinite(destination.deliveredAt)) {
        restoreProgress = smooth((time - destination.deliveredAt) / .45);
        holdProgress = smooth((time - destination.deliveredAt) / 1.1);
      }
      // Once crossed, Nightjar becomes the route's restored endpoint tableau
      // instead of vanishing behind the chase camera before the result frame.
      // The brief ease reads as the frontage taking the air, and guarantees
      // that successful play—not only the HUD—shows the lit final state.
      const lead = players.filter(player => player?.active && player.hp > 0).reduce((best, player) => !best || player.z < best.z ? player : best, null);
      const heldZ = lead ? lead.z - 30 : actualZ;
      const displayZ = restored && !delivery.endless ? mix(actualZ, Math.min(actualZ, heldZ), holdProgress) : actualZ;
      if (delivery.endless && lead && actualZ > lead.z + 12) landmark.visible = false;
      const displayX = restored && lead ? mix(destination.x ?? 0, lead.x * .12, holdProgress) : (destination.x ?? 0);
      place(landmark, displayX, 0, displayZ, time);
      sign.material = restoreProgress > .35 ? atlasBrightMaterial : atlasDimMaterial;
      windows.forEach(window => { window.material = restoreProgress > .5 ? glassWarmMaterial : glassDarkMaterial; });
      aerial.rotation.z = mix(Math.PI * .5, 0, restoreProgress);
      aerial.scale.y = mix(.45, 1, restoreProgress);
      chevrons.forEach(mark => { mark.visible = !restored; mark.position.y = -3.68; });
      chevronMaterial.opacity = reduceMotion ? .88 : .84 + Math.sin(time * 3) * .1;
    }
    lastDebug = { active: true, moths: moths.length, parcels: parcels.length, crabs: crabs.length, releases: releases.length, restored: Boolean(delivery.restored || destination?.deliveredAt != null) };
  }

  function metrics() {
    let drawables = 0, allocatedDrawables = 0, triangles = 0;
    root.traverse(object => { if (object.isMesh || object.isLineSegments) allocatedDrawables++; });
    root.traverseVisible(object => {
      if (!object.isMesh && !object.isLineSegments) return; drawables++;
      const positionCount = object.geometry?.attributes?.position?.count ?? 0;
      triangles += object.isMesh ? (object.geometry.index?.count ?? positionCount) / 3 : 0;
    });
    return { ...lastDebug, drawables, allocatedDrawables, triangles: Math.round(triangles), geometries: geometries.size, materials: materials.size, textures: 1, releaseLimit: RELEASE_LIMIT, reducedMotion: reduceMotion };
  }

  function dispose() {
    motionQuery?.removeEventListener?.('change', motionListener);
    root.removeFromParent(); geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); atlas.dispose();
    sorterMap.clear(); mothMap.clear(); parcelMap.clear(); crabMap.clear(); releaseMap.clear();
  }

  return { root, update, metrics, dispose };
}
