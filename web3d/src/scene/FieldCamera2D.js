import { clamp } from '../utils/math.js';

export const HOME_VIEW = { x: 0, y: 0, zoom: 1 };

export function projectView(view, width, height) {
  const scale = Math.min(width / 804, height / 490) * view.zoom;
  return { scale, left: width / 2 - view.x * scale, top: height * .565 - view.y * scale };
}

function limitAxis(position, before, after, worldMin, worldMax) {
  const low = worldMin + before;
  const high = worldMax - after;
  // Nếu vừa khung, giữ trọn ruộng. Khi phóng lớn, chỉ cho xem bên trong biên ruộng.
  return clamp(position, Math.min(low, high), Math.max(low, high));
}

export function boundView(view, width, height, bounds) {
  const { scale } = projectView(view, width, height);
  if (!scale) return view;
  return {
    zoom: view.zoom,
    x: limitAxis(view.x, width * .5 / scale, width * .5 / scale, bounds.minX, bounds.maxX),
    y: limitAxis(view.y, height * .565 / scale, height * .435 / scale, bounds.minY, bounds.maxY),
  };
}

export function zoomView(view, zoom, x, y, width, height) {
  const from = projectView(view, width, height);
  const to = projectView({ ...HOME_VIEW, zoom }, width, height);
  if (!from.scale) return view;
  return {
    zoom,
    x: (x - from.left) / from.scale - (x - to.left) / to.scale,
    y: (y - from.top) / from.scale - (y - to.top) / to.scale,
  };
}

export function interpolateView(view, goal, weight) {
  if (weight === 1) return goal;
  const zoom = view.zoom + (goal.zoom - view.zoom) * weight;
  const start = view.zoom * (1 - weight);
  const end = goal.zoom * weight;
  return { zoom, x: (view.x * start + goal.x * end) / zoom, y: (view.y * start + goal.y * end) / zoom };
}
