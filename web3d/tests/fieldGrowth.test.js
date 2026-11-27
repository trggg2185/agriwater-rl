import { expect, it } from 'vitest';
import { cropGrowth } from '../src/scene/FieldArtwork2D.js';
import { growthWindow } from '../src/utils/growth.js';

const meta = { growthStageDays: [8, 16, 24], maxDays: 30 };

it('giữ đúng giai đoạn trước khi bước mô phỏng đầu tiên của giai đoạn kế xảy ra', () => {
  const flowering = { day: 24, stage: 2 };
  const ripe = { day: 25, stage: 3 };
  const state = {
    meta,
    dataSource: 'api',
    series: [{ day: 17, stage: 2 }, flowering],
  };
  expect(growthWindow(state, flowering)).toEqual({ first: 17, next: 25 });
  expect(cropGrowth(flowering, state).age).toBeLessThan(3);
  state.series.push(ripe);
  expect(cropGrowth(ripe, state).age).toBe(3);
  expect(cropGrowth({ ...ripe, terminated: true }, state).wilt).toBe(1);
});
