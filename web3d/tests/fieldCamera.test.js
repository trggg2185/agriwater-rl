import { expect, it } from 'vitest';
import { fieldBounds } from '../src/scene/FieldArtwork2D.js';
import { boundView, HOME_VIEW, interpolateView, projectView, zoomView } from '../src/scene/FieldCamera2D.js';

const width = 800;
const height = 444;

it('giữ điểm dưới con trỏ trong suốt lúc zoom, kể cả giữa các khung hình', () => {
  const pointer = [533, 177];
  const goal = zoomView(HOME_VIEW, 1.7, ...pointer, width, height);
  const { left, top, scale } = projectView(HOME_VIEW, width, height);
  const world = [(pointer[0] - left) / scale, (pointer[1] - top) / scale];

  for (const weight of [.1, .5, .9, 1]) {
    const view = projectView(interpolateView(HOME_VIEW, goal, weight), width, height);
    expect(view.left + world[0] * view.scale).toBeCloseTo(pointer[0]);
    expect(view.top + world[1] * view.scale).toBeCloseTo(pointer[1]);
  }
});

it('giữ trọn ruộng khi thu nhỏ và giới hạn khung xem khi phóng lớn', () => {
  for (const sign of [-1, 1]) {
    const far = { x: sign * 1e4, y: sign * 1e4 };
    const fit = projectView(boundView({ ...far, zoom: .8 }, width, height, fieldBounds), width, height);
    expect(fit.left + fieldBounds.minX * fit.scale).toBeGreaterThanOrEqual(-1e-8);
    expect(fit.left + fieldBounds.maxX * fit.scale).toBeLessThanOrEqual(width + 1e-8);
    expect(fit.top + fieldBounds.minY * fit.scale).toBeGreaterThanOrEqual(-1e-8);
    expect(fit.top + fieldBounds.maxY * fit.scale).toBeLessThanOrEqual(height + 1e-8);

    const full = projectView(boundView({ ...far, zoom: 2.2 }, width, height, fieldBounds), width, height);
    expect(full.left + fieldBounds.minX * full.scale).toBeLessThanOrEqual(1e-8);
    expect(full.left + fieldBounds.maxX * full.scale).toBeGreaterThanOrEqual(width - 1e-8);
    expect(full.top + fieldBounds.minY * full.scale).toBeLessThanOrEqual(1e-8);
    expect(full.top + fieldBounds.maxY * full.scale).toBeGreaterThanOrEqual(height - 1e-8);
  }
});
