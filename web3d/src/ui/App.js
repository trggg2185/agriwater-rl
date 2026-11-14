/**
 * Lắp ráp toàn bộ lớp UI nổi trên cảnh 3D.
 * Mỗi component chỉ nhận store (và actions khi cần điều khiển dữ liệu).
 */

import { el } from '../utils/dom.js';
import { createLabels3D } from '../scene/Labels3D.js';
import { TopBrand } from './TopBrand.js';
import { TopNav } from './TopNav.js';
import { WeatherCard } from './WeatherCard.js';
import { ViewTitle } from './ViewTitle.js';
import { CameraButtons } from './CameraButtons.js';
import { DeviceHotspots } from './DeviceHotspots.js';
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

  const parts = [
    TopBrand(store),
    TopNav(store),
    createLabels3D(store, scene),
    WeatherCard(store),
    CameraButtons(store),
    DeviceHotspots(store, scene),
    ViewTitle(store),
    SidePanel(store, appActions),
    SimDock(store, appActions),
  ];

  parts.forEach((part, index) => {
    part.node.style.setProperty('--d', `${80 + index * 55}ms`);
    part.node.classList.add('enter');
    root.append(part.node);
  });

  return {
    notify,
    destroy() {
      window.clearTimeout(toastTimer);
      for (const part of parts) part.destroy?.();
    },
  };
}
