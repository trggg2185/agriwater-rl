/**
 * Ranh giới giữa các dải khu tưới — đường mảnh NÉT ĐỨT chạy ngang thửa.
 *
 * Mỗi dải là một khoảng theo trục X (trục dọc thửa), ranh nằm ở biên hai dải
 * kề nhau. Đường được vẽ thành từng đoạn ngắn men theo địa hình luống (lấy
 * cùng `ridgeHeight` với Soil) nên không lơ lửng trên mặt đất.
 *
 * Chỉ là lớp trang trí đọc tham số hình học — không mang dữ liệu mô phỏng.
 */

import * as THREE from 'three';
import { SCENE } from '../config.js';
import { bandBounds } from '../utils/irrigationZones.js';
import { ridgeHeight } from './Soil.js';

const LINE_COLOR = '#dfeae4';
const DASH = 0.26;
const GAP = 0.2;
/** Nâng lên khỏi mặt đất để không tranh độ sâu với luống. */
const LIFT = 0.022;

export function createZoneBands({ headCount, width, depth } = {}) {
  const group = new THREE.Group();
  group.name = 'zone-bands';

  const count = Math.max(2, Math.round(headCount ?? SCENE.sprinklers.headCount));
  const plotWidth = width ?? SCENE.plot.width;
  const plotDepth = depth ?? SCENE.plot.depth;
  const zStart = -plotDepth / 2 + SCENE.plot.soilInset + 0.12;
  const zEnd = plotDepth / 2 - SCENE.plot.soilInset - 0.12;

  const positions = [];

  for (let index = 1; index < count; index += 1) {
    const [edge] = bandBounds(index, { width: plotWidth, headCount: count });
    for (let z = zStart; z < zEnd; z += DASH + GAP) {
      const zTo = Math.min(z + DASH, zEnd);
      positions.push(edge, ridgeHeight(edge, z) + LIFT, z);
      positions.push(edge, ridgeHeight(edge, zTo) + LIFT, zTo);
    }
  }

  if (positions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(LINE_COLOR),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.name = 'zone-band-lines';
    lines.renderOrder = 2;
    group.add(lines);
  }

  return { group };
}
