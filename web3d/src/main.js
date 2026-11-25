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

import { fetchMeta, fetchSession, loadStaticReplay, pickStaticReplay } from './data/api.js';
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
  backendOnline: false,
  agentA: 'dqn',
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

let requestSeq = 0;
let appHandle = null;

function applySession(next, { scenario, seed, crop, agentA, keepDay, mode }) {
  const prevDay = store.getState().day;
  const maxDay = Math.max(1, next.series.length);
  store.setState({
    meta: next.meta ?? store.getState().meta,
    series: next.series,
    scenario,
    seed,
    crop,
    agentA,
    mode: mode ?? store.getState().mode,
    day: keepDay ? Math.min(prevDay, maxDay) : Math.min(next.day ?? 1, maxDay),
    playing: false,
    previewAction: null,
  });
}

const actions = {
  /** Dựng lại phiên từ backend Live (DQN thật), replay DQN tĩnh hoặc mock. */
  async regenerate(patch = {}, { keepDay = false } = {}) {
    const state = store.getState();
    const scenario = patch.scenario ?? state.scenario;
    const seed = patch.seed ?? state.seed;
    const crop = patch.crop ?? state.crop;
    const agentA = patch.agentA ?? state.agentA;
    const mode = patch.mode ?? state.mode;
    const token = ++requestSeq;

    if (mode === 'live' || state.backendOnline) {
      try {
        const live = await fetchSession({ scenario, seed, crop, agent: agentA });
        if (token !== requestSeq) return;
        store.setState({ backendOnline: true });
        applySession(live, { scenario, seed, crop, agentA, keepDay, mode: 'live' });
        return;
      } catch {
        if (token !== requestSeq) return;
        store.setState({ backendOnline: false });
        if (mode === 'live') {
          appHandle?.notify(
            'Chưa bật backend Python (chạy: .venv/Scripts/python.exe -m agriwater.dashboard.api). Đang dùng bản phát lại DQN.',
          );
        }
      }
    }

    const bundle = await loadStaticReplay().catch(() => null);
    if (token !== requestSeq) return;
    const replayed = pickStaticReplay(bundle, { scenario, crop, agent: agentA });
    if (replayed) {
      applySession(replayed, { scenario, seed: replayed.seed ?? seed, crop, agentA, keepDay, mode: 'replay' });
      if (seed !== (replayed.seed ?? 42)) {
        appHandle?.notify('Bản phát lại DQN dùng seed 42; bật backend API để chạy mọi seed.');
      }
      return;
    }

    const fallback = createMockSession({ scenario, seed, crop });
    applySession(fallback, { scenario, seed, crop, agentA, keepDay, mode: 'replay' });
  },
};

const scene = createSceneManager(document.getElementById('scene-root'), store);
store.setState({ cameraDistance: scene.baseDistance });

appHandle = mountApp(document.getElementById('overlay'), store, actions, scene);
createPlayback(store);

// Tự động kết nối backend DQN nếu đang chạy, ngược lại nạp bản phát lại DQN thật.
fetchMeta()
  .then((meta) => {
    store.setState({ meta, backendOnline: true, mode: 'live' });
    return actions.regenerate({ agentA: 'dqn', mode: 'live' }, { keepDay: false });
  })
  .catch(() => actions.regenerate({ agentA: 'dqn', mode: 'replay' }, { keepDay: false }));

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
