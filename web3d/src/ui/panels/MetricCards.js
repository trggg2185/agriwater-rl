/**
 * Lưới thẻ 3×2: thẻ đầu nền đất tối, 5 thẻ sau nền trắng.
 * Giá trị lấy từ chuỗi record của phiên hiện tại (giai đoạn 1: mock).
 */

import { el } from '../../utils/dom.js';
import { moistureState } from '../../utils/colors.js';
import { formatNumber } from '../../utils/math.js';

function createCard({ label, unit, dark = false }) {
  const number = el('span');
  const node = el('div', { class: `kpi${dark ? ' kpi--soil' : ''}` }, [
    el('span', { class: 'kpi__label' }, label),
    el('span', { class: 'kpi__value' }, [number, el('span', { class: 'kpi__unit' }, unit)]),
  ]);
  return { node, number };
}

export function createMetricCards() {
  const cards = [
    createCard({ label: 'Hiện tại', unit: '%', dark: true }),
    createCard({ label: 'Nhiệt độ', unit: '°C' }),
    createCard({ label: 'Xác suất mưa', unit: '%' }),
    createCard({ label: 'Mưa dự báo', unit: 'mm' }),
    createCard({ label: 'Nước đã dùng', unit: 'L' }),
    createCard({ label: 'Điểm thưởng', unit: '' }),
  ];

  const grid = el('div', { class: 'kpi-grid' }, cards.map((card) => card.node));
  const node = el('section', { class: 'section' }, [
    el('h3', { class: 'section__title' }, 'Độ ẩm đất'),
    grid,
  ]);

  function update(state) {
    const { meta, series, day } = state;
    const visible = series.slice(0, Math.max(1, day));
    const record = visible[visible.length - 1];
    if (!record) return;

    const water = visible.reduce((total, item) => total + item.waterLiters, 0);
    const reward = visible.reduce((total, item) => total + item.reward, 0);

    cards[0].number.textContent = formatNumber(record.moisture * 100, 1);
    cards[1].number.textContent = formatNumber(record.temperature, 1);
    cards[2].number.textContent = formatNumber(record.rainProbability * 100, 0);
    cards[3].number.textContent = formatNumber(record.rainForecastMm, 1);
    cards[4].number.textContent = formatNumber(water, 0);
    cards[5].number.textContent = formatNumber(reward, 0);

    const status = moistureState(record.moisture, {
      idealDefault: meta.moisture.idealDefault,
      idealStage2: meta.moisture.idealStage2,
      stressBounds: meta.moisture.stressBounds,
      stage: record.stage,
    });
    cards[0].node.classList.toggle('is-warn', status === 'warn');
    cards[0].node.classList.toggle('is-alarm', status === 'alarm');

    for (const card of cards.slice(1)) {
      card.node.classList.remove('is-warn', 'is-alarm');
    }
  }

  return { node, update };
}
