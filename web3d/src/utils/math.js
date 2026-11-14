/** Toán dùng cho biểu đồ và hiệu ứng đếm số. */

export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const numberFormat = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** Định dạng theo tiếng Việt (dấu phẩy thập phân). */
export function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  if (digits === 0) return new Intl.NumberFormat('vi-VN').format(Math.round(value));
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Trả về trần trục Y "đẹp" (bội số của bước). */
export function niceMax(values, fallback = 10) {
  const max = values.reduce((acc, value) => (Number.isFinite(value) ? Math.max(acc, value) : acc), 0);
  if (max <= 0) return fallback;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 1.2 ? 1.2 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Chia khoảng [0, max] thành các mốc đều nhau. */
export function ticks(max, count = 5) {
  const result = [];
  for (let i = 0; i <= count; i += 1) result.push((max / count) * i);
  return result;
}

export { numberFormat };
