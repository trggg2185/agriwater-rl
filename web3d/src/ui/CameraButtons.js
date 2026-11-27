import { el, icon } from '../utils/dom.js';

/** Cụm 3 nút tròn: kéo máy quay, zoom in, zoom out. */
export function CameraButtons(store, scene) {
  const handButton = el(
    'button',
    { class: 'camera__btn', type: 'button', 'aria-label': 'Chế độ kéo máy quay', title: 'Bật hoặc tắt chế độ kéo máy quay. Nhấn Esc để đặt lại khung nhìn.', 'aria-pressed': 'false' },
    [icon('hand')],
  );
  const zoomIn = el('button', { class: 'camera__btn', type: 'button', 'aria-label': 'Phóng to' }, [
    icon('plus'),
  ]);
  const zoomOut = el('button', { class: 'camera__btn', type: 'button', 'aria-label': 'Thu nhỏ' }, [
    icon('minus'),
  ]);

  handButton.addEventListener('click', () => {
    store.setState(({ handMode }) => ({ handMode: !handMode }));
  });

  zoomIn.addEventListener('click', () => scene.zoomBy(0.86));
  zoomOut.addEventListener('click', () => scene.zoomBy(1.16));

  const node = el('div', { class: 'camera', role: 'group', 'aria-label': 'Điều khiển khung nhìn' }, [
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
