/**
 * Khối "Trạng thái quan sát": vector 7 chiều mà agent nhận ở mỗi bước.
 *
 * Tên trường và thứ tự theo docs/DESIGN_CONTRACT.md:
 *   crop_type, crop_growth_stage, soil_moisture, temperature,
 *   rain_probability, rain_forecast_mm, last_irrigation
 *
 * Mỗi dòng hiện giá trị THÔ (đơn vị người đọc) kèm thanh chuẩn hoá 0–1 —
 * đúng dạng mà agent thấy, nhưng vẫn đọc được bằng mắt thường.
 */

import { el } from '../../utils/dom.js';
import { clamp, formatNumber } from '../../utils/math.js';
import { moistureState } from '../../utils/colors.js';

const FIELDS = [
  { key: 'crop_type', label: 'Loại cây trồng' },
  { key: 'crop_growth_stage', label: 'Giai đoạn sinh trưởng' },
  { key: 'soil_moisture', label: 'Độ ẩm đất' },
  { key: 'temperature', label: 'Nhiệt độ' },
  { key: 'rain_probability', label: 'Xác suất mưa' },
  { key: 'rain_forecast_mm', label: 'Mưa dự báo' },
  { key: 'last_irrigation', label: 'Lần tưới gần nhất' },
];

export function createObservation() {
  const rows = FIELDS.map((field) => {
    const fill = el('i');
    const value = el('span', { class: 'obs__value' }, '—');
    const row = el('div', { class: 'obs__row' }, [
      el('span', { class: 'obs__name' }, [
        field.label,
        el('code', { class: 'obs__code' }, field.key),
      ]),
      el('span', { class: 'obs__bar' }, fill),
      value,
    ]);
    return { row, fill, value };
  });

  const node = el('section', { class: 'section' }, [
    el('div', { class: 'section__head' }, [
      el('h3', { class: 'section__title' }, 'Trạng thái quan sát'),
      el('span', { class: 'legend' }, [el('span', { class: 'legend__dot legend__dot--muted' }), '7 chiều']),
    ]),
    el(
      'p',
      { class: 'section__hint' },
      'Trạng thái trước hành động. Các thanh biểu thị giá trị chuẩn hóa 0–1.',
    ),
    el('div', { class: 'obs' }, rows.map((row) => row.row)),
  ]);

  function paint(index, text, norm, stateClass = '') {
    const row = rows[index];
    row.value.textContent = text;
    row.value.title = text;
    row.fill.style.width = `${clamp(norm, 0, 1) * 100}%`;
    row.row.className = `obs__row${stateClass ? ` ${stateClass}` : ''}`;
  }

  function update(state) {
    const { meta, series, day, crop } = state;
    const visible = series.slice(0, Math.max(1, day));
    const record = visible[visible.length - 1];
    if (!record) return;

    const cropInfo = meta.crops.find((item) => item.code === crop) ?? meta.crops[0];
    const stageName = meta.stages[record.stage] ?? `Giai đoạn ${record.stage}`;
    const maxLiters = Math.max(1, ...meta.actionLiters);

    const moisture = record.previousMoisture;
    const status = moistureState(moisture, { ...meta.moisture, stage: record.stage });
    const lastLiters = record.lastIrrigation;

    // Mã cây Gymnasium 0–3 được chia cho 3, kể cả khi Web3D chỉ hiển thị hai loại.
    paint(0, `${cropInfo.label} · mã ${cropInfo.code}`, cropInfo.code / 3);
    paint(
      1,
      `${stageName} · mã ${record.stage}`,
      record.stage / Math.max(1, meta.stages.length - 1),
      record.stage === 2 ? 'is-note' : '',
    );
    paint(
      2,
      `${formatNumber(moisture * 100, 1)} %`,
      moisture,
      status === 'ideal' ? '' : `is-${status}`,
    );
    paint(
      3,
      `${formatNumber(record.temperature, 1)} °C`,
      (record.temperature - 15) / 30,
      record.temperature >= 38 ? 'is-warn' : '',
    );
    paint(4, `${formatNumber(record.rainProbability * 100, 0)} %`, record.rainProbability, 'is-info');
    paint(
      5,
      `${formatNumber(record.rainForecastMm, 1)} mm`,
      record.rainForecastMm / 50,
      record.rainProbability >= 0.7 && record.rainForecastMm >= 15 ? 'is-info is-strong' : 'is-info',
    );
    paint(
      6,
      `${formatNumber(lastLiters, 1)} L`,
      lastLiters / maxLiters,
      lastLiters > 0 ? 'is-info' : '',
    );
  }

  return { node, update };
}
