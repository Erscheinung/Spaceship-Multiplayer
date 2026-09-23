import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLIGHT_SPEED, courseFrame, worldPosition } from './course.js';

export const COLORS = { cyan: 0x19cddd, magenta: 0xef657b, orange: 0xffa342 };
const INK = 0x293c49;
// The city uses a dusty plaster palette so the cyan sky and ship lights carry
// the visual focus. Every shape below is original procedural geometry.
export const palette = [0xf1e6cf, 0xd8d1b9, 0x9db8aa, 0xc9a889, 0xb8c9bb, 0xd7b86b, 0xa7b6c1, 0xd8a6a1, 0xb4abc7, 0xe3c49f, 0x91b7bb, 0xc4ce99, 0xc99379, 0xa5b5ce];
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
  box(g, 0, b.height / 2 - 4, 0, b.width, b.height, b.depth, base, true);
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
    // End facades remain visible through turns and from above.
    for (const end of [-1, 1]) {
      const z = (index % 2 - .5) * 8 + end * 12.56;
      for (let y = 0; y < h - 5; y += 3) for (const col of [-1, 0, 1]) {
        box(g, x + col * w * .27, y, z, w * .15, 1.4, .1, accents[(index + col + 7) % accents.length]);
      }
      box(g, x, h * .55 - 4, z, w, .35 + index % 3 * .2, .14, accents[(index + 3) % accents.length]);
    }
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

export function makeSkyline(scene) {
  const blocks = Array.from({ length: 18 }, (_, i) => { const g = makeDistrict(i); scene.add(g); return g; });
  const basis = new THREE.Matrix4();
  let previousBlock = null, previousCell = '';
  // World-aligned outer districts fill the view during banks and hairpins.
  // Instancing keeps almost a thousand distant buildings to a few draw calls.
  const count = 31 * 31;
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(0xffffff), count);
  const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(0x536f72), count);
  const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(0xbfd2c9), count * 3);
  const windows = new THREE.InstancedMesh(skylineWindows(), new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}), count);
  const setbacks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(0xffffff), count);
  const roofRooms = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(0xffffff), count);
  const aerials = new THREE.InstancedMesh(new THREE.CylinderGeometry(.05,.08,1,5), toon(0x344c52), count);
  for (const mesh of [buildings, roofs, bands, windows, setbacks, roofRooms, aerials]) mesh.frustumCulled = false;
  scene.add(buildings, roofs, bands, windows, setbacks, roofRooms, aerials);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const hash = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
  return (time, viewZ = 0) => {
    const distance = time * FLIGHT_SPEED - viewZ, block = Math.floor(distance / 36);
    if (block !== previousBlock) {
      previousBlock = block;
      blocks.forEach((g, i) => {
        const section = block - 4 + ((i - (block - 4) % blocks.length + blocks.length) % blocks.length);
        const f = courseFrame(section * 36);
        g.position.set(f.x, f.y, f.z);
        g.quaternion.setFromRotationMatrix(basis.makeBasis(
          new THREE.Vector3(f.right.x, f.right.y, f.right.z), new THREE.Vector3(f.up.x, f.up.y, f.up.z), new THREE.Vector3(-f.forward.x, -f.forward.y, -f.forward.z)));
      });
    }
    const f = courseFrame(distance), cx = Math.floor(f.x / 22), cz = Math.floor(f.z / 22), cell = `${cx}:${cz}:${Math.floor(distance / 140)}`;
    if (cell === previousCell) return;
    previousCell = cell;
    const route = [];
    for (let d = distance - 900; d <= distance + 900; d += 12) route.push(courseFrame(d));
    let i = 0;
    for (let x = cx - 15; x <= cx + 15; x++) for (let z = cz - 15; z <= cz + 15; z++) {
      const n = hash(x, z), px = x * 22, pz = z * 22;
      const clear = route.every(p => Math.hypot(p.x - px, p.z - pz) > 42);
      const profile = hash(x + 13, z - 5), detail = hash(x - 7, z + 19);
      const height = 18 + n * 43, width = 12 + hash(z, x + 8) * 6, depth = 12 + n * 6;
      dummy.position.set(px, -8 + height / 2, pz); dummy.scale.set(clear ? width : 0, clear ? height : 0, clear ? depth : 0); dummy.updateMatrix(); buildings.setMatrixAt(i, dummy.matrix);
      buildings.setColorAt(i, color.setHex(palette[Math.floor(n * palette.length)]));
      windows.setMatrixAt(i, dummy.matrix);
      windows.setColorAt(i, color.setHex(detail > .72 ? 0x806b62 : detail > .35 ? 0x536e70 : 0x39545e));
      dummy.position.y = -8 + height; dummy.scale.set(clear ? width + .8 : 0, clear ? .8 : 0, clear ? depth + .8 : 0); dummy.updateMatrix(); roofs.setMatrixAt(i, dummy.matrix);
      for (let floor = 0; floor < 3; floor++) {
        dummy.position.y = -8 + height * (.3 + floor * .22);
        dummy.scale.set(clear ? width + .12 : 0, clear ? .65 : 0, clear ? depth + .12 : 0);
        dummy.updateMatrix(); bands.setMatrixAt(i * 3 + floor, dummy.matrix);
      }
      const setbackHeight = profile > .45 ? 3 + profile * 8 : 0;
      dummy.position.set(px + (detail - .5) * 2, -8 + height + setbackHeight / 2, pz + (profile - .5) * 2);
      dummy.scale.set(clear && setbackHeight ? width * (.44 + detail * .25) : 0, clear ? setbackHeight : 0, clear ? depth * .54 : 0);
      dummy.updateMatrix(); setbacks.setMatrixAt(i, dummy.matrix);
      setbacks.setColorAt(i, color.setHex(palette[Math.floor(profile * palette.length)]));
      const roomHeight = 1.5 + detail * 2.5;
      dummy.position.set(px - width * .2, -8 + height + roomHeight / 2, pz + depth * .18);
      dummy.scale.set(clear ? width * .23 : 0, clear ? roomHeight : 0, clear ? depth * .21 : 0);
      dummy.updateMatrix(); roofRooms.setMatrixAt(i, dummy.matrix);
      roofRooms.setColorAt(i, color.setHex(detail > .5 ? 0x718e91 : 0xc8c8b6));
      dummy.position.set(px + width * .27, -8 + height + 2 + profile * 3, pz - depth * .25);
      dummy.scale.set(clear && detail > .22 ? 1 : 0, clear ? 4 + profile * 6 : 0, 1);
      dummy.updateMatrix(); aerials.setMatrixAt(i, dummy.matrix);
      i++;
    }
    for (const mesh of [buildings, roofs, bands, windows, setbacks, roofRooms, aerials]) mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of [buildings, windows, setbacks, roofRooms]) mesh.instanceColor.needsUpdate = true;
  };
}

export function disposeObject(object) {
  object.traverse(child => {
    child.geometry?.dispose();
    if (child.material) for (const m of Array.isArray(child.material) ? child.material : [child.material]) { m.map?.dispose(); m.dispose(); }
  });
  object.removeFromParent();
}
