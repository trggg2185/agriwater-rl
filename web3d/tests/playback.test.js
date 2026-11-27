import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPlayback } from '../src/data/playback.js';

/** Store giả: đủ `getState`/`setState` cho đồng hồ phát lại. */
function fakeStore(initial) {
  let state = initial;
  return {
    getState: () => state,
    setState(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      return state;
    },
  };
}

/**
 * Trình duyệt thật bị throttle `requestAnimationFrame` khi tab không hiển thị,
 * nên test tự cấp khung hình để kiểm tra đúng logic thay vì đúng tốc độ máy.
 */
describe('createPlayback', () => {
  let pending;
  const original = { raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };

  beforeEach(() => {
    pending = null;
    globalThis.requestAnimationFrame = (callback) => {
      pending = callback;
      return 1;
    };
    globalThis.cancelAnimationFrame = () => {
      pending = null;
    };
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = original.raf;
    globalThis.cancelAnimationFrame = original.caf;
  });

  /** Chạy n khung, mỗi khung 120 ms (mức chặn tối đa của delta). */
  function frames(count) {
    for (let index = 0; index < count; index += 1) {
      const callback = pending;
      pending = null;
      callback((index + 1) * 120);
    }
  }

  it('chế độ live: mỗi nhịp gọi onLiveStep, KHÔNG tự cộng day', () => {
    const steps = [];
    const store = fakeStore({
      playing: true,
      speed: 1,
      day: 3,
      series: new Array(3).fill(null),
      dataSource: 'api',
    });
    const playback = createPlayback(store, { onLiveStep: () => steps.push(store.getState().day) });

    frames(20); // 2400 ms > 1500 ms mỗi nhịp
    expect(steps.length).toBeGreaterThan(0);
    // Ngày do server trả về; đồng hồ không được tự nhích con số này.
    expect(store.getState().day).toBe(3);
    playback.destroy();
  });

  it('chế độ live: xem hết lịch sử trước khi yêu cầu ngày mới', () => {
    const steps = [];
    const store = fakeStore({
      playing: true,
      speed: 1,
      day: 1,
      series: new Array(3).fill(null),
      dataSource: 'api',
    });
    const playback = createPlayback(store, { onLiveStep: () => steps.push(store.getState().day) });
    frames(45);
    expect(store.getState().day).toBe(3);
    expect(steps).toEqual([3]);
    playback.destroy();
  });

  it('chế độ live: không gọi khi đang tạm dừng', () => {
    const steps = [];
    const store = fakeStore({
      playing: false,
      speed: 1,
      day: 1,
      series: new Array(5).fill(null),
      dataSource: 'api',
    });
    const playback = createPlayback(store, { onLiveStep: () => steps.push(1) });
    frames(20);
    expect(steps).toHaveLength(0);
    playback.destroy();
  });

  it('dữ liệu có sẵn: tự tăng day và dừng ở cuối dải', () => {
    const store = fakeStore({
      playing: true,
      speed: 10,
      day: 1,
      series: new Array(3).fill(null),
      dataSource: 'python',
    });
    const playback = createPlayback(store, { onLiveStep: () => expect.unreachable() });
    frames(30);
    expect(store.getState().day).toBe(3);
    expect(store.getState().playing).toBe(false);
    playback.destroy();
  });
});
