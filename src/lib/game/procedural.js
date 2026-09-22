import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLIGHT_SPEED, courseFrame, worldPosition } from './course.js';

export const COLORS = { cyan: 0x19cddd, magenta: 0xef657b, orange: 0xffa342 };
const INK = 0x293c49;
// The city uses a dusty plaster palette so the cyan sky and ship lights carry
// the visual focus. Every shape below is original procedural geometry.
export const palette = [0xf1e6cf, 0xd8d1b9, 0x9db8aa, 0xc9a889, 0xb8c9bb, 0xd7b86b, 0xa7b6c1];
const accents = [0x3f6870, 0x4a7d78, 0xd78369, 0xdfa83e, 0x7295a0, 0xb35960];
const districtNames = ['old-town', 'market', 'terrace', 'highline', 'canal', 'garden'];

export const toon = color => new THREE.MeshToonMaterial({ color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

export function outlined(geometry, color) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, toon(color));
  mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: INK })));
  return group;
}

// Small trim pieces are baked into the district material without their own
// edge geometry. Outlines stay on primary masses and landmarks; this keeps
// startup and mobile GPU cost bounded as detail density rises.
function box(group, x, y, z, w, h, d, color, outline = false) {
  const mesh = outline ? outlined(new THREE.BoxGeometry(w, h, d), color) : new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  mesh.position.set(x, y, z); group.add(mesh); return mesh;
}

function stripe(group, side, x, y, z, h, color) {
  // A narrow vertical facade stripe reads as trim at distance and as a shop
  // sign when the ship sweeps past it.
  box(group, x - side * .07, y, z, .1, h, .12, color);
}

// `x` is the road-facing facade plane, rather than a building centre.
function window(group, side, x, y, z, color = 0x355563, w = 1.15, h = 1.35) {
  const front = x - side * .06;
  box(group, front, y, z, .11, h, w, color);
  box(group, front - side * .09, y - h / 2 - .12, z, .3, .12, w + .25, 0xe8dec3);
}

function sign(group, side, x, y, z, color, width = 2.3, height = 1.25) {
  const front = x - side * .08;
  box(group, front, y, z, .14, height, width, color);
  box(group, front - side * .09, y + .27, z, .08, .08, width * .66, 0xf4ecd7);
  box(group, front - side * .1, y - .05, z, .08, .11, width * .42, INK);
}

function awning(group, side, x, y, z, color, width = 2.8) {
  const front = x - side * .58;
  box(group, front, y, z, .8, .16, width, color);
  box(group, front - side * .42, y - .23, z, .08, .3, width, 0xf3e7cd);
}

function vendingMachine(group, side, x, z, color) {
  const front = x - side * .22;
  box(group, front, -2.55, z, .45, 2.55, 1.3, color);
  box(group, front - side * .25, -2.5, z, .1, 1.45, 1.03, 0xaed9cc);
  for (let i = 0; i < 3; i++) box(group, front - side * .31, -2.95 + i * .4, z - .25, .08, .12, .2, accents[i + 1]);
}

function makeTree(group, x, z, scale = 1) {
  box(group, x, -2.8, z, .34 * scale, 2.5 * scale, .34 * scale, 0x806851);
  const crown = outlined(new THREE.IcosahedronGeometry(1.5 * scale, 0), 0x5f947c);
  crown.position.set(x, -.9 + scale * .15, z); group.add(crown);
  const crown2 = outlined(new THREE.IcosahedronGeometry(1.05 * scale, 0), 0x75a487);
  crown2.position.set(x + .45 * scale, .35 + scale * .15, z + .2 * scale); group.add(crown2);
}

function makeRooftopTank(group, x, y, z, color) {
  const tank = outlined(new THREE.CylinderGeometry(.8, .8, 1.8, 8), color);
  tank.position.set(x, y, z); group.add(tank);
  box(group, x, y - 1.05, z, 1.6, .15, 1.6, 0x536b6f);
}

function makeAC(group, side, x, y, z) {
  const front = x - side * .2;
  box(group, front, y, z, .38, .75, 1.35, 0xd9dac8);
  box(group, front - side * .22, y, z, .08, .45, .9, 0x71878a);
}

// Merge static architecture by material. A district is one object with a
// handful of materials after baking, despite containing dozens of small
// windows, signs, balconies and street props.
function bake(group) {
  group.updateMatrixWorld(true);
  const meshes = [], lines = [];
  group.traverse(object => {
    if (!object.geometry) return;
    let geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    if (!object.isLineSegments && geometry.index) { const indexed = geometry; geometry = geometry.toNonIndexed(); indexed.dispose(); }
    if (object.isLineSegments) { lines.push(geometry); return; }
    const color = object.material.color;
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    meshes.push(geometry);
  });
  const result = new THREE.Group();
  if (meshes.length) {
    const material = toon(0xffffff); material.vertexColors = true;
    const mesh = new THREE.Mesh(mergeGeometries(meshes), material);
    mesh.castShadow = true; mesh.receiveShadow = true; result.add(mesh);
    meshes.forEach(geometry => geometry.dispose());
  }
  if (lines.length) {
    result.add(new THREE.LineSegments(mergeGeometries(lines), new THREE.LineBasicMaterial({ color: INK })));
    lines.forEach(geometry => geometry.dispose());
  }
  disposeObject(group); return result;
}

export function makeShip(id, selectedColor) {
  const group = new THREE.Group(), color = selectedColor ?? (id ? COLORS.magenta : COLORS.cyan);
  const shape = new THREE.Shape();
  shape.moveTo(0, -2); shape.lineTo(1.75, 1.2); shape.lineTo(.55, .85); shape.lineTo(0, 1.5); shape.lineTo(-.55, .85); shape.lineTo(-1.75, 1.2); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: .22, bevelEnabled: false }); geo.rotateX(Math.PI / 2);
  group.add(outlined(geo, 0xf7eed9));
  box(group, 0, .15, 0, .48, .3, 2.3, color);
  const canopy = outlined(new THREE.SphereGeometry(.48, 8, 4), 0x294e60);
  canopy.scale.set(.7, .65, 1.4); canopy.position.set(0, .38, -.2); group.add(canopy);
  for (const side of [-1, 1]) {
    box(group, side * .9, 0, .65, .38, .38, 1.6, color);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.18, 1.8, 6), new THREE.MeshBasicMaterial({ color: 0x9affed }));
    flame.rotation.x = Math.PI / 2; flame.position.set(side * .9, 0, 2.1); flame.name = 'trail'; group.add(flame);
  }
  return group;
}

export function makeRock(seed) {
  const group = outlined(new THREE.IcosahedronGeometry(1, 0), 0xcb7459);
  const band = outlined(new THREE.TorusGeometry(.77, .09, 4, 12), 0xffd476);
  band.rotation.x = Math.PI / 2; group.add(band); return group;
}

export function makePickup(type) {
  const group = outlined(new THREE.OctahedronGeometry(.65), type === 'rate' ? COLORS.cyan : COLORS.magenta);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.95, .035, 4, 20), new THREE.MeshBasicMaterial({ color: 0xfff2ba }));
  group.add(ring); return group;
}

export function makeTower(b) {
  const g = new THREE.Group();
  if (b.kind === 'gate') {
    // A skybridge is a recognizable landmark with an open underside. The
    // collision volume only occupies the beam, matching what is rendered.
    box(g, 0, 0, 0, b.width, b.height, b.depth, b.district === 'canal' ? 0xd7b86b : 0x89a99e, true);
    for (let x = -b.width / 2 + 2; x < b.width / 2; x += 3) box(g, x, 0, b.depth / 2 + .04, 1, b.height, .1, INK);
    box(g, 0, b.height / 2 + .22, 0, b.width + 1.4, .16, b.depth + .2, 0xf4e5c7);
    return bake(g);
  }
  if (b.kind === 'pole') {
    box(g, 0, b.height / 2 - 4, 0, b.width, b.height, b.depth, 0x365764);
    box(g, 0, b.height - 4, 0, b.width + 1, .6, b.depth + 1, 0xe3c56f);
    for (let y = 0; y < b.height - 4; y += 4) box(g, 0, y, 0, b.width + .1, .7, b.depth + .1, 0xef657b);
    return bake(g);
  }
  const base = palette[(b.id / 10) % palette.length | 0];
  box(g, 0, b.height / 2 - 4, 0, b.width, b.height, b.depth, base, true);
  box(g, 0, b.height - 4.2, 0, b.width + .2, .4, b.depth + .2, 0x4f6b70);
  const side = b.x < 0 ? 1 : -1;
  for (let y = -1; y < b.height - 5; y += 2.6) for (const off of [-1.9, 0, 1.9]) window(g, side, side * (b.width / 2), y, off, 0x365764, 1.05, 1.4);
  box(g, side * .04, -2.8, b.depth / 2 + .08, 1.8, 2.3, .16, 0x335160);
  box(g, 0, -3.65, 0, b.width + 1, .3, b.depth + 1, 0xf2c35d);
  return bake(g);
}

function addCable(group, z, y, sag = 0) {
  // Thin box segments are cheaper than line geometry and still read as cables
  // against the teal sky when the camera banks.
  box(group, -16, y, z, 12, .08, .08, 0x456368);
  box(group, 0, y - sag, z, 20, .08, .08, 0x456368);
  box(group, 16, y, z, 12, .08, .08, 0x456368);
}

function makeDistrict(index) {
  const district = districtNames[index % districtNames.length];
  const g = new THREE.Group();
  // Raised curbs and sidewalks establish a street scale beneath the flight
  // path. The central lane remains open from -13 to +13 local units.
  for (const side of [-1, 1]) {
    box(g, side * 15.8, -3.92, 0, 4.2, .45, 36, 0xbfc6b7);
    box(g, side * 13.75, -3.66, 0, .18, .18, 36, 0xf2e7ca);
  }
  const detail = index * 17 + 3;
  for (const side of [-1, 1]) {
    const x = side * (21 + (index % 3) * .8);
    const w = 8 + (index % 2) * 2;
    const h = 10 + (index * 7 + (side + 1) * 3) % 13;
    box(g, x, h / 2 - 4, (index % 2 - .5) * 8, w, h, 25, palette[(index + (side > 0 ? 1 : 0)) % palette.length], true);
    box(g, x, h - 3.65, (index % 2 - .5) * 8, w + .6, .52, 25.5, 0x536f72);
    const front = x - side * (w / 2 + .04);
    // Storefronts and patterned upper windows create a navigable close wall.
    for (let floor = 0; floor < Math.floor((h - 3) / 2.8); floor++) {
      const y = -2.1 + floor * 2.65;
      for (let slot = -1; slot <= 1; slot++) window(g, side, front, y, (index % 2 - .5) * 8 + slot * 3.1, floor === 0 ? accents[(detail + slot + 5) % accents.length] : 0x3d606a, 1.35, 1.5);
      if (floor > 0 && (floor + index) % 3 === 1) {
        box(g, front - side * .3, y - .98, (index % 2 - .5) * 8 + 1.6, .1, .12, 3.4, 0xd2b47d);
        box(g, front - side * .3, y - .78, (index % 2 - .5) * 8 - .1, .1, .12, 3.4, 0xd2b47d);
      }
    }
    sign(g, side, front, -1.0, (index % 2 - .5) * 8 - 1.8, accents[(detail + 2) % accents.length], 2.8, 1.15);
    awning(g, side, front, -.15, (index % 2 - .5) * 8 + 1.3, accents[(detail + 4) % accents.length], 3.3);
    makeAC(g, side, front, Math.min(h - 5.4, 8), (index % 2 - .5) * 8 - 2.4);
    if (index % 3 === 0) makeRooftopTank(g, x + side * 1.7, h - 2.1, (index % 2 - .5) * 8, 0x879d95);
    if (district === 'terrace' || district === 'old-town') {
      box(g, front - side * .3, 2.2, (index % 2 - .5) * 8 + 3, .1, .12, 4.2, 0x7b9c91);
      for (let p = -1; p <= 1; p++) box(g, front - side * .34, 2.9, (index % 2 - .5) * 8 + 3 + p * 1.5, .1, .9, .12, 0x7b9c91);
    }
    vendingMachine(g, side, side * 15.5, (index % 2 - .5) * 8 + 3.2, accents[(detail + 1) % accents.length]);
    box(g, side * 12.8, -3.05, (index % 2 - .5) * 8 - 3.2, .42, 1.05, .42, 0xd4a54e);
    makeTree(g, side * (17.2 + (index % 2) * .7), (index % 2 - .5) * 8 - 1.7, .72 + (index % 3) * .12);
  }
  // Every district has a signature piece visible from a few blocks away.
  if (district === 'market') {
    box(g, 0, 12.6, 0, 29, .28, .45, 0xd8bf82);
    for (const x of [-11, -5.5, 0, 5.5, 11]) box(g, x, 11.8, 0, .12, 1.6, .12, 0x657b79);
    addCable(g, -7, 15, 1.2);
  } else if (district === 'highline') {
    for (const side of [-1, 1]) {
      box(g, side * 22, 10.5, 8, 10, 1.2, 3.2, 0xa4b6aa);
      box(g, side * 22, 11.35, 8, 10.5, .16, 3.45, 0xe2c47f);
    }
  } else if (district === 'canal') {
    for (const side of [-1, 1]) {
      box(g, side * 9.5, -3.1, 0, .18, 1.6, 35, 0x7ea8a1);
      box(g, side * 10.2, -2.45, 0, .16, .16, 35, 0xe7d6ae);
    }
    addCable(g, 7, 13, 1.8);
  } else if (district === 'garden') {
    for (const z of [-12, -4, 4, 12]) { makeTree(g, -17.5, z, .9); makeTree(g, 17.5, z + 1.5, .75); }
  } else {
    addCable(g, -11, 14.5, 1.3);
    addCable(g, 10, 16.3, .8);
  }
  return bake(g);
}

export function makeSkyline(scene) {
  const blocks = Array.from({ length: 12 }, (_, i) => { const g = makeDistrict(i); scene.add(g); return g; });
  const span = blocks.length * 36;
  return (time, viewZ = 0) => blocks.forEach((g, i) => {
    const z = (((i * 36 + time * FLIGHT_SPEED - viewZ + 96) % span + span) % span) - span + viewZ;
    const f = courseFrame(time * FLIGHT_SPEED - z), p = worldPosition(0, 0, z, time);
    g.position.set(p.x, p.y, p.z);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(f.right.x, f.right.y, f.right.z),
      new THREE.Vector3(f.up.x, f.up.y, f.up.z),
      new THREE.Vector3(-f.forward.x, -f.forward.y, -f.forward.z)
    ));
  });
}

export function disposeObject(object) {
  object.traverse(child => {
    child.geometry?.dispose();
    if (child.material) for (const m of Array.isArray(child.material) ? child.material : [child.material]) m.dispose();
  });
  object.removeFromParent();
}
