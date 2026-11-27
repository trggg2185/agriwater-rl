import { SCENE } from '../config.js';
import { moistureColor } from '../utils/colors.js';
import { fieldIrrigationStatus } from '../utils/irrigationZones.js';
import { clamp } from '../utils/math.js';
import { cropGrowth, drawField, drawGroundGrid, fieldBounds, plantCenters, projectField } from './FieldArtwork2D.js';
import { boundView, HOME_VIEW, interpolateView, projectView, zoomView } from './FieldCamera2D.js';
import { drawSpray, sprayTargets } from './IrrigationSpray2D.js';

const POINTS = [[1.9, 2.3], [4.9, 2.3], [8, 2.3], [1.9, 6.8], [4.9, 6.8], [8, 6.8]]
  .map(([col, row]) => projectField(col, row));

export function createFieldScene(root, store) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const water = document.createElement('canvas');
  water.className = 'field-spray';
  const waterCtx = water.getContext('2d');
  root.append(canvas, water);

  const listeners = new Set();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let view = HOME_VIEW;
  let goal = HOME_VIEW;
  let animation = 0;
  let lastFrame = 0;
  let sprayAnimation = 0;
  let drag = null;
  let points = [];
  let state = store.getState();
  let crop;
  let heat;
  let flows = [];
  let targets = [];
  let age;
  let wilt;
  let targetAge = 0;
  let targetWilt = 0;

  function transform() {
    return projectView(view, width, height);
  }

  function withinField(candidate) {
    return boundView(candidate, width, height, fieldBounds);
  }

  function draw() {
    if (!width || !height) return;
    const { scale, left, top } = transform();
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(left, top);
    ctx.scale(scale, scale);
    drawGroundGrid(ctx, {
      minX: -left / scale, maxX: (width - left) / scale,
      minY: -top / scale, maxY: (height - top) / scale, scale,
    });
    drawField(ctx, { crop, age, wilt, heat, watering: flows.some(Boolean) });
    ctx.restore();

    points = POINTS.map(([localX, localY], index) => {
      const x = left + localX * scale;
      const y = top + localY * scale;
      return {
        id: `head-${index}`, label: `Vòi phun ${index + 1}`,
        x: x / width, y: y / height,
        visible: x > 12 && x < width - 12 && y > 12 && y < height - 12,
      };
    });
    for (const listener of listeners) listener(points);
    syncSpray();
  }

  function renderSpray(time) {
    sprayAnimation = 0;
    waterCtx.clearRect(0, 0, width, height);
    if (!width || !height || !flows.some(Boolean)) return;
    const { scale, left, top } = transform();
    waterCtx.save();
    waterCtx.translate(left, top);
    waterCtx.scale(scale, scale);
    drawSpray(waterCtx, POINTS, targets, flows, time, motion.matches);
    waterCtx.restore();
    if (!motion.matches) sprayAnimation = requestAnimationFrame(renderSpray);
  }

  function syncSpray() {
    if (!sprayAnimation) renderSpray(performance.now());
  }

  function resize() {
    ({ width, height } = root.getBoundingClientRect());
    goal = withinField(goal);
    view = withinField(view);
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    water.width = canvas.width;
    water.height = canvas.height;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    waterCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function approach(current, target) {
    return motion.matches || Math.abs(current - target) < .012
      ? target : current + (target - current) * .28;
  }

  function renderFrame(time) {
    const elapsed = lastFrame ? time - lastFrame : 16;
    lastFrame = time;
    const settled = Math.abs(view.zoom - goal.zoom) < .001
      && Math.hypot(view.x - goal.x, view.y - goal.y) < .15;
    const weight = settled || motion.matches ? 1 : 1 - Math.exp(-elapsed / 43);
    view = withinField(interpolateView(view, goal, weight));
    age = approach(age, targetAge);
    wilt = approach(wilt, targetWilt);
    draw();
    animation = weight === 1 && age === targetAge && wilt === targetWilt
      ? 0 : requestAnimationFrame(renderFrame);
    if (!animation) lastFrame = 0;
  }

  function scheduleDraw() {
    if (!animation) animation = requestAnimationFrame(renderFrame);
  }

  function moveCamera(x, y) {
    goal = withinField({ ...goal, x, y });
    scheduleDraw();
  }

  function startDrag(event) {
    if ((!state.handMode && event.pointerType !== 'mouse') || !event.isPrimary || event.button !== 0) return;
    goal = view;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    root.setPointerCapture(event.pointerId);
    root.classList.add('is-dragging');
  }

  function moveDrag(event) {
    if (event.pointerId !== drag?.id) return;
    const { scale } = transform();
    if (!scale) return;
    moveCamera(goal.x - (event.clientX - drag.x) / scale, goal.y - (event.clientY - drag.y) / scale);
    drag.x = event.clientX;
    drag.y = event.clientY;
  }

  function endDrag(event) {
    if (event.pointerId !== drag?.id) return;
    drag = null;
    root.classList.remove('is-dragging');
  }

  function reset() {
    goal = withinField(HOME_VIEW);
    scheduleDraw();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  const controller = new AbortController();
  const options = { signal: controller.signal };
  root.addEventListener('pointerdown', startDrag, options);
  root.addEventListener('pointermove', moveDrag, options);
  root.addEventListener('lostpointercapture', endDrag, options);
  root.addEventListener('wheel', (event) => {
    if (drag || !event.deltaY) return;
    event.preventDefault();
    const box = root.getBoundingClientRect();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    const delta = clamp(event.deltaY * units, -200, 200);
    zoomBy(Math.exp(delta * .0025), event.clientX - box.left, event.clientY - box.top);
  }, { ...options, passive: false });
  root.addEventListener('keydown', (event) => {
    const move = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    }[event.key];
    if (event.key === 'Escape') reset();
    else if (move) moveCamera(goal.x + move[0] * 28, goal.y + move[1] * 28);
    else return;
    event.preventDefault();
  }, options);

  const unsubscribe = store.subscribe((next) => {
    state = next;
    const nextCrop = state.meta.crops.find(({ code }) => code === state.crop)?.key ?? 'rice';
    const record = state.series[state.day - 1];
    if (record) {
      const growth = cropGrowth(record, state);
      targetAge = growth.age;
      targetWilt = growth.wilt;
    }
    if (crop !== nextCrop) {
      crop = nextCrop;
      age = targetAge;
      wilt = targetWilt;
    }
    const irrigation = fieldIrrigationStatus(state, SCENE.sprinklers.headCount);
    if (irrigation.flows.some((flow, index) => Boolean(flow) !== Boolean(flows[index]))) {
      targets = sprayTargets(plantCenters, POINTS, irrigation.flows);
    }
    flows = irrigation.flows;
    heat = state.heatmap ? irrigation.moisture.map(moistureColor) : null;
    root.classList.toggle('is-pannable', Boolean(state.handMode));
    scheduleDraw();
  });
  resize();

  function zoomBy(factor, x = width / 2, y = height / 2) {
    const zoom = clamp(goal.zoom / factor, .8, 2.2);
    if (zoom === goal.zoom) return;
    goal = withinField(zoomView(view, zoom, x, y, width, height));
    scheduleDraw();
  }

  return {
    zoomBy,
    reset,
    onDevices(listener) {
      listeners.add(listener);
      listener(points);
      return () => listeners.delete(listener);
    },
    dispose() {
      cancelAnimationFrame(animation);
      cancelAnimationFrame(sprayAnimation);
      controller.abort();
      unsubscribe();
      resizeObserver.disconnect();
      canvas.remove();
      water.remove();
    },
  };
}
