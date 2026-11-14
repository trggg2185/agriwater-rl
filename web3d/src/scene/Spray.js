/**
 * Tia nước của đầu phun — toàn bộ quỹ đạo bay tính trong VERTEX SHADER.
 *
 * Hình dạng theo ảnh mẫu: đầu vòi thấp, từ miệng vòi bung ra hàng chục tia RẤT
 * MẢNH toả thành HÌNH QUẠT rộng (bán kính tới sát mép dải khu), mỗi tia là một
 * đường parabol; gần miệng vòi dày và sáng, xa dần tách thành giọt rồi thành
 * sương mịn. Hai quạt đối xứng hướng vuông góc trục dọc thửa và quét qua lại.
 *
 * Kiến trúc:
 *  - `jets`: InstancedBufferGeometry (quad billboard) — 1 draw call.
 *  - `mist`: THREE.Points — 1 draw call.
 * JS chỉ dựng thuộc tính MỘT LẦN (hướng tia, tầm rơi, góc phóng, pha); mỗi
 * frame chỉ cập nhật uniform (thời gian, gió, trạng thái mở, lưu lượng).
 *
 * Bảo toàn dữ liệu: tầm rơi được kẹp theo biên thửa (plotEdgeDistance) nên
 * không tia nào chạm đất ngoài khay; lưu lượng từng vòi vẫn lấy từ mô hình
 * phân khu, không đổi m(t) của env.
 */

import * as THREE from 'three';
import { SCENE } from '../config.js';
import {
  headMaxRadius,
  plotEdgeDistance,
} from '../utils/irrigationZones.js';

/** Độ dài một chu kỳ bay của hạt (giây) — càng nhỏ nước càng "nhanh". */
const FLIGHT_PERIOD = 1.25;
const DROPLETS_PER_STREAM = 20;
const FAN_ANGLE = Math.PI / 2;

/** mulberry32: sinh số tất định để tia nước giống nhau giữa các lần tải. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const JET_VERTEX = /* glsl */ `
  precision highp float;

  attribute vec4 aBasis;
  attribute vec3 aHead;
  attribute float aBase;
  attribute float aAzimuth;
  attribute float aRange;
  attribute float aTanH;
  attribute float aPhase;
  attribute float aWidth;
  attribute float aSeed;
  attribute float aAlpha;

  uniform float uTime;
  uniform vec4 uOpen;
  uniform vec4 uFlow;
  uniform float uCapacity;
  uniform float uSweepSeconds;
  uniform float uSweepRad;
  uniform float uMode;
  uniform float uPeriod;
  uniform float uArcHalf;
  uniform vec2 uWind;
  uniform vec2 uPlotHalf;

  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    vUv = uv;

    float openMask = dot(uOpen, aBasis);
    if (openMask < 0.01) {
      vAlpha = 0.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    float intensity = clamp(dot(uFlow, aBasis) / max(uCapacity, 0.001), 0.3, 1.0);

    // Quét: hai quạt lắc ±sweepRad, hoặc quay tròn liên tục ở chế độ rotary360.
    float osc = sin(uTime * 6.2831853 / max(uSweepSeconds, 0.15) + aSeed * 6.2831853);
    float sweep = mix(osc * uSweepRad, uTime * 6.2831853 / max(uSweepSeconds, 0.15), uMode);

    float az = aBase + aAzimuth + sweep;
    vec2 dir = vec2(cos(az), sin(az));

    float t = fract(uTime / uPeriod + aPhase);
    float u = t;

    vec3 p = aHead;
    p.xz += dir * (aRange * u);
    p.y += 4.0 * aTanH * u * (1.0 - u);
    p.xz += uWind * (u * u) * aRange * 0.05;

    // Vận tốc quỹ đạo (đạo hàm) → hướng kéo dài vệt nước.
    vec3 vel = vec3(
      dir.x * aRange,
      4.0 * aTanH * (1.0 - 2.0 * u),
      dir.y * aRange
    ) / uPeriod;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 velView = modelViewMatrix * vec4(vel, 0.0);
    vec2 along = normalize(velView.xy + vec2(1e-4));
    vec2 across = vec2(-along.y, along.x);

    float len = clamp(length(vel) * 0.05 * (0.6 + 0.7 * intensity), 0.05, 0.75);
    float wid = aWidth * (0.9 + 1.2 * intensity);

    mv.xy += along * (position.x * len) + across * (position.y * wid);
    gl_Position = projectionMatrix * mv;

    // Điểm rơi ngoài thửa thì tắt hẳn trước khi chạm đất.
    float inside = step(abs(p.x), uPlotHalf.x) * step(abs(p.z), uPlotHalf.y);
    float edgeFade = 1.0 - smoothstep(0.55, 1.0, abs(aAzimuth) / max(uArcHalf, 1e-3));

    float fadeIn = smoothstep(0.0, 0.04, u);
    float fadeOut = 1.0 - smoothstep(0.9, 1.0, u);

    vAlpha = openMask * aAlpha * intensity * fadeIn * fadeOut * edgeFade * inside;
  }
`;

const JET_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;

  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    float across = 1.0 - smoothstep(0.06, 0.5, abs(vUv.y - 0.5));
    float along = 1.0 - smoothstep(0.32, 0.5, abs(vUv.x - 0.5));
    float alpha = vAlpha * across * along;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor * (0.72 + 0.5 * across), alpha);
  }
`;

const MIST_VERTEX = /* glsl */ `
  precision highp float;

  attribute vec4 aBasis;
  attribute float aBase;
  attribute float aAzimuth;
  attribute float aRange;
  attribute float aTanH;
  attribute float aPhase;
  attribute float aSeed;
  attribute float aSize;

  uniform float uTime;
  uniform vec4 uOpen;
  uniform vec4 uFlow;
  uniform float uCapacity;
  uniform float uSweepSeconds;
  uniform float uSweepRad;
  uniform float uMode;
  uniform float uPixelScale;
  uniform vec2 uWind;

  varying float vAlpha;

  void main() {
    float openMask = dot(uOpen, aBasis);
    if (openMask < 0.01) {
      vAlpha = 0.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    float intensity = clamp(dot(uFlow, aBasis) / max(uCapacity, 0.001), 0.3, 1.0);
    float osc = sin(uTime * 6.2831853 / max(uSweepSeconds, 0.15) + aSeed * 6.2831853);
    float sweep = mix(osc * uSweepRad, uTime * 6.2831853 / max(uSweepSeconds, 0.15), uMode);
    float az = aBase + aAzimuth + sweep;
    vec2 dir = vec2(cos(az), sin(az));

    // Sương: hạt đi chậm, bốc lên và trôi theo gió.
    float t = fract(uTime * 0.24 + aPhase);
    float u = min(1.0, t * 1.2);

    vec3 p = position;
    p.xz += dir * (aRange * u);
    p.y += 4.0 * aTanH * u * (1.0 - u) + t * 0.45;
    p.xz += uWind * t * 0.55 + dir.yx * (t * 0.22);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelScale / max(0.6, -mv.z);

    vAlpha = openMask * intensity * (1.0 - t) * 0.2;
  }
`;

const MIST_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;

  varying float vAlpha;

  void main() {
    vec2 offset = gl_PointCoord - 0.5;
    float falloff = 1.0 - smoothstep(0.1, 0.5, length(offset));
    float alpha = vAlpha * falloff;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/**
 * @param {object} options
 * @param {Array<{x:number,z:number,label:string}>} options.heads
 * @param {number} options.width  bề rộng thửa
 * @param {number} options.depth  chiều sâu thửa
 */
export function createSpray({ heads, width, depth }) {
  const group = new THREE.Group();
  group.name = 'spray';

  const config = SCENE.sprinklers;
  const headCount = heads.length;

  const arcRad = THREE.MathUtils.degToRad(config.arcDegrees);
  const sweepRad = THREE.MathUtils.degToRad(config.sweepDegrees);
  const [minAngle, maxAngle] = config.launchAngleDeg ?? [22, 35];
  const radiusFactor = config.maxRadiusFactor ?? 1.05;
  // Số tia mỗi quạt: đủ dày để quạt đọc thành chùm tia liền như ảnh mẫu.
  const streamsPerFan = Math.max(24, Math.round((config.streamsPerHead ?? 56) * 0.75));

  const plotHalf = new THREE.Vector2(width / 2, depth / 2);

  const uniforms = {
    uTime: { value: 0 },
    uOpen: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFlow: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCapacity: { value: 8.33 },
    uSweepSeconds: { value: config.sweepSeconds ?? 4 },
    uSweepRad: { value: sweepRad },
    uMode: { value: config.mode === 'rotary360' ? 1 : 0 },
    uPeriod: { value: FLIGHT_PERIOD },
    uArcHalf: { value: arcRad / 2 },
    uWind: { value: new THREE.Vector2(0.35, 0.12) },
    uPlotHalf: { value: plotHalf },
    uPixelScale: { value: Math.min(2, window.devicePixelRatio || 1) },
    uColor: { value: new THREE.Color('#dcefff') },
  };

  const random = mulberry32(20260214);

  // ---------- Dữ liệu tia ----------
  const jetHeads = [];
  const jetBasis = [];
  const jetBase = [];
  const jetAzimuth = [];
  const jetRange = [];
  const jetTan = [];
  const jetPhase = [];
  const jetWidth = [];
  const jetSeed = [];
  const jetAlpha = [];

  const mistHeads = [];
  const mistBasis = [];
  const mistBase = [];
  const mistAzimuth = [];
  const mistRange = [];
  const mistTan = [];
  const mistPhase = [];
  const mistSeed = [];
  const mistSize = [];

  function basis(headIndex) {
    return [headIndex === 0 ? 1 : 0, headIndex === 1 ? 1 : 0, headIndex === 2 ? 1 : 0, headIndex === 3 ? 1 : 0];
  }

  heads.slice(0, 4).forEach((head, headIndex) => {
    const nozzleY = head.y ?? head.nozzleY ?? 0.24;
    const x = head.x;
    const z = head.z;
    const maxRadius = headMaxRadius(headIndex, {
      width,
      depth,
      headCount,
      radiusFactor,
    });
    const fanBasis = basis(headIndex);

    for (const baseAngle of [FAN_ANGLE, -FAN_ANGLE]) {
      for (let stream = 0; stream < streamsPerFan; stream += 1) {
        const spread = (stream + 0.5) / streamsPerFan - 0.5;
        const jitter = THREE.MathUtils.degToRad((random() - 0.5) * 4);
        const azimuth = spread * arcRad + jitter;

        // Tầm rơi: chừa mép khay, và phải đúng cả khi quạt đang lắc.
        let edge = Infinity;
        for (const sweepSample of [-sweepRad, 0, sweepRad]) {
          const angle = baseAngle + azimuth + sweepSample;
          edge = Math.min(
            edge,
            plotEdgeDistance({ x, z }, Math.cos(angle), Math.sin(angle), {
              width,
              depth,
              margin: 0.18,
            }),
          );
        }
        const limit = Math.max(0.5, Math.min(maxRadius, edge * 0.98));
        const range = limit * (0.55 + 0.45 * random());
        const angleDeg = minAngle + random() * (maxAngle - minAngle);
        const tanH = Math.tan(THREE.MathUtils.degToRad(angleDeg));
        const seed = random();

        for (let drop = 0; drop < DROPLETS_PER_STREAM; drop += 1) {
          jetHeads.push(x, nozzleY, z);
          jetBasis.push(...fanBasis);
          jetBase.push(baseAngle);
          jetAzimuth.push(azimuth);
          jetRange.push(range);
          jetTan.push((range * tanH) / 4);
          jetPhase.push((drop + random() * 0.6) / DROPLETS_PER_STREAM);
          jetWidth.push(0.016 + random() * 0.012);
          jetSeed.push(seed);
          jetAlpha.push(0.62 + random() * 0.38);
        }
      }

      // Sương mịn quanh vùng nước rơi.
      for (let puff = 0; puff < 22; puff += 1) {
        const azimuth = (random() - 0.5) * arcRad * 0.9;
        const angle = baseAngle + azimuth;
        const edge = plotEdgeDistance({ x, z }, Math.cos(angle), Math.sin(angle), {
          width,
          depth,
          margin: 0.18,
        });
        const limit = Math.max(0.5, Math.min(maxRadius, edge * 0.98));
        const range = limit * (0.35 + 0.5 * random());
        const angleDeg = minAngle + random() * (maxAngle - minAngle);

        mistHeads.push(x, nozzleY, z);
        mistBasis.push(...fanBasis);
        mistBase.push(baseAngle);
        mistAzimuth.push(azimuth);
        mistRange.push(range);
        mistTan.push((range * Math.tan(THREE.MathUtils.degToRad(angleDeg))) / 4);
        mistPhase.push(random());
        mistSeed.push(random());
        mistSize.push(20 + random() * 34);
      }
    }
  });

  // ---------- Lưới quạt (instanced quads) ----------
  const base = new THREE.PlaneGeometry(1, 1);
  const jetGeometry = new THREE.InstancedBufferGeometry();
  jetGeometry.index = base.index;
  jetGeometry.setAttribute('position', base.getAttribute('position'));
  jetGeometry.setAttribute('uv', base.getAttribute('uv'));
  jetGeometry.instanceCount = jetHeads.length / 3;

  const addAttribute = (name, array, itemSize) => {
    jetGeometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(array), itemSize));
  };
  addAttribute('aHead', jetHeads, 3);
  addAttribute('aBasis', jetBasis, 4);
  addAttribute('aBase', jetBase, 1);
  addAttribute('aAzimuth', jetAzimuth, 1);
  addAttribute('aRange', jetRange, 1);
  addAttribute('aTanH', jetTan, 1);
  addAttribute('aPhase', jetPhase, 1);
  addAttribute('aWidth', jetWidth, 1);
  addAttribute('aSeed', jetSeed, 1);
  addAttribute('aAlpha', jetAlpha, 1);

  const jetMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: JET_VERTEX,
    fragmentShader: JET_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const jets = new THREE.Mesh(jetGeometry, jetMaterial);
  jets.frustumCulled = false;
  jets.name = 'spray-jets';
  jets.renderOrder = 5;
  group.add(jets);

  // ---------- Sương ----------
  const mistGeometry = new THREE.BufferGeometry();
  mistGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(mistHeads), 3),
  );
  mistGeometry.setAttribute(
    'aBasis',
    new THREE.Float32BufferAttribute(new Float32Array(mistBasis), 4),
  );
  mistGeometry.setAttribute(
    'aBase',
    new THREE.Float32BufferAttribute(new Float32Array(mistBase), 1),
  );
  mistGeometry.setAttribute(
    'aAzimuth',
    new THREE.Float32BufferAttribute(new Float32Array(mistAzimuth), 1),
  );
  mistGeometry.setAttribute(
    'aRange',
    new THREE.Float32BufferAttribute(new Float32Array(mistRange), 1),
  );
  mistGeometry.setAttribute(
    'aTanH',
    new THREE.Float32BufferAttribute(new Float32Array(mistTan), 1),
  );
  mistGeometry.setAttribute(
    'aPhase',
    new THREE.Float32BufferAttribute(new Float32Array(mistPhase), 1),
  );
  mistGeometry.setAttribute(
    'aSeed',
    new THREE.Float32BufferAttribute(new Float32Array(mistSeed), 1),
  );
  mistGeometry.setAttribute(
    'aSize',
    new THREE.Float32BufferAttribute(new Float32Array(mistSize), 1),
  );

  const mistMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: MIST_VERTEX,
    fragmentShader: MIST_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mist = new THREE.Points(mistGeometry, mistMaterial);
  mist.frustumCulled = false;
  mist.name = 'spray-mist';
  mist.renderOrder = 4;
  group.add(mist);

  /** Mức tưới lớn nhất / số đầu — mẫu số để quy lưu lượng thành cường độ 0..1. */
  function setCapacity(litersPerHead) {
    uniforms.uCapacity.value = Math.max(0.001, litersPerHead || 8.33);
    uniforms.uPixelScale.value = window.devicePixelRatio || 1;
  }

  function setWind(x, z) {
    uniforms.uWind.value.set(x, z);
  }

  /** Cập nhật trạng thái mở/lưu lượng của từng vòi (đọc từ Sprinklers). */
  function setNozzles(nozzles = []) {
    for (let index = 0; index < 4; index += 1) {
      const unit = nozzles[index];
      uniforms.uOpen.value.setComponent(index, unit ? unit.open : 0);
      uniforms.uFlow.value.setComponent(index, unit ? unit.flow : 0);
    }
  }

  function update(delta) {
    uniforms.uTime.value += delta;
  }

  setCapacity(25 / Math.max(1, headCount));

  return {
    group,
    jets,
    mist,
    uniforms,
    setCapacity,
    setWind,
    setNozzles,
    update,
    /** Số instance đang vẽ (để kiểm tra hiệu năng). */
    get instanceCount() {
      return jetGeometry.instanceCount;
    },
  };
}
