/**
 * Đồng hồ phát lại: chỉ ghi `day` vào store theo thời gian.
 *
 * Không chứa luật mô phỏng. Giai đoạn 2 file này cũng phục vụ Replay CSV;
 * giai đoạn 3 nhận frame từ WebSocket của backend.
 */

import { UI } from '../config.js';

export function createPlayback(store) {
  let frame = 0;
  let lastTime = 0;
  let accumulator = 0;

  function tick(time) {
    const delta = lastTime ? Math.min(time - lastTime, 120) : 0;
    lastTime = time;

    const state = store.getState();
    if (state.playing) {
      accumulator += delta;
      const interval = UI.timing.stepBaseMs / state.speed;
      const total = state.series.length;
      let day = state.day;

      while (accumulator >= interval) {
        accumulator -= interval;
        if (day >= total) {
          accumulator = 0;
          store.setState({ playing: false });
          break;
        }
        day += 1;
        store.setState({ day });
      }
    } else {
      accumulator = 0;
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
