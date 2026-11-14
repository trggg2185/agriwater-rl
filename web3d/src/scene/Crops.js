/**
 * Cây trồng thủ tục: ngô (thân đốt + lá dài rũ + cờ + bắp) và lúa (bụi chồi +
 * lá hẹp + bông). Toàn bộ hình học sinh bằng code, nhân bản bằng InstancedMesh.
 *
 * Giai đoạn sinh trưởng, độ ẩm, hành động và thời tiết đều đọc từ store thông
 * qua `update(dt, state)` do SceneManager gọi — component không tự đọc store.
 */

import * as THREE from 'three';
import { SCENE } from '../config.js';
import { ridgeHeight } from './Soil.js';

const STEM_COLOR = new THREE.Color('#6d9a44');
const LEAF_BASE = new THREE.Color('#4d7d31');
const LEAF_MID = new THREE.Color('#6aa347');
const LEAF_TIP = new THREE.Color('#9cc35c');
const TASSEL_COLOR = new THREE.Color('#cbb46a');
const EAR_COLOR = new THREE.Color('#d9c66d');
const HUSK_COLOR = new THREE.Color('#7fa348');
const SILK_COLOR = new THREE.Color('#b06a4a');
const RICE_STEM = new THREE.Color('#6f9445');
const RICE_LEAF = new THREE.Color('#7fae52');
const PANICLE = new THREE.Color('#c9b46b');

const PLANT_HEIGHT = 0.95;
const ROWS = SCENE.plot.ridges;
/** Khoảng cách mỗi cây dọc luống (đơn vị cảnh) — số cây suy ra từ bề rộng thửa. */
const PLANT_SPACING = 0.56;
const CORN_VARIANTS = 4;
const RICE_VARIANTS = 3;

/** Bán kính vòng đất trống quanh gốc đầu phun (một cây bị thay thế). */
const HEAD_CLEARANCE = 0.42;

/** RNG nhỏ, tất định theo biến thể. */
function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bộ gom hình học: mọi bộ phận đổ chung vào một BufferGeometry. */
function createBuilder() {
  const positions = [];
  const colors = [];
  const births = [];
  const heights = [];
  const indices = [];

  function vertex(x, y, z, color, birth, heightAt) {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
    births.push(birth);
    heights.push(heightAt);
    return positions.length / 3 - 1;
  }

  function quad(a, b, c, d) {
    indices.push(a, b, c, a, c, d);
  }

  function build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aBirth', new THREE.Float32BufferAttribute(births, 1));
    geometry.setAttribute('aHeight', new THREE.Float32BufferAttribute(heights, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  return { vertex, quad, build };
}

/** Chia màu lá theo chiều dài: gốc đậm → thân → đầu sáng. */
function leafColor(t, target) {
  if (t < 0.55) return target.copy(LEAF_BASE).lerp(LEAF_MID, t / 0.55);
  return target.copy(LEAF_MID).lerp(LEAF_TIP, (t - 0.55) / 0.45);
}

/** Thêm một lá ribbon: 3 cột đỉnh/đoạn (trái, gân giữa nổi, phải). */
function addLeaf(builder, options) {
  const {
    azimuth,
    attachY,
    length,
    width,
    startAngle,
    droop,
    birth,
    plantHeight,
    segments = 10,
    twist = 0.35,
    colorScale = 1,
  } = options;

  const cosA = Math.cos(azimuth);
  const sinA = Math.sin(azimuth);
  const lateralX = -sinA;
  const lateralZ = cosA;
  const rows = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const radial = Math.cos(startAngle) * length * t;
    const lift = Math.sin(startAngle) * length * t - droop * length * t * t;
    const cx = cosA * radial;
    const cz = sinA * radial;
    const cy = attachY + lift;

    const halfWidth = Math.max(
      0.004,
      width * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.82),
    );
    const twistAngle = twist * t;
    const lx = lateralX * Math.cos(twistAngle);
    const lz = lateralZ * Math.cos(twistAngle);
    const ly = Math.sin(twistAngle) * halfWidth;

    const color = leafColor(t, new THREE.Color()).multiplyScalar(colorScale);
    const heightAt = Math.min(1, Math.max(0, (cy / plantHeight) * 0.92));

    const left = builder.vertex(
      cx + lx * halfWidth,
      cy + ly,
      cz + lz * halfWidth,
      color,
      birth,
      heightAt,
    );
    const mid = builder.vertex(cx, cy + halfWidth * 0.34, cz, color, birth, heightAt);
    const right = builder.vertex(
      cx - lx * halfWidth,
      cy - ly,
      cz - lz * halfWidth,
      color,
      birth,
      heightAt,
    );
    rows.push([left, mid, right]);
  }

  for (let i = 0; i < segments; i += 1) {
    const [l0, m0, r0] = rows[i];
    const [l1, m1, r1] = rows[i + 1];
    builder.quad(l0, m0, m1, l1);
    builder.quad(m0, r0, r1, m1);
  }
}

/** Thân: trụ thon nhiều đốt, hơi cong. */
function addStem(builder, { height, radius, birth, color, lean = 0.05 }) {
  const rings = 9;
  const sides = 6;
  const rows = [];

  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings;
    const y = height * t;
    const r = radius * (1 - 0.62 * t) * (i % 2 === 0 ? 1 : 0.92);
    const bend = lean * height * t * t;
    const ring = [];
    for (let s = 0; s < sides; s += 1) {
      const angle = (s / sides) * Math.PI * 2;
      ring.push(
        builder.vertex(
          Math.cos(angle) * r + bend,
          y,
          Math.sin(angle) * r,
          color,
          birth,
          t,
        ),
      );
    }
    rows.push(ring);
  }

  for (let i = 0; i < rings; i += 1) {
    for (let s = 0; s < sides; s += 1) {
      const next = (s + 1) % sides;
      builder.quad(rows[i][s], rows[i][next], rows[i + 1][next], rows[i + 1][s]);
    }
  }
}

/** Cờ (tassel): vài nhánh mảnh toả ra ở ngọn. */
function addTassel(builder, { baseY, height, birth, plantHeight, branches = 7 }) {
  const random = mulberry32(Math.round(baseY * 1000));
  for (let b = 0; b < branches; b += 1) {
    const angle = (b / branches) * Math.PI * 2 + random() * 0.5;
    const spread = 0.1 + random() * 0.13;
    const length = height * (0.16 + random() * 0.12);
    const width = 0.012;

    const ax = Math.cos(angle);
    const az = Math.sin(angle);
    const segments = 3;
    const rows = [];

    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const x = ax * spread * t * length * 6;
      const z = az * spread * t * length * 6;
      const y = baseY + length * t;
      const w = width * (1 - t * 0.75);
      const lx = -az * w;
      const lz = ax * w;
      const color = TASSEL_COLOR.clone();
      const h = Math.min(1, Math.max(0, (y / plantHeight) * 0.98));
      const left = builder.vertex(x + lx, y, z + lz, color, birth, h);
      const right = builder.vertex(x - lx, y, z - lz, color, birth, h);
      rows.push([left, right]);
    }

    for (let i = 0; i < segments; i += 1) {
      builder.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
    }
  }
}

/** Bắp: ellipsoid thấp phân giải + 2 lá áo + râu. */
function addEar(builder, { attachY, azimuth, birth, plantHeight, scale = 1 }) {
  const cosA = Math.cos(azimuth);
  const sinA = Math.sin(azimuth);
  const offset = 0.07;
  const cx = cosA * offset;
  const cz = sinA * offset;

  const rings = 5;
  const sides = 7;
  const earHeight = 0.3 * scale;
  const earRadius = 0.058 * scale;
  const rows = [];

  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings;
    const y = attachY + earHeight * t;
    const bulge = Math.sin(Math.PI * (0.15 + t * 0.72));
    const r = earRadius * bulge;
    const ring = [];
    for (let s = 0; s < sides; s += 1) {
      const angle = (s / sides) * Math.PI * 2;
      ring.push(
        builder.vertex(
          cx + Math.cos(angle) * r,
          y,
          cz + Math.sin(angle) * r,
          EAR_COLOR,
          birth,
          Math.min(1, y / plantHeight),
        ),
      );
    }
    rows.push(ring);
  }

  for (let i = 0; i < rings; i += 1) {
    for (let s = 0; s < sides; s += 1) {
      const next = (s + 1) % sides;
      builder.quad(rows[i][s], rows[i][next], rows[i + 1][next], rows[i + 1][s]);
    }
  }

  // Lá áo bọc bắp
  addLeaf(builder, {
    azimuth,
    attachY: attachY - 0.02,
    length: earHeight * 1.05,
    width: 0.05 * scale,
    startAngle: 1.15,
    droop: 0.32,
    birth,
    plantHeight,
    segments: 5,
    colorScale: 1,
  });

  // Râu bắp
  for (let i = 0; i < 3; i += 1) {
    const angle = azimuth + (i - 1) * 0.25;
    const length = 0.14 * scale;
    const startY = attachY + earHeight;
    const x0 = cx + Math.cos(angle) * 0.01;
    const z0 = cz + Math.sin(angle) * 0.01;
    const x1 = x0 + Math.cos(angle) * 0.03;
    const z1 = z0 + Math.sin(angle) * 0.03;
    const a = builder.vertex(x0, startY, z0, SILK_COLOR, 3, Math.min(1, startY / plantHeight));
    const b = builder.vertex(
      x1,
      startY + length,
      z1,
      SILK_COLOR,
      3,
      Math.min(1, (startY + length) / plantHeight),
    );
    const c = builder.vertex(
      x1 + 0.012,
      startY + length,
      z1 + 0.012,
      SILK_COLOR,
      3,
      Math.min(1, (startY + length) / plantHeight),
    );
    builder.quad(a, b, c, b);
  }
}

/** Một cây ngô hoàn chỉnh (mọi bộ phận, hiện dần theo giai đoạn). */
function buildCorn(variant) {
  const random = mulberry32(4200 + variant * 137);
  const builder = createBuilder();
  const height = PLANT_HEIGHT * (0.92 + random() * 0.14);
  const leafCount = 10 + Math.floor(random() * 3);

  addStem(builder, {
    height,
    radius: 0.034,
    birth: 0,
    color: STEM_COLOR,
    lean: -0.05 + random() * 0.1,
  });

  for (let i = 0; i < leafCount; i += 1) {
    const t = i / (leafCount - 1);
    const attachY = height * (0.1 + 0.86 * t);
    const lower = 1 - t;
    const azimuth = i * 2.399 + variant * 0.7;

    addLeaf(builder, {
      azimuth,
      attachY,
      length: height * (0.74 - 0.18 * t) * (0.9 + random() * 0.2),
      width: 0.05 * (1 - 0.3 * t),
      startAngle: 1.26 - 0.44 * lower,
      droop: 0.36 + 0.78 * lower,
      birth: i < 3 ? 0 : i < 8 ? 1 : 2,
      plantHeight: height,
      segments: 8,
      twist: 0.25 + random() * 0.35,
    });
  }

  addTassel(builder, {
    baseY: height * 0.985,
    height,
    birth: 2,
    plantHeight: height,
    branches: 6 + Math.floor(random() * 3),
  });

  addEar(builder, {
    attachY: height * (0.5 + random() * 0.08),
    azimuth: variant * 1.7,
    birth: 2,
    plantHeight: height,
    scale: 0.9 + random() * 0.25,
  });

  return builder.build();
}

/** Một bụi lúa: vài chồi thân mảnh + lá hẹp + bông. */
function buildRice(variant) {
  const random = mulberry32(9100 + variant * 91);
  const builder = createBuilder();
  const tillers = 5 + Math.floor(random() * 3);
  const height = 1.25 * (0.94 + random() * 0.12);

  for (let i = 0; i < tillers; i += 1) {
    const angle = (i / tillers) * Math.PI * 2 + random() * 0.4;
    const spread = 0.045;
    const baseX = Math.cos(angle) * spread;
    const baseZ = Math.sin(angle) * spread;
    const stemHeight = height * (0.85 + random() * 0.3);

    for (let k = 0; k < 4; k += 1) {
      const attachY = stemHeight * (0.25 + k * 0.2);
      addLeaf(builder, {
        azimuth: angle + k * 1.9,
        attachY,
        length: height * (0.52 - k * 0.06),
        width: 0.032,
        startAngle: 1.2 - k * 0.12,
        droop: 0.55 + k * 0.12,
        birth: k < 2 ? 0 : k < 3 ? 1 : 2,
        plantHeight: height,
        segments: 7,
        twist: 0.2,
        colorScale: 1.02,
      });
    }

    // Thân mảnh
    const stemTop = stemHeight;
    const a = builder.vertex(baseX, 0, baseZ, RICE_STEM, 0, 0);
    const b = builder.vertex(baseX + 0.008, stemTop, baseZ, RICE_STEM, 0, stemTop / height);
    const c = builder.vertex(baseX - 0.008, stemTop, baseZ, RICE_STEM, 0, stemTop / height);
    const d = builder.vertex(baseX, 0, baseZ, RICE_STEM, 0, 0);
    builder.quad(a, b, c, d);

    // Bông lúa
    const panicleLength = 0.24;
    const p0 = builder.vertex(baseX, stemTop, baseZ, PANICLE, 2, 0.95);
    const p1 = builder.vertex(baseX + 0.05, stemTop + panicleLength, baseZ, PANICLE, 2, 1);
    const p2 = builder.vertex(baseX - 0.05, stemTop + panicleLength * 0.96, baseZ, PANICLE, 2, 1);
    const p3 = builder.vertex(baseX, stemTop + panicleLength * 0.5, baseZ, PANICLE, 2, 0.97);
    builder.quad(p0, p1, p3, p2);
  }

  return builder.build();
}

/** Vật liệu dùng chung: gió, giai đoạn, khô hạn, stress. */
function createCropMaterial(uniforms) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.66,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uStage = uniforms.uStage;
    shader.uniforms.uHeight = uniforms.uHeight;
    shader.uniforms.uDry = uniforms.uDry;
    shader.uniforms.uStress = uniforms.uStress;
    shader.uniforms.uWind = uniforms.uWind;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aBirth;
        attribute float aHeight;
        uniform float uTime;
        uniform float uStage;
        uniform float uHeight;
        uniform float uDry;
        uniform float uStress;
        uniform float uWind;`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
        float grow = clamp((uStage - aBirth) * 2.2 + 0.55, 0.0, 1.0);
        transformed.xz *= grow;
        transformed.y *= uHeight;

        #ifdef USE_INSTANCING
          vec3 instancePos = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
        #else
          vec3 instancePos = vec3( 0.0 );
        #endif

        float weight = pow( clamp( aHeight, 0.0, 1.0 ), 2.0 );
        float sway = sin( uTime * 1.55 + instancePos.x * 0.55 + instancePos.z * 0.42 ) * 0.65
                   + sin( uTime * 2.6 + instancePos.z * 0.85 + instancePos.x * 0.2 ) * 0.35;
        transformed.x += sway * uWind * weight * 0.19;
        transformed.z += sway * uWind * weight * 0.13;
        transformed.y -= uStress * weight * 0.16 * (1.0 - aHeight * 0.4);`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        float dryMask = smoothstep( 0.66, 0.16, aHeight ) * uDry;
        vColor = mix( vColor, vec3( 0.60, 0.47, 0.17 ), dryMask );
        float stressMask = smoothstep( 0.5, 1.0, aHeight ) * uStress;
        vColor = mix( vColor, vec3( 0.52, 0.5, 0.28 ), stressMask * 0.5 );`,
      );
  };

  return material;
}

export function createCrops({ heads = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'crops';

  const uniforms = {
    uTime: { value: 0 },
    uStage: { value: 0 },
    uHeight: { value: 0.2 },
    uDry: { value: 0 },
    uStress: { value: 0 },
    uWind: { value: 0.7 },
  };

  const cornMaterial = createCropMaterial(uniforms);
  const riceMaterial = createCropMaterial(uniforms);

  const cornGroup = new THREE.Group();
  const riceGroup = new THREE.Group();

  const { width, depth, ridges } = SCENE.plot;
  const rowDepth = depth / ridges;
  // Chỉ trồng trong LÒNG ĐẤT: bỏ phần viền khay + chừa mép để lá không tràn
  // ra thành khay/sàn (trước đây dùng full width nên cây mọc cả trên viền).
  const soilMargin = SCENE.plot.soilInset + 0.22;
  const rowLength = width - soilMargin * 2;
  const plantsPerRow = Math.max(8, Math.round(rowLength / PLANT_SPACING));
  const plantSpacing = rowLength / plantsPerRow;

  const placements = [];
  for (let row = 0; row < ridges; row += 1) {
    const z = -depth / 2 + rowDepth * (row + 0.5);
    for (let index = 0; index < plantsPerRow; index += 1) {
      const x =
        -rowLength / 2 +
        plantSpacing * (index + 0.5) +
        (Math.random() - 0.5) * plantSpacing * 0.16;
      if (Math.abs(x) > rowLength / 2) continue;
      // Đầu phun nằm trong rãnh giữa: thay đúng một cây và chừa vòng đất trống.
      const occupied = heads.some((head) =>
        Math.hypot(head.x - x, head.z - z) < HEAD_CLEARANCE,
      );
      if (occupied) continue;

      placements.push({ x, z, row, index });
    }
  }

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  function buildInstances(geometries, material, target, count) {
    const meshes = [];
    const buckets = geometries.map(() => []);

    placements.forEach((spot, order) => {
      const variant = (spot.index + spot.row * 3) % geometries.length;
      buckets[variant].push(spot);
      void order;
    });

    geometries.forEach((geometry, variant) => {
      const bucket = buckets[variant];
      if (!bucket.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, bucket.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;

      bucket.forEach((spot, i) => {
        const jitterZ = (Math.random() - 0.5) * rowDepth * 0.1;
        const y = ridgeHeight(spot.x, spot.z + jitterZ);
        const scale = 0.9 + Math.random() * 0.2;
        dummy.position.set(spot.x, y - 0.02, spot.z + jitterZ);
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        const shade = 0.9 + Math.random() * 0.2;
        tint.setRGB(shade, shade * (0.97 + Math.random() * 0.06), shade * 0.96);
        mesh.setColorAt(i, tint);
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      target.add(mesh);
      meshes.push(mesh);
    });

    return meshes;
  }

  const cornGeometries = Array.from({ length: CORN_VARIANTS }, (_, i) => buildCorn(i));
  const riceGeometries = Array.from({ length: RICE_VARIANTS }, (_, i) => buildRice(i));

  const cornMeshes = buildInstances(cornGeometries, cornMaterial, cornGroup, CORN_VARIANTS);
  const riceMeshes = buildInstances(riceGeometries, riceMaterial, riceGroup, RICE_VARIANTS);

  riceGroup.visible = false;
  group.add(cornGroup, riceGroup);

  // Mặt nước nông cho ruộng lúa
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(width - SCENE.plot.soilInset * 2, depth - SCENE.plot.soilInset * 2),
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#4e6f6a'),
      transparent: true,
      opacity: 0.42,
      roughness: 0.18,
      metalness: 0.05,
      transmission: 0.35,
      side: THREE.DoubleSide,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  // Phải nằm TRÊN đỉnh luống (cao nhất ~0.55): nếu cắt ngang mặt đất thì hai
  // mặt phẳng gần nhau sẽ nhấp nháy khi xoay camera.
  water.position.y = 0.56;
  water.visible = false;
  group.add(water);

  const targets = { stage: 0, height: 0.2, dry: 0, stress: 0, wind: 0.7 };

  function setCrop(cropCode) {
    const isRice = cropCode === 1;
    cornGroup.visible = !isRice;
    riceGroup.visible = isRice;
    water.visible = isRice;
  }

  function update(delta, state) {
    const record = state.series[Math.min(state.day, state.series.length) - 1];
    const stage = record ? record.stage : 0;
    const moisture = record ? record.moisture : 0.45;
    const bounds = state.meta.moisture;

    const stageHeight = [0.2, 0.62, 1, 1.02][Math.min(3, Math.max(0, stage))];
    const dryTarget = stage >= 3 ? 0.85 : stage === 2 ? 0.12 : 0;
    const stressTarget =
      moisture < bounds.stressBounds[0] ? 1 : moisture > bounds.stressBounds[1] ? 0.7 : 0;
    const raining = record && record.actualRainMm > 0.5;
    const windTarget = raining ? 1.7 : state.scenario === 'stormy' ? 1.35 : 0.75;

    const lerp = 1 - Math.exp(-delta * 2.2);
    targets.stage += (stage - targets.stage) * lerp;
    targets.height += (stageHeight - targets.height) * lerp;
    targets.dry += (dryTarget - targets.dry) * lerp;
    targets.stress += (stressTarget - targets.stress) * Math.min(1, delta * 1.6);
    targets.wind += (windTarget - targets.wind) * Math.min(1, delta * 1.5);

    uniforms.uStage.value = targets.stage;
    uniforms.uHeight.value = targets.height;
    uniforms.uDry.value = targets.dry;
    uniforms.uStress.value = targets.stress;
    uniforms.uWind.value = targets.wind;
  }

  return {
    group,
    update,
    setCrop,
    advanceTime(seconds) {
      uniforms.uTime.value = seconds;
    },
    get stats() {
      return {
        cornMeshes: cornMeshes.length,
        riceMeshes: riceMeshes.length,
        plants: placements.length,
      };
    },
  };
}
