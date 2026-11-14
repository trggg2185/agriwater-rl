/**
 * Chia 4 đầu phun thành các "khu tưới" (zone).
 *
 * Hệ tưới thật không bật tất cả vòi cùng lúc: bơm có lưu lượng giới hạn nên
 * người ta tưới luân canh từng khu. Ở đây số khu mở tỉ lệ với lượng nước của
 * hành động, và khu được chọn xoay theo ngày để các góc thửa đều nhận nước.
 *
 * Hàm THUẦN, chỉ trình bày: lượng nước vẫn là `action_liters` trong meta,
 * không có ngưỡng mô phỏng nào ở đây.
 */

/**
 * @param {object} input
 * @param {number} input.liters     lượng nước của đợt (0…max)
 * @param {number} input.day        ngày mô phỏng — dùng để luân canh khu
 * @param {number} input.headCount  số đầu phun quanh thửa
 * @param {number[]} input.actionLiters 6 mức nước từ meta
 * @returns {boolean[]} khu nào mở trong đợt này
 */
export function zonePlan({ liters = 0, day = 1, headCount = 4, actionLiters = [] }) {
  const count = Math.max(0, Math.floor(headCount));
  if (count === 0) return [];

  const max = actionLiters.reduce((top, value) => Math.max(top, value), 0);
  if (liters <= 0 || max <= 0) return new Array(count).fill(false);

  // 5 L mở 1 vòi … 25 L mở cả 4.
  const openCount = Math.max(1, Math.min(count, Math.round((liters / max) * count)));
  const start = ((Math.round(day) - 1) % count + count) % count;

  const plan = new Array(count).fill(false);
  for (let step = 0; step < openCount; step += 1) plan[(start + step) % count] = true;
  return plan;
}

/** Lượng nước đang thể hiện trên cảnh: mức chọn tay, nếu không thì của ngày. */
export function shownLiters(state, record) {
  if (state.previewAction != null) return state.previewAction;
  return record ? record.waterLiters : 0;
}
