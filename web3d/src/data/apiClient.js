/**
 * Client của backend FastAPI (`agriwater/api/app.py`).
 *
 * Chỉ có ba việc: mở ván, chạy một ngày, và hỏi xem server có sống không. Mọi
 * con số (độ ẩm, điểm, 6 thành phần) do Python trả về — file này không tính gì.
 *
 * Mặc định gọi `/api/...` để đi qua proxy của Vite (`vite.config.js` →
 * 127.0.0.1:8000). Muốn gọi thẳng server thì đặt `VITE_API_BASE` trong `.env`.
 */

const BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/+$/, '');

/** Request JSON có timeout; ném Error kèm `detail` của FastAPI nếu có. */
async function request(path, { method = 'GET', body, timeoutMs = 4000, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') throw new Error('Trình duyệt không hỗ trợ fetch');

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0;
  try {
    const response = await doFetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = typeof payload?.detail === 'string' ? payload.detail
          : payload?.detail?.[0]?.msg ?? '';
      } catch {
        // server trả lỗi không phải JSON — giữ nguyên mã trạng thái.
      }
      throw new Error(`${response.status}${detail ? ` ${detail}` : ''}`);
    }
    return await response.json();
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

/** Server có đang chạy không? Timeout ngắn để app không chờ lâu khi mở. */
export async function isAvailable(options = {}) {
  try {
    await request('/health', { ...options, timeoutMs: options.timeoutMs ?? 1200 });
    return true;
  } catch {
    return false;
  }
}

/** Mở ván mới, có thể chạy chính sách baseline đến ngày bắt đầu mong muốn. */
export function createSession({ scenario, seed, crop, initialAction, startDay = 1, initialState, weather }, options = {}) {
  return request('/session', {
    ...options,
    method: 'POST',
    body: {
      scenario, seed, crop, initial_action: initialAction, start_day: startDay,
      initial_state: initialState, weather,
    },
  });
}

/** Chạy đúng một ngày: action 0–5 (0 = không tưới). */
export function step({ sessionId, action, automatic = false }, options = {}) {
  return request('/step', {
    ...options,
    method: 'POST',
    body: { session_id: sessionId, action, automatic },
  });
}

/**
 * Lít (0…25) → chỉ số action 0–5. UI nói bằng lít, backend nói bằng chỉ số.
 * Không khớp mức nào thì trả 0 (ngày nghỉ tưới) thay vì đoán.
 */
export function litersToAction(meta, liters) {
  const list = meta?.actionLiters ?? [];
  const value = Number(liters);
  const index = list.findIndex((litersAtLevel) => Math.abs(litersAtLevel - value) < 1e-9);
  return index >= 0 ? index : 0;
}
