import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceMaterial, prepareSurfaceGeometry, SURFACE } from './surfaces.js';
import { MATERIAL } from './materialAtlas.js';
import { FLIGHT_SPEED, courseFrame, worldPosition } from './course.js';

export const COLORS = { cyan: 0x19cddd, magenta: 0xef657b, orange: 0xffa342 };
const INK = 0x293c49;
// Ivory and teal masses establish a coherent illustrated city; rose/indigo
// properties and small luminous shop details carry its orbital-night identity.
export const palette = [0xe1e8db, 0xc5d6d1, 0x83b5ad, 0xb0c4c7, 0x94bdba, 0xd8c6b6, 0x91acbd, 0xd8a7b8, 0xaaa5c6, 0xd1d9cb, 0x78afb5, 0xbacdc2, 0xc18ea9, 0x99abc9];
const accents = [0x3c808a, 0x61aaa3, 0xeb819b, 0xc89cd7, 0x6bbecb, 0xc56396];
const districtNames = ['old-town', 'market', 'terrace', 'highline', 'canal', 'garden'];

export const toon = (color, kind = SURFACE.plaster) => surfaceMaterial(color, kind);

export function outlined(geometry, color, kind = SURFACE.plaster) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, toon(color, kind));
  mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: INK })));
  return group;
}

// Small trim pieces are baked into the district material without their own
// edge geometry. Outlines stay on primary masses and landmarks; this keeps
// startup and mobile GPU cost bounded as detail density rises.
function box(group, x, y, z, w, h, d, color, outline = false, kind = SURFACE.plaster) {
  const mesh = outline ? outlined(new THREE.BoxGeometry(w, h, d), color, kind) : new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color, kind));
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
  box(group, front, y, z, .11, h + .14, w + .14, 0x293e49, false, SURFACE.metal);
  box(group, front - side * .065, y, z, .035, h - .14, w - .12, color, false, SURFACE.window);
  box(group, front - side * .09, y, z, .045, h, .055, 0xc6b58f, false, SURFACE.timber);
  if (h > 1.2) box(group, front - side * .09, y + h * .12, z, .045, .055, w, 0xc6b58f, false, SURFACE.timber);
  box(group, front - side * .09, y - h / 2 - .12, z, .3, .12, w + .25, 0xe8dec3);
}

function sign(group, side, x, y, z, color, width = 5.2, height = 1.05, label = 0) {
  const front = x - side * .22;
  box(group, front, y, z, .18, height + .16, width + .16, 0x688d98, false, SURFACE.metal);
  const fascia = box(group, front - side * .12, y, z, .04, height, width, 0xffffff, false, SURFACE.sign);
  fascia.material.userData.surfaceSeed = (label % 8 + .5) / 8;
}

function awning(group, side, x, y, z, color, width = 2.8) {
  const front = x - side * .58;
  box(group, front, y, z, .8, .16, width, color, false, SURFACE.fabric);
  box(group, front - side * .42, y - .23, z, .08, .3, width, color, false, SURFACE.fabric);
}

function vendingMachine(group, side, x, z, color) {
  const front = x - side * .22;
  box(group, front, -2.55, z, .45, 2.55, 1.3, color);
  box(group, front - side * .25, -2.5, z, .1, 1.45, 1.03, 0xaed9cc, false, SURFACE.lamp);
  for (let i = 0; i < 3; i++) box(group, front - side * .31, -2.95 + i * .4, z - .25, .08, .12, .2, accents[i + 1]);
}

function makeTree(group, x, z, scale = 1) {
  const groundY = -3.7;
  box(group, x, groundY + 1.25 * scale, z, .34 * scale, 2.5 * scale, .34 * scale, 0x806851);
  const crown = outlined(new THREE.IcosahedronGeometry(1.5 * scale, 0), 0x5f947c, SURFACE.metal);
  crown.position.set(x, groundY + 3.9 * scale, z); group.add(crown);
  const crown2 = outlined(new THREE.IcosahedronGeometry(1.05 * scale, 0), 0x75a487, SURFACE.metal);
  crown2.position.set(x + .45 * scale, groundY + 5.1 * scale, z + .2 * scale); group.add(crown2);
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
    let geometry = object.geometry.clone();
    if (!object.isLineSegments) {
      const origin = object.matrixWorld.elements;
      const seed = object.material.userData.surfaceSeed ?? ((Math.sin(origin[12] * 13.7 + origin[13] * 7.1 + origin[14] * 3.3 + (group.userData.materialSeed ?? 0) * 19.17) * 43758.5453) % 1 + 1) % 1;
      prepareSurfaceGeometry(geometry, object.material.userData.surface ?? 0, seed);
    }
    geometry.applyMatrix4(object.matrixWorld);
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
    const material = surfaceMaterial(0xffffff, 0, { baked: true }); material.vertexColors = true;
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
  const geo = new THREE.ExtrudeGeometry(shape, { depth: .22, bevelEnabled: true, bevelThickness: .045, bevelSize: .055, bevelSegments: 1, steps: 1 }); geo.rotateX(Math.PI / 2);
  group.add(outlined(geo, 0xf7eed9, SURFACE.metal));
  box(group, 0, .15, 0, .48, .3, 2.3, color);
  const canopy = outlined(new THREE.SphereGeometry(.48, 8, 4), 0x294e60, SURFACE.window);
  canopy.children[0].material.dispose();
  canopy.children[0].material = new THREE.MeshPhongMaterial({ color: 0x274e63, specular: 0x8bc6d4, shininess: 75 });
  canopy.scale.set(.7, .65, 1.4); canopy.position.set(0, .38, -.2); group.add(canopy);
  // Navigation stripe, wing panels and a deliberately asymmetric courier badge.
  box(group, -.57, .15, .25, .28, .035, .64, 0xd88a59, false, SURFACE.metal);
  box(group, .62, .15, .5, .48, .035, .13, 0x345264, false, SURFACE.metal);
  box(group, 0, .57, -.18, .045, .045, .72, 0xd7c9aa, false, SURFACE.metal);
  for (const side of [-1, 1]) {
    box(group, side * 1.17, .13, .7, .07, .045, .7, 0xe5ae5f, false, SURFACE.metal);
    box(group, side * .9, 0, 1.45, .43, .43, .15, 0x344753, false, SURFACE.metal);
    box(group, side * .9, 0, 1.55, .24, .24, .08, 0x8ce7df, false, SURFACE.lamp);
    box(group, side * .9, 0, .65, .38, .38, 1.6, color);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.18, 1.8, 6), new THREE.MeshBasicMaterial({ color: 0x9affed }));
    flame.rotation.x = Math.PI / 2; flame.position.set(side * .9, 0, 2.1); flame.name = 'trail'; group.add(flame);
  }
  return group;
}

// Disconnected rays communicate an instantaneous burst, never a solid orb.
export function makeImpactBurst(color) {
  const points = [];
  for (let i = 0; i < 14; i++) {
    const y = 1 - 2 * (i + .5) / 14, angle = i * 2.399963;
    const radius = Math.sqrt(1 - y * y);
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    points.push(x * .52, y * .52, z * .52, x, y, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, depthWrite: false }));
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

// Original travel-poster illustrations and flight sayings, drawn once per tower.
const posterSayings = [
  ['SEE YOU SPACE COWBOY', 'COWBOY BEBOP'], ['LIVE LONG AND PROSPER', 'STAR TREK'],
  ['STAY ON TARGET', 'STAR WARS'], ['NEXT STOP: THE STARS', 'SKYWAY TRAVEL BUREAU'],
  ['TAKE THE SCENIC ORBIT', 'AFTERLIGHT EXPRESS'], ['A LITTLE LOST, STILL FLYING', 'PILOT NOTES'],
  ['HOME IS A DISTANT BLUE DOT', 'DEEP SPACE POST'], ['SAVE A SEAT FOR THE MOON', 'LUNAR LOCAL'],
  ['LET THE COMETS GO FIRST', 'FLIGHT SCHOOL'], ['EVERY SUNSET HAS A DEPARTURE', 'ORBITAL TRANSIT'],
  ['GOOD COFFEE. LONG ORBITS.', 'STATION CAFE'], ['FOLLOW THE QUIET STARS', 'NIGHT FLIGHT'],
  ['THE SKY HAS ROOM FOR YOU', 'CITY AIRWAYS'], ['MEET ME PAST NEPTUNE', 'OUTER PLANETS LINE'],
  ['SMALL SHIP. WIDE UNIVERSE.', 'INDEPENDENT PILOTS'], ['KEEP A WINDOW TO THE STARS', 'CABIN JOURNAL'],
  ['POSTCARDS FROM TOMORROW', 'MARS MAIL'], ['SLOW DOWN FOR SATURN', 'RING ROAD'],
  ['ANOTHER DAWN, ANOTHER WORLD', 'EXPLORER CLUB'], ['CARRY KINDNESS AS CARGO', 'FREIGHT UNION'],
  ['WE TOOK THE LONG WAY HOME', 'VOYAGER LOG'], ['MOONLIGHT IS FREE', 'LUNAR GARDENS'],
  ['MAKE TIME FOR THE VIEW', 'SKYWAY OBSERVATORY'], ['YOUR ORBIT WILL FIND YOU', 'STATION RADIO']
];
function makePoster(index, width, height) {
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 512;
  const c = canvas.getContext('2d');
  const colors = ['#da947e', '#819ea9', '#a8b48a', '#b5a2bd', '#d5b66e', '#75aaa2'];
  c.fillStyle = '#eee3c9'; c.fillRect(0, 0, 384, 512);
  c.fillStyle = colors[index % colors.length]; c.fillRect(16, 16, 352, 340);
  c.fillStyle = '#f5d991'; c.beginPath(); c.arc(250 - index % 3 * 53, 110, 62, 0, Math.PI * 2); c.fill();
  // Flat cut-paper mountains, planetary rings and a tiny outbound craft.
  for (let layer = 0; layer < 3; layer++) {
    c.fillStyle = ['#a6bdb0', '#628e91', '#355663'][layer]; c.beginPath(); c.moveTo(16, 356);
    for (let x = 16; x <= 368; x += 44) c.lineTo(x, 205 + layer * 40 + Math.sin(x * .02 + index + layer) * 32);
    c.lineTo(368, 356); c.closePath(); c.fill();
  }
  c.strokeStyle = '#f5e7c6'; c.lineWidth = 7; c.beginPath(); c.ellipse(190, 161, 132, 25, -.45, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#f5e7c6'; c.beginPath(); c.moveTo(96, 177); c.lineTo(148, 146); c.lineTo(127, 185); c.lineTo(118, 172); c.closePath(); c.fill();
  const [quote, credit] = posterSayings[index % posterSayings.length];
  c.fillStyle = '#293c49'; c.textAlign = 'center'; c.font = 'bold 25px sans-serif';
  const lines = []; let line = '';
  for (const word of quote.split(' ')) { const next = line ? line + ' ' + word : word; if (c.measureText(next).width > 330) { lines.push(line); line = word; } else line = next; } lines.push(line);
  lines.forEach((text, i) => c.fillText(text, 192, 391 + i * 29));
  c.font = '13px sans-serif'; c.fillText(credit, 192, 486);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map }));
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
  // End the walls at the cap's underside: overlapping top faces at
  // b.height - 4 z-fight when the camera looks down across the roof.
  const wallHeight = b.height - .4;
  box(g, 0, wallHeight / 2 - 4, 0, b.width, wallHeight, b.depth, base, true);
  box(g, 0, b.height - 4.2, 0, b.width + .2, .4, b.depth + .2, 0x4f6b70);
  const side = b.x < 0 ? 1 : -1;
  for (let y = -1; y < b.height - 5; y += 2.6) for (const off of [-1.9, 0, 1.9]) window(g, side, side * (b.width / 2), y, off, 0x365764, 1.05, 1.4);
  box(g, side * .04, -2.8, b.depth / 2 + .08, 1.8, 2.3, .16, 0x335160);
  box(g, 0, -3.65, 0, b.width + 1, .3, b.depth + 1, 0xf2c35d);
  const result = bake(g);
  for (const facing of [-1, 1]) {
    const art = makePoster(Math.abs(Math.floor(b.id / 10)) + (facing < 0 ? 7 : 0), b.width * .78, Math.min(b.height - 3.5, b.width * 1.12));
    art.position.set(0, b.height / 2 - 3, facing * (b.depth / 2 + .11));
    art.rotation.y = facing < 0 ? Math.PI : 0; result.add(art);
  }
  return result;
}

function addCable(group, z, y, sag = 0) {
  // Thin box segments are cheaper than line geometry and still read as cables
  // against the teal sky when the camera banks.
  box(group, -16, y, z, 12, .08, .08, 0x456368);
  box(group, 0, y - sag, z, 20, .08, .08, 0x456368);
  box(group, 16, y, z, 12, .08, .08, 0x456368);
}

// A frontage is authored in a local frame: -X faces the street, Z runs across
// the wall. Individual properties share construction rules, not a window grid.
const families = [
  { name: 'brick-maison', wall: MATERIAL.terracottaBrick, base: MATERIAL.wood, roof: MATERIAL.slate, trim: 0xe2e9dc, accent: 0x426a74, height: 19 },
  { name: 'noodle-house', wall: MATERIAL.ivory, base: MATERIAL.indigoBoards, roof: MATERIAL.terracottaRoof, trim: 0x55747c, accent: 0xe583a3, height: 11 },
  { name: 'stone-arcade', wall: MATERIAL.limestone, base: MATERIAL.limestone, roof: MATERIAL.copper, trim: 0xe0e9dc, accent: 0x3c7775, height: 15 },
  { name: 'tile-cafe', wall: MATERIAL.ivory, base: MATERIAL.tealTile, roof: MATERIAL.copper, trim: 0xddece1, accent: 0x2e6972, height: 17 },
  { name: 'rose-townhouse', wall: MATERIAL.rose, base: MATERIAL.coralTile, roof: MATERIAL.slate, trim: 0xe5e6da, accent: 0x425772, height: 17 },
  { name: 'garden-workshop', wall: MATERIAL.sageBoards, base: MATERIAL.terracottaBrick, roof: MATERIAL.slate, trim: 0xcfdfda, accent: 0x476a60, height: 12 }
];

function facadeWindow(g, y, z, width, height, trim, { bay = false, lattice = false, shutters = false, accent = 0x456778 } = {}) {
  const project = bay ? .7 : .1;
  box(g, -project / 2, y, z, project, height + .25, width + .28, trim, false, SURFACE.metal);
  box(g, -project - .025, y, z, .07, height, width, 0x315364, false, SURFACE.window);
  box(g, -project - .08, y, z, .08, height, .07, trim, false, SURFACE.metal);
  box(g, -project - .08, y + height * .15, z, .08, .07, width, trim, false, SURFACE.metal);
  if (lattice) for (const dy of [-.3, .35]) box(g, -project - .09, y + dy * height, z, .07, .055, width, trim, false, SURFACE.metal);
  box(g, -project * .55, y - height / 2 - .2, z, project + .32, .2, width + .5, trim, false, SURFACE.metal);
  if (bay) box(g, -.42, y + height / 2 + .24, z, 1.08, .23, width + .65, accent, false, SURFACE.metal);
  if (shutters) for (const side of [-1, 1]) box(g, -.16, y, z + side * (width * .5 + .28), .19, height + .08, .42, 0xf5f5f5, false, MATERIAL.indigoBoards);
}

function balcony(g, y, z, width, trim, planted = false) {
  box(g, -.7, y, z, 1.5, .22, width + .45, trim, false, SURFACE.metal);
  box(g, -1.32, y + .96, z, .07, .08, width + .3, 0x344951, false, SURFACE.metal);
  for (let i = 0; i <= 4; i++) box(g, -1.32, y + .49, z + (i / 4 - .5) * (width + .2), .055, .9, .055, 0x344951, false, SURFACE.metal);
  for (const side of [-1, 1]) box(g, -.74, y + .96, z + side * (width + .3) / 2, 1.2, .07, .07, 0x344951, false, SURFACE.metal);
  if (planted) {
    box(g, -1.12, y + .55, z + width * .24, .45, .4, width * .4, 0xcf8660, false, SURFACE.metal);
    box(g, -1.12, y + .87, z + width * .24, .5, .35, width * .43, 0x557e50, false, SURFACE.metal);
  }
}

function archFace(g, x, bottom, z, width, height, color, kind = SURFACE.metal) {
  const r = width / 2, shoulder = height - r;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0); shape.lineTo(r, 0); shape.lineTo(r, shoulder);
  shape.absarc(0, shoulder, r, 0, Math.PI, false); shape.lineTo(-r, 0);
  const geometry = new THREE.ShapeGeometry(shape, 6); geometry.rotateY(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, toon(color, kind));
  mesh.position.set(x, bottom, z); g.add(mesh);
}

function archedOpening(g, bottom, z, width, height, trim, glass = false) {
  archFace(g, -.08, bottom, z, width + .42, height + .3, trim);
  archFace(g, -.1, bottom + .13, z, width, height, glass ? 0x345c65 : 0x263d45, glass ? SURFACE.window : SURFACE.metal);
  if (glass) {
    box(g, -.14, bottom + height * .42, z, .07, height * .78, .08, trim, false, SURFACE.metal);
    box(g, -.14, bottom + height * .58, z, .07, .08, width, trim, false, SURFACE.metal);
  }
}

function clothCanopy(g, y, z, width, fabric) {
  const canopy = box(g, -.83, y, z, 1.7, .12, width, 0xffffff, false, fabric);
  canopy.rotation.z = -.15;
  box(g, -1.62, y - .25, z, .09, .42, width, 0xffffff, false, fabric);
  for (const side of [-1, 1]) box(g, -.82, y - .2, z + side * (width - .15) / 2, 1.65, .065, .065, 0x475c5b, false, SURFACE.metal);
}

function shopDoor(g, y, z, width, height, trim, timber = false) {
  box(g, -.11, y, z, .22, height + .25, width + .3, trim, false, SURFACE.metal);
  box(g, -.25, y, z, .06, height, width, timber ? 0xffffff : 0x324f57, false, timber ? MATERIAL.wood : SURFACE.window);
  box(g, -.3, y - .25, z + width * .3, .06, .38, .06, 0xe2b665, false, SURFACE.metal);
}

function paperLantern(g, y, z) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(.36, 8, 4), toon(0xef8ca9, SURFACE.lamp));
  mesh.scale.set(.85, 1.35, 1); mesh.position.set(-.85, y, z); g.add(mesh);
  box(g, -.85, y + .51, z, .28, .14, .28, 0x463b37, false, SURFACE.metal);
  box(g, -.4, y + .65, z, .9, .06, .06, 0x463b37, false, SURFACE.metal);
}

function authoredFrontage(g, width, h, identity, label, variant) {
  const f = families[identity], edge = width * (variant % 2 ? .27 : .31);
  const floorCount = Math.max(1, Math.floor((h - 7) / 3.8));
  if (identity === 0) {
    // Tall brick merchant house: projecting sash bays and continuous iron balconies.
    shopDoor(g, -2.05, -edge, 1.6, 3.45, f.trim);
    facadeWindow(g, -2, width * .13, width * .43, 2.9, f.trim);
    clothCanopy(g, -.22, width * .12, width * .49, MATERIAL.stripedCanvas);
    sign(g, 1, -.12, 1.0, 0, f.accent, width * .82, .86, label);
    for (let floor = 0; floor < floorCount; floor++) {
      const y = 3.7 + floor * 3.8;
      for (const z of [-edge, edge]) facadeWindow(g, y, z, width * .22, 2.45, f.trim, { bay: (floor + variant) % 2 === 0, accent: f.accent });
      if (floor === variant % 2) balcony(g, y - 1.6, 0, width * .88, f.trim);
    }
    for (const z of [-width / 2 + .13, width / 2 - .13]) box(g, -.12, h / 2 - 1.9, z, .24, h - 4.3, .26, f.trim, false, SURFACE.metal);
  } else if (identity === 1) {
    // Low timber noodle house: open counter, hanging fabric, lanterns and a
    // single ribbon of upper lattice glazing beneath deep eaves.
    shopDoor(g, -2.2, -edge, 1.5, 3.1, f.trim, true);
    box(g, -.1, -1.8, width * .12, .2, 2.7, width * .47, 0x243b3a, false, SURFACE.metal);
    box(g, -.7, -2.55, width * .12, 1.35, .24, width * .52, 0xffffff, false, MATERIAL.wood);
    for (let panel = 0; panel < 3; panel++) box(g, -.53, -.63, width * .12 + (panel - 1) * width * .16, .08, 1.12, width * .15, 0xffffff, false, MATERIAL.floralCanvas);
    for (const z of [-width * .43, width * .42]) paperLantern(g, .35, z);
    sign(g, 1, -.07, 1.4, 0, f.accent, width * .62, .86, 6);
    facadeWindow(g, 3.8, 0, width * .73, 1.7, f.trim, { lattice: true });
    for (const z of [-width * .48, 0, width * .48]) box(g, -.13, 1.4, z, .23, h - 2.2, .22, f.trim, false, SURFACE.metal);
    box(g, -.1, 2.35, 0, .24, .25, width, f.trim, false, SURFACE.metal);
  } else if (identity === 2) {
    // Honey-stone arcade: genuinely different round-headed openings and
    // muscular piers instead of rectangles with a different wall color.
    for (const z of [-width * .3, width * .3]) {
      archedOpening(g, -3.88, z, width * .33, 4.6, f.trim, true);
      clothCanopy(g, -.85, z, width * .34, MATERIAL.floralCanvas);
    }
    sign(g, 1, -.18, 1.25, 0, f.accent, width * .74, .7, label);
    for (let floor = 0; floor < floorCount; floor++) {
      const bottom = 2.75 + floor * 3.8;
      for (const z of [-width * .27, width * .27]) archedOpening(g, bottom, z, width * .24, 2.75, f.trim, true);
      if (floor === 0) balcony(g, bottom - .25, 0, width * .82, f.trim, true);
    }
    for (const z of [-width * .48, 0, width * .48]) box(g, -.24, -1.65, z, .48, 4.5, .38, f.trim, false, SURFACE.metal);
  } else if (identity === 3) {
    // Teal ceramic café: broad wraparound glazing and a rising Art Deco fin.
    shopDoor(g, -2.2, -edge, 1.45, 3.1, f.trim);
    facadeWindow(g, -2.05, width * .12, width * .5, 2.65, f.trim);
    clothCanopy(g, -.23, width * .1, width * .57, MATERIAL.stripedCanvas);
    for (let floor = 0; floor < floorCount; floor++) {
      const y = 3.25 + floor * 3.65;
      facadeWindow(g, y, width * .12, width * .61, 1.8, f.accent);
      box(g, -.14, y - 1.17, width * .12, .25, .22, width * .72, f.trim, false, SURFACE.metal);
    }
    box(g, -.3, h / 2 - 1.3, -width * .36, .6, h + 1.5, width * .14, 0xffffff, false, MATERIAL.tealTile);
    sign(g, 1, -.65, 2.1, -width * .36, f.accent, width * .22, 2.65, label);
    for (const offset of [0, .6, 1.2]) box(g, -.1, h - 3.4 + offset, width * .1, .23, .22, width * (.8 - offset * .3), f.trim, false, SURFACE.metal);
  } else if (identity === 4) {
    // Rose pension: decorative tiled dado, narrow paired shutters, flower
    // boxes and one front balcony rather than a whole repeated iron grid.
    shopDoor(g, -2.15, 0, 1.8, 3.2, f.trim, true);
    for (const z of [-edge, edge]) facadeWindow(g, -1.85, z, width * .18, 2.25, f.trim, { shutters: true });
    sign(g, 1, -.1, .65, 0, f.accent, width * .55, .85, 7);
    for (let floor = 0; floor < floorCount; floor++) {
      const y = 3.7 + floor * 3.8;
      for (const z of [-width * .25, width * .25]) facadeWindow(g, y, z, width * .19, 2.5, f.trim, { shutters: true });
      if (floor === 0) balcony(g, y - 1.5, 0, width * .75, f.trim, true);
    }
    if (variant % 3 !== 2) clothCanopy(g, -.05, 0, 2.6, MATERIAL.floralCanvas);
  } else {
    // Sage workshop: wide garage and asymmetric pedestrian entry, structural
    // battens, a long studio clerestory and a tiled porch.
    box(g, -.12, -1.65, -width * .15, .24, 4.2, width * .54, 0xffffff, false, MATERIAL.indigoBoards);
    for (let slat = 0; slat < 4; slat++) box(g, -.26, -3.35 + slat * .92, -width * .15, .08, .06, width * .54, f.trim, false, SURFACE.metal);
    shopDoor(g, -2.2, width * .34, 1.45, 3.1, f.trim);
    facadeWindow(g, 3.35, 0, width * .79, 1.9, f.trim, { lattice: true });
    sign(g, 1, -.1, .92, 0, f.accent, width * .73, .8, 3);
    for (const z of [-width * .46, width * .44]) box(g, -.19, h / 2 - 3, z, .32, h - 1.2, .2, f.trim, false, SURFACE.metal);
    box(g, -.65, -3.87, width * .34, 1.5, .18, 2.2, 0xffffff, false, MATERIAL.encaustic);
  }
  // Strong cornice, shallow threshold, one lamp. Their forms remain legible
  // at chase-camera distance; tiny random facade greebles were removed.
  box(g, -.2, h - 4.08, 0, .5, .28, width + .3, f.trim, false, SURFACE.metal);
  box(g, -.23, -3.85, 0, .5, .2, width + .2, f.trim, false, SURFACE.metal);
  if (identity !== 1) {
    box(g, -.65, .25, width * .44, .85, .07, .07, 0x344951, false, SURFACE.metal);
    box(g, -1, -.1, width * .44, .28, .65, .34, 0x99d8dc, false, SURFACE.lamp);
  }
}

// The narrow service alleys have their own quieter end elevations. They
// preserve each construction identity without duplicating the street's shop,
// canopy, counter and balcony geometry three times around every property.
function secondaryFrontage(g, width, h, identity, label, variant) {
  const f = families[identity];
  if (identity === 2) {
    archedOpening(g, -3.86, -.15 * width, width * .42, 4.1, f.trim, true);
  } else if (identity === 5) {
    box(g, -.08, -2.05, 0, .16, 3.6, width * .62, 0xffffff, false, MATERIAL.wood);
    box(g, -.19, -2.05, 0, .06, 3.6, .1, f.trim, false, SURFACE.metal);
  } else {
    shopDoor(g, -2.1, width * (variant % 2 ? .2 : -.2), width * .22, 3.3, f.trim, identity !== 3);
    if (identity === 1) box(g, -.3, -.73, width * .2, .06, .85, width * .24, 0xffffff, false, MATERIAL.floralCanvas);
  }
  if (identity !== 5) sign(g, 1, -.05, .65, 0, f.accent, width * .62, .7, label);
  const floors = Math.max(1, Math.floor((h - 7) / 4.1));
  for (let floor = 0; floor < floors; floor++) {
    const y = 3.6 + floor * 4.1;
    if (identity === 2) {
      archedOpening(g, y - 1.2, 0, width * .32, 2.7, f.trim, true);
    } else if (identity === 1 || identity === 3 || identity === 5) {
      facadeWindow(g, y, 0, width * .66, 1.6, f.trim, { lattice: identity === 1 });
    } else {
      for (const z of [-width * .25, width * .25]) facadeWindow(g, y, z, width * .2, 2.1, f.trim, { shutters: identity === 4 });
    }
  }
  box(g, -.15, h - 4.08, 0, .36, .28, width + .3, f.trim, false, SURFACE.metal);
}

function pitchedRoof(group, x, y, z, width, depth, rise, kind) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(0, rise); shape.lineTo(width / 2, 0); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  const roof = outlined(geo, 0xffffff, kind); roof.position.set(x, y, z - depth / 2); group.add(roof);
}

function propertyRoof(g, x, y, z, w, d, identity) {
  const f = families[identity];
  if (identity === 0 || identity === 4) {
    pitchedRoof(g, x, y, z, w + .7, d + .7, identity === 4 ? 3.3 : 2.6, f.roof);
    box(g, x + w * .25, y + 2.1, z + d * .27, 1, 4.2, 1.2, 0xffffff, false, MATERIAL.terracottaBrick);
    box(g, x + w * .25, y + 4.28, z + d * .27, 1.3, .22, 1.5, f.trim, false, SURFACE.metal);
    if (identity === 0) {
      box(g, x, y + 1.4, z + d * .32, w * .53, 2.5, 2.6, 0xffffff, false, MATERIAL.rose);
      pitchedRoof(g, x, y + 2.65, z + d * .32, w * .62, 3.1, 1.15, MATERIAL.copper);
      for (const end of [-1, 1]) box(g, x, y + 1.7, z + d * .32 + end * 1.34, w * .32, 1.35, .07, 0x395b65, false, SURFACE.window);
    }
  } else if (identity === 1) {
    pitchedRoof(g, x, y, z, w + 1.4, d + 1.3, 2.35, f.roof);
    for (const side of [-1, 1]) box(g, x + side * (w + .9) / 2, y + .08, z, .32, .24, d + 1.5, f.trim, false, SURFACE.metal);
    box(g, x, y + 2.42, z, .24, .24, d + 1.6, f.trim, false, SURFACE.metal);
  } else if (identity === 5) {
    for (const dz of [-d * .27, d * .27]) {
      pitchedRoof(g, x, y, z + dz, w + .7, d * .5, 2.1, MATERIAL.copper);
      box(g, x, y + .85, z + dz + d * .25 + .02, w * .7, 1.35, .06, 0x4b7b7a, false, SURFACE.window);
    }
    makeRooftopTank(g, x + w * .25, y + 1.15, z - d * .3, 0x9c7354);
  } else {
    box(g, x, y, z, w + .5, .35, d + .5, 0xffffff, false, f.roof);
    for (const end of [-1, 1]) box(g, x, y + .6, z + end * d / 2, w, 1.2, .3, f.trim, false, SURFACE.metal);
    for (const side of [-1, 1]) box(g, x + side * w / 2, y + .6, z, .3, 1.2, d, f.trim, false, SURFACE.metal);
    if (identity === 2) {
      box(g, x + w * .15, y + 1.25, z - d * .13, w * .6, 2.5, d * .5, 0xffffff, false, MATERIAL.ivory);
      pitchedRoof(g, x + w * .15, y + 2.5, z - d * .13, w * .72, d * .6, 1.4, MATERIAL.terracottaRoof);
      box(g, x - w * .3, y + .7, z + d * .3, 1.1, .9, d * .35, 0x65864f, false, SURFACE.metal);
    } else {
      box(g, x + w * .1, y + 1, z - d * .15, w * .64, 2, d * .58, 0xffffff, false, MATERIAL.tealTile);
      box(g, x + w * .1, y + 2.15, z - d * .15, w * .7, .22, d * .64, f.trim, false, SURFACE.metal);
    }
  }
}

const streetPlans = [
  [0, 1, 4, 2, 5, 3, 1, 0, 2, 4, 3, 5, 2, 1, 3, 0, 5, 4, 1, 3, 0, 2, 4, 5, 3, 4, 5, 1, 2, 0, 4, 0, 1, 5, 3, 2],
  [5, 2, 1, 3, 0, 4, 3, 5, 4, 0, 1, 2, 0, 4, 5, 2, 3, 1, 4, 0, 2, 5, 1, 3, 2, 1, 0, 4, 5, 3, 1, 5, 2, 0, 4, 3]
];

export function propertyLayout(index, side, lot) {
  const lane = side > 0 ? 1 : 0, address = index * 2 + lot;
  const identity = streetPlans[lane][address % 36];
  const variation = (index * 7 + lot * 3 + lane * 11) % 9;
  return {
    identity, variation,
    width: 7.4 + (variation % 4) * .6,
    depth: 12.8 + ((variation + lane) % 3) * .9,
    z: (lot === 0 ? -9 : 8.5) + (lane ? 1.15 : -.25),
    setback: [0, .65, .25, 1.05][(variation + identity) % 4],
    height: families[identity].height + [-2.1, .7, 1.8, -.8, 0][(address + lane * 3) % 5]
  };
}

function makeDistrict(index) {
  const g = new THREE.Group();
  g.userData.familyKit = true; g.userData.materialSeed = index;
  for (const side of [-1, 1]) {
    box(g, side * 15.8, -3.92, 0, 4.2, .45, 36, 0xf8f1e4, false, MATERIAL.basalt);
    box(g, side * 13.75, -3.66, 0, .18, .18, 36, 0xc8e0d7, false, SURFACE.metal);
    for (let lot = 0; lot < 2; lot++) {
      const { identity, variation, width, depth, z, setback, height: h } = propertyLayout(index, side, lot);
      const f = families[identity];
      const x = side * (17.6 + width / 2 + setback);
      // Each property has its own material and proportions. Ground-floor
      // construction wraps the corners rather than ending at a pasted facade.
      box(g, x, h / 2 - 4, z, width, h, depth, 0xffffff, true, f.wall);
      box(g, x, -1.95, z, width + .08, 4.1, depth + .08, 0xffffff, false, f.base);
      box(g, x, .16, z, width + .3, .22, depth + .3, f.trim, false, SURFACE.metal);
      const front = new THREE.Group();
      authoredFrontage(front, depth, h, identity, (index + lot + (side > 0 ? 3 : 0)) % 8, variation);
      front.position.set(x - side * width / 2, 0, z); front.rotation.y = side > 0 ? 0 : Math.PI; g.add(front);
      for (const end of [-1, 1]) {
        const face = new THREE.Group();
        secondaryFrontage(face, width, h, identity, (index + lot + (end < 0 ? 2 : 0)) % 8, variation);
        // End-wall fittings are shallower in the narrow service alleys.
        face.scale.x = .65;
        face.position.set(x, 0, z + end * depth / 2); face.rotation.y = end > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(face);
      }
      propertyRoof(g, x, h - 3.98, z, width, depth, identity);
      // A small planting/bench at the property seam gives the lane a human
      // scale without adding more street furniture to the flight envelope.
      if (lot === 0) {
        makeTree(g, side * 15.75, z + depth / 2 + 1.05, .66);
        box(g, side * 16, -3.08, z + depth / 2 + 2.15, 1.15, .18, 2.15, 0xffffff, false, MATERIAL.wood);
      }
    }
  }
  if (index % 3 === 0) addCable(g, -14, 14.5, 1.1);
  return bake(g);
}

// A single set of window quads is reused across the entire outer city. The
// silhouettes, colors, setbacks, roof equipment and aerials vary per cell.
function skylineWindows() {
  const positions = [], indices = [];
  const quad = (a, b, c, d) => {
    const i = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  for (let floor = 0; floor < 5; floor++) {
    const y = -.32 + floor * .15, top = y + .075;
    for (const x of [-.23, .23]) for (const z of [-.506, .506])
      quad([x - .09, y, z], [x + .09, y, z], [x + .09, top, z], [x - .09, top, z]);
    for (const z of [-.23, .23]) for (const x of [-.506, .506])
      quad([x, y, z - .07], [x, y, z + .07], [x, top, z + .07], [x, top, z - .07]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Dense instance pools retain existing cells across grid crossings. Removing
// a cell swaps the last active instance into its slot; only changed ranges
// are uploaded, with no zero-scale hidden instances in the lighting shader.
function instancePool(mesh, colored = false) {
  const slots = new Map(), keys = [];
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (colored) { mesh.setColorAt(0, new THREE.Color()); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
  mesh.count = 0; mesh.frustumCulled = false;
  let first = Infinity, last = -1;
  const dirty = index => { first = Math.min(first, index); last = Math.max(last, index); };
  return {
    mesh,
    put(key, matrix, color) {
      let index = slots.get(key);
      if (index === undefined) { index = keys.length; slots.set(key, index); keys.push(key); }
      mesh.setMatrixAt(index, matrix);
      if (colored) mesh.setColorAt(index, color);
      mesh.count = keys.length; dirty(index);
    },
    remove(key) {
      const index = slots.get(key);
      if (index === undefined) return;
      const tail = keys.length - 1;
      if (index !== tail) {
        mesh.instanceMatrix.array.copyWithin(index * 16, tail * 16, tail * 16 + 16);
        if (colored) mesh.instanceColor.array.copyWithin(index * 3, tail * 3, tail * 3 + 3);
        keys[index] = keys[tail]; slots.set(keys[index], index); dirty(index);
      }
      keys.pop(); slots.delete(key); mesh.count = keys.length;
    },
    flush() {
      if (last < first) return;
      mesh.instanceMatrix.addUpdateRange(first * 16, (last - first + 1) * 16); mesh.instanceMatrix.needsUpdate = true;
      if (colored) { mesh.instanceColor.addUpdateRange(first * 3, (last - first + 1) * 3); mesh.instanceColor.needsUpdate = true; }
      first = Infinity; last = -1;
    }
  };
}

export function makeSkyline(scene) {
  const blocks = Array.from({ length: 18 }, (_, i) => { const g = makeDistrict(i); scene.add(g); return g; });
  const basis = new THREE.Matrix4(), right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  let previousBlock = null, previousCell = '', previousRoute = null;
  const count = 31 * 31;
  const buildings = instancePool(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(0xffffff), count), true);
  const roofs = instancePool(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(0x536f72, SURFACE.roof), count));
  const bands = instancePool(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(0xbfd2c9), count * 3));
  const windows = instancePool(new THREE.InstancedMesh(skylineWindows(), surfaceMaterial(0xffffff, SURFACE.window), count), true);
  const setbacks = instancePool(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(0xffffff), count), true);
  const roofRooms = instancePool(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(0xffffff), count), true);
  const aerials = instancePool(new THREE.InstancedMesh(new THREE.CylinderGeometry(.05,.08,1,5), toon(0x344c52), count));
  const pools = [buildings, roofs, bands, windows, setbacks, roofRooms, aerials];
  for (const pool of pools) scene.add(pool.mesh);
  windows.mesh.material.side = THREE.DoubleSide;
  const cells = new Map(), clearance = new Set();
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const hash = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
  return (time, viewZ = 0) => {
    const distance = time * FLIGHT_SPEED - viewZ, block = Math.floor(distance / 36);
    if (block !== previousBlock) {
      previousBlock = block;
      blocks.forEach((g, i) => {
        const section = block - 4 + ((i - (block - 4) % blocks.length + blocks.length) % blocks.length);
        if (g.userData.section === section) return;
        g.userData.section = section;
        const f = courseFrame(section * 36);
        g.position.set(f.x, f.y, f.z);
        right.set(f.right.x, f.right.y, f.right.z); up.set(f.up.x, f.up.y, f.up.z); back.set(-f.forward.x, -f.forward.y, -f.forward.z);
        g.quaternion.setFromRotationMatrix(basis.makeBasis(right, up, back));
      });
    }
    const f = courseFrame(distance), cx = Math.floor(f.x / 22), cz = Math.floor(f.z / 22), routeSection = Math.floor(distance / 140);
    const cell = `${cx}:${cz}:${routeSection}`;
    if (cell === previousCell) return;
    previousCell = cell;
    if (routeSection !== previousRoute) {
      previousRoute = routeSection; clearance.clear();
      // Rasterize route clearance once, rather than testing every building
      // against 151 route samples at every 22-metre grid crossing. Padding
      // keeps the entire rolling interval clear, including nearby hairpins.
      const anchor = routeSection * 140;
      for (let d = anchor - 1000; d <= anchor + 1140; d += 12) {
        const p = courseFrame(d), rx = Math.floor(p.x / 22), rz = Math.floor(p.z / 22);
        for (let x = rx - 2; x <= rx + 2; x++) for (let z = rz - 2; z <= rz + 2; z++) {
          if ((p.x - x * 22) ** 2 + (p.z - z * 22) ** 2 <= 42 ** 2) clearance.add(`${x}:${z}`);
        }
      }
    }
    for (const [key, position] of cells) {
      if (Math.abs(position.x - cx) <= 15 && Math.abs(position.z - cz) <= 15 && !clearance.has(key)) continue;
      cells.delete(key);
      for (const pool of [buildings, roofs, windows, setbacks, roofRooms, aerials]) pool.remove(key);
      for (let floor = 0; floor < 3; floor++) bands.remove(`${key}:${floor}`);
    }
    for (let x = cx - 15; x <= cx + 15; x++) for (let z = cz - 15; z <= cz + 15; z++) {
      const key = `${x}:${z}`;
      if (cells.has(key) || clearance.has(key)) continue;
      cells.set(key, { x, z });
      const n = hash(x, z), px = x * 22, pz = z * 22;
      const profile = hash(x + 13, z - 5), detail = hash(x - 7, z + 19);
      const height = 18 + n * 43, width = 12 + hash(z, x + 8) * 6, depth = 12 + n * 6;
      dummy.position.set(px, -8 + height / 2, pz); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      buildings.put(key, dummy.matrix, color.setHex(palette[Math.floor(n * palette.length)]));
      windows.put(key, dummy.matrix, color.setHex(detail > .72 ? 0x806b62 : detail > .35 ? 0x536e70 : 0x39545e));
      dummy.position.y = -8 + height; dummy.scale.set(width + .8, .8, depth + .8); dummy.updateMatrix(); roofs.put(key, dummy.matrix);
      for (let floor = 0; floor < 3; floor++) {
        dummy.position.y = -8 + height * (.3 + floor * .22); dummy.scale.set(width + .12, .65, depth + .12); dummy.updateMatrix(); bands.put(`${key}:${floor}`, dummy.matrix);
      }
      if (profile > .45) {
        const setbackHeight = 3 + profile * 8;
        dummy.position.set(px + (detail - .5) * 2, -8 + height + setbackHeight / 2, pz + (profile - .5) * 2); dummy.scale.set(width * (.44 + detail * .25), setbackHeight, depth * .54); dummy.updateMatrix();
        setbacks.put(key, dummy.matrix, color.setHex(palette[Math.floor(profile * palette.length)]));
      }
      const roomHeight = 1.5 + detail * 2.5;
      dummy.position.set(px - width * .2, -8 + height + roomHeight / 2, pz + depth * .18); dummy.scale.set(width * .23, roomHeight, depth * .21); dummy.updateMatrix();
      roofRooms.put(key, dummy.matrix, color.setHex(detail > .5 ? 0x718e91 : 0xc8c8b6));
      if (detail > .22) {
        dummy.position.set(px + width * .27, -8 + height + 2 + profile * 3, pz - depth * .25); dummy.scale.set(1, 4 + profile * 6, 1); dummy.updateMatrix(); aerials.put(key, dummy.matrix);
      }
    }
    for (const pool of pools) pool.flush();
  };
}

export function disposeObject(object) {
  object.traverse(child => {
    child.geometry?.dispose();
    if (child.material) for (const m of Array.isArray(child.material) ? child.material : [child.material]) { m.map?.dispose(); m.dispose(); }
  });
  object.removeFromParent();
}
