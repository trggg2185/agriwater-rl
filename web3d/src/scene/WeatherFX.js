/**
 * Mưa, ánh sáng và độ mờ chuyển dần giữa các trạng thái thời tiết.
 */

import * as THREE from 'three';
import { SCENE } from '../config.js';

const RAIN_COUNT = 480;

function createRain() {
  const positions = new Float32Array(RAIN_COUNT * 2 * 3);
  const speeds = new Float32Array(RAIN_COUNT);

  for (let i = 0; i < RAIN_COUNT; i += 1) {
    const x = (Math.random() - 0.5) * 26;
    const y = Math.random() * 14;
    const z = (Math.random() - 0.5) * 26;
    const length = 0.28 + Math.random() * 0.55;

    positions[i * 6] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x + 0.16;
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
        p.x += p.y * 0.19;
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_Position = projectionMatrix * mv;
        vAlpha = smoothstep( -0.35, 0.8, p.y ) * (1.0 - smoothstep( 12.0, 14.0, p.y ));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4( 0.83, 0.91, 0.96, vAlpha * uOpacity * 0.66 );
      }
    `,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.visible = false;
  return { lines, material };
}

export function createWeatherFX() {
  const rain = createRain();
  let rainAmount = 0;
  let overcast = 0;

  return {
    group: rain.lines,
    update(delta, record, preview) {
      const actualRain = record?.actualRainMm ?? 0;
      const forecast = record?.rainProbability ?? 0;
      const rainTarget = preview ? 0.52 : Math.min(actualRain / 8, 1);
      const cloudTarget = preview ? 0.38 : Math.max(rainTarget, forecast * 0.55);
      const blend = 1 - Math.exp(-delta * 3);
      rainAmount += (rainTarget - rainAmount) * blend;
      overcast += (cloudTarget - overcast) * blend;

      rain.lines.visible = rainAmount > 0.008;
      rain.material.uniforms.uOpacity.value = rainAmount;
      return {
        sunIntensity: SCENE.light.sunIntensity * (1 - overcast * 0.58),
        hemiIntensity: SCENE.light.hemiIntensity * (1 - overcast * 0.14),
        fogNear: SCENE.fog.near - overcast * 37,
        fogFar: SCENE.fog.far - overcast * 61,
      };
    },
    advanceTime(seconds) {
      rain.material.uniforms.uTime.value = seconds;
    },
  };
}
