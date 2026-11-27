/** Thiết bị cố định của thửa canh tác và vị trí ghim điều khiển. */
import * as THREE from 'three';
import { SCENE } from '../config.js';
import { ridgeHeight } from './Soil.js';

export function createPlot({ heads = [] } = {}) {
  const halfWidth = SCENE.plot.width / 2;
  const group = new THREE.Group();
  group.name = 'plot';

  // ---------- Trạm bơm nhỏ bên trái thửa ----------
  const pumpGroup = new THREE.Group();
  pumpGroup.name = 'pump';
  pumpGroup.position.set(-halfWidth - 1.4, 0.18, 0.75);

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

  // Ống dẫn từ bơm đến luống cây
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
    heads,
    pumpOutlet,
    devices,
    setPump,
    update,
  };
}
