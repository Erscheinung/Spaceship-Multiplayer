import * as THREE from 'three';
import { surfaceMaterial, SURFACE } from './surfaces.js';
import { courseFrame } from './course.js';

export const ROAD_SUPPORT = Object.freeze({ extent: 28.5, height: -4.1 });

// Road geometry lives in world space. Crossing a segment only recycles the
// pieces behind the camera; the other 159 segments do not need rebuilding.
export function createRoad(scene) {
  const count = 160;
  const positions = new THREE.BufferAttribute(new Float32Array(count * 18), 3).setUsage(THREE.DynamicDrawUsage);
  const normals = new THREE.BufferAttribute(new Float32Array(count * 18), 3).setUsage(THREE.DynamicDrawUsage);
  const surfaceUv = new THREE.BufferAttribute(new Float32Array(count * 12), 2).setUsage(THREE.DynamicDrawUsage);
  const surfaceData = new THREE.BufferAttribute(new Float32Array(count * 12), 2);
  for (let i = 0; i < count * 6; i++) { surfaceData.setXY(i, SURFACE.paving, .4); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('surfaceUv', surfaceUv); geometry.setAttribute('surfaceData', surfaceData);
  geometry.setAttribute('position', positions); geometry.setAttribute('normal', normals);
  // The atlas supplies the full-color basalt albedo. Keep this cool near-white
  // multiplier so the former grey-green road tint does not crush its values.
  const road = new THREE.Mesh(geometry, surfaceMaterial(0xe8edf0, SURFACE.paving, { baked: true }));
  road.material.side = THREE.DoubleSide; road.receiveShadow = true; road.frustumCulled = false; scene.add(road);
  // A continuous foundation follows the same sampled route as the road. It
  // supports the road, sidewalk slabs, property frontages, and lot gaps
  // without relying on rigid 36m district slabs meeting through hills/turns.
  const supportGeometry = new THREE.BufferGeometry();
  const supportPositions = new THREE.BufferAttribute(new Float32Array(count * 18), 3).setUsage(THREE.DynamicDrawUsage);
  const supportNormals = new THREE.BufferAttribute(new Float32Array(count * 18), 3).setUsage(THREE.DynamicDrawUsage);
  const supportUv = new THREE.BufferAttribute(new Float32Array(count * 12), 2).setUsage(THREE.DynamicDrawUsage);
  const supportData = new Float32Array(count * 12);
  for (let i = 0; i < count * 6; i++) { supportData[i * 2] = SURFACE.paving; supportData[i * 2 + 1] = .4; }
  supportGeometry.setAttribute('position', supportPositions);
  supportGeometry.setAttribute('normal', supportNormals);
  supportGeometry.setAttribute('surfaceUv', supportUv);
  supportGeometry.setAttribute('surfaceData', new THREE.BufferAttribute(supportData, 2));
  const support = new THREE.Mesh(supportGeometry, surfaceMaterial(0xbfc6b7, SURFACE.paving, { baked: true }));
  support.material.side = THREE.DoubleSide;
  support.receiveShadow = true;
  support.frustumCulled = false;
  support.userData.roadSupport = true;
  scene.add(support);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(.45, .6, 1), new THREE.MeshToonMaterial({ color: 0xe3c56f }), count * 2);
  rails.castShadow = true; rails.receiveShadow = true;
  const guards = new THREE.InstancedMesh(new THREE.BoxGeometry(.1, 5, 1), new THREE.MeshBasicMaterial({ color: 0x19cddd, transparent: true, opacity: .06, depthWrite: false }), count * 2);
  const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(.14, .05, 1.25), new THREE.MeshToonMaterial({ color: 0xf3e3b9 }), count * 2);
  marks.receiveShadow = true;
  const instances = [rails, guards, marks];
  for (const mesh of instances) { mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh); }
  const slots = new Array(count), dummy = new THREE.Object3D(), basis = new THREE.Matrix4();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const edge = new THREE.Vector3(), normal = new THREE.Vector3(), start = new THREE.Vector3(), end = new THREE.Vector3();
  const offset = (f, x, y, target) => target.set(f.x + f.right.x * x + f.up.x * y, f.y + f.right.y * x + f.up.y * y, f.z + f.right.z * x + f.up.z * y);
  const supportPoints = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const writeSupportQuad = (slot, distance, first, last) => {
    offset(first, -ROAD_SUPPORT.extent, ROAD_SUPPORT.height, supportPoints[0]);
    offset(first, ROAD_SUPPORT.extent, ROAD_SUPPORT.height, supportPoints[1]);
    offset(last, -ROAD_SUPPORT.extent, ROAD_SUPPORT.height, supportPoints[2]);
    offset(last, ROAD_SUPPORT.extent, ROAD_SUPPORT.height, supportPoints[3]);
    const basePosition = slot * 18, baseVertex = slot * 6;
    const order = [0, 1, 2, 1, 3, 2];
    const uv = [[-ROAD_SUPPORT.extent, distance], [ROAD_SUPPORT.extent, distance], [-ROAD_SUPPORT.extent, distance + 2], [ROAD_SUPPORT.extent, distance + 2]];
    for (let vertex = 0; vertex < 6; vertex++) {
      const source = order[vertex], point = supportPoints[source];
      point.toArray(supportPositions.array, basePosition + vertex * 3);
      supportUv.array[(baseVertex + vertex) * 2] = uv[source][0];
      supportUv.array[(baseVertex + vertex) * 2 + 1] = uv[source][1];
    }
    for (let triangle = 0; triangle < 6; triangle += 3) {
      const i0 = order[triangle], i1 = order[triangle + 1], i2 = order[triangle + 2];
      normal.subVectors(supportPoints[i1], supportPoints[i0]).cross(edge.subVectors(supportPoints[i2], supportPoints[i0])).normalize();
      for (let vertex = 0; vertex < 3; vertex++) normal.toArray(supportNormals.array, basePosition + (triangle + vertex) * 3);
    }
  };
  let previousSection = null;
  return section => {
    if (section === previousSection) return;
    previousSection = section;
    for (let segment = section - 18; segment < section + count - 18; segment++) {
      const slot = ((segment % count) + count) % count;
      if (slots[slot] === segment) continue;
      slots[slot] = segment;
      const distance = segment * 2 + 1;
      const first = courseFrame(distance), last = courseFrame(distance + 2), mid = courseFrame(distance + 1);
      offset(first, -13.8, -4, a); offset(first, 13.8, -4, b);
      offset(last, -13.8, -4, c); offset(last, 13.8, -4, d);
      const base = slot * 18;
      surfaceUv.array.set([-13.8,distance,13.8,distance,-13.8,distance+2,13.8,distance,13.8,distance+2,-13.8,distance+2],slot*12);
      surfaceUv.addUpdateRange(slot*12,12);
      a.toArray(positions.array, base); b.toArray(positions.array, base + 3); c.toArray(positions.array, base + 6);
      b.toArray(positions.array, base + 9); d.toArray(positions.array, base + 12); c.toArray(positions.array, base + 15);
      normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
      for (let i = 0; i < 9; i += 3) normal.toArray(normals.array, base + i);
      normal.subVectors(d, b).cross(edge.subVectors(c, b)).normalize();
      for (let i = 9; i < 18; i += 3) normal.toArray(normals.array, base + i);
      positions.addUpdateRange(base, 18); normals.addUpdateRange(base, 18);
      writeSupportQuad(slot, distance, first, last);
      supportPositions.addUpdateRange(slot * 18, 18);
      supportNormals.addUpdateRange(slot * 18, 18);
      supportUv.addUpdateRange(slot * 12, 12);
      right.set(mid.right.x, mid.right.y, mid.right.z); up.set(mid.up.x, mid.up.y, mid.up.z); back.set(-mid.forward.x, -mid.forward.y, -mid.forward.z);
      dummy.quaternion.setFromRotationMatrix(basis.makeBasis(right, up, back));
      for (let j = 0; j < 2; j++) {
        const side = j ? 1 : -1, index = slot * 2 + j;
        offset(first, side * 13.8, 0, start); offset(last, side * 13.8, 0, end);
        dummy.position.copy(start).add(end).multiplyScalar(.5).addScaledVector(up, -3.65);
        dummy.scale.set(1, 1, start.distanceTo(end) + .1); dummy.updateMatrix(); rails.setMatrixAt(index, dummy.matrix);
        dummy.position.addScaledVector(up, 5.6); dummy.updateMatrix(); guards.setMatrixAt(index, dummy.matrix);
        offset(mid, side * 5.8, -3.92, dummy.position); dummy.scale.set(1, 1, 1.6); dummy.updateMatrix(); marks.setMatrixAt(index, dummy.matrix);
      }
      for (const mesh of instances) mesh.instanceMatrix.addUpdateRange(slot * 32, 32);
    }
    positions.needsUpdate = true; normals.needsUpdate = true; surfaceUv.needsUpdate = true;
    supportPositions.needsUpdate = true; supportNormals.needsUpdate = true; supportUv.needsUpdate = true;
    for (const mesh of instances) mesh.instanceMatrix.needsUpdate = true;
  };
}
