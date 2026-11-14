/**
 * Điểm vào duy nhất của giao diện.
 *
 * Giai đoạn 1: dữ liệu mock trong bộ nhớ (data/mock.js).
 * Giai đoạn 2: thay bằng Replay CSV; giai đoạn 3: thay bằng /api + WebSocket.
 */

import './styles/tokens.css';
import './styles/layout.css';
import './styles/glass.css';
import './styles/panel.css';
import './styles/chart.css';

import { createMockSession } from './data/mock.js';
import { createPlayback } from './data/playback.js';
import { createSceneManager } from './scene/SceneManager.js';
import { createStore } from './state/store.js';
import { mountApp } from './ui/App.js';

const session = createMockSession({ scenario: 'dry', seed: 42, crop: 0 });

const store = createStore({
  ...session,
  activeTab: 'overview',
  view: 'monitor',
  playing: false,
  speed: 1,
  mode: 'replay',
  agentA: 'random',
  agentB: 'fixed',
  heatmap: false,
  /** "estimate" (mỗi dải một m_i ước lượng) hoặc "uniform" (m_i = m(t)). */
  zoneMode: 'estimate',
  handMode: false,
  pumpOn: true,
  openHeads: [true, true, true, true],
  cameraDistance: 26,
  previewAction: null,
  anchor: null,
});

const actions = {
  /** Dựng lại phiên mock (giai đoạn 3 sẽ gọi POST /api/session). */
  regenerate(patch = {}, { keepDay = false } = {}) {
    const state = store.getState();
    const scenario = patch.scenario ?? state.scenario;
    const seed = patch.seed ?? state.seed;
    const crop = patch.crop ?? state.crop;
    const next = createMockSession({ scenario, seed, crop });

    store.setState({
      meta: next.meta,
      series: next.series,
      scenario,
      seed,
      crop,
      day: keepDay ? Math.min(state.day, next.series.length) : next.day,
      playing: false,
      previewAction: null,
    });
  },
};

const scene = createSceneManager(document.getElementById('scene-root'), store);
store.setState({ cameraDistance: scene.baseDistance });

mountApp(document.getElementById('overlay'), store, actions, scene);
createPlayback(store);

// Tay nắm debug chỉ tồn tại ở chế độ dev (không lọt vào bản build).
if (import.meta.env.DEV) {
  window.__agriwater = { store, scene, actions };
}

window.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    store.setState((state) => ({ playing: !state.playing }));
  } else if (event.key === 'r' || event.key === 'R') {
    store.setState({ day: 1, playing: false });
  }
});

const loader = document.getElementById('loader');
window.setTimeout(() => loader?.classList.add('is-done'), 520);
