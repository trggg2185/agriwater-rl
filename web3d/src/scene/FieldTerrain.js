/** Địa hình mở, hạ dần từ luống đất xuống mép cỏ. */
import * as THREE from 'three';
import { SCENE } from '../config.js';
import { hash2, valueNoise } from '../utils/noise.js';
import { SOIL_BASE_Y } from './Soil.js';

export function createFieldTerrain() {
  const { width, depth, soilInset } = SCENE.plot;
  const bedX = width / 2 - soilInset;
  const bedZ = depth / 2 - soilInset;
  const halfWidth = width / 2 + 1.9;
  const halfDepth = depth / 2 + 1.7;
  const grass = new THREE.Color('#78935b');
  const dryGrass = new THREE.Color('#a7a578');
  const dirt = new THREE.Color('#745443');
  const tint = new THREE.Color();

  function terrainPoint(u, v) {
    const angle = Math.atan2(v, u);
    const reach = Math.max(Math.abs(u), Math.abs(v));
    const edge = 1 + reach ** 3 * (0.041 * Math.sin(5 * angle + 0.7) + 0.031 * Math.cos(7 * angle));
    const x = u * halfWidth * Math.sqrt(1 - 0.25 * v * v) * edge;
    const z = -v * halfDepth * Math.sqrt(1 - 0.25 * u * u) * edge;
    const slope = THREE.MathUtils.smoothstep(reach, 0.55, 1);
    const roughness = (valueNoise(x * 1.8, z * 1.8) - 0.5) * 0.035;
    return [x, SOIL_BASE_Y - 0.055 - 0.27 * slope + roughness, z];
  }

  const groundGeometry = new THREE.PlaneGeometry(2, 2, 112, 90);
  const points = groundGeometry.attributes.position;
  const colors = new Float32Array(points.count * 3);
  for (let index = 0; index < points.count; index += 1) {
    const [x, y, z] = terrainPoint(points.getX(index), points.getY(index));
    points.setXYZ(index, x, y, z);
    const edge = Math.max(Math.abs(x) / bedX, Math.abs(z) / bedZ);
    const variation = valueNoise(x * 2.3, z * 2.3) - 0.5;
    const cover = THREE.MathUtils.smoothstep(edge + variation * 0.18, 0.98, 1.21);
    tint.copy(dirt).lerp(grass, cover).lerp(dryGrass, 0.12 + hash2(index, 31) * 0.2);
    tint.toArray(colors, index * 3);
  }
  points.needsUpdate = true;
  groundGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeometry.computeVertexNormals();

  const ground = new THREE.Mesh(
    groundGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  ground.receiveShadow = true;
  ground.name = 'open-ground';

  const bladePositions = [];
  const bladeColors = [];
  for (let index = 0; index < 480; index += 1) {
    const angle = hash2(index, 11) * Math.PI * 2;
    const reach = 0.71 + hash2(index, 12) * 0.25;
    const u = Math.cos(angle);
    const v = Math.sin(angle);
    const scale = reach / Math.max(Math.abs(u), Math.abs(v));
    const [x, y, z] = terrainPoint(u * scale, v * scale);
    if (Math.max(Math.abs(x) / bedX, Math.abs(z) / bedZ) < 1.14) continue;

    for (let blade = 0; blade < 3; blade += 1) {
      const root = x + 0.065 * (blade - 1);
      const h = 0.06 + hash2(index, 17 + blade) * 0.19;
      const bend = (hash2(index, 25 + blade) - 0.5) * 0.22;
      bladePositions.push(root - 0.026, y, z, root + 0.026, y, z, root + bend, y + h, z + 0.04);
      tint.copy(grass).lerp(dryGrass, hash2(index, 27 + blade) * 0.6).multiplyScalar(0.63);
      for (let vertex = 0; vertex < 3; vertex += 1) bladeColors.push(tint.r, tint.g, tint.b);
    }
  }
  const bladeGeometry = new THREE.BufferGeometry();
  bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bladePositions, 3));
  bladeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(bladeColors, 3));
  bladeGeometry.computeVertexNormals();
  const blades = new THREE.Mesh(
    bladeGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }),
  );

  // Mép ruộng lúa ghép từ các ô đất thấp, quanh ruộng vẫn thoáng.
  const tiles = [];
  for (let row = -5; row <= 5; row += 1) {
    const extent = Math.abs(row) === 5 ? 5 : 6;
    for (let col = -extent; col <= extent; col += 1) tiles.push({ col, row });
  }
  const paddy = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.998, 0.998),
    new THREE.MeshStandardMaterial({ roughness: 0.98 }),
    tiles.length,
  );
  const tile = new THREE.Object3D();
  tile.rotation.x = -Math.PI / 2;
  const ochre = new THREE.Color('#b99661');
  const paleClay = new THREE.Color('#dec092');
  tiles.forEach(({ col, row }, index) => {
    tile.position.set(col, SOIL_BASE_Y - 0.09 + hash2(col, row) * 0.027, row);
    tile.updateMatrix();
    paddy.setMatrixAt(index, tile.matrix);
    paddy.setColorAt(index, tint.copy(ochre).lerp(paleClay, hash2(col + 20, row)));
  });
  paddy.receiveShadow = true;
  paddy.name = 'paddy-clay';
  paddy.visible = false;

  const group = new THREE.Group();
  group.name = 'field-terrain';
  group.add(ground, blades, paddy);
  return {
    group,
    setCrop(crop) {
      const rice = crop === 1;
      paddy.visible = rice;
      ground.visible = blades.visible = !rice;
    },
  };
}
