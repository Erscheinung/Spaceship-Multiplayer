import * as THREE from 'three';

// The source is one authored 4x4 albedo sheet. Each mip is rebuilt tile by tile
// with a wrapped gutter, so a distant roof cannot sample its neighbour's wall.
export const MATERIAL_ATLAS_URL = '/textures/afterlight-materials.webp';
export const MATERIAL_ATLAS_SIZE = 1024;
export const MATERIAL_TILE_SIZE = 256;
export const MATERIAL = Object.freeze({
  ivory: 10, rose: 11, sageBoards: 12, indigoBoards: 13,
  terracottaBrick: 14, limestone: 15, tealTile: 16, coralTile: 17,
  copper: 18, slate: 19, terracottaRoof: 20, wood: 21,
  basalt: 22, encaustic: 23, stripedCanvas: 24, floralCanvas: 25
});

function paddedMip(source, cellSize) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = cellSize * 4;
  const c = canvas.getContext('2d');
  const sourceCellX = source.width / 4, sourceCellY = source.height / 4;
  const pad = cellSize >= 4 ? Math.max(1, cellSize / 32) : 0;
  const inner = cellSize - pad * 2;
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const x = col * cellSize, y = row * cellSize;
    c.drawImage(source, col * sourceCellX, row * sourceCellY, sourceCellX, sourceCellY, x + pad, y + pad, inner, inner);
    if (!pad) continue;
    // Wrap opposite edges rather than duplicating the edge texel. This also
    // gives bilinear filtering a continuous seam at each metric repeat.
    c.drawImage(canvas, x + inner, y + pad, pad, inner, x, y + pad, pad, inner);
    c.drawImage(canvas, x + pad, y + pad, pad, inner, x + pad + inner, y + pad, pad, inner);
    c.drawImage(canvas, x, y + inner, cellSize, pad, x, y, cellSize, pad);
    c.drawImage(canvas, x, y + pad, cellSize, pad, x, y + pad + inner, cellSize, pad);
  }
  return canvas;
}

export function prepareMaterialAtlas(source) {
  const levels = [];
  for (let cell = MATERIAL_TILE_SIZE; cell >= 1; cell /= 2) levels.push(paddedMip(source, cell));
  // Complete the WebGL mip chain. The sampler deliberately caps its footprint
  // at level 6, before these tiny levels can mix separate material cells.
  for (const size of [2, 1]) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    canvas.getContext('2d').drawImage(levels.at(-1), 0, 0, size, size); levels.push(canvas);
  }
  const texture = new THREE.CanvasTexture(levels[0]);
  texture.mipmaps = levels; texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// A white fallback keeps asynchronous loading from darkening materials.
export function emptyMaterialAtlas() {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.needsUpdate = true; return texture;
}
