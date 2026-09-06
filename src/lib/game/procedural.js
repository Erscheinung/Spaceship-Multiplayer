import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLIGHT_SPEED, roadCenter } from './course.js';

export const COLORS = { cyan: 0x19cddd, magenta: 0xef657b, orange: 0xffa342 };
const INK = 0x293c49;
export const palette = [0xf3e6c8, 0xe9aa8c, 0x91bbb0, 0xe3c56f, 0xb6c9bc];
export const toon = color => new THREE.MeshToonMaterial({ color, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1 });
export function outlined(geometry, color) {
  const group = new THREE.Group();
  const mesh=new THREE.Mesh(geometry, toon(color));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: INK })));
  return group;
}
function box(group, x, y, z, w, h, d, color) {
  const mesh = outlined(new THREE.BoxGeometry(w, h, d), color); mesh.position.set(x, y, z); group.add(mesh); return mesh;
}
// Merge static architecture by material: detail without hundreds of draw calls per block.
function bake(group) {
  group.updateMatrixWorld(true);
  const meshes = new Map(), lines = [];
  group.traverse(o => {
    if (!o.geometry) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (o.isLineSegments) lines.push(geo);
    else { const color = o.material.color.getHex(); if (!meshes.has(color)) meshes.set(color, []); meshes.get(color).push(geo); }
  });
  const result = new THREE.Group();
  for (const [color, geometries] of meshes) { const mesh=new THREE.Mesh(mergeGeometries(geometries), toon(color));mesh.castShadow=true;mesh.receiveShadow=true;result.add(mesh); geometries.forEach(g => g.dispose()); }
  if (lines.length) { result.add(new THREE.LineSegments(mergeGeometries(lines), new THREE.LineBasicMaterial({ color: INK }))); lines.forEach(g => g.dispose()); }
  disposeObject(group); return result;
}
export function makeShip(id, selectedColor) {
  const group = new THREE.Group(), color = selectedColor ?? (id ? COLORS.magenta : COLORS.cyan);
  const shape = new THREE.Shape(); shape.moveTo(0,-2); shape.lineTo(1.75,1.2); shape.lineTo(.55,.85); shape.lineTo(0,1.5); shape.lineTo(-.55,.85); shape.lineTo(-1.75,1.2); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape,{depth:.22, bevelEnabled:false}); geo.rotateX(Math.PI/2);
  group.add(outlined(geo, 0xf7eed9));
  box(group,0,.15,0,.48,.3,2.3,color);
  const canopy = outlined(new THREE.SphereGeometry(.48,8,4),0x294e60); canopy.scale.set(.7,.65,1.4); canopy.position.set(0,.38,-.2); group.add(canopy);
  for (const side of [-1,1]) {
    box(group,side*.9,0,.65,.38,.38,1.6,color);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.18,1.8,6),new THREE.MeshBasicMaterial({color:0x9affed})); flame.rotation.x=Math.PI/2; flame.position.set(side*.9,0,2.1); flame.name='trail'; group.add(flame);
  }
  return group;
}
export function makeRock(seed) {
  const group = outlined(new THREE.IcosahedronGeometry(1,0),0xcb7459);
  const band = outlined(new THREE.TorusGeometry(.77,.09,4,12),0xffd476); band.rotation.x=Math.PI/2; group.add(band);
  return group;
}
export function makePickup(type) {
  const group = outlined(new THREE.OctahedronGeometry(.65),type==='rate'?COLORS.cyan:COLORS.magenta);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.95,.035,4,20),new THREE.MeshBasicMaterial({color:0xfff2ba})); group.add(ring); return group;
}
export function makeTower(b) {
  const g = new THREE.Group();
  box(g,0,b.height/2-4,0,b.width,b.height,b.depth,palette[b.id%palette.length]);
  box(g,0,b.height-3.8,0,b.width+.5,.5,b.depth+.5,0x4f6b70);
  for(let y=-1;y<b.height-5;y+=2.6) for(const x of [-1,1]) {
    box(g,x*b.width*.26,y,b.depth/2+.04,1.2,1.65,.12,0x365764);
    box(g,x*b.width*.26,y-.9,b.depth/2+.2,1.5,.16,.45,0xf3e6c8);
  }
  box(g,0,-2.8,b.depth/2+.08,1.8,2.3,.16,0x335160);
  box(g,0,-3.65,0,b.width+1,.3,b.depth+1,0xf2c35d);
  for(let i=0;i<5;i++) box(g,(i-2)*b.width/5,-3.43,b.depth/2+.6,.55,.06,.9,INK);
  return bake(g);
}
function makeBlock(index) {
  const g = new THREE.Group();
  for(const side of [-1,1]) {
    box(g,side*24,-4.05,0,16,.6,32,0xd8d6bd);
    box(g,side*16,-3.7,0,.25,.25,32,0xf5eed9);
    for(let j=0;j<3;j++) {
      const h=9+(index*7+j*11+(side+1)*3)%16, z=(j-1)*10.5, x=side*(21+(j%2)*2);
      box(g,x,h/2-3.8,z,8,h,9,palette[(index+j+(side+1))%palette.length]);
      box(g,x,h-3.6,z,8.6,.6,9.6,0x4f6b70);
      box(g,x+.6,h-2.9,z,2.4,1,2.4,0xc6cbb5);
      for(let y=-.5;y<h-5;y+=3.2) for(const off of [-2.3,0,2.3]) {
        box(g,x+off,y,z+4.55,1.25,1.9,.12,0x365764);
        box(g,x+off,y-1,z+4.75,1.6,.18,.55,0xf3e6c8);
        // Street-facing windows and balcony ledges.
        box(g,x-side*4.05,y,z+off,.12,1.9,1.25,0x365764);
      }
      box(g,x-side*4.3,-.9,z,1,3.6,2.2,0xe3c56f);
      for(let a=0;a<3;a++) box(g,x-side*4.85,-1.9+a*.9,z,.1,.25,1.25,INK);
    }
    // Street lamps, overhead service lines, trees and planters.
    box(g,side*15.2,.4,9,.18,8.6,.18,0x365764);
    box(g,side*13.9,4.5,9,2.8,.18,.18,0x365764);
    box(g,side*12.7,4.3,9,.7,.25,.6,0xf5df9d);
    box(g,side*17,-3.3,-6,2.4,1.1,2.4,0xcb947f);
    box(g,side*17,-1.7,-6,.4,3,.4,0x74695a);
    const tree=outlined(new THREE.IcosahedronGeometry(2,1),0x699d83); tree.position.set(side*17,.2,-6); g.add(tree);
  }
  if(index%3===0) {
    box(g,0,8,-10,33,.28,.28,0x365764);
    for(const x of [-7,0,7]) box(g,x,7.55,-10,1.2,.6,.2,0xe3c56f);
  }
  for(let z=-12;z<=12;z+=8) box(g,0,-4, z,.16,.035,3.5,0xf1e4bb);
  const result=bake(g);

  return result;
}
export function makeSkyline(scene) {
  const blocks=Array.from({length:12},(_,i)=>{const g=makeBlock(i);scene.add(g);return g;});
  return (time, viewZ = 0) => blocks.forEach((g,i)=>{
    const z=(((i*32+time*FLIGHT_SPEED-viewZ+64)%384+384)%384)-320+viewZ;
    g.position.set(roadCenter(time*FLIGHT_SPEED-z),0,z);
    g.rotation.y=-Math.atan((roadCenter(time*FLIGHT_SPEED-z+1)-roadCenter(time*FLIGHT_SPEED-z-1))/2);
  });
}
export function disposeObject(object) {
  object.traverse(child => { child.geometry?.dispose(); if (child.material) for (const m of Array.isArray(child.material) ? child.material : [child.material]) m.dispose(); });
  object.removeFromParent();
}
