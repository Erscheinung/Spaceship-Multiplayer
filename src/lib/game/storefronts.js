import * as THREE from 'three';
import { surfaceLight } from './surfaces.js';
import { MATERIAL_ATLAS_URL, prepareMaterialAtlas, emptyMaterialAtlas } from './materialAtlas.js';

// An original, deliberately art-directed town identity, packed into one atlas.
// This is shared GPU artwork with scene-level ownership, not per-shop textures.
const shops = [
  ['AFTERLIGHT POST', 'LATE PARCELS / SAFE ARRIVALS', '#385766', '#f2c779', 'post'],
  ['COMET COFFEE', 'ONE MORE CUP BEFORE ORBIT', '#824d3f', '#f4d8ab', 'cup'],
  ['NIGHTJAR RADIO', 'YOUR LOCAL SIGNAL / 88.4', '#334b66', '#dfb7a8', 'radio'],
  ['MOSS & MOON', 'ROOFTOP GARDEN SUPPLIES', '#455d4a', '#d5dda5', 'leaf'],
  ['RING ROAD REPAIRS', 'SMALL SHIPS / LONG JOURNEYS', '#ab7048', '#fff0ce', 'gear'],
  ['BLUE HOUR BOOKS', 'STORIES FOR THE WAY HOME', '#4d526f', '#e8d8ae', 'book'],
  ['LUNAR NOODLE CLUB', 'HOT SOUP / COLD SPACE', '#7c4750', '#f3c687', 'cup'],
  ['THE STARLING HOTEL', 'A LIGHT LEFT ON FOR YOU', '#3b676b', '#f1d5a1', 'post']
];
let owners = 0, materialLoad = 0;
let materialReady = Promise.resolve(false);
export const waitForMaterialAtlas = () => materialReady;
function loadMaterialArtwork() {
  const generation = ++materialLoad;
  materialReady = new Promise(resolve => {
    new THREE.ImageLoader().load(MATERIAL_ATLAS_URL, source => {
      if (generation !== materialLoad || owners === 0) { resolve(false); return; }
      const texture = prepareMaterialAtlas(source);
      surfaceLight.materials.value.dispose(); surfaceLight.materials.value = texture;
      resolve(true);
    }, undefined, () => resolve(false));
  });
}
export function acquireStorefrontAtlas() {
  if (!surfaceLight.atlas.value) {
    const canvas=document.createElement('canvas'); canvas.width=512;canvas.height=512;
    const c=canvas.getContext('2d');
    shops.forEach(([name,caption,background,ink,motif],i)=>{
      const y=i*64;
      c.fillStyle=background;c.fillRect(0,y,512,64);
      c.strokeStyle=ink;c.fillStyle=ink;c.lineWidth=1;
      c.strokeRect(5,y+5,502,54); c.beginPath();c.moveTo(76,y+12);c.lineTo(76,y+52);c.stroke();
      c.save();c.translate(40,y+32);c.lineWidth=2.2;
      // Small hand-composed pictograms, with the same visual grammar as posters.
      if(motif==='post'){
        c.strokeRect(-18,-12,36,24);c.beginPath();c.moveTo(-18,-12);c.lineTo(0,2);c.lineTo(18,-12);c.stroke();
        c.beginPath();c.moveTo(-23,14);c.lineTo(-8,14);c.stroke();
      } else if(motif==='cup'){
        c.beginPath();c.moveTo(-14,-6);c.lineTo(-10,13);c.lineTo(10,13);c.lineTo(14,-6);c.closePath();c.stroke();
        c.beginPath();c.arc(15,2,7,-Math.PI/2,Math.PI/2);c.stroke();
        for(const x of [-6,3]){c.beginPath();c.moveTo(x,-12);c.quadraticCurveTo(x-5,-18,x+2,-21);c.stroke();}
      } else if(motif==='radio'){
        for(const r of [7,14,22]){c.beginPath();c.arc(0,3,r,Math.PI*1.15,Math.PI*1.85);c.stroke();}
        c.beginPath();c.moveTo(0,-2);c.lineTo(-7,16);c.lineTo(7,16);c.closePath();c.stroke();
      } else if(motif==='leaf'){
        c.beginPath();c.moveTo(-16,14);c.quadraticCurveTo(-20,-16,17,-18);c.quadraticCurveTo(21,12,-16,14);c.moveTo(-16,14);c.lineTo(11,-12);c.stroke();
      } else if(motif==='book'){
        c.beginPath();c.moveTo(0,-12);c.quadraticCurveTo(-10,-19,-20,-12);c.lineTo(-20,16);c.quadraticCurveTo(-10,9,0,16);c.quadraticCurveTo(10,9,20,16);c.lineTo(20,-12);c.quadraticCurveTo(10,-19,0,-12);c.lineTo(0,16);c.stroke();
      } else {
        c.beginPath();c.arc(0,0,15,0,Math.PI*2);c.stroke();
        for(let n=0;n<8;n++){const a=n*Math.PI/4;c.beginPath();c.moveTo(Math.cos(a)*16,Math.sin(a)*16);c.lineTo(Math.cos(a)*22,Math.sin(a)*22);c.stroke();}
        c.beginPath();c.moveTo(-8,8);c.lineTo(9,-9);c.stroke();
      }
      c.restore();
      c.textAlign='center';c.font='bold 24px Georgia, serif';c.fillText(name,292,y+30,409);
      c.font='9px sans-serif';c.fillText(caption,292,y+47,405);
      // Fine pinstripes and ink wear are fixed artwork, never animated noise.
      c.globalAlpha=.12;c.fillStyle=ink;
      for(let x=13;x<500;x+=17)c.fillRect(x,y+58,7,1);
      c.globalAlpha=1;
    });
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=2;surfaceLight.atlas.value=texture;
  }
  if (owners++ === 0) loadMaterialArtwork();
  let released=false;
  return ()=>{
    if(released)return;released=true;
    if(--owners===0){surfaceLight.atlas.value.dispose();surfaceLight.atlas.value=null;
      materialLoad++; surfaceLight.materials.value.dispose(); surfaceLight.materials.value=emptyMaterialAtlas();}
  };
}
