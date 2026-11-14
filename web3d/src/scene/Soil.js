/**
 * Mặt đất trong khay: luống (ridge) và rãnh (furrow) song song chạy dọc trục X.
 *
 * `ridgeHeight` được export để Crops đặt cây đúng trên đỉnh luống và Sprinklers
 * đặt vòi đúng cao độ — một nguồn hình học duy nhất.
 */

import * as THREE from 'three';
import { SCENE } from '../config.js';
import { valueNoise } from '../utils/noise.js';
import { createSoilMaps } from '../utils/textures.js';
import { moistureColor } from '../utils/colors.js';

const DRY_COLOR = new THREE.Color('#7b5f47');
const WET_COLOR = new THREE.Color('#2d1f15');
/**
 * Cao độ đáy rãnh so với gốc khay.
 * Phải cao hơn mặt trên của thành khay (~0.33) để rãnh không bị mặt trắng của
 * khay cắt qua — đó chính là nguồn nhấp nháy trắng/nâu khi xoay camera.
 */
export const SOIL_BASE_Y = 0.4;

/** 0 = rãnh, 1 = đỉnh luống. */
export function ridgeCrest(z) {
  const { depth, ridges } = SCENE.plot;
  const u = (z + depth / 2) / depth;
  const k = u * ridges + 0.5;
  const frac = k - Math.floor(k);
  return 0.5 + 0.5 * Math.cos(frac * Math.PI * 2);
}

/** Cao độ mặt đất tại (x, z) theo toạ độ cục bộ của khay. */
export function ridgeHeight(x, z) {
  const crest = Math.pow(ridgeCrest(z), 0.62);
  const wobble = (valueNoise(x * 0.3 + 3.1, z * 0.44 + 7.7) - 0.5) * 0.06;
  return SOIL_BASE_Y + crest * SCENE.plot.ridgeHeight + wobble;
}

export function createSoil() {
  const width = SCENE.plot.width - SCENE.plot.soilInset * 2;
  const depth = SCENE.plot.depth - SCENE.plot.soilInset * 2;

  const geometry = new THREE.PlaneGeometry(width, depth, 200, 144);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    position.setY(index, ridgeHeight(x, z));

    // AO giả: rãnh tối hơn đỉnh luống.
    const ao = 0.7 + 0.3 * Math.pow(ridgeCrest(z), 0.8);
    colors[index * 3] = ao;
    colors[index * 3 + 1] = ao;
    colors[index * 3 + 2] = ao;
  }

  position.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const { map, bumpMap } = createSoilMaps();
  const material = new THREE.MeshStandardMaterial({
    map,
    bumpMap,
    bumpScale: 0.42,
    vertexColors: true,
    color: DRY_COLOR.clone(),
    roughness: 0.94,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'soil';

  // Heatmap theo KHU: texture vẽ lại mỗi khi m_i đổi (không phải fbm tĩnh).
  const heatCanvas = document.createElement('canvas');
  heatCanvas.width = 256;
  heatCanvas.height = 8;
  const heatContext = heatCanvas.getContext('2d');
  const heatTexture = new THREE.CanvasTexture(heatCanvas);
  heatTexture.colorSpace = THREE.SRGBColorSpace;
  heatTexture.needsUpdate = true;

  let heatKey = '';
  paintHeat(new Array(1).fill(0.45));

  const heatMaterial = new THREE.MeshBasicMaterial({
    map: heatTexture,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const heatmap = new THREE.Mesh(geometry, heatMaterial);
  heatmap.position.y = 0.014;
  heatmap.visible = false;
  heatmap.name = 'soil-heatmap';

  const group = new THREE.Group();
  group.add(mesh, heatmap);

  function setMoisture(moisture) {
    const t = Math.min(1, Math.max(0, (moisture - 0.12) / 0.72));
    material.color.copy(DRY_COLOR).lerp(WET_COLOR, t);
    material.roughness = 0.95 - 0.33 * t;
    material.bumpScale = 0.42 - 0.16 * t;
    material.needsUpdate = false;
  }

  function setHeatmap(visible) {
    heatmap.visible = Boolean(visible);
  }

  /**
   * Vẽ dải màu theo m_i của từng khu (trục X), chuyển màu mượt ở ranh khu.
   * `values` rỗng thì dùng một màu trung tính.
   */
  function paintHeat(values) {
    const count = Math.max(1, values.length);
    const { width: canvasWidth, height: canvasHeight } = heatCanvas;

    for (let x = 0; x < canvasWidth; x += 1) {
      const u = (x + 0.5) / canvasWidth;
      const position = u * count - 0.5;
      const left = Math.min(count - 1, Math.max(0, Math.floor(position)));
      const right = Math.min(count - 1, left + 1);
      const raw = Math.min(1, Math.max(0, position - left));
      const t = raw * raw * (3 - 2 * raw);
      const value = values[left] * (1 - t) + values[right] * t;
      heatContext.fillStyle = moistureColor(value);
      heatContext.fillRect(x, 0, 1, canvasHeight);
    }
    heatTexture.needsUpdate = true;
  }

  function setZoneHeat(values = []) {
    const key = values.map((value) => value.toFixed(4)).join('|');
    if (key === heatKey) return;
    heatKey = key;
    paintHeat(values.length ? values : new Array(1).fill(0.45));
  }

  return { group, mesh, heatmap, setMoisture, setHeatmap, setZoneHeat };
}
