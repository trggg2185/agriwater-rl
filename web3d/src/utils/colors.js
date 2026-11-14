/** Màu suy ra từ dữ liệu: độ ẩm, điều kiện thời tiết, mức cảnh báo. */

const MOISTURE_STOPS = [
  { at: 0.0, color: '#d4574f' },
  { at: 0.2, color: '#e0a03c' },
  { at: 0.4, color: '#6fa04a' },
  { at: 0.7, color: '#3f9a5a' },
  { at: 0.85, color: '#5ea8f0' },
  { at: 1.0, color: '#2a6fdb' },
];

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Nội suy màu theo độ ẩm, dùng cho heatmap và màu đất. */
export function moistureColor(value) {
  const v = Math.min(1, Math.max(0, value));
  for (let i = 0; i < MOISTURE_STOPS.length - 1; i += 1) {
    const a = MOISTURE_STOPS[i];
    const b = MOISTURE_STOPS[i + 1];
    if (v >= a.at && v <= b.at) {
      const t = (v - a.at) / (b.at - a.at || 1);
      const from = hexToRgb(a.color);
      const to = hexToRgb(b.color);
      return rgbToHex(from.map((c, idx) => c + (to[idx] - c) * t));
    }
  }
  return MOISTURE_STOPS[MOISTURE_STOPS.length - 1].color;
}

/**
 * Trạng thái độ ẩm so với ngưỡng lấy từ config.
 * 'ideal' | 'warn' (ngoài vùng lý tưởng) | 'alarm' (ngoài ngưỡng stress).
 */
export function moistureState(moisture, bounds) {
  const { idealDefault, idealStage2, stressBounds, stage = 0 } = bounds;
  const ideal = stage === 2 ? idealStage2 : idealDefault;
  if (moisture < stressBounds[0] || moisture > stressBounds[1]) return 'alarm';
  if (moisture < ideal[0] || moisture > ideal[1]) return 'warn';
  return 'ideal';
}

/** Nhãn thời tiết suy ra từ xác suất mưa và lượng mưa dự báo. */
export function weatherCondition(rainProbability, rainForecastMm) {
  if (rainProbability >= 0.7 && rainForecastMm >= 15) return { key: 'rain', label: 'Mưa' };
  if (rainProbability >= 0.35) return { key: 'cloud', label: 'Âm u' };
  return { key: 'sun', label: 'Nắng' };
}
