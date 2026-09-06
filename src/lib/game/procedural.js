import * as THREE from 'three';

export const COLORS = { cyan: 0x26eaff, magenta: 0xff299c, orange: 0xff782e };
const glow = (color, intensity = 3) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.5 });

export function makeShip(id) {
  const group = new THREE.Group(); const color = id ? COLORS.magenta : COLORS.cyan;
  const geometry = new THREE.ConeGeometry(0.9, 2.7, 4);
  geometry.rotateX(-Math.PI / 2); geometry.scale(1, 0.24, 1);
  const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x131a32, metalness: 0.75, roughness: 0.28, emissive: color, emissiveIntensity: 0.25 }));
  group.add(body, new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) })));
  const cockpit = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), glow(color));
  cockpit.scale.set(0.65, 0.5, 1.7); cockpit.position.y = 0.25; group.add(cockpit);
  for (let i = 0; i < 12; i++) {
    const trail = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, opacity: (1 - i / 12) * 0.65, depthWrite: false, blending: THREE.AdditiveBlending }));
    trail.name = 'trail'; trail.position.set(0, 0, 1.2 + i * 0.3); trail.scale.setScalar(1 - i / 15); group.add(trail);
  }
  return group;
}

export function makeRock(seed) {
  let n = seed || 1;
  const random = () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const positions = geometry.attributes.position;
  const displacements = new Map();
  for (let i = 0; i < positions.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(positions, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    if (!displacements.has(key)) displacements.set(key, 0.8 + random() * 0.4);
    v.multiplyScalar(displacements.get(key)); positions.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x241827, metalness: 0.8, roughness: 0.55, flatShading: true })));
  const cracks = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), new THREE.LineBasicMaterial({ color: new THREE.Color(COLORS.orange).multiplyScalar(2.7) }));
  cracks.scale.setScalar(1.004); group.add(cracks); return group;
}

export function makePickup(type) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), glow(type === 'rate' ? COLORS.cyan : COLORS.magenta, 4)));
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.85, 0.85, 0.85)), new THREE.LineBasicMaterial({ color: 0xffffff })));
  return group;
}

export function makeSkyline(scene) {
  const count = 180; const dummy = new THREE.Object3D();
  const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x080919, emissive: 0x170a24, emissiveIntensity: 0.6, roughness: 0.7 }), count);
  // Edge glow in the instanced shader: keeps the whole city to two draw calls.
  const edges = new THREE.InstancedMesh(new THREE.BoxGeometry(1.008, 1.008, 1.008), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `varying vec3 p; varying vec3 c; void main(){ p=position; c=instanceColor; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 p; varying vec3 c; void main(){vec3 a=abs(p); float middle=max(min(a.x,a.y),min(max(a.x,a.y),a.z)); float edge=smoothstep(.475,.493,middle); if(edge<.05) discard; gl_FragColor=vec4(c*3.,edge);}`
  }), count);
  const buildings = [];
  for (let i = 0; i < count; i++) {
    buildings.push({ x: (i % 2 ? 1 : -1) * (19 + Math.random() * 42), z: -180 + Math.random() * 210, h: 3 + Math.random() ** 2 * 28, w: 2 + Math.random() * 4 });
    edges.setColorAt(i, new THREE.Color(i % 4 === 0 ? COLORS.cyan : COLORS.magenta));
  }
  boxes.frustumCulled = false; edges.frustumCulled = false; scene.add(boxes, edges);
  return time => {
    buildings.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2 - 4, ((b.z + time * 7 + 180) % 210) - 180);
      dummy.scale.set(b.w, b.h, b.w); dummy.updateMatrix(); boxes.setMatrixAt(i, dummy.matrix); edges.setMatrixAt(i, dummy.matrix);
    });
    boxes.instanceMatrix.needsUpdate = true; edges.instanceMatrix.needsUpdate = true;
  };
}

export function disposeObject(object) {
  object.traverse(child => { child.geometry?.dispose(); if (child.material) for (const m of Array.isArray(child.material) ? child.material : [child.material]) m.dispose(); });
  object.removeFromParent();
}
