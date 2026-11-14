/**
 * Nút điều khiển gắn TRỰC TIẾP vào vật thể 3D: một nút cho trạm bơm và một nút
 * cho từng đầu phun. Toạ độ lấy từ `scene.onDevices` (Vector3.project mỗi
 * frame), nên xoay/kéo camera thì nút vẫn bám đúng thiết bị.
 *
 * Chỉ hiện ở mục "Điều khiển thiết bị" để không rối cảnh giám sát.
 */

import { SCENE } from '../config.js';
import { el, icon } from '../utils/dom.js';
import { zonePlan } from '../utils/zones.js';

export function DeviceHotspots(store, scene) {
  const node = el('div', { class: 'hotspots', 'aria-hidden': 'false' });
  const buttons = new Map();

  function isPumpOn(state) {
    return state.pumpOn !== false;
  }

  function makeButton(device, index) {
    const isPump = device.id === 'pump';
    const button = el(
      'button',
      {
        class: `hotspot${isPump ? ' hotspot--pump' : ''}`,
        type: 'button',
        'aria-label': isPump ? 'Bật hoặc tắt bơm' : `Đóng hoặc mở ${device.label}`,
        'aria-pressed': 'false',
      },
      isPump
        ? [icon('power'), el('span', { class: 'hotspot__text' }, 'Bơm')]
        : [el('span', { class: 'hotspot__num' }, String(index))],
    );

    button.addEventListener('click', () => {
      const state = store.getState();
      if (isPump) {
        store.setState({ pumpOn: !isPumpOn(state) });
        return;
      }
      const heads = [...(state.openHeads ?? [])];
      while (heads.length < index) heads.push(true);
      heads[index - 1] = heads[index - 1] === false;
      store.setState({ openHeads: heads });
    });

    return button;
  }

  function place(list) {
    for (const point of list) {
      const button = buttons.get(point.id);
      if (!button) continue;
      button.style.left = `${point.x * 100}%`;
      button.style.top = `${point.y * 100}%`;
      button.classList.toggle('is-offscreen', !point.visible);
    }
  }

  function sync(state) {
    const visible = state.view === 'device';
    node.classList.toggle('is-visible', visible);
    const pumpRunning = isPumpOn(state);

    const journey = state.series?.slice(0, Math.max(1, state.day)) ?? [];
    const record = journey[journey.length - 1];
    const liters = state.previewAction ?? (record ? record.waterLiters : 0);
    const plan = zonePlan({
      liters,
      day: record ? record.day : state.day,
      headCount: SCENE.plot.sprinklerCount,
      actionLiters: state.meta?.actionLiters ?? [],
    });
    for (const [id, button] of buttons) {
      if (id === 'pump') {
        button.classList.toggle('is-on', pumpRunning);
        button.setAttribute('aria-pressed', String(pumpRunning));
        button.disabled = false;
        continue;
      }
      const index = Number(id.split('-')[1]);
      const open = state.openHeads?.[index] !== false;
      const inZone = Boolean(plan[index]);
      const active = open && pumpRunning && inZone && liters > 0;
      button.classList.toggle('is-on', active);
      button.classList.toggle('is-standby', open && pumpRunning && !inZone && liters > 0);
      button.classList.toggle('is-closed', !open);
      button.setAttribute('aria-pressed', String(open));
      button.disabled = !pumpRunning;
    }
  }

  const detach = scene?.onDevices
    ? scene.onDevices((list) => {
        // Tạo nút lần đầu, sau đó chỉ cập nhật vị trí.
        for (const point of list) {
          if (buttons.has(point.id)) continue;
          const index = point.id.startsWith('head-')
            ? Number(point.id.split('-')[1]) + 1
            : 0;
          const button = makeButton(point, index);
          buttons.set(point.id, button);
          node.append(button);
        }
        place(list);
      })
    : () => {};

  const unsubscribe = store.subscribe(sync);
  return { node, destroy: () => { unsubscribe(); detach(); } };
}
