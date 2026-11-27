/** Gắn các điều khiển vào khung mô phỏng và bảng dữ liệu. */

import { el } from '../utils/dom.js';
import { ViewTitle } from './ViewTitle.js';
import { CameraButtons } from './CameraButtons.js';
import { DeviceHotspots } from './DeviceHotspots.js';
import { FieldHud } from './FieldHud.js';
import { SimDock } from './SimDock.js';
import { SidePanel } from './SidePanel.js';

export function mountApp(root, store, actions, scene) {
  const toast = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  root.append(toast);

  let toastTimer = 0;
  const notify = (message) => {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
  };

  const appActions = { ...actions, notify };

  const parts = [];
  function mount(selector, ...components) {
    root.querySelector(selector).append(...components.map((component) => component.node));
    parts.push(...components);
  }
  mount('.workspace-heading', ViewTitle(store));
  const hud = FieldHud(store, appActions);
  mount(
    '.field__viewport',
    hud,
    CameraButtons(store, scene),
    DeviceHotspots(store, scene),
  );
  root.querySelector('.field__telemetry').append(hud.readout);
  mount('.field__controls', SimDock(store, appActions));
  mount('.workspace-data', SidePanel(store));

  const fieldName = root.querySelector('#field-title');
  const stage = root.querySelector('.field__stage');
  const unsubscribe = store.subscribe((state) => {
    const crop = state.meta.crops.find((item) => item.code === state.crop);
    const record = state.series[state.day - 1];
    fieldName.textContent = crop?.key === 'rice' ? 'Ruộng lúa' : 'Vườn ngô';
    stage.textContent = record ? state.meta.stages[record.stage] : '';
  });

  return {
    notify,
    destroy() {
      window.clearTimeout(toastTimer);
      unsubscribe();
      for (const part of parts) part.destroy?.();
    },
  };
}
