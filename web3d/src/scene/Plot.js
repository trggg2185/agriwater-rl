/**
 * Thửa chính: khay mint bo mép có vát cạnh, viền dày bao quanh lòng đất,
 * trạm bơm bên trái và điểm neo cho bong bóng nhãn.
 *
 * Đầu phun KHÔNG còn ở 4 góc: chúng nằm trên trục dọc giữa thửa (xem
 * utils/irrigationZones.js) và do Sprinklers dựng; ở đây chỉ nhận danh sách
 * `heads` để dựng điểm neo thiết bị cho UI.
 */

import * as THREE from 'three';
import { SCENE } from '../config.js';
import { ridgeHeight } from './Soil.js';

const TRAY_COLOR = new THREE.Color('#cfdcd4');

function roundedRect(shape, x, y, width, height, radius) {
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function extract(shape, depth, bevel) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function createPlot({ heads = [] } = {}) {
  const { width, depth, rimThickness } = SCENE.plot;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const baseHeight = 0.28;
  const rimHeight = 0.36;
  const radius = 0.55;

  const group = new THREE.Group();
  group.name = 'plot';
  // Nâng hẳn khỏi mặt sân: đáy khay (đã tính cả vát) phải cao hơn mặt sân,
  // nếu không hai mặt gần đồng phẳng sẽ nhấp nháy khi xoay camera.
  group.position.y = SCENE.grid.thickness + 0.08;

  const trayMaterial = new THREE.MeshStandardMaterial({
    color: TRAY_COLOR.clone(),
    roughness: 0.46,
    metalness: 0.06,
  });

  const inset = rimThickness;
  const holeShape = () =>
    roundedRect(
      new THREE.Path(),
      -halfWidth + inset,
      -halfDepth + inset,
      width - inset * 2,
      depth - inset * 2,
      Math.max(0.12, radius - inset * 0.7),
    );

  // Thành khay dưới (vành khuyên, CÓ LỖ ở giữa): nếu đáy là tấm đặc thì mặt
  // trắng của nó nằm sát mặt đất, đúng chỗ luống lõm xuống → nhấp nháy trắng/nâu.
  const baseShape = roundedRect(
    new THREE.Shape(),
    -halfWidth,
    -halfDepth,
    width,
    depth,
    radius,
  );
  baseShape.holes.push(holeShape());
  const base = new THREE.Mesh(extract(baseShape, baseHeight, 0.05), trayMaterial);
  base.castShadow = true;
  base.receiveShadow = true;

  // Viền khay (khung có lỗ ở giữa)
  const rimShape = roundedRect(
    new THREE.Shape(),
    -halfWidth,
    -halfDepth,
    width,
    depth,
    radius,
  );
  rimShape.holes.push(holeShape());

  const rim = new THREE.Mesh(extract(rimShape, rimHeight, 0.04), trayMaterial);
  rim.position.y = baseHeight;
  rim.castShadow = true;
  rim.receiveShadow = true;

  group.add(base, rim);

  // Thanh ray tối mảnh trên mặt sân, dọc mép trái khay (như ảnh tham chiếu)
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.055, depth + 0.4),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#2b312e'),
      roughness: 0.5,
      metalness: 0.35,
    }),
  );
  rail.position.set(-halfWidth - 0.5, 0.06, 0);
  rail.castShadow = true;
  rail.receiveShadow = true;
  group.add(rail);

  // Điểm neo của bong bóng nhãn (góc trước-trái của thửa)
  const anchorLocal = new THREE.Vector3(
    -halfWidth - 0.05,
    baseHeight + rimHeight + 0.06,
    halfDepth * 0.52,
  );

  const anchorRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.045, 8, 24),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#dfeae4'),
      roughness: 0.35,
      metalness: 0.2,
      emissive: new THREE.Color('#cfdcd4'),
      emissiveIntensity: 0.25,
    }),
  );
  anchorRing.rotation.x = -Math.PI / 2;
  anchorRing.position.copy(anchorLocal);
  group.add(anchorRing);

  const anchorDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 8),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffffff'),
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.6,
      roughness: 0.3,
    }),
  );
  anchorDot.position.copy(anchorLocal).setY(anchorLocal.y + 0.03);
  group.add(anchorDot);

  const anchorWorld = anchorLocal.clone().add(group.position);

  // ---------- Trạm bơm nhỏ bên trái thửa ----------
  const pumpGroup = new THREE.Group();
  pumpGroup.name = 'pump';
  pumpGroup.position.set(-halfWidth - 1.5, 0, 0.75);

  const pumpBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.52, 0.5),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#48524d'),
      roughness: 0.62,
      metalness: 0.35,
    }),
  );
  pumpBody.position.y = 0.26;
  pumpBody.castShadow = true;
  pumpBody.receiveShadow = true;

  const pumpCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.18, 14),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#7d8983'),
      roughness: 0.45,
      metalness: 0.6,
    }),
  );
  pumpCap.position.y = 0.61;
  pumpCap.castShadow = true;

  // Tay van xoay khi bơm chạy
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.028, 8, 18),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#b6473a'),
      roughness: 0.5,
      metalness: 0.2,
    }),
  );
  wheel.position.set(0.33, 0.3, 0);
  wheel.rotation.y = Math.PI / 2;
  wheel.castShadow = true;

  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 10, 8),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#2fb344'),
      emissive: new THREE.Color('#2fb344'),
      emissiveIntensity: 1.4,
      roughness: 0.3,
    }),
  );
  led.position.set(0.18, 0.44, 0.27);

  // Ống dẫn từ bơm vào mép khay
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#6d7873'),
      roughness: 0.4,
      metalness: 0.5,
    }),
  );
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0.72, 0.2, 0);
  pipe.castShadow = true;

  pumpGroup.add(pumpBody, pumpCap, wheel, led, pipe);
  group.add(pumpGroup);

  function setPump(on) {
    const running = Boolean(on);
    led.material.color.set(running ? '#2fb344' : '#6b7570');
    led.material.emissive.set(running ? '#2fb344' : '#000000');
    led.material.emissiveIntensity = running ? 1.5 : 0;
  }

  function update(delta, on) {
    if (on) wheel.rotation.x += delta * 2.4;
  }

  // Điểm ra của ống chính từ trạm bơm (toạ độ cục bộ của nhóm thửa).
  const pumpOutlet = new THREE.Vector3(
    pumpGroup.position.x + 1.24,
    pumpGroup.position.y + 0.2,
    pumpGroup.position.z,
  );

  // Điểm để UI gắn nút điều khiển vào đúng vật thể 3D (toạ độ thế giới).
  const devices = [
    {
      id: 'pump',
      label: 'Bơm',
      position: pumpGroup.position.clone().add(new THREE.Vector3(0, 0.72, 0)).add(group.position),
    },
    ...heads.map((head, index) => ({
      id: `head-${index}`,
      label: `Vòi ${index + 1}`,
      position: new THREE.Vector3(
        head.x,
        ridgeHeight(head.x, head.z) + 0.16,
        head.z,
      ).add(group.position),
    })),
  ];

  return {
    group,
    anchorWorld,
    anchorLocal,
    heads,
    pumpOutlet,
    trayMaterial,
    base,
    rim,
    devices,
    setPump,
    update,
  };
}
