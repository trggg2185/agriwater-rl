/**
 * Store pub/sub tối giản.
 *
 * `scene/` và `ui/` chỉ ĐỌC từ đây. Chỉ `data/` (apiClient, replayLoader,
 * playback) được ghi trạng thái mô phỏng vào store.
 */

export function createStore(initialState) {
  let state = { ...initialState };
  const subscribers = new Set();

  return {
    getState() {
      return state;
    },

    /** Gộp patch vào state rồi thông báo. Patch có thể là hàm nhận state cũ. */
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      if (!next) return state;
      state = { ...state, ...next };
      for (const subscriber of subscribers) subscriber(state);
      return state;
    },

    /** Đăng ký; hàm được gọi ngay một lần với state hiện tại. */
    subscribe(handler) {
      subscribers.add(handler);
      handler(state);
      return () => subscribers.delete(handler);
    },
  };
}

/** Chọn một nhánh nhỏ của state, dùng cho các component ít phụ thuộc. */
export function select(state, keys) {
  const picked = {};
  for (const key of keys) picked[key] = state[key];
  return picked;
}
