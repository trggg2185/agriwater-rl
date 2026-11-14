/**
 * Khối "Nhật ký": bảng từng ngày đã chạy — hành động tưới, độ ẩm kèm biến động
 * so với ngày trước, giai đoạn sinh trưởng và điểm thưởng của bước đó.
 *
 * Chỉ đọc từ store. Bấm một dòng = nhảy tới ngày đó (đổi `day`), không tính lại
 * mô phỏng — dữ liệu vẫn là nguồn chân lý duy nhất.
 */

import { el } from '../../utils/dom.js';
import { formatNumber } from '../../utils/math.js';

/** Màu chấm giai đoạn — chỉ là quy ước hiển thị, không phải luật mô phỏng. */
const STAGE_TINT = ['#a8d18a', '#5f9a3f', '#d0a52e', '#a9781f'];

const COLUMNS = ['Ngày', 'Tưới', 'Độ ẩm', 'Giai đoạn', 'Thưởng'];

function signed(value, digits = 0) {
  const text = formatNumber(Math.abs(value), digits);
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

function chip(label, value, tone = '') {
  return el('span', { class: `log__chip${tone ? ` ${tone}` : ''}` }, [
    el('span', { class: 'log__chip-label' }, label),
    el('span', { class: 'log__chip-value' }, value),
  ]);
}

export function createHistoryLog(store) {
  const count = el('span', { class: 'log__count' }, '—');
  const trend = el('div', { class: 'log__trend' });
  const live = el('div', { class: 'log__live', hidden: true });
  const body = el('div', { class: 'log__body' });
  const head = el('div', { class: 'log__head' }, COLUMNS.map((label) => el('span', {}, label)));

  const node = el('section', { class: 'section' }, [
    el('div', { class: 'section__head' }, [
      el('h3', { class: 'section__title' }, 'Diễn biến từng ngày'),
      count,
    ]),
    el(
      'p',
      { class: 'section__hint' },
      'Hành động, độ ẩm và biến động của từng ngày. Bấm một dòng để xem lại ngày đó.',
    ),
    trend,
    live,
    el('div', { class: 'log' }, [head, body]),
  ]);

  function rowFor(record, meta, currentDay) {
    const isCurrent = record.day === currentDay;
    const delta = (record.moisture - record.previousMoisture) * 100;
    const water = record.waterLiters;
    const stageName = meta.stages[record.stage] ?? `GĐ ${record.stage}`;

    const deltaNode = el(
      'em',
      { class: `log__delta${delta > 0.05 ? ' is-up' : delta < -0.05 ? ' is-down' : ''}` },
      delta === 0 ? '' : signed(delta, 1),
    );

    return el(
      'button',
      {
        class: `log__row${isCurrent ? ' is-current' : ''}`,
        type: 'button',
        dataset: { day: record.day },
        'aria-label': `Xem lại ngày ${record.day}: tưới ${water} lít, độ ẩm ${formatNumber(
          record.moisture * 100,
          1,
        )} phần trăm, thưởng ${formatNumber(record.reward, 0)}`,
      },
      [
        el('span', { class: 'log__day' }, String(record.day)),
        el(
          'span',
          { class: `log__water${water === 0 ? ' is-zero' : ''}` },
          water === 0 ? '—' : `${formatNumber(water, 0)} L`,
        ),
        el('span', { class: 'log__moist' }, [
          el('b', {}, `${formatNumber(record.moisture * 100, 1)} %`),
          deltaNode,
        ]),
        el('span', { class: 'log__stage', title: stageName }, [
          el('i', { style: { background: STAGE_TINT[record.stage] ?? STAGE_TINT[0] } }),
          stageName,
        ]),
        el(
          'span',
          { class: `log__reward${record.reward < 0 ? ' is-neg' : record.reward > 0 ? ' is-pos' : ''}` },
          signed(record.reward, 0),
        ),
      ],
    );
  }

  function paintTrend(visible) {
    const window = visible.slice(-7);
    const last = window[window.length - 1];
    const first = window[0];
    const deltaMoisture = (last.moisture - first.previousMoisture) * 100;
    const water = window.reduce((total, record) => total + record.waterLiters, 0);
    const reward = window.reduce((total, record) => total + record.reward, 0);

    trend.replaceChildren(
      chip(
        'Độ ẩm',
        `${formatNumber(first.previousMoisture * 100, 1)}→${formatNumber(last.moisture * 100, 1)} %`,
        deltaMoisture > 0.05 ? 'is-up' : deltaMoisture < -0.05 ? 'is-down' : '',
      ),
      chip('Tưới', `${formatNumber(water, 0)} L`),
      chip('Thưởng', signed(reward, 0), reward >= 0 ? 'is-up' : 'is-down'),
    );
    count.textContent = `${visible.length} ngày`;
  }

  function paintLive(state) {
    const notes = [];
    if (state.previewAction != null) {
      notes.push(`Mức tay ${formatNumber(state.previewAction, 0)} L (xem trước, chưa ghi vào dữ liệu)`);
    }
    if (state.pumpOn === false) notes.push('Bơm đang tắt');
    live.hidden = notes.length === 0;
    live.textContent = notes.join(' · ');
  }

  /**
   * Cuộn bảng tới dòng đang xem. Lần mount đầu tiên panel chưa vào layout nên
   * chiều cao còn 0 — thử lại vài nhịp thay vì bỏ qua.
   */
  function scrollCurrentIntoView(row, attempt = 0) {
    if (!row) return;
    if (!body.clientHeight) {
      if (attempt < 8) window.setTimeout(() => scrollCurrentIntoView(row, attempt + 1), 60);
      return;
    }
    body.scrollTop = Math.max(0, row.offsetTop - body.clientHeight + row.offsetHeight + 6);
  }

  let lastKey = '';

  function update(state) {
    const { meta, series, day } = state;
    const visible = series.slice(0, Math.max(1, day));
    if (!visible.length) return;

    paintLive(state);

    const key = `${day}|${state.activeTab}|${state.scenario}|${state.seed}|${series.length}`;
    if (key === lastKey) return;
    lastKey = key;

    paintTrend(visible);
    body.replaceChildren(
      ...visible.map((record) => rowFor(record, meta, day)),
    );

    scrollCurrentIntoView(body.lastElementChild);
  }

  body.addEventListener('click', (event) => {
    const row = event.target.closest('.log__row');
    if (!row) return;
    const day = Number(row.dataset.day);
    if (!Number.isFinite(day)) return;
    store.setState({ day });
  });

  return { node, update };
}
