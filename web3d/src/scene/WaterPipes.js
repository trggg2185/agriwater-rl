/**
 * Hệ ống tưới: ống chính từ trạm bơm vòng qua mép thửa, rồi chạy dọc rãnh giữa
 * (ngầm nông, lộ nhẹ trong rãnh) qua từng đầu phun. Mỗi đầu có một hộp van nhỏ.
 *
 * Dải sáng xanh chạy dọc ống được làm trong shader bằng offset UV (không cập
 * nhật đỉnh mỗi frame): mỗi đoạn ống là một cylinder riêng, uv.y chạy từ đầu
 * cấp nước tới đầu kia nên `fract(uv.y·k − t)` cho cảm giác nước chảy.
 *
 * Đoạn ống chỉ sáng khi có ít nhất một vòi phía sau nó đang mở; tắt thì về xám.
 */

import * as THREE from 'three';
import { SCENE } from '../config.js';
import { SOIL_BASE_Y } from './Soil.js';

const PIPE_COLOR = '#9ba6a1';
const EMISSIVE = 'vec3(0.30, 0.65, 1.0)';

function createPipeMaterial(direction = 1) {
  const uniforms = {
    uTime: { value: 0 },
    uFlow: { value: 0 },
    uDir: { value: direction },
  };

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PIPE_COLOR),
    roughness: 0.42,
    metalness: 0.42,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlow = uniforms.uFlow;
    shader.uniforms.uDir = uniforms.uDir;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPipeUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPipeUv = uv;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec2 vPipeUv;
         uniform float uTime;
         uniform float uFlow;
         uniform float uDir;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float travel = fract(vPipeUv.y * 2.2 * uDir - uTime * 0.55);
         float band = smoothstep(0.62, 0.94, travel) * (1.0 - smoothstep(0.94, 1.0, travel));
         totalEmissiveRadiance += ${EMISSIVE} * band * uFlow * 1.8;
         totalEmissiveRadiance += ${EMISSIVE} * uFlow * 0.16;`,
      );
  };
  material.customProgramCacheKey = () => 'agriwater-pipe-flow';

  return { material, uniforms };
}

function addCylinder(parent, from, to, material, radius) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  if (length < 1e-4) return null;

  const geometry = new THREE.CylinderGeometry(radius, radius, length, 8, 1, true);
  geometry.translate(0, length / 2, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addJoint(parent, point, material, radius) {
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), material);
  joint.position.copy(point);
  parent.add(joint);
  return joint;
}

/**
 * @param {object} options
 * @param {Array<{x:number,z:number,index:number}>} options.heads vị trí đầu (toạ độ khay)
 * @param {number} options.width  bề rộng thửa
 * @param {number} options.depth  chiều sâu thửa
 * @param {{x:number,y:number,z:number}} options.pumpOutlet điểm ra của trạm bơm
 */
export function createWaterPipes({ heads, width, depth, pumpOutlet }) {
  const group = new THREE.Group();
  group.name = 'water-pipes';

  const radius = 0.045;
  const pipeY = SOIL_BASE_Y + 0.055;
  const valveY = pipeY + 0.015;

  const outlet = pumpOutlet
    ? new THREE.Vector3(pumpOutlet.x, pumpOutlet.y, pumpOutlet.z)
    : new THREE.Vector3(-width / 2 - 0.25, 0.2, 0.75);

  // Điểm vào thửa: mép trái của rãnh giữa.
  const entryX = -width / 2 + 0.28;
  const entry = new THREE.Vector3(entryX, pipeY, 0);
  const corner = new THREE.Vector3(outlet.x, outlet.y, 0);

  const segments = [];

  function addSegment(from, to, direction = 1) {
    const { material, uniforms } = createPipeMaterial(direction);
    const mesh = addCylinder(group, from, to, material, radius);
    if (!mesh) return;
    segments.push({
      mesh,
      uniforms,
      flow: 0,
      target: 0,
      // Đoạn này cấp nước cho các vòi có chỉ số ≥ `feedsFrom` (xếp theo trục X).
      feedsFrom: segments.length,
    });
  }

  // 0–1: từ bơm vòng ra mép thửa rồi chui vào rãnh giữa.
  addSegment(outlet, corner, 1);
  addSegment(corner, entry, 1);
  addJoint(group, corner, segments.at(-1).mesh.material, radius * 1.15);

  // 2..: dọc rãnh giữa, chia đoạn tại từng đầu phun.
  const nodes = [
    new THREE.Vector3(entryX, pipeY, 0),
    ...heads.map((head) => new THREE.Vector3(head.x, pipeY, 0)),
    new THREE.Vector3(width / 2 - 0.28, pipeY, 0),
  ];
  for (let i = 1; i < nodes.length; i += 1) {
    addSegment(nodes[i - 1], nodes[i], 1);
    addJoint(group, nodes[i], segments.at(-1).mesh.material, radius * 1.1);
  }

  // ---------- Hộp van + đèn nhỏ ở mỗi đầu ----------
  const valveMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3f4a45'),
    roughness: 0.5,
    metalness: 0.45,
  });
  const valveLidMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5c6862'),
    roughness: 0.42,
    metalness: 0.55,
  });
  const ledGeometry = new THREE.SphereGeometry(0.022, 8, 6);

  const valves = heads.map((head) => {
    const box = new THREE.Group();
    box.position.set(head.x, valveY, 0.22);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.13), valveMaterial);
    body.position.y = 0.02;
    body.castShadow = true;
    body.receiveShadow = true;

    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.1), valveLidMaterial);
    lid.position.y = 0.08;

    const ledMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#5a6560'),
      emissive: new THREE.Color('#2f86e0'),
      emissiveIntensity: 0,
      roughness: 0.35,
    });
    const led = new THREE.Mesh(ledGeometry, ledMaterial);
    led.position.set(0.045, 0.09, 0.028);

    // Nhánh ngắn nối hộp van vào ống chính.
    const stub = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, 0.2, 6),
      valveMaterial,
    );
    stub.rotation.x = Math.PI / 2;
    stub.position.set(0, 0, -0.11);

    box.add(body, lid, led, stub);
    group.add(box);

    return { ledMaterial, head };
  });

  let time = 0;

  /**
   * @param {boolean[]} open vòi nào đang mở
   * @param {boolean} pumpOn bơm tổng
   */
  function setFlow(open = [], pumpOn = true) {
    let farthest = -1;
    if (pumpOn) {
      open.forEach((isOpen, index) => {
        if (isOpen) farthest = Math.max(farthest, index);
      });
    }

    segments.forEach((segment, index) => {
      // Hai đoạn đầu (bơm → rãnh) sáng khi có bất kỳ vòi mở; các đoạn dọc rãnh
      // sáng nếu vòi xa nhất mà chúng phục vụ đang mở.
      segment.target = farthest >= 0 && index <= 2 + farthest ? 1 : 0;
    });

    valves.forEach((valve, index) => {
      const isOn = Boolean(pumpOn) && Boolean(open[index]) && farthest >= 0;
      valve.ledMaterial.emissiveIntensity = isOn ? 1.8 : 0;
      valve.ledMaterial.color.set(isOn ? '#7cc6ff' : '#5a6560');
    });
  }

  function update(delta) {
    time += delta;
    const lerp = Math.min(1, delta * 3.5);
    for (const segment of segments) {
      segment.flow += (segment.target - segment.flow) * lerp;
      segment.uniforms.uTime.value = time;
      segment.uniforms.uFlow.value = segment.flow;
    }
  }

  return { group, segments, valves, setFlow, update, pipeY };
}
