/**
 * Đầu phun KIỂU CỐ ĐỊNH (như ảnh mẫu): một ống đen nhỏ cắm trong rãnh giữa,
 * cao ~0,2 m, KHÔNG thò/thụt. Nước phun ra từ miệng vòi thấp và toả thành quạt
 * RẤT RỘNG (bán kính tới sát mép dải khu) — phần tia nước do `Spray.js` dựng.
 *
 * Vì vòi đứng yên, trạng thái mở/đóng chỉ thể hiện bằng vòng sáng ở miệng vòi
 * và lưu lượng (cường độ quạt nước) — không có animation trồi lên.
 *
 * Chỉ đọc dữ liệu qua tham số truyền vào — không gọi store/API.
 */

import * as THREE from 'three';
import { SCENE } from '../config.js';
import { ridgeHeight } from './Soil.js';

const BODY_COLOR = '#272d2a';
const TRIM_COLOR = '#3f4843';
const GLOW_COLOR = '#7cc6ff';

export function createSprinklers(heads) {
  const group = new THREE.Group();
  group.name = 'sprinklers';

  const riserHeight = SCENE.sprinklers.riserHeight ?? 0.2;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(BODY_COLOR),
    roughness: 0.55,
    metalness: 0.3,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(TRIM_COLOR),
    roughness: 0.42,
    metalness: 0.55,
  });
  const bareSoilMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3a2a1e'),
    roughness: 0.98,
    metalness: 0,
  });

  const tubeGeometry = new THREE.CylinderGeometry(0.032, 0.038, riserHeight, 10);
  tubeGeometry.translate(0, riserHeight / 2, 0);
  const headGeometry = new THREE.CylinderGeometry(0.045, 0.038, 0.055, 12);
  const collarGeometry = new THREE.CircleGeometry(0.17, 24);
  const glowGeometry = new THREE.TorusGeometry(0.042, 0.009, 6, 18);

  const units = heads.map((head, index) => {
    const groundY = ridgeHeight(head.x, head.z);
    const unitGroup = new THREE.Group();
    unitGroup.position.set(head.x, groundY, head.z);

    // Vòng đất trống quanh gốc vòi (cây đã được dọn quanh đây).
    const collar = new THREE.Mesh(collarGeometry, bareSoilMaterial);
    collar.rotation.x = -Math.PI / 2;
    collar.position.y = 0.004;
    collar.receiveShadow = true;
    unitGroup.add(collar);

    // Ống đen cắm vào đất, cao cố định.
    const tube = new THREE.Mesh(tubeGeometry, bodyMaterial);
    tube.castShadow = true;
    unitGroup.add(tube);

    // Đầu vòi (miệng phun).
    const nozzle = new THREE.Mesh(headGeometry, trimMaterial);
    nozzle.position.y = riserHeight;
    nozzle.castShadow = true;
    unitGroup.add(nozzle);

    // Vòng sáng xanh ở miệng vòi — chỉ hiện khi vòi đang phun.
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(GLOW_COLOR),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = riserHeight + 0.03;
    glow.renderOrder = 4;
    unitGroup.add(glow);

    group.add(unitGroup);

    return {
      index,
      head,
      groundY,
      /** Cao độ miệng vòi trong toạ độ nhóm thửa. */
      nozzleY: groundY + riserHeight + 0.03,
      group: unitGroup,
      glow,
      open: false,
      openAmount: 0,
      flow: 0,
      flowTarget: 0,
    };
  });

  /** Trạng thái đích từng vòi (khu nào được cấp nước + lưu lượng). */
  function setTargets({ open = [], pumpOn = true, flows = [] }) {
    for (const unit of units) {
      unit.open = Boolean(pumpOn) && Boolean(open[unit.index]);
      unit.flowTarget = unit.open ? Math.max(0, flows[unit.index] ?? 0) : 0;
    }
  }

  function snapToTargets() {
    for (const unit of units) {
      unit.openAmount = unit.open ? 1 : 0;
      unit.flow = unit.flowTarget;
      applyUnit(unit);
    }
  }

  function applyUnit(unit) {
    unit.glow.material.opacity = unit.openAmount * 0.8;
    unit.glow.scale.setScalar(0.9 + unit.openAmount * 0.3);
  }

  function update(delta) {
    const lerp = Math.min(1, delta * 9);
    for (const unit of units) {
      unit.openAmount += ((unit.open ? 1 : 0) - unit.openAmount) * lerp;
      unit.flow += (unit.flowTarget - unit.flow) * Math.min(1, delta * 4);
      applyUnit(unit);
    }
  }

  return {
    group,
    heads,
    units,
    setTargets,
    snapToTargets,
    update,
    /** Điểm miệng vòi (toạ độ nhóm thửa) để Spray bám đúng gốc tia. */
    get nozzles() {
      return units.map((unit) => ({
        x: unit.head.x,
        y: unit.nozzleY,
        z: unit.head.z,
        open: unit.openAmount,
        flow: unit.flow,
      }));
    },
    /** Lưu lượng hiển thị của từng đầu (L). */
    get flows() {
      return units.map((unit) => unit.flow);
    },
  };
}
