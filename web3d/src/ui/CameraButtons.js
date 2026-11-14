import { el, icon } from '../utils/dom.js';

/** Cụm 3 nút tròn: bàn tay (kéo-di chuyển), zoom in, zoom out. */
export function CameraButtons(store) {
  const handButton = el(
    'button',
    { class: 'camera__btn', type: 'button', 'aria-label': 'Bật chế độ kéo di chuyển', 'aria-pressed': 'false' },
    [icon('hand')],
  );
  const zoomIn = el('button', { class: 'camera__btn', type: 'button', 'aria-label': 'Phóng to' }, [
    icon('plus'),
  ]);
  const zoomOut = el('button', { class: 'camera__btn', type: 'button', 'aria-label': 'Thu nhỏ' }, [
    icon('minus'),
  ]);

  handButton.addEventListener('click', () => {
    store.setState((state) => ({ handMode: !state.handMode }));
  });

  const zoomBy = (factor) =>
    store.setState((state) => ({
      cameraDistance: Math.min(44, Math.max(12, (state.cameraDistance ?? 26) * factor)),
    }));

  zoomIn.addEventListener('click', () => zoomBy(0.86));
  zoomOut.addEventListener('click', () => zoomBy(1.16));

  const node = el('div', { class: 'camera', role: 'group', 'aria-label': 'Điều khiển camera' }, [
    handButton,
    zoomIn,
    zoomOut,
  ]);

  function update(state) {
    handButton.classList.toggle('is-active', Boolean(state.handMode));
    handButton.setAttribute('aria-pressed', String(Boolean(state.handMode)));
  }

  const unsubscribe = store.subscribe(update);
  return { node, destroy: unsubscribe };
}
