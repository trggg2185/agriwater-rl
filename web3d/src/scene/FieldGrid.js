/**
 * Nền: một sân vỉa hè liền sát quanh thửa, KHÔNG có lưới ô trống.
 *
 * Chống nhấp nháy (z-fighting): mỗi cao độ chỉ có ĐÚNG MỘT mặt phẳng hiển thị.
 * Trước đây mặt sân (y = 0.32) chồng lên đỉnh gờ (y = 0.30) và mặt nền tối
 * (y = 0.26) — ba mặt gần như đồng phẳng trên cùng một diện tích nên khi xoay
 * camera chúng tranh nhau từng pixel. Nay:
 *   - mặt sân  : plane ở y = thickness
 *   - gờ mép   : 4 thanh nằm NGOÀI mép sân (không chồng lên mặt sân)
 *   - nền tối  : hạ hẳn xuống y = 0, chỉ lộ ra ngoài sân
 */

import * as THREE from 'three';
import { SCENE } from '../config.js';
import { createFieldTexture } from '../utils/textures.js';

export function createFieldGrid() {
  const { apronScale, thickness } = SCENE.grid;
  const apronW = SCENE.plot.width * apronScale;
  const apronD = SCENE.plot.depth * apronScale;

  const group = new THREE.Group();
  group.name = 'field-grid';

  // ---------- Mặt sân: một plane duy nhất ----------
  const map = createFieldTexture({ grooves: SCENE.plot.ridges, seam: false });
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(apronW, apronD, 1, 1),
    new THREE.MeshStandardMaterial({
      map,
      roughness: 0.92,
      metalness: 0.02,
      color: new THREE.Color('#a6aeaa'),
    }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = thickness;
  apron.receiveShadow = true;
  group.add(apron);

  // ---------- Gờ mép: 4 thanh bao quanh, nằm ngoài diện tích mặt sân ----------
  const edgeW = 0.34;
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5d6663'),
    roughness: 0.95,
    metalness: 0.02,
  });
  const edgeLong = new THREE.BoxGeometry(apronW + edgeW * 2, thickness, edgeW);
  const edgeShort = new THREE.BoxGeometry(edgeW, thickness, apronD);

  const edges = [
    [edgeLong, 0, apronD / 2 + edgeW / 2],
    [edgeLong, 0, -apronD / 2 - edgeW / 2],
    [edgeShort, apronW / 2 + edgeW / 2, 0],
    [edgeShort, -apronW / 2 - edgeW / 2, 0],
  ];

  for (const [geometry, x, z] of edges) {
    const edge = new THREE.Mesh(geometry, edgeMaterial);
    edge.position.set(x, thickness / 2, z);
    edge.receiveShadow = true;
    edge.castShadow = true;
    group.add(edge);
  }

  // ---------- Mặt nền tối rộng phía ngoài ----------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(apronW * 7, apronD * 7),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#252a26'), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  group.add(ground);

  return { group, apron, apronW, apronD };
}
