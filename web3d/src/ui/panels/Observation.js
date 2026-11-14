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
      'Giá trị agent nhận mỗi bước; thanh bên cạnh là dạng chuẩn hoá 0–1.',
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

    // Lần tưới gần nhất = đợt tưới có nước gần nhất TRƯỚC ngày đang xem.
    let lastLiters = 0;
    let lastDay = null;
    for (let i = visible.length - 2; i >= 0; i -= 1) {
      if (visible[i].waterLiters > 0) {
        lastLiters = visible[i].waterLiters;
        lastDay = visible[i].day;
        break;
      }
    }
    const daysAgo = lastDay === null ? null : record.day - lastDay;

    const moisture = moistureState(record.moisture, {
      idealDefault: meta.moisture.idealDefault,
      idealStage2: meta.moisture.idealStage2,
      stressBounds: meta.moisture.stressBounds,
      stage: record.stage,
    });

    paint(0, `${cropInfo.label} · mã ${cropInfo.code}`, cropInfo.code / Math.max(1, meta.crops.length - 1));
    paint(
      1,
      `${stageName} · mã ${record.stage}`,
      record.stage / Math.max(1, meta.stages.length - 1),
      record.stage === 2 ? 'is-note' : '',
    );
    paint(
      2,
      `${formatNumber(record.moisture * 100, 1)} %`,
      record.moisture,
      moisture === 'ideal' ? '' : `is-${moisture}`,
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
      record.rainForecastMm / 40,
      record.rainProbability >= 0.7 && record.rainForecastMm >= 15 ? 'is-info is-strong' : 'is-info',
    );
    paint(
      6,
      lastLiters > 0 ? `${formatNumber(lastLiters, 0)} L · ${daysAgo} ngày trước` : 'chưa tưới',
      lastLiters / maxLiters,
      lastLiters > 0 ? 'is-info' : '',
    );
  }

  return { node, update };
}
