/**
 * Đồng hồ phát lại: ghi `day` vào store theo thời gian.
 *
 * Không chứa luật mô phỏng. Hai chế độ:
 *   - dữ liệu có sẵn (JSON/mock): tự cộng `day`, không ai phải tính lại;
 *   - live (FastAPI): mỗi nhịp gọi `onLiveStep()` để Python chạy một ngày —
 *     dùng lại các ngày đã tính trước khi yêu cầu Python chạy tiếp.
 */

import { UI } from '../config.js';

export function createPlayback(store, { onLiveStep } = {}) {
  let frame = 0;
  let lastTime = 0;
  let accumulator = 0;

  function tick(time) {
    const delta = lastTime ? Math.min(time - lastTime, 120) : 0;
    lastTime = time;

    const state = store.getState();
    if (!state.playing) {
      accumulator = 0;
    } else {
      accumulator += delta;
      const interval = UI.timing.stepBaseMs / state.speed;
      if (accumulator >= interval) {
        accumulator %= interval;
        const latest = state.series.at(-1);
        if (state.day < state.series.length) {
          store.setState({ day: state.day + 1 });
        } else if (state.dataSource === 'api' && !latest?.terminated && !latest?.truncated) {
          onLiveStep?.();
        } else {
          store.setState({ playing: false });
        }
      }
    }

    frame = requestAnimationFrame(tick);
  }

  frame = requestAnimationFrame(tick);

  return {
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
}

/** Chuyển sang ngày khác, có kẹp trong khoảng dữ liệu có thật. */
export function seek(store, day) {
  const total = store.getState().series.length;
  store.setState({ day: Math.min(total, Math.max(1, Math.round(day))) });
}
