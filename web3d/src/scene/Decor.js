/**
 * Trang trí nền: cụm nhà kho + silo + ống ở góc trái trên, cây tròn tối và
 * trụ đèn rải quanh thửa. Tất cả dựng thủ tục bằng hình khối cơ bản.
 */

import * as THREE from 'three';
import { SCENE } from '../config.js';

function createBarn() {
  const group = new THREE.Group();

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5c6460'),
    roughness: 0.85,
    metalness: 0.05,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3f4744'),
    roughness: 0.9,
    metalness: 0.05,
  });
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8e9791'),
    roughness: 0.55,
    metalness: 0.5,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 2.8), wallMaterial);
  body.position.y = 1.1;
  body.castShadow = true;
  body.receiveShadow = true;

  const roofA = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.16, 3.0), roofMaterial);
  roofA.position.set(-0.92, 2.62, 0);
  roofA.rotation.z = THREE.MathUtils.degToRad(-26);
  roofA.castShadow = true;

  const roofB = roofA.clone();
  roofB.position.x = 0.92;
  roofB.rotation.z = THREE.MathUtils.degToRad(26);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 1.5, 1.1),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e3533'), roughness: 0.9 }),
  );
  door.position.set(1.82, 0.75, 0);

  group.add(body, roofA, roofB, door);

  const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 3.2, 20), metalMaterial);
  silo.position.set(2.9, 1.6, -0.7);
  silo.castShadow = true;
  silo.receiveShadow = true;

  const siloTop = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.7, 20), roofMaterial);
  siloTop.position.set(2.9, 3.55, -0.7);
  siloTop.castShadow = true;

  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.2, 12), metalMaterial);
  pipe.position.set(-2.3, 1.0, 1.5);
  pipe.rotation.z = THREE.MathUtils.degToRad(18);
  pipe.castShadow = true;

  const pipeTop = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 12), metalMaterial);
  pipeTop.position.set(-2.86, 2.35, 1.5);
  pipeTop.rotation.z = THREE.MathUtils.degToRad(88);
  pipeTop.castShadow = true;

  group.add(silo, siloTop, pipe, pipeTop);
  return group;
}

function createTree(scale = 1) {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1 * scale, 0.14 * scale, 0.9 * scale, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#3b3128'), roughness: 1 }),
  );
  trunk.position.y = 0.45 * scale;
  trunk.castShadow = true;

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.95 * scale, 14, 12),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f4034'), roughness: 0.95 }),
  );
  canopy.scale.set(1, 0.86, 1);
  canopy.position.y = 1.35 * scale;
  canopy.castShadow = true;
  canopy.receiveShadow = true;

  group.add(trunk, canopy);
  return group;
}

function createLamp() {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#39413e'),
      roughness: 0.6,
      metalness: 0.4,
    }),
  );
  pole.position.y = 1.2;
  pole.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 10),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e8e3cf'),
      emissive: new THREE.Color('#f4e9c9'),
      emissiveIntensity: 0.9,
      roughness: 0.4,
    }),
  );
  head.position.y = 2.42;

  group.add(pole, head);
  return group;
}

export function createDecor() {
  const group = new THREE.Group();
  group.name = 'decor';
  const baseY = SCENE.grid.thickness;

  // Vị trí đặt theo đúng khung thửa hiện tại (SCENE.plot): mọi thứ nằm NGOÀI
  // lòng thửa nhưng vẫn trong vùng camera nhìn thấy, không bị panel che.
  const edgeX = SCENE.plot.width / 2;
  const edgeZ = SCENE.plot.depth / 2;

  // Nhà kho đứng TÁCH HẲN khỏi khay: xoay trước, đo hộp bao thật rồi đẩy ra
  // xa sao cho cạnh gần nhất của cả cụm (kể cả silo) cách mép thửa ≥ 0,9 m.
  const barn = createBarn();
  barn.rotation.y = THREE.MathUtils.degToRad(14);
  const barnBounds = new THREE.Box3().setFromObject(barn);
  const barnCenter = barnBounds.getCenter(new THREE.Vector3());
  const BARN_GAP = 0.9;
  barn.position.set(
    -edgeX - BARN_GAP - barnBounds.max.x,
    baseY,
    -edgeZ + 1.2 - barnCenter.z,
  );
  group.add(barn);

  const treeSpots = [
    [-9, -1, 0.72],
    [-7.5, 1, 0.64],
    [-4, -8, 0.7],
    [0, -7.5, 0.66],
    [2.5, -8.5, 0.62],
    [7, 1, 0.68],
  ].filter(([x, z]) => Math.abs(x) > edgeX || Math.abs(z) > edgeZ);
  for (const [x, z, scale] of treeSpots) {
    const tree = createTree(scale);
    tree.position.set(x, baseY, z);
    tree.rotation.y = (x * 1.7 + z) % Math.PI;
    group.add(tree);
  }

  // Cụm cây bụi tối sát mép trái thửa (như ảnh tham chiếu)
  const shrubMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2e3c33'),
    roughness: 0.95,
  });
  const shrubSpots = [
    [-edgeX - 0.5, 2.2, 0.3],
    [-edgeX - 0.95, 2.9, 0.22],
    [-edgeX - 0.32, 1.4, 0.18],
    [-edgeX - 0.25, -3.6, 0.24],
  ];
  for (const [x, z, radius] of shrubSpots) {
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 10), shrubMaterial);
    shrub.position.set(x, baseY + radius * 0.75, z);
    shrub.scale.set(1, 0.85, 1);
    shrub.castShadow = true;
    group.add(shrub);
  }

  const lampSpots = [
    [-edgeX - 0.8, -2.0],
    [edgeX + 0.6, 1.2],
    [-2.0, -edgeZ - 2.5],
  ];
  for (const [x, z] of lampSpots) {
    const lamp = createLamp();
    lamp.position.set(x, baseY, z);
    group.add(lamp);
  }

  return { group };
}
