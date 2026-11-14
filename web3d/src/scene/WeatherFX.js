/**
 * Thời tiết trong cảnh: mưa (vệt LineSegments + mây giả) và ánh sáng ấm khi
 * nắng gắt. Chỉ đọc dữ liệu weather/observation từ store.
 */

import * as THREE from 'three';
import { SCENE } from '../config.js';

const RAIN_COUNT = 900;

function createRain() {
  const positions = new Float32Array(RAIN_COUNT * 2 * 3);
  const speeds = new Float32Array(RAIN_COUNT);

  for (let i = 0; i < RAIN_COUNT; i += 1) {
    const x = (Math.random() - 0.5) * 26;
    const y = Math.random() * 14;
    const z = (Math.random() - 0.5) * 26;
    const length = 0.35 + Math.random() * 0.45;

    positions[i * 6] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x + 0.04;
    positions[i * 6 + 4] = y - length;
    positions[i * 6 + 5] = z;

    speeds[i] = 6 + Math.random() * 6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSpeed;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float fall = mod( uTime * aSpeed, 15.0 );
        p.y = mod( p.y - fall + 15.0, 15.0 ) - 1.0;
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_Position = projectionMatrix * mv;
        vAlpha = 0.55;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4( 0.74, 0.83, 0.88, vAlpha * uOpacity );
      }
    `,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.visible = false;
  return { lines, material };
}

function createClouds() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3a4442'),
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.75,
  });

  const spots = [
    [-8, 9.5, -4, 4.2],
    [2, 10.4, 3, 5.4],
    [8, 8.6, -6, 3.4],
    [-2, 11.2, 7, 4.6],
  ];

  for (const [x, y, z, scale] of spots) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), material);
    cloud.position.set(x, y, z);
    cloud.scale.set(scale, scale * 0.45, scale * 0.8);
    group.add(cloud);
  }

  group.visible = false;
  return group;
}

export function createWeatherFX(baseY = 0) {
  const group = new THREE.Group();
  group.name = 'weather';

  const rain = createRain();
  const clouds = createClouds();
  rain.lines.position.y = baseY;
  clouds.position.y = baseY;
  group.add(rain.lines, clouds);

  let rainAmount = 0;

  return {
    group,
    /** Trả về gợi ý điều chỉnh ánh sáng để SceneManager áp dụng. */
    update(delta, record) {
      const raining = record ? Math.min(1, record.actualRainMm / 8) : 0;
      const probability = record ? record.rainProbability : 0;
      rainAmount += (raining - rainAmount) * Math.min(1, delta * 2);
      const visible = rainAmount > 0.03 || probability > 0.75;

      rain.lines.visible = visible;
      clouds.visible = visible || probability > 0.55;
      rain.material.uniforms.uOpacity.value = Math.max(0.12, rainAmount) * (visible ? 1 : 0);

      const overcast = Math.max(rainAmount, probability * 0.6);
      return {
        sunIntensity: SCENE.light.sunIntensity * (1 - overcast * 0.55),
        hemiIntensity: SCENE.light.hemiIntensity * (1 - overcast * 0.2),
        fogFar: SCENE.fog.far * (1 - overcast * 0.35),
        overcast,
      };
    },
    advanceTime(seconds) {
      rain.material.uniforms.uTime.value = seconds;
    },
  };
}
