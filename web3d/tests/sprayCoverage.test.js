import { expect, it } from 'vitest';
import { plantCenters, projectField } from '../src/scene/FieldArtwork2D.js';
import { sprayTargets } from '../src/scene/IrrigationSpray2D.js';
import { fieldIrrigationStatus } from '../src/utils/irrigationZones.js';

it('phủ đúng 100 bụi, kể cả khi chỉ còn một vòi mở', () => {
  const heads = [[1.9, 2.3], [4.9, 6.8]].map(([col, row]) => projectField(col, row));
  const all = sprayTargets(plantCenters, heads, [5, 5]);
  expect(all.every((group) => group.length > 0)).toBe(true);
  expect(new Set(all.flat()).size).toBe(100);
  const single = sprayTargets(plantCenters, heads, [0, 10]);
  expect(single[0]).toHaveLength(0);
  expect(single[1]).toHaveLength(100);
});

it('tổng lưu lượng bằng lượng tưới và bơm tắt không phun', () => {
  const state = {
    day: 1,
    series: [{ day: 1, moisture: .4, waterLiters: 15 }],
    meta: { actionLiters: [0, 5, 10, 15, 20, 25] },
    openHeads: [true, false, true, false, true, false],
  };
  expect(fieldIrrigationStatus(state, 6).flows).toEqual([5, 0, 5, 0, 5, 0]);
  expect(fieldIrrigationStatus({ ...state, pumpOn: false }, 6).flows).toEqual(Array(6).fill(0));
});
