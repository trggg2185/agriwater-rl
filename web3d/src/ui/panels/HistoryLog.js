/**
 * Khối "Nhật ký": bảng từng ngày đã chạy — hành động tưới, độ ẩm kèm biến động
 * so với ngày trước, giai đoạn sinh trưởng và điểm thưởng của bước đó.
 *
 * Ba lớp thông tin, từ khái quát tới chi tiết:
 *   1. Chip 7 ngày gần nhất + dòng tổng hợp "tới nay" (nước, thưởng, ngày tưới).
 *   2. Bộ lọc nhanh: tất cả / có tưới / không tưới / bị phạt.
 *   3. Hồ sơ ngày đang xem: đủ vector quan sát 7 chiều mà agent nhận ở bước đó,
 *      cộng lượng mưa thực tế và bảng phân rã điểm (R_health, R_water, …).
 *
 * Chỉ đọc từ store. Bấm một dòng = nhảy tới ngày đó (đổi `day`), không tính lại
 * mô phỏng — dữ liệu vẫn là nguồn chân lý duy nhất. Phím ↑/↓ khi đang đứng trong
 * bảng cũng đổi ngày, tiện tua từng bước như phát lại.
 */

import { el } from '../../utils/dom.js';
import { clamp, formatNumber } from '../../utils/math.js';

/** Màu chấm giai đoạn — chỉ là quy ước hiển thị, không phải luật mô phỏng. */
const STAGE_TINT = ['#a8d18a', '#5f9a3f', '#d0a52e', '#a9781f'];

const COLUMNS = ['Ngày', 'Tưới', 'Độ ẩm', 'Giai đoạn', 'Thưởng'];

/** Nhãn tiếng Việt cho 6 thành phần điểm của `agriwater/agents/reward.py`. */
const REWARD_PARTS = [
  { key: 'R_health', label: 'Vùng lý tưởng' },
  { key: 'R_stress', label: 'Căng thẳng' },
  { key: 'R_water', label: 'Nước đã dùng' },
  { key: 'R_waste', label: 'Tưới lãng phí' },
  { key: 'R_rain', label: 'Tưới khi sắp mưa' },
  { key: 'R_delay', label: 'Tưới dồn dập' },
];

/** Bộ lọc chỉ là cách nhìn dữ liệu, không đổi dữ liệu. */
const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'water', label: 'Có tưới', test: (record) => record.waterLiters > 0 },
  { key: 'idle', label: 'Không tưới', test: (record) => !(record.waterLiters > 0) },
  { key: 'penalty', label: 'Bị phạt', test: (record) => (record.reward ?? 0) < 0 },
];

const finite = (value) => (Number.isFinite(value) ? value : 0);

function signed(value, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  const text = formatNumber(Math.abs(value), digits);
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

const pct = (value, digits = 0) =>
  Number.isFinite(value) ? `${formatNumber(value * 100, digits)} %` : '—';

const mm = (value, digits = 1) => (Number.isFinite(value) ? `${formatNumber(value, digits)} mm` : '—');

function chip(label, value, tone = '') {
  return el('span', { class: `log__chip${tone ? ` ${tone}` : ''}` }, [
    el('span', { class: 'log__chip-label' }, label),
    el('span', { class: 'log__chip-value' }, value),
  ]);
}

/**
 * Trạng thái độ ẩm so với ngưỡng ĐANG DÙNG cho giai đoạn đó — cùng nguồn với
 * nền biểu đồ và "Trạng thái quan sát", nên không có chuyện hai chỗ nói khác nhau.
 */
function moistureStatus(record, meta) {
  const bounds = meta?.moisture ?? {};
  const stress = bounds.stressBounds ?? [0.2, 0.85];
  const ideal =
    record.stage === 2 ? bounds.idealStage2 ?? [0.5, 0.75] : bounds.idealDefault ?? [0.4, 0.7];
  const value = record.moisture;
  if (!Number.isFinite(value)) return { label: '—', tone: '' };
  if (value < stress[0]) return { label: 'Héo', tone: 'is-bad' };
  if (value > stress[1]) return { label: 'Úng', tone: 'is-bad' };
  if (value >= ideal[0] && value <= ideal[1]) return { label: 'Lý tưởng', tone: 'is-good' };
  return { label: 'Ngoài vùng', tone: 'is-note' };
}

/**
 * "Lần tưới gần nhất" theo đúng nghĩa của biến thứ 7 trong vector quan sát:
 * đợt tưới có nước gần nhất TRƯỚC ngày đó, kèm số ngày đã trôi qua.
 */
function buildLastIrrigation(series) {
  const map = new Map();
  let previous = null;
  for (const record of series) {
    map.set(
      record.day,
      previous ? { liters: previous.waterLiters, daysAgo: record.day - previous.day } : null,
    );
    if (record.waterLiters > 0) previous = record;
  }
  return map;
}

export function createHistoryLog(store) {
  const count = el('span', { class: 'log__count' }, '—');
  const trend = el('div', { class: 'log__trend' });
  const story = el('p', { class: 'log__story' });
  const filters = el('div', {
    class: 'log__filters',
    role: 'group',
    'aria-label': 'Lọc nhật ký theo hành động',
  });
  const live = el('div', { class: 'log__live', hidden: true });
  const detail = el('div', { class: 'log__detail' });
  const body = el('div', { class: 'log__body' });
  const empty = el('div', { class: 'log__empty', hidden: true }, 'Không có ngày nào khớp bộ lọc.');
  const head = el('div', { class: 'log__head', 'aria-hidden': 'true' }, COLUMNS.map((label) => el('span', {}, label)));

  const node = el('section', { class: 'section' }, [
    el('div', { class: 'section__head' }, [
      el('h3', { class: 'section__title' }, 'Diễn biến từng ngày'),
      count,
    ]),
    el(
      'p',
      { class: 'section__hint' },
      'Hành động, độ ẩm và biến động của từng ngày. Bấm một dòng (hoặc phím ↑/↓) để xem lại ngày đó.',
    ),
    trend,
    story,
    filters,
    live,
    detail,
    el('div', { class: 'log' }, [head, body]),
    empty,
  ]);

  let filter = 'all';
  /**
   * Chế độ xem: `false` = đang ở danh sách (đọc lướt nhiều ngày), `true` = đang
   * mở hồ sơ một ngày. Nút "← Danh sách" đưa về danh sách, bấm một dòng mở lại.
   */
  let detailOpen = true;
  /**
   * Ngày xa nhất đã từng chạy. Danh sách luôn dài tới mốc này nên lùi về ngày
   * trước KHÔNG làm những ngày sau biến mất — chỉ con số tổng hợp là tính tới
   * ngày đang xem. Đổi phiên (kịch bản/seed/cây) thì mốc này đặt lại.
   */
  let maxDaySeen = 1;
  let sessionKey = '';
  let view = null;
  let lastKey = '';
  let keepFocus = false;

  const filterButtons = FILTERS.map((entry) => {
    const button = el(
      'button',
      { class: 'log__filter', type: 'button', 'aria-pressed': String(entry.key === filter) },
      entry.label,
    );
    button.addEventListener('click', () => {
      if (filter === entry.key) return;
      filter = entry.key;
      for (const item of filterButtons) {
        item.button.setAttribute('aria-pressed', String(item.entry.key === filter));
      }
      render();
    });
    filters.append(button);
    return { button, entry };
  });

  function rowFor(record, meta, currentDay) {
    const isCurrent = record.day === currentDay;
    const delta = (record.moisture - record.previousMoisture) * 100;
    const water = record.waterLiters;
    const stageName = meta.stages?.[record.stage] ?? `GĐ ${record.stage}`;

    const deltaNode = el(
      'em',
      { class: `log__delta${delta > 0.05 ? ' is-up' : delta < -0.05 ? ' is-down' : ''}` },
      Number.isFinite(delta) && Math.abs(delta) >= 0.05 ? signed(delta, 1) : '',
    );

    return el(
      'button',
      {
        class: `log__row${isCurrent ? ' is-current' : ''}`,
        type: 'button',
        dataset: { day: record.day },
        'aria-current': isCurrent ? 'true' : null,
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
          {
            class: `log__reward${record.reward < 0 ? ' is-neg' : record.reward > 0 ? ' is-pos' : ''}`,
          },
          signed(record.reward, 0),
        ),
      ],
    );
  }

  function paintTrend(visible) {
    const recent = visible.slice(-7);
    const last = recent[recent.length - 1];
    const first = recent[0];
    const deltaMoisture = (last.moisture - first.previousMoisture) * 100;
    const water = recent.reduce((total, record) => total + finite(record.waterLiters), 0);
    const reward = recent.reduce((total, record) => total + finite(record.reward), 0);

    trend.replaceChildren(
      chip(
        'Độ ẩm',
        `${formatNumber(first.previousMoisture * 100, 1)}→${formatNumber(last.moisture * 100, 1)} %`,
        deltaMoisture > 0.05 ? 'is-up' : deltaMoisture < -0.05 ? 'is-down' : '',
      ),
      chip('Tưới', `${formatNumber(water, 0)} L`),
      chip('Thưởng', signed(reward, 0), reward >= 0 ? 'is-up' : 'is-down'),
    );
  }

  /** Tổng hợp tính tới ngày đang xem — trả lời "đến giờ đã tưới bao nhiêu, lời lỗ ra sao". */
  function paintStory(visible) {
    const water = visible.reduce((total, record) => total + finite(record.waterLiters), 0);
    const reward = visible.reduce((total, record) => total + finite(record.reward), 0);
    const watered = visible.filter((record) => record.waterLiters > 0).length;
    const worst = visible.reduce(
      (acc, record) => (finite(record.reward) < finite(acc.reward) ? record : acc),
      visible[0],
    );

    story.replaceChildren(
      el('span', {}, `Tới nay ${visible.length} ngày: `),
      el('b', {}, `${formatNumber(water, 0)} L`),
      el('span', {}, ` · ${watered} ngày có tưới · thưởng `),
      el('b', { class: reward < 0 ? 'is-neg' : reward > 0 ? 'is-pos' : '' }, signed(reward, 0)),
      el(
        'span',
        {},
        ` · tệ nhất ngày ${worst.day} (${signed(finite(worst.reward), 0)})`,
      ),
    );
  }

  function paintDetail(record, meta, lastIrrigation) {
    if (!record || !detailOpen) {
      detail.replaceChildren();
      detail.hidden = true;
      return;
    }
    detail.hidden = false;

    const cropInfo = meta.crops?.find((item) => item.code === view?.crop) ?? meta.crops?.[0];
    const stageName = meta.stages?.[record.stage] ?? `GĐ ${record.stage}`;
    const status = moistureStatus(record, meta);
    const delta = (record.moisture - record.previousMoisture) * 100;
    const hasDelta = Number.isFinite(delta) && Math.abs(delta) >= 0.05;

    const fields = [
      ['Loại cây', cropInfo ? `${cropInfo.label} · mã ${cropInfo.code}` : '—', ''],
      ['Giai đoạn', `${stageName} · mã ${record.stage}`, record.stage === 2 ? 'is-note' : ''],
      [
        'Độ ẩm đất',
        `${pct(record.moisture, 1)}${hasDelta ? ` (${signed(delta, 1)})` : ''}`,
        status.tone,
      ],
      [
        'Nhiệt độ',
        Number.isFinite(record.temperature) ? `${formatNumber(record.temperature, 1)} °C` : '—',
        '',
      ],
      ['Xác suất mưa', pct(record.rainProbability, 0), ''],
      ['Mưa dự báo', mm(record.rainForecastMm), ''],
      [
        'Mưa thực tế',
        mm(record.actualRainMm),
        Number.isFinite(record.actualRainMm) && record.actualRainMm > 0 ? 'is-water' : '',
      ],
      [
        'Lần tưới trước',
        lastIrrigation
          ? `${formatNumber(lastIrrigation.liters, 0)} L · ${lastIrrigation.daysAgo} ngày trước`
          : 'chưa tưới',
        '',
      ],
    ];

    const parts = REWARD_PARTS.map((part) => ({
      ...part,
      value: record.rewardParts?.[part.key],
    })).filter((part) => Number.isFinite(part.value) && Math.abs(part.value) > 1e-9);

    const partsNode = parts.length
      ? el(
          'div',
          { class: 'log__parts', 'aria-label': 'Phân rã điểm của ngày' },
          parts.map((part) =>
            el(
              'span',
              {
                class: `log__part${part.value > 0 ? ' is-pos' : part.value < 0 ? ' is-neg' : ''}`,
              },
              [el('em', {}, part.label), el('b', {}, signed(part.value, 0))],
            ),
          ),
        )
      : el(
          'p',
          { class: 'log__parts-empty' },
          Number.isFinite(record.reward)
            ? 'Không thành phần nào khác 0 — ngày không tưới, cây trong vùng lý tưởng.'
            : 'Dữ liệu ngày này chưa có phân rã điểm.',
        );

    const backButton = el(
      'button',
      { class: 'log__back', type: 'button', 'aria-label': 'Quay lại danh sách các ngày' },
      [el('span', { class: 'log__back-arrow', 'aria-hidden': 'true' }, '←'), 'Danh sách'],
    );
    backButton.addEventListener('click', () => {
      detailOpen = false;
      render();
      body.querySelector('.log__row.is-current')?.focus({ preventScroll: true });
    });

    detail.replaceChildren(
      el('div', { class: 'log__detail-top' }, [
        backButton,
        el('b', { class: 'log__detail-day' }, `Ngày ${record.day}`),
        el(
          'span',
          {
            class: `log__detail-reward${record.reward < 0 ? ' is-neg' : record.reward > 0 ? ' is-pos' : ''}`,
          },
          `Thưởng ${signed(record.reward, 0)}`,
        ),
      ]),
      el('div', { class: 'log__detail-sub' }, [
        el('span', { class: 'log__detail-tag' }, stageName),
        el('span', { class: `log__detail-status ${status.tone}` }, status.label),
        el(
          'span',
          { class: 'log__detail-action' },
          record.waterLiters > 0
            ? `Tưới ${formatNumber(record.waterLiters, 0)} L`
            : 'Ngày nghỉ tưới',
        ),
      ]),
      el(
        'div',
        { class: 'log__fields' },
        fields.map(([label, value, tone]) =>
          el(
            'span',
            { class: `log__field${tone ? ` ${tone}` : ''}`, title: `${label}: ${value}` },
            [el('em', {}, label), el('b', {}, value)],
          ),
        ),
      ),
      partsNode,
    );
  }

  function paintLive(state) {
    const notes = [];
    if (state.previewAction != null) {
      notes.push(
        `Mức tay ${formatNumber(state.previewAction, 0)} L (xem trước, chưa ghi vào nhật ký)`,
      );
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

  function render() {
    const state = view;
    if (!state) return;
    const { meta, series, day } = state;
    const total = Math.max(1, series.length);

    const key = `${state.scenario}|${state.seed}|${state.crop}|${series.length}`;
    if (key !== sessionKey) {
      sessionKey = key;
      maxDaySeen = 1;
    }
    maxDaySeen = clamp(Math.max(maxDaySeen, Math.round(day)), 1, total);

    /** Tới ngày đang xem — dùng cho chip 7 ngày, dòng tổng hợp và hồ sơ. */
    const reached = series.slice(0, clamp(Math.round(day), 1, total));
    if (!reached.length) return;
    /** Toàn bộ ngày đã chạy — dùng cho bảng, để lùi ngày không mất ngày sau. */
    const listed = series.slice(0, maxDaySeen);

    const filterDef = FILTERS.find((entry) => entry.key === filter) ?? FILTERS[0];
    const rows = filterDef.test ? listed.filter(filterDef.test) : listed;
    const current = reached[reached.length - 1];

    paintTrend(reached);
    paintStory(reached);
    paintDetail(current, meta, buildLastIrrigation(series).get(current.day) ?? null);
    node.classList.toggle('is-list', !detailOpen);
    body.replaceChildren(...rows.map((record) => rowFor(record, meta, current.day)));

    const scope = filter === 'all' ? `${listed.length} ngày` : `${rows.length}/${listed.length} ngày`;
    count.textContent =
      current.day < listed.length ? `${scope} · đang xem ngày ${current.day}` : scope;
    empty.hidden = rows.length > 0;
    empty.textContent = `Không có ngày nào khớp bộ lọc "${
      filterDef.label
    }" trong ${listed.length} ngày đã chạy.`;

    scrollCurrentIntoView(body.querySelector('.log__row.is-current'));

    if (keepFocus) {
      keepFocus = false;
      body.querySelector('.log__row.is-current')?.focus({ preventScroll: true });
    }
  }

  function update(state) {
    view = state;
    paintLive(state);

    const key = [
      state.day,
      state.series?.length,
      state.scenario,
      state.seed,
      state.crop,
      state.activeTab,
    ].join('|');
    if (key === lastKey) return;
    lastKey = key;
    render();
  }

  body.addEventListener('click', (event) => {
    const row = event.target.closest('.log__row');
    if (!row) return;
    const day = Number(row.dataset.day);
    if (!Number.isFinite(day)) return;
    keepFocus = true;
    // Bấm một ngày = mở hồ sơ ngày đó (nếu đang ở danh sách thì mở lại).
    if (!detailOpen) {
      detailOpen = true;
      if (day === store.getState().day) {
        render();
        return;
      }
    }
    store.setState({ day });
  });

  // ↑/↓ tua từng ngày; Esc đóng hồ sơ để về danh sách.
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && detailOpen) {
      event.preventDefault();
      detailOpen = false;
      render();
      body.querySelector('.log__row.is-current')?.focus({ preventScroll: true });
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (!event.target.closest?.('.log__row')) return;
    event.preventDefault();
    const state = store.getState();
    const next = event.key === 'ArrowDown' ? state.day + 1 : state.day - 1;
    const clamped = clamp(next, 1, Math.max(1, state.series.length));
    if (clamped === state.day) return;
    keepFocus = true;
    store.setState({ day: clamped });
  });

  return { node, update };
}
