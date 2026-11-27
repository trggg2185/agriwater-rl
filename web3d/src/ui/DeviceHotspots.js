import { SCENE } from '../config.js';
import { el } from '../utils/dom.js';
import { fieldIrrigationStatus } from '../utils/irrigationZones.js';

export function DeviceHotspots(store, scene) {
  const node = el('div', { class: 'hotspots' });
  const devices = new Map();

  function sync(state) {
    const controls = state.view === 'device';
    const { pumpOn, liters, openMask } = fieldIrrigationStatus(state, SCENE.sprinklers.headCount);
    for (const { index, button, marker, status } of devices.values()) {
      const enabled = state.openHeads?.[index] !== false;
      const active = openMask[index];
      button.hidden = !controls;
      marker.classList.toggle('is-on', active);
      marker.classList.toggle('is-controlled', controls);
      status.textContent = `S${index + 1}: ${active ? 'PHUN' : enabled ? 'CHỜ' : 'TẮT'}`;
      button.classList.toggle('is-on', active);
      button.classList.toggle('is-standby', enabled && pumpOn && !active && liters > 0);
      button.setAttribute('aria-pressed', String(enabled));
      button.disabled = state.simulationBusy;
    }
  }

  const detach = scene.onDevices((points) => {
    for (const [index, point] of points.entries()) {
      if (!devices.has(point.id)) {
        const button = el('button', {
          class: 'hotspot', type: 'button', 'aria-label': `Đóng hoặc mở ${point.label.toLowerCase()}`,
          hidden: true,
        }, String(index + 1));
        button.addEventListener('click', () => {
          const heads = [...(store.getState().openHeads ?? [])];
          while (heads.length <= index) heads.push(true);
          heads[index] = !heads[index];
          store.setState({ openHeads: heads });
        });
        const status = el('span', { class: 'hotspot-marker__label' });
        const marker = el('span', { class: 'hotspot-marker', 'aria-hidden': 'true' }, [
          el('span', { class: 'hotspot-marker__spray' }),
          el('span', { class: 'hotspot-marker__dot' }),
          status,
          index === 3 && el('span', { class: 'hotspot-marker__callout' }, 'Vòi phun tự động'),
        ]);
        const pin = el('div', { class: 'hotspot-pin' }, [marker, button]);
        devices.set(point.id, { index, button, marker, status, pin });
        node.append(pin);
        sync(store.getState());
      }
      const { pin } = devices.get(point.id);
      pin.style.left = `${point.x * 100}%`;
      pin.style.top = `${point.y * 100}%`;
      pin.hidden = !point.visible;
    }
  });

  const unsubscribe = store.subscribe(sync);
  return { node, destroy: () => { unsubscribe(); detach(); } };
}
