/**
 * Phân khu tưới — ƯỚC LƯỢNG HIỂN THỊ, không phải nguồn chân lý.
 *
 * Nguồn chân lý của độ ẩm vẫn là môi trường Python: mỗi ngày nó trả về đúng
 * một giá trị m(t) cho cả thửa. Ở đây ta chỉ chia m(t) thành `headCount` khu
 * theo một mô hình BẢO TOÀN:
 *
 *     m_i = m(t) + a · (p_i − 1/n)        với Σ p_i = 1
 *     ⇒ trung bình các khu = m(t) đúng tuyệt đối.
 *
 * `p_i` là tỉ trọng nước của khu (khu vừa được tưới cao hơn, lâu ngày phẳng
 * dần về 1/n), `a` là biên độ lệch. Khi một khu chạm biên [0, 1] thì GIẢM `a`
 * cho mọi khu (co đều) chứ không kẹp riêng khu đó — nhờ vậy trung bình vẫn
 * bằng m(t) kể cả lúc bị co vì kẹp biên.
 *
 * Toàn bộ hàm ở đây thuần (không đọc store, không gọi API, không Math.random),
 * nên tua replay tới ngày bất kỳ luôn cho cùng kết quả với chạy tuần tự.
 *
 * Hình học: luống chạy dọc trục X, nên "trục dọc giữa thửa" là đường z = 0 và
 * mỗi khu là một DẢI vuông góc trục dọc (bề rộng width / n, sâu hết depth).
 */

/** Tham số hiển thị mặc định; config.js có thể ghi đè phần vị trí/hình quạt. */
export const ZONE_DEFAULTS = {
  headCount: 3,
  /** Trần tầm bắn = khoảng cách tới góc xa nhất của dải × hệ số này. */
  radiusFactor: 1.05,
  /** Đầu phun cách mép thửa tối thiểu 10% kích thước thửa. */
  edgeInset: 0.1,
  /** Trọng số tỉ trọng cũ giữ lại mỗi ngày (phần còn lại theo nước hôm nay). */
  relax: 0.62,
  /** Biên độ lệch tối đa của m_i so với m(t), đơn vị 0..1. */
  spread: 0.075,
  /** Chừa mép khay khi tính tầm rơi để nước không bắn ra ngoài. */
  landMargin: 0.15,
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const clamp01 = (value) => clamp(value, 0, 1);

const finiteOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);

/** headCount hợp lệ: số nguyên 2…4. */
export function clampHeadCount(headCount) {
  const n = Math.round(finiteOr(headCount, ZONE_DEFAULTS.headCount));
  return clamp(n, 2, 4);
}

/**
 * Vị trí các đầu phun trên trục dọc giữa thửa (z = 0), cách đều nhau:
 *   x_k = −width/2 + (k + 0,5) · width / n
 * Với n lẻ, đầu giữa trùng tâm thửa (x = 0).
 */
export function headPositions({ width, depth, headCount }) {
  const n = clampHeadCount(headCount);
  const band = width / n;
  return Array.from({ length: n }, (_, index) => {
    const x0 = -width / 2 + index * band;
    const x1 = x0 + band;
    return {
      index,
      label: `K${index + 1}`,
      x: (x0 + x1) / 2,
      z: 0,
      band: [x0, x1],
      halfWidth: band / 2,
      depth,
    };
  });
}

/** Biên của dải khu thứ `index` theo trục X. */
export function bandBounds(index, { width, headCount }) {
  const n = clampHeadCount(headCount);
  const band = width / n;
  const k = clamp(Math.round(index), 0, n - 1);
  return [-width / 2 + k * band, -width / 2 + (k + 1) * band];
}

/** Khu chứa điểm có hoành độ x (dải vuông góc trục dọc). */
export function zoneIndexAt(x, { width, headCount }) {
  const n = clampHeadCount(headCount);
  const band = width / n;
  const k = Math.floor((x + width / 2) / band);
  return clamp(k, 0, n - 1);
}

/** Khoảng cách từ tâm khu tới góc xa nhất của chính dải đó. */
export function bandCornerDistance(index, { width, depth, headCount }) {
  const n = clampHeadCount(headCount);
  const band = width / n;
  const k = clamp(Math.round(index), 0, n - 1);
  const x0 = -width / 2 + k * band;
  const x1 = x0 + band;
  const centerX = (x0 + x1) / 2;
  const farX = Math.max(Math.abs(x0 - centerX), Math.abs(x1 - centerX));
  return Math.hypot(farX, depth / 2);
}

/**
 * Trần tầm bắn của đầu phun: khoảng cách tới góc xa nhất của dải × radiusFactor.
 * Đây là TRẦN lý thuyết — tầm rơi thực của từng tia còn bị kẹp theo biên thửa
 * (xem `streamRange`) nên nước không bắn ra ngoài khay.
 */
export function headMaxRadius(index, { width, depth, headCount, radiusFactor }) {
  const factor = finiteOr(radiusFactor, ZONE_DEFAULTS.radiusFactor);
  return bandCornerDistance(index, { width, depth, headCount }) * factor;
}

/**
 * Số vòi mở cho một mức nước:
 *   liters == 0 → 0
 *   ngược lại   → clamp(ceil(liters / (maxLiters / n)), 1, n)
 * maxLiters lấy từ meta (mức tưới lớn nhất), không hard-code.
 */
export function openCount(liters, maxLiters, headCount) {
  const n = clampHeadCount(headCount);
  const total = finiteOr(liters, 0);
  if (!(total > 0)) return 0;
  const capacity = finiteOr(maxLiters, 0) / n;
  if (!(capacity > 0)) return 1;
  return clamp(Math.ceil(total / capacity), 1, n);
}

/** Lưu lượng mỗi vòi đang mở — bảo toàn: tổng các vòi = lượng nước của đợt. */
export function flowPerOpen(liters, open) {
  const total = finiteOr(liters, 0);
  const count = Math.max(0, Math.round(finiteOr(open, 0)));
  if (count === 0 || !(total > 0)) return 0;
  return total / count;
}

/**
 * Chọn khu để tưới: ưu tiên khu KHÔ (m_i thấp) — tức khu dưới vùng lý tưởng
 * được phục vụ trước. Hòa độ ẩm thì xoay vòng theo ngày. Không dùng Math.random.
 */
export function pickZones({ zoneMoisture = [], count = 0, day = 1 }) {
  const n = zoneMoisture.length;
  const take = clamp(Math.round(count), 0, n);
  if (take === 0 || n === 0) return [];

  const offset = ((Math.round(finiteOr(day, 1)) % n) + n) % n;
  const order = zoneMoisture.map((moisture, index) => ({
    index,
    moisture: finiteOr(moisture, 0),
    // Thứ tự hòa: xoay vòng theo ngày để khu khác nhận nước hôm sau.
    tie: (index - offset + n) % n,
  }));

  order.sort((a, b) => {
    if (Math.abs(a.moisture - b.moisture) > 1e-12) return a.moisture - b.moisture;
    return a.tie - b.tie;
  });

  return order
    .slice(0, take)
    .map((entry) => entry.index)
    .sort((a, b) => a - b);
}

/**
 * m_i của từng khu từ m(t) + tỉ trọng p_i.
 * Biên độ `a` bị co nếu có khu chạm biên [0, 1] ⇒ trung bình vẫn = m.
 */
export function zoneMoistures(meanMoisture, shares, mode = 'estimate') {
  const n = shares.length;
  const mean = clamp01(finiteOr(meanMoisture, 0));
  const even = 1 / n;
  if (mode === 'uniform') return new Array(n).fill(mean);

  const deviations = shares.map((share) => share - even);
  let amplitude = ZONE_DEFAULTS.spread;

  const maxPositive = deviations.reduce((top, value) => Math.max(top, value), 0);
  const maxNegative = deviations.reduce((top, value) => Math.max(top, -value), 0);
  if (maxPositive > 1e-12) amplitude = Math.min(amplitude, (1 - mean) / maxPositive);
  if (maxNegative > 1e-12) amplitude = Math.min(amplitude, mean / maxNegative);
  amplitude = Math.max(0, amplitude);

  return shares.map((share) => clamp01(mean + amplitude * (share - even)));
}

/** Chuẩn hoá tỉ trọng sao cho tổng = 1 (cộng bù sai số vào phần tử lớn nhất). */
function normalizeShares(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 1e-12)) return new Array(values.length).fill(1 / values.length);
  const shares = values.map((value) => value / total);
  const drift = 1 - shares.reduce((sum, value) => sum + value, 0);
  let largest = 0;
  for (let i = 1; i < shares.length; i += 1) if (shares[i] > shares[largest]) largest = i;
  shares[largest] += drift;
  return shares;
}

/**
 * Chạy mô hình ước lượng cho cả chuỗi ngày.
 *
 * @param {object} input
 * @param {Array<{day:number, waterLiters:number, moisture:number, previousMoisture?:number}>} input.series
 * @param {number} input.headCount 2…4
 * @param {number} input.maxLiters mức tưới lớn nhất trong meta
 * @param {'estimate'|'uniform'} [input.mode]
 * @returns {Array<{day:number, liters:number, openCount:number, openZones:number[],
 *   flows:number[], moisture:number[], mean:number}>}
 */
export function simulateZoneField({ series = [], headCount, maxLiters = 0, mode = 'estimate' }) {
  const n = clampHeadCount(headCount);
  const even = 1 / n;
  const relax = ZONE_DEFAULTS.relax;

  let shares = new Array(n).fill(even);
  const days = [];

  for (const record of series) {
    const before = clamp01(finiteOr(record.previousMoisture, finiteOr(record.moisture, 0)));
    const beforeField = zoneMoistures(before, shares, mode);

    const liters = Math.max(0, finiteOr(record.waterLiters, 0));
    const open = openCount(liters, maxLiters, n);
    const openZones = open > 0 ? pickZones({ zoneMoisture: beforeField, count: open, day: record.day }) : [];

    const flows = new Array(n).fill(0);
    if (openZones.length) {
      const per = flowPerOpen(liters, openZones.length);
      for (const index of openZones) flows[index] = per;
    }

    // Tỉ trọng nước: hôm nay pha loãng tỉ trọng cũ, hôm không tưới thì phẳng dần.
    const today = new Array(n).fill(even);
    if (liters > 0 && openZones.length) {
      for (let i = 0; i < n; i += 1) today[i] = 0;
      for (const index of openZones) today[index] = 1 / openZones.length;
    }
    const wetWeight = liters > 0 ? 1 - relax : 0;
    shares = normalizeShares(shares.map((share, i) => share * relax + today[i] * wetWeight));

    const mean = clamp01(finiteOr(record.moisture, before));
    const moisture = zoneMoistures(mean, shares, mode);

    days.push({
      day: record.day,
      liters,
      openCount: openZones.length,
      openZones,
      flows,
      moisture,
      mean,
    });
  }

  return days;
}

/**
 * Như `simulateZoneField` nhưng có memo theo identity của mảng series: scene và
 * UI cùng gọi hàm này nên không phải tính lại 30 ngày mỗi lần render.
 */
const timelineCache = new WeakMap();

export function zoneTimeline({ series = [], headCount, maxLiters = 0, mode = 'estimate' }) {
  const key = `${clampHeadCount(headCount)}|${maxLiters}|${mode}`;
  const cached = timelineCache.get(series);
  if (cached && cached.key === key) return cached.days;
  const days = simulateZoneField({ series, headCount, maxLiters, mode });
  timelineCache.set(series, { key, days });
  return days;
}

/** Tổng lưu lượng của các vòi đang mở (phải bằng lượng nước của đợt). */
export function totalFlow(flows = []) {
  return flows.reduce((sum, value) => sum + finiteOr(value, 0), 0);
}

/**
 * Khoảng cách từ gốc tia tới mép trong của thửa theo hướng (dx, dz).
 * Dùng để kẹp tầm rơi: mọi tia chạm đất bên trong khay.
 */
export function plotEdgeDistance({ x, z }, dx, dz, { width, depth, margin }) {
  const inset = finiteOr(margin, ZONE_DEFAULTS.landMargin);
  const halfWidth = width / 2 - inset;
  const halfDepth = depth / 2 - inset;

  const limitX = dx > 1e-9 ? (halfWidth - x) / dx : dx < -1e-9 ? (-halfWidth - x) / dx : Infinity;
  const limitZ = dz > 1e-9 ? (halfDepth - z) / dz : dz < -1e-9 ? (-halfDepth - z) / dz : Infinity;
  return Math.max(0, Math.min(limitX, limitZ));
}

/**
 * Tầm rơi thực của một tia: không vượt trần R_max của đầu phun và không vượt
 * mép thửa (trừ landMargin). Phần chồng lấn sang dải kề chỉ là thị giác.
 */
export function streamRange(head, azimuth, maxRadius, plot) {
  const dx = Math.cos(azimuth);
  const dz = Math.sin(azimuth);
  const edge = plotEdgeDistance(head, dx, dz, plot);
  return Math.max(0, Math.min(maxRadius, edge));
}

/** Điểm rơi trên mặt đất của một tia (chỉ để kiểm tra/đặt ripple). */
export function landingPoint(head, azimuth, range) {
  return { x: head.x + Math.cos(azimuth) * range, z: head.z + Math.sin(azimuth) * range };
}

export default {
  ZONE_DEFAULTS,
  clampHeadCount,
  headPositions,
  bandBounds,
  zoneIndexAt,
  bandCornerDistance,
  headMaxRadius,
  openCount,
  flowPerOpen,
  pickZones,
  zoneMoistures,
  simulateZoneField,
  zoneTimeline,
  totalFlow,
  plotEdgeDistance,
  streamRange,
  landingPoint,
};
