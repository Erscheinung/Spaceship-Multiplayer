import * as THREE from 'three';

// Shared values, never shared disposable materials. Updates do not recompile.
export const surfaceLight = { night: { value: 0 }, atlas: { value: null } };
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

const functions = /* glsl */`
uniform float cityNight;
uniform sampler2D cityAtlas;
varying vec2 vSurfaceUv;
varying vec2 vSurfaceData;
float surfaceHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float surfaceNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(surfaceHash(i),surfaceHash(i+vec2(1,0)),f.x),mix(surfaceHash(i+vec2(0,1)),surfaceHash(i+vec2(1,1)),f.x),f.y);
}
float joint(vec2 p, vec2 width) {
  vec2 edge=min(fract(p),1.0-fract(p));
  vec2 aa=max(fwidth(p),vec2(.001));
  vec2 line=1.0-smoothstep(width-aa,width+aa,edge);
  return max(line.x,line.y);
}
`;

export function surfaceMaterial(color, kind = SURFACE.plaster, { baked = false, world = false } = {}) {
  const material = new THREE.MeshToonMaterial({ color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  material.userData.surface = kind;
  material.onBeforeCompile = shader => {
    shader.uniforms.cityNight = surfaceLight.night;
    shader.uniforms.cityAtlas = surfaceLight.atlas;
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

      float detailFade=1.0-smoothstep(.025,.13,max(fwidth(q.x),fwidth(q.y)));
      float surfaceValue=1.0;
      if(kind<.5) {
        // One broad, vertically stretched limewash field; no pixel grain or
        // second noise evaluation across the city's large plaster surfaces.
        float wash=surfaceNoise(q*vec2(.48,.19)+seed*17.0);
        surfaceValue=.87+wash*.23;
      } else if(kind<1.5) {
        vec2 brick=q/vec2(1.05,.42); brick.x+=mod(floor(brick.y),2.0)*.5;
        float mortar=joint(brick,vec2(.025,.045));
        float variation=mix(.5,surfaceHash(floor(brick)+seed),detailFade);
        diffuseColor.rgb=mix(diffuseColor.rgb*(.76+variation*.35),vec3(.43,.39,.32),mortar*.62);
        surfaceValue=.97+surfaceHash(floor(q*7.0))*.06*detailFade;
      } else if(kind<2.5) {
        float grain=sin(q.y*14.0+surfaceNoise(q*vec2(3.0,.3))*5.0);
        surfaceValue=.88+grain*.055*detailFade;
        surfaceValue*=1.0-joint(q*vec2(2.0,.12),vec2(.025,.008))*.24;
      } else if(kind<3.5) {
        vec2 tile=q/vec2(1.4,.85);
        tile.x+=mod(floor(tile.y),2.0)*.5;
        surfaceValue=.96+(surfaceHash(floor(tile)+seed)-.5)*.16*detailFade;
        surfaceValue*=1.0-joint(tile,vec2(.018,.025))*.22;
      } else if(kind<4.5) {
        // Overlapping roof courses, distinct from pavement grout. Analytic
        // lips suggest construction depth without bump-map texture fetches.
        vec2 tile=q/vec2(.72,.58);
        tile.x+=mod(floor(tile.y),2.0)*.5;
        vec2 local=fract(tile), aa=max(fwidth(tile),vec2(.001));
        float courseShadow=1.0-smoothstep(.04-aa.y,.19+aa.y,local.y);
        float lip=smoothstep(.83-aa.y,.9+aa.y,local.y)*(1.0-smoothstep(.96-aa.y,1.0+aa.y,local.y));
        float seam=1.0-smoothstep(.018-aa.x,.04+aa.x,min(local.x,1.0-local.x));
        float tone=surfaceHash(floor(tile)+seed*17.0)-.5;
        surfaceValue=.97+detailFade*(tone*.13-courseShadow*.23-seam*.12+lip*.09);
      } else if(kind<5.5) {
        float stripe=sin(q.x*9.0);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.87,.8,.63),mix(.5,smoothstep(-.1,.1,stripe),detailFade)*.8);
        surfaceValue=.97;
      } else if(kind<6.5) {
        float glass=sin(q.x*2.5+q.y*1.1);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.32,.55,.62),smoothstep(.65,.8,glass)*.24);
      } else if(kind>8.5) {
        vec2 atlasUv=vec2(q.x,1.0-(floor(seed*8.0)+1.0-q.y)/8.0);
        diffuseColor.rgb*=texture2D(cityAtlas,atlasUv).rgb;
      } else if(kind>7.5) {
        surfaceValue=1.0;
        surfaceValue*=1.0-joint(q*vec2(1.8,.45),vec2(.009,.009))*.1;
      }
      diffuseColor.rgb*=surfaceValue;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if(vSurfaceData.x>5.5 && vSurfaceData.x<7.5) {
        float lamp=step(6.5,vSurfaceData.x);
        float occupied=step(.28,fract(vSurfaceData.y*13.71));
        float glow=mix(occupied,lamp,lamp)*cityNight;
        vec3 warm=mix(vec3(1.0,.45,.13),vec3(1.0,.72,.32),vSurfaceData.y);
        totalEmissiveRadiance+=warm*glow*mix(2.2,3.0,lamp);
      }
    `);
  };
  material.customProgramCacheKey = () => `afterlight-surfaces-v3-${baked}-${world}`;
  return material;
}
