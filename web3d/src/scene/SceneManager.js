/**
 * SceneManager: renderer, camera isometric, OrbitControls, ánh sáng, vòng lặp
 * render duy nhất và phép chiếu thiết bị 3D lên khung mô phỏng.
 *
 * Chỉ ĐỌC store. Không gọi API, không sửa dữ liệu mô phỏng.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SCENE } from '../config.js';
import { createCrops } from './Crops.js';
import { createFieldTerrain } from './FieldTerrain.js';
import { createPlot } from './Plot.js';
import { createSoil } from './Soil.js';
import { createSpray } from './Spray.js';
import { createSprinklers } from './Sprinklers.js';
import { createWaterPipes } from './WaterPipes.js';
import { createWeatherFX } from './WeatherFX.js';
import { createZoneBands } from './ZoneBands.js';
import { clampHeadCount, headPositions, irrigationStatus } from '../utils/irrigationZones.js';

const DEG = THREE.MathUtils.degToRad;

export function createSceneManager(container, store) {
  const getWidth = () => Math.max(1, container.clientWidth || window.innerWidth);
  const getHeight = () => Math.max(1, container.clientHeight || window.innerHeight);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(getWidth(), getHeight(), false);
  renderer.shadowMap.autoUpdate = true;
  renderer.setClearAlpha(0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.debug.checkShaderErrors = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SCENE.fog.color, SCENE.fog.near, SCENE.fog.far);

  // ---------- Camera ----------
  const target = new THREE.Vector3(
    SCENE.camera.shiftX,
    SCENE.camera.shiftY,
    SCENE.camera.shiftZ,
  );
  const baseDistance = SCENE.plot.width * SCENE.camera.distanceFactor;

  const camera = new THREE.PerspectiveCamera(
    SCENE.camera.fov,
    getWidth() / getHeight(),
    1,
    260,
  );

  const polar = DEG(SCENE.camera.polar);
  const azimuth = DEG(SCENE.camera.azimuth);
  const offset = new THREE.Vector3(
    Math.sin(polar) * Math.sin(azimuth),
    Math.cos(polar),
    Math.sin(polar) * Math.cos(azimuth),
  ).multiplyScalar(baseDistance);

  camera.position.copy(target).add(offset);
  camera.lookAt(target);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.screenSpacePanning = true;
  // Camera luôn di chuyển được: chuột trái xoay, chuột phải (hoặc nút bàn
  // tay) kéo dịch cả cảnh — không còn khoá cứng ở một vị trí.
  controls.enablePan = true;
  controls.enableRotate = true;
  controls.minDistance = baseDistance * SCENE.camera.minDistanceFactor;
  controls.maxDistance = baseDistance * SCENE.camera.maxDistanceFactor;
  controls.minPolarAngle = DEG(SCENE.camera.polarRange[0]);
  controls.maxPolarAngle = DEG(SCENE.camera.polarRange[1]);
  // azimuthRange >= 180 = xoay tự do: khi đó KHÔNG đặt giới hạn, nếu đặt
  // [-180, 180] quanh góc hiện tại thì OrbitControls sẽ kẹp camera sang phía
  // đối diện và thửa ruộng bị đẩy xuống góc phải màn hình.
  const freeAzimuth = SCENE.camera.azimuthRange >= 179;
  controls.minAzimuthAngle = freeAzimuth
    ? -Infinity
    : azimuth - DEG(SCENE.camera.azimuthRange);
  controls.maxAzimuthAngle = freeAzimuth ? Infinity : azimuth + DEG(SCENE.camera.azimuthRange);
  controls.update();

  // Giữ tâm xoay bám sát thửa: chặn kéo xa khỏi vị trí gốc.
  const homeTarget = controls.target.clone();
  const panRadius = SCENE.camera.panRadius;

  function clampTarget() {
    const delta = controls.target.clone().sub(homeTarget);
    const distance = delta.length();
    if (distance <= panRadius) return;
    const clamped = delta.multiplyScalar(panRadius / distance);
    const correction = clamped.sub(controls.target.clone().sub(homeTarget));
    controls.target.copy(homeTarget).add(clamped);
    camera.position.add(correction);
    controls.update();
  }

  // ---------- Đèn ----------
  const light = SCENE.light;
  const hemi = new THREE.HemisphereLight(light.hemiSky, light.hemiGround, light.hemiIntensity);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(light.sunColor, light.sunIntensity);
  sun.position.set(...light.sunPosition);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(light.shadowMapSize, light.shadowMapSize);
  sun.shadow.camera.left = -light.shadowRadius;
  sun.shadow.camera.right = light.shadowRadius;
  sun.shadow.camera.top = light.shadowRadius;
  sun.shadow.camera.bottom = -light.shadowRadius;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.045;
  sun.shadow.radius = 2.2;
  sun.shadow.intensity = 0.66;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(light.fillColor, light.fillIntensity);
  fill.position.set(...light.fillPosition);
  scene.add(fill);

  // ---------- Nội dung scene ----------
  // Đầu phun nằm trên trục dọc giữa thửa, cách đều: đầu giữa trùng tâm khi số
  // đầu là lẻ. Số đầu đọc từ config, không hard-code 4 nữa.
  const headCount = clampHeadCount(SCENE.sprinklers.headCount);
  const heads = headPositions({
    width: SCENE.plot.width,
    depth: SCENE.plot.depth,
    headCount,
  });

  const terrain = createFieldTerrain();
  const plot = createPlot({ heads });
  const soil = createSoil();
  const crops = createCrops({ heads });
  const sprinklers = createSprinklers(heads);
  const bands = createZoneBands({ headCount });
  const pipes = SCENE.sprinklers.pipes
    ? createWaterPipes({
        heads,
        width: SCENE.plot.width,
        depth: SCENE.plot.depth,
        pumpOutlet: plot.pumpOutlet,
      })
    : null;
  const spray = createSpray({
    heads: sprinklers.units.map((unit) => ({
      x: unit.head.x,
      y: unit.nozzleY,
      z: unit.head.z,
    })),
    width: SCENE.plot.width,
    depth: SCENE.plot.depth,
  });
  const weather = createWeatherFX();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  plot.group.add(terrain.group, soil.group, bands.group, crops.group, sprinklers.group, spray.group);
  if (pipes) plot.group.add(pipes.group);
  scene.add(plot.group, weather.group);

  let latestState = store.getState();

  // ---------- Điểm neo thiết bị ----------
  const deviceListeners = new Set();
  const projectedDevice = new THREE.Vector3();
  let lastDevices = [];

  function projectDevices() {
    let changed = lastDevices.length !== plot.devices.length;
    const next = plot.devices.map((device, index) => {
      projectedDevice.copy(device.position).project(camera);
      const point = {
        id: device.id,
        label: device.label,
        x: (projectedDevice.x + 1) / 2,
        y: (1 - projectedDevice.y) / 2,
        visible: Math.abs(projectedDevice.x) < 1 && Math.abs(projectedDevice.y) < 1 && projectedDevice.z < 1,
      };
      const previous = lastDevices[index];
      if (
        !previous ||
        Math.abs(previous.x - point.x) > 0.0015 ||
        Math.abs(previous.y - point.y) > 0.0015 ||
        previous.visible !== point.visible
      ) {
        changed = true;
      }
      return point;
    });
    if (!changed) return;
    lastDevices = next;
    for (const listener of deviceListeners) listener(next);
  }

  // ---------- Zoom theo store ----------
  function currentDistance() {
    return camera.position.distanceTo(controls.target);
  }

  let zoomTarget = null;
  controls.addEventListener('start', () => { zoomTarget = null; });

  function zoomBy(factor) {
    zoomTarget = THREE.MathUtils.clamp(
      (zoomTarget ?? currentDistance()) * factor,
      controls.minDistance,
      controls.maxDistance,
    );
  }

  function updateZoom(delta) {
    if (zoomTarget == null) return;
    const current = currentDistance();
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-delta * 13);
    const distance = THREE.MathUtils.lerp(current, zoomTarget, blend);
    const settled = Math.abs(zoomTarget - distance) < 0.025;
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, settled ? zoomTarget : distance);
    if (settled) zoomTarget = null;
  }

  // ---------- Đồng bộ store → scene ----------
  const unsubscribe = store.subscribe((state) => {
    latestState = state;
    terrain.setCrop(state.crop);
    crops.setCrop(state.crop);
    const record = state.series?.[Math.min(state.day, state.series.length) - 1];
    soil.setMoisture(record ? record.moisture : 0.45);
    soil.setHeatmap(Boolean(state.heatmap));

    const zones = irrigationStatus(state, headCount);
    plot.setPump(zones.pumpOn);
    sprinklers.setTargets({
      open: zones.openMask,
      pumpOn: zones.pumpOn,
      flows: zones.flows,
    });
    spray.setCapacity(zones.maxLiters / headCount);
    if (pipes) pipes.setFlow(zones.openMask, zones.pumpOn);
    soil.setZoneHeat(
      state.zoneMode === 'uniform'
        ? zones.moisture.map(() => zones.mean)
        : zones.moisture,
    );

    const hand = Boolean(state.handMode);
    controls.mouseButtons = hand
      ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = hand
      ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
      : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  });

  // ---------- Vòng lặp ----------
  const clock = new THREE.Clock();
  const elapsedTotal = () => clock.elapsedTime;
  let frameId = 0;
  let fps = 0;
  let frames = 0;
  let elapsed = 0;

  function animate() {
    frameId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    elapsed += delta;

    updateZoom(delta);
    controls.update();
    clampTarget();
    projectDevices();
    plot.update(delta, latestState.pumpOn !== false);
    const seconds = elapsedTotal();
    const record =
      latestState.series?.[Math.min(latestState.day, latestState.series.length) - 1];

    const motionTime = reducedMotion.matches ? 0 : seconds;
    crops.advanceTime(motionTime);
    crops.update(delta, latestState);

    sprinklers.update(delta);
    spray.setNozzles(sprinklers.nozzles);
    spray.update(delta);
    if (pipes) pipes.update(delta);

    weather.advanceTime(motionTime);
    const atmosphere = weather.update(delta, record, latestState.weatherPreview);
    sun.intensity = atmosphere.sunIntensity;
    hemi.intensity = atmosphere.hemiIntensity;
    scene.fog.near = atmosphere.fogNear;
    scene.fog.far = atmosphere.fogFar;

    renderer.render(scene, camera);

    frames += 1;
    if (elapsed >= 0.5) {
      fps = Math.round(frames / elapsed);
      frames = 0;
      elapsed = 0;
      updateDebug();

      // Hạ chất lượng một lần nếu máy không giữ được 50 FPS.
      if (fps < 50 && pixelRatioCap > 1.25) {
        pixelRatioCap = 1.25;
        resize();
      }
    }
  }

  // ---------- Debug overlay (ẩn, bật bằng phím D) ----------
  const debug = document.createElement('div');
  debug.style.cssText = [
    'position:fixed',
    'right:10px',
    'bottom:10px',
    'z-index:60',
    'padding:8px 10px',
    'border-radius:8px',
    'background:rgba(12,16,14,.82)',
    'color:#d7e3dd',
    'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
    'white-space:pre',
    'pointer-events:none',
    'display:none',
  ].join(';');
  container.appendChild(debug);

  function updateDebug() {
    if (debug.style.display === 'none') return;
    const info = renderer.info;
    debug.textContent = [
      `FPS      ${fps}`,
      `objects  ${info.render.calls} calls / ${scene.children.length} roots`,
      `triangles ${info.render.triangles.toLocaleString('vi-VN')}`,
      `canvas   ${renderer.domElement.width}×${renderer.domElement.height} (css ${getWidth()}×${getHeight()})`,
      `camera   d=${currentDistance().toFixed(1)} polar=${THREE.MathUtils.radToDeg(controls.getPolarAngle()).toFixed(0)}°`,
    ].join('\n');
  }

  function onKeyDown(event) {
    if (event.key === 'd' || event.key === 'D') {
      const hidden = debug.style.display === 'none';
      debug.style.display = hidden ? 'block' : 'none';
      updateDebug();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  // ---------- Resize ----------
  let pixelRatioCap = 2;

  function resize() {
    const width = getWidth();
    const height = getHeight();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.zoom = Math.min(1, camera.aspect / 1.42);
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  window.addEventListener('resize', resize);
  resize();
  animate();

  return {
    scene,
    camera,
    renderer,
    controls,
    plot,
    soil,
    crops,
    heads,
    sprinklers,
    pipes,
    bands,
    zoomBy,
    onDevices(listener) {
      deviceListeners.add(listener);
      listener(lastDevices);
      return () => deviceListeners.delete(listener);
    },
    dispose() {
      cancelAnimationFrame(frameId);
      unsubscribe();
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      debug.remove();
    },
  };
}
