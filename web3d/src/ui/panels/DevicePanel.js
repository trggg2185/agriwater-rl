/**
 * Panel "Điều khiển thiết bị": trạng thái bơm và đầu phun, chọn 6 mức nước và
 * công tắc bơm. Mọi thay đổi ghi vào store (pumpOn / openHeads / previewAction),
 * cảnh 2D và các nút gắn trên vật thể đọc lại từ đó.
 */

import { SCENE } from '../../config.js';
import { el, icon } from '../../utils/dom.js';
import { formatNumber } from '../../utils/math.js';
import { clampHeadCount, irrigationBlock, fieldIrrigationStatus } from '../../utils/irrigationZones.js';

function statusCard({ label, unit = '', tone = '' }) {
  const value = el('span', { class: 'kpi__value' });
  const node = el('div', { class: `kpi${tone ? ` ${tone}` : ''}` }, [
    el('span', { class: 'kpi__label' }, label),
    el('span', { class: 'kpi__value' }, [value, el('span', { class: 'kpi__unit' }, unit)]),
  ]);
  return { node, value };
}

export function createDevicePanel(store, actions) {
  const headCount = clampHeadCount(SCENE.sprinklers.headCount);

  // ---------- Trạng thái ----------
  const pumpCard = statusCard({ label: 'Bơm' });
  const levelCard = statusCard({ label: 'Mức hiển thị', unit: 'L' });
  const headCard = statusCard({ label: 'Vòi đang phun' });
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
      button.addEventListener('click', () => actions.selectIrrigation(liters));
      levelGrid.append(button);
      return button;
    });
  }

  // ---------- Đầu phun ----------
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
    'Các vòi đang mở chia vùng để phủ toàn ruộng. Mô hình Python tính lượng nước chung cho ruộng.',
  );

  const levelHint = el('p', { class: 'section__hint' });
  const node = el('div', { class: 'device-panel' }, [
    el('section', { class: 'section' }, [
      el('div', { class: 'section__head' }, [el('h3', { class: 'section__title' }, 'Trạng thái')]),
      statusGrid,
    ]),
    el('section', { class: 'section' }, [pumpButton]),
    el('section', { class: 'section' }, [
      el('div', { class: 'section__head' }, [el('h3', { class: 'section__title' }, 'Mức nước')]),
      levelGrid,
      levelHint,
    ]),
    el('section', { class: 'section' }, [
      el('div', { class: 'section__head' }, [el('h3', { class: 'section__title' }, 'Đầu phun')]),
      headList,
    ]),
    hint,
  ]);

  function update(state) {
    const { liters, pumpOn, openMask } = fieldIrrigationStatus(state, headCount);
    const openHeads = state.openHeads ?? [];
    const sprayingCount = openMask.filter(Boolean).length;

    pumpCard.value.textContent = pumpOn ? 'Bật' : 'Tắt';
    pumpCard.node.classList.toggle('is-warn', !pumpOn);
    levelCard.value.textContent = formatNumber(liters, 0);
    levelCard.node.classList.toggle('is-warn', liters === 0);
    headCard.value.textContent = `${sprayingCount}/${headRows.length}`;
    headCard.node.classList.toggle('is-warn', sprayingCount === 0);

    pumpButton.disabled = state.simulationBusy;
    pumpButton.classList.toggle('is-on', pumpOn);
    pumpButton.setAttribute('aria-pressed', String(pumpOn));
    pumpButton.replaceChildren(icon('power'), pumpOn ? 'Bơm đang chạy' : 'Bơm đã tắt');

    if (levelButtons.length !== (state.meta?.actionLiters?.length ?? 0)) {
      buildLevels(state.meta.actionLiters);
    }
    levelButtons.forEach((button, index) => {
      const candidate = state.meta.actionLiters[index];
      const blocked = irrigationBlock(state, candidate, headCount);
      const selected = candidate === state.previewAction;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = Boolean(blocked);
      button.title = blocked;
    });
    levelHint.textContent = irrigationBlock(state, 1, headCount) || (state.dataSource === 'api'
      ? 'Chọn mức nước, rồi bấm nút áp dụng ở thanh ngày.'
      : 'Chọn mức nước để xem thử trên ruộng.');

    headRows.forEach((row, index) => {
      const open = openHeads[index] !== false;
      const running = openMask[index];
      row.toggle.disabled = state.simulationBusy;
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
