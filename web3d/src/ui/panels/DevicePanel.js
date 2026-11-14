/**
 * Panel "Điều khiển thiết bị": trạng thái bơm + 4 đầu phun, chọn 6 mức nước và
 * công tắc bơm. Mọi thay đổi ghi vào store (pumpOn / openHeads / previewAction),
 * cảnh 3D và các nút gắn trên vật thể đọc lại từ đó — một nguồn duy nhất.
 */

import { SCENE } from '../../config.js';
import { el, icon } from '../../utils/dom.js';
import { formatNumber } from '../../utils/math.js';
import { zonePlan } from '../../utils/zones.js';

function statusCard({ label, unit = '', tone = '' }) {
  const value = el('span', { class: 'kpi__value' });
  const node = el('div', { class: `kpi${tone ? ` ${tone}` : ''}` }, [
    el('span', { class: 'kpi__label' }, label),
    el('span', { class: 'kpi__value' }, [value, el('span', { class: 'kpi__unit' }, unit)]),
  ]);
  return { node, value };
}

export function createDevicePanel(store) {
  const headCount = SCENE.plot.sprinklerCount;

  // ---------- Trạng thái ----------
  const pumpCard = statusCard({ label: 'Bơm' });
  const levelCard = statusCard({ label: 'Mức đang chọn', unit: 'L' });
  const headCard = statusCard({ label: 'Đang phun' });
  pumpCard.value.textContent = 'Bật';

  const statusGrid = el('div', { class: 'kpi-grid' }, [
    pumpCard.node,
    levelCard.node,
    headCard.node,
  ]);

  // ---------- Bơm ----------
  const pumpIcon = icon('power');
  const pumpButton = el(
    'button',
    { class: 'device-switch', type: 'button', 'aria-pressed': 'true' },
    [pumpIcon, 'Bơm đang chạy'],
  );
  pumpButton.addEventListener('click', () => {
    const state = store.getState();
    store.setState({ pumpOn: state.pumpOn === false });
  });

  // ---------- 6 mức nước ----------
  const levelGrid = el('div', { class: 'level-grid', role: 'group', 'aria-label': 'Mức nước tưới' });
  let levelButtons = [];

  function buildLevels(actionLiters) {
    levelGrid.replaceChildren();
    levelButtons = actionLiters.map((liters) => {
      const button = el(
        'button',
        { class: 'level-btn', type: 'button' },
        [el('strong', {}, liters === 0 ? '0' : String(liters)), el('span', {}, 'L')],
      );
      button.addEventListener('click', () => store.setState({ previewAction: liters }));
      levelGrid.append(button);
      return button;
    });
  }

  // ---------- 4 đầu phun ----------
  const headList = el('div', { class: 'device-heads' });
  const headRows = [];

  for (let index = 0; index < headCount; index += 1) {
    const dot = el('span', { class: 'device-head__dot' });
    const state = el('span', { class: 'device-head__state' }, 'Mở');
    const toggle = el(
      'button',
      {
        class: 'device-toggle',
        type: 'button',
        'aria-pressed': 'true',
        'aria-label': `Đóng hoặc mở đầu phun ${index + 1}`,
      },
      [el('span', { class: 'device-toggle__knob' })],
    );
    toggle.addEventListener('click', () => {
      const current = store.getState();
      const open = [...(current.openHeads ?? [])];
      while (open.length <= index) open.push(true);
      open[index] = open[index] === false;
      store.setState({ openHeads: open });
    });

    headList.append(
      el('div', { class: 'device-head' }, [
        dot,
        el('span', { class: 'device-head__name' }, `Đầu phun ${index + 1}`),
        state,
        toggle,
      ]),
    );
    headRows.push({ dot, state, toggle });
  }

  const hint = el(
    'p',
    { class: 'section__hint' },
    'Bơm tưới luân canh từng khu: 5 L mở 1 vòi, 25 L mở cả 4, khu được chọn xoay theo ngày. Bấm nút tròn trên cảnh để bật/tắt bơm và đóng/mở từng đầu phun.',
  );

  const node = el('div', { class: 'device-panel' }, [
    el('section', { class: 'section' }, [
      el('div', { class: 'section__head' }, [el('h3', { class: 'section__title' }, 'Trạng thái')]),
      statusGrid,
    ]),
    el('section', { class: 'section' }, [pumpButton]),
    el('section', { class: 'section' }, [
      el('div', { class: 'section__head' }, [el('h3', { class: 'section__title' }, 'Mức nước')]),
      levelGrid,
    ]),
    el('section', { class: 'section' }, [
      el('div', { class: 'section__head' }, [el('h3', { class: 'section__title' }, 'Đầu phun')]),
      headList,
    ]),
    hint,
  ]);

  function update(state) {
    const visible = state.series.slice(0, Math.max(1, state.day));
    const record = visible[visible.length - 1];
    const liters = state.previewAction ?? (record ? record.waterLiters : 0);
    const openHeads = state.openHeads ?? [];
    const pumpOn = state.pumpOn !== false;
    // Hệ tưới chạy luân canh khu: mỗi đợt chỉ một phần số vòi phun.
    const plan = zonePlan({
      liters,
      day: record ? record.day : state.day,
      headCount: headRows.length,
      actionLiters: state.meta?.actionLiters ?? [],
    });
    const sprayingCount = headRows.reduce(
      (total, _row, index) =>
        total + (openHeads[index] !== false && plan[index] && pumpOn && liters > 0 ? 1 : 0),
      0,
    );

    pumpCard.value.textContent = pumpOn ? 'Bật' : 'Tắt';
    pumpCard.node.classList.toggle('is-warn', !pumpOn);
    levelCard.value.textContent = liters === 0 ? 'Không tưới' : formatNumber(liters, 0);
    levelCard.node.classList.toggle('is-warn', liters === 0);
    headCard.value.textContent = `${sprayingCount}/${headRows.length}`;
    headCard.node.classList.toggle('is-warn', sprayingCount === 0);

    pumpButton.classList.toggle('is-on', pumpOn);
    pumpButton.setAttribute('aria-pressed', String(pumpOn));
    pumpButton.replaceChildren(icon('power'), pumpOn ? 'Bơm đang chạy' : 'Bơm đã tắt');

    if (levelButtons.length !== (state.meta?.actionLiters?.length ?? 0)) {
      buildLevels(state.meta.actionLiters);
    }
    levelButtons.forEach((button, index) => {
      button.classList.toggle('is-active', state.meta.actionLiters[index] === liters);
    });

    headRows.forEach((row, index) => {
      const open = openHeads[index] !== false;
      const inZone = Boolean(plan[index]);
      const running = open && inZone && pumpOn && liters > 0;
      row.toggle.classList.toggle('is-on', open);
      row.toggle.setAttribute('aria-pressed', String(open));
      row.dot.classList.toggle('is-running', running);
      row.dot.classList.toggle('is-standby', open && !running && liters > 0);
      row.state.classList.toggle('is-wait', open && liters > 0 && !running);
      row.state.textContent = !open
        ? 'Đóng'
        : running
          ? 'Đang phun'
          : !pumpOn
            ? 'Chờ bơm'
            : liters === 0
              ? 'Mở'
              : 'Chờ khu';
    });
  }

  return { node, update };
}
