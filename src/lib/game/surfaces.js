import * as THREE from 'three';
import { emptyMaterialAtlas } from './materialAtlas.js';

// Shared values, never shared disposable materials. Updates do not recompile.
export const surfaceLight = { night: { value: 0 }, atlas: { value: null }, materials: { value: emptyMaterialAtlas() } };
export const SURFACE = { plaster: 0, brick: 1, timber: 2, paving: 3, roof: 4, fabric: 5, window: 6, lamp: 7, metal: 8, sign: 9 };

// Physical face coordinates survive baking, banking and district recycling.
export function prepareSurfaceGeometry(geometry, kind = 0, seed = 0) {
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  const uv = new Float32Array(p.count * 2), data = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = Math.abs(n.getX(i)), y = Math.abs(n.getY(i)), z = Math.abs(n.getZ(i));
    uv[i * 2] = x > y && x > z ? p.getZ(i) : p.getX(i);
    uv[i * 2 + 1] = y > x && y > z ? p.getZ(i) : p.getY(i);
    if (kind === SURFACE.sign) {
      uv[i * 2] = geometry.attributes.uv.getX(i);
      uv[i * 2 + 1] = geometry.attributes.uv.getY(i);
    }
    data[i * 2] = kind; data[i * 2 + 1] = seed;
  }
  geometry.setAttribute('surfaceUv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('surfaceData', new THREE.BufferAttribute(data, 2));
  return geometry;
}

// Deliberate painted finishes in atlas order. Convert once to linear RGB so
// the shader and vertex tints share Three's colour space. The source artwork
// contributes construction detail, not its former earth-coloured albedo.
const finishColors = [0xe1e8db, 0xdba4b5, 0x76aaa1, 0x4e6688,
  0xb8768c, 0xc4d2c7, 0x479b9c, 0xd692ad,
  0x508d91, 0x515c7b, 0xb77994, 0x748b92,
  0xa1b6b5, 0x8eaeaa, 0x89c1c4, 0xb9b2ce];
const finishGLSL = finishColors.map((hex, i) => {
  const c = new THREE.Color(hex);
  return `${i ? 'else ' : ''}if(tile<${(i + .5).toFixed(1)}) finish=vec3(${c.toArray().map(n => n.toFixed(5)).join(',')});`;
}).join('\n');
const functions = /* glsl */`
uniform float cityNight;
uniform sampler2D cityAtlas;
uniform sampler2D cityMaterials;
varying vec2 vSurfaceUv;
varying vec2 vSurfaceData;
// Metric UVs repeat inside one atlas cell. Derivatives are taken before
// fract(), avoiding spurious coarse mips at repeat boundaries. Padded mips
// and a footprint-dependent inset keep all filtering inside the chosen tile.
vec3 paintedMaterial(float tile, vec2 metric, float span) {
  vec2 p=metric/span;
  vec2 dx=dFdx(p), dy=dFdy(p);
  float footprint=max(length(dx),length(dy))*240.0;
  float lod=clamp(log2(max(footprint,1.0)),0.0,6.0);
  float margin=max(.03125,exp2(lod)/256.0);
  float usable=1.0-2.0*margin;
  vec2 cell=vec2(mod(tile,4.0),3.0-floor(tile/4.0));
  vec2 uv=(cell+margin+fract(p)*usable)*.25;
  dx*=usable*.25;dy*=usable*.25;
  // A 45.25px maximum footprint means LOD<=5.5 at 1024px. Trilinear
  // filtering may therefore reach mip6 but never the unisolated mip7.
  float limit=max(max(length(dx),length(dy))/.04419417,1.0);
  return textureGrad(cityMaterials,uv,dx/limit,dy/limit).rgb;
}
`;

export function surfaceMaterial(color, kind = SURFACE.plaster, { baked = false, world = false } = {}) {
  const material = new THREE.MeshToonMaterial({ color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  material.userData.surface = kind;
  material.onBeforeCompile = shader => {
    shader.uniforms.cityNight = surfaceLight.night;
    shader.uniforms.cityAtlas = surfaceLight.atlas;
    shader.uniforms.cityMaterials = surfaceLight.materials;
    shader.uniforms.surfaceKind = { value: kind };
    const vertexHeader = `varying vec2 vSurfaceUv; varying vec2 vSurfaceData;\n${baked ? 'attribute vec2 surfaceUv; attribute vec2 surfaceData;' : 'uniform float surfaceKind;'}`;
    shader.vertexShader = vertexHeader + '\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      ${baked ? 'vSurfaceUv=surfaceUv; vSurfaceData=surfaceData;' : `
      vec3 metric=position;
      #ifdef USE_INSTANCING
        metric*=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      #endif
      ${world ? 'metric=(modelMatrix*vec4(position,1.0)).xyz;' : ''}
      vec3 face=abs(normal);
      vSurfaceUv=${world ? 'metric.xz' : 'face.y>face.x && face.y>face.z ? metric.xz : (face.x>face.z ? metric.zy : metric.xy)'};
      vSurfaceData=vec2(surfaceKind,0.37);
      #ifdef USE_INSTANCING
        vSurfaceData.y=fract(instanceMatrix[3].x*.013+instanceMatrix[3].z*.017);
      #endif`}
    `);
    shader.fragmentShader = functions + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 q=vSurfaceUv; float kind=vSurfaceData.x; float seed=vSurfaceData.y;

      if(kind<5.5 || kind>9.5) {
        float tile=kind>9.5?kind-10.0:(kind<.5?0.0:(kind<1.5?4.0:(kind<2.5?11.0:(kind<3.5?12.0:(kind<4.5?9.0:14.0)))));
        float span=tile<2.0?5.5:(tile<4.0?3.8:(tile<6.0?3.0:(tile<8.0?2.7:(tile<11.0?3.6:(tile<12.0?3.0:3.8)))));
        // Keep ceramic joints, board rhythm and roof courses, but compress
        // their value range. Broad plaster and paving are almost flat paint.
        vec3 art=paintedMaterial(tile,q,span);
        float value=dot(art,vec3(.2126,.7152,.0722));
        float detail=tile<2.0?.075:(tile<4.0?.20:(tile<6.0?.22:(tile<8.0?.34:(tile<11.0?.28:(tile<13.0?.12:.36)))));
        float relief=mix(1.0,clamp(value*2.2,.55,1.2),detail);
        vec3 finish=vec3(1.0);
        ${finishGLSL}
        // Explicit atlas finishes own the colour; generic painted objects
        // keep their authored vertex palette without a second dark tint.
        diffuseColor.rgb*=kind>9.5?finish*relief:vec3(relief);

      } else if(kind<6.5) {
        // Quiet reflected sky, with a broad value change rather than stripes.
        float reflection=smoothstep(-1.0,1.0,sin(q.x*.28+q.y*.7));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.24,.46,.52),reflection*.2);
      } else if(kind>8.5) {
        vec2 atlasUv=vec2(q.x,1.0-(floor(seed*8.0)+1.0-q.y)/8.0);
        diffuseColor.rgb*=texture2D(cityAtlas,atlasUv).rgb;
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if(vSurfaceData.x>5.5 && vSurfaceData.x<7.5) {
        float lamp=step(6.5,vSurfaceData.x);
        float occupancy=fract(vSurfaceData.y*13.71);
        float occupied=step(.53,occupancy);
        float glow=mix(occupied,1.0,lamp)*cityNight;
        vec3 warm=mix(vec3(1.0,.52,.28),vec3(.28,.8,.85),step(.83,occupancy));
        // Small fixtures carry coral/cyan/violet; occupied rooms stay warm.
        vec3 neon=occupancy<.34?vec3(1.0,.21,.40):(occupancy<.68?vec3(.16,.85,.91):vec3(.57,.35,1.0));
        warm=mix(warm,neon,lamp*.82);
        // Large windows remain tinted rooms rather than white light cards.
        // A quiet vertical falloff suggests depth; only small lamps bloom.
        float room=.64+.2*sin(vSurfaceUv.y*.65+vSurfaceData.y*5.0);
        totalEmissiveRadiance+=warm*glow*mix(.48*room,1.65,lamp);
      } else if(vSurfaceData.x>8.5 && vSurfaceData.x<9.5) {
        // Only the light lettering/pictograms emit, not a glowing wall card.
        float lettering=smoothstep(.28,.64,max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b)));
        totalEmissiveRadiance+=diffuseColor.rgb*lettering*(.16+cityNight*.72);
      }
    `);
  };
  material.customProgramCacheKey = () => `afterlight-surfaces-v5-${baked}-${world}`;
  return material;
}
