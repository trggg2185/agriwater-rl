/**
 * Điểm vào duy nhất của giao diện.
 *
 * Ba nguồn dữ liệu, thử theo thứ tự từ "thật nhất" tới "tự túc":
 *
 *   1. FastAPI (`agriwater/api/app.py`) — bấm tưới là Python tính ngay.
 *   2. Episode JSON do Python xuất (`web3d/scripts/export_episode.py`).
 *   3. Mock trong bộ nhớ (`data/mock.js`) để giao diện luôn dựng đủ hình.
 *
 * Store giữ `dataSource` = 'api' | 'python' | 'mock'. Chỉ nhánh 'api' mới gửi
 * action về Python; hai nhánh còn lại chỉ phát lại dữ liệu đã có.
 */

import { createElement } from 'react';
import { SCENE } from './config.js';
import { irrigationBlock } from './utils/irrigationZones.js';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import './styles/utilities.css';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/glass.css';
import './styles/panel.css';
import './styles/chart.css';
import './styles/field.css';
import './styles/research.css';

import * as api from './data/apiClient.js';
import { createMockSession } from './data/mock.js';
import { createPlayback } from './data/playback.js';
import { episodeUrl, loadEpisode, normalizeEpisode } from './data/replay.js';
import { createFieldScene } from './scene/FieldScene2D.js';
import { createStore } from './state/store.js';
import { mountApp } from './ui/App.js';
import { Dashboard } from './ui/Dashboard.jsx';

const DEFAULT_SESSION = { scenario: 'dry', seed: 42, crop: 1 };
const DEFAULT_OPEN_DAY = 18;
const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';

/** Ván đang chạy trên server; `null` = không ở chế độ live. */
let notify = () => {};

async function openSession({ scenario, seed, crop, startDay = 1, offline = false, profile }) {
  if (!offline) {
    try {
      const payload = await api.createSession({ scenario, seed, crop, startDay, initialState: profile?.initialState, weather: profile?.weather });
      console.info(`[agriwater] backend live: ${scenario} · seed ${seed}`);
      return { ...normalizeEpisode(payload, { dataSource: 'api' }), sessionId: payload.session_id };
    } catch (error) {
      if (profile) throw error;
      console.info(`[agriwater] không có backend FastAPI (${error.message}) — thử episode JSON`);
    }
  }

  try {
    const episode = await loadEpisode(episodeUrl(scenario, seed, crop));
    if (episode.crop !== crop) throw new Error('Episode không đúng loại cây');
    const source = episode.source ?? {};
    console.info(
      `[agriwater] dữ liệu từ Python: ${episode.series.length} ngày · ` +
        `${source.policy ?? '?'} · ${source.config ?? '?'}`,
    );
    return episode;
  } catch (error) {
    console.info(`[agriwater] không có episode Python (${error.message}) — dùng mock`);
    return { ...createMockSession({ scenario, seed, crop }), dataSource: 'mock' };
  }
}

const session = await openSession({
  ...DEFAULT_SESSION,
  startDay: DEFAULT_OPEN_DAY,
  offline: previewMode,
});
let liveSessionId = session.sessionId ?? null;

const store = createStore({
  ...session,
  activeTab: 'overview',
  day: session.dataSource === 'api' ? session.day : Math.min(DEFAULT_OPEN_DAY, session.series.length),
  view: 'monitor',
  autoIrrigation: true,
  playing: false,
  speed: 1,
  mode: session.dataSource === 'api' ? 'live' : 'replay',
  heatmap: false,
  /** "estimate" (mỗi dải một m_i ước lượng) hoặc "uniform" (m_i = m(t)). */
  zoneMode: 'estimate',
  handMode: false,
  pumpOn: true,
  openHeads: [],
  previewAction: null,
  simulationBusy: false,
});

/** Đếm lượt gọi để lần tải chậm về sau không ghi đè lần tải mới. */
let regenerateToken = 0;

/** Chỉ gửi một bước tại một thời điểm. Không tự chuyển vụ hay gửi lại khi lỗi. */
async function applyIrrigation(liters, automatic) {
  const token = regenerateToken;
  const sessionId = liveSessionId;
  if (!sessionId) return;
  store.setState({ simulationBusy: true });
  try {
    const action = api.litersToAction(store.getState().meta, liters);
    const payload = await api.step({ sessionId, action, automatic });
    if (token !== regenerateToken) return;
    const next = normalizeEpisode(payload, { dataSource: 'api' });
    const last = next.series.at(-1);
    const finished = last?.terminated || last?.truncated;
    store.setState({
      meta: next.meta,
      series: next.series,
      day: next.day,
      source: next.source,
      previewAction: null,
      simulationBusy: false,
      ...(finished ? { playing: false } : {}),
    });
    if (liters > 0 || !automatic) {
      notify(last.waterLiters > 0
        ? `Đã tưới ${last.waterLiters} L ngày ${next.day}.`
        : `Ngày ${next.day} đã được mô phỏng.`);
    }
  } catch (error) {
    if (token !== regenerateToken) return;
    store.setState({ simulationBusy: false, playing: false });
    notify(`Không tính được ngày tiếp theo: ${error.message}`);
  }
}

const headCount = SCENE.sprinklers.headCount;

const actions = {
  /**
   * Đổi ván. Ở chế độ live thì mở session mới trên server; nếu không thì tải
   * episode JSON tương ứng, cuối cùng mới rơi về mock.
   */
  async regenerate(patch = {}, { keepDay = false, offline = false } = {}) {
    const state = store.getState();
    const profile = patch.profile ?? state.appliedProfile;
    const scenario = patch.scenario ?? state.scenario;
    const seed = patch.seed ?? state.seed;
    const crop = patch.crop ?? state.crop;
    const token = (regenerateToken += 1);
    store.setState({ simulationBusy: true, playing: false, previewAction: null });
    const startDay = keepDay ? state.day : 1;
    let next;
    try {
      next = await openSession({ scenario, seed, crop, startDay, offline, profile });
    } catch (error) {
      if (token === regenerateToken) store.setState({ simulationBusy: false });
      if (patch.profile) throw error;
      notify(`Không thể mở phiên mô phỏng: ${error.message}`);
      return;
    }
    if (token !== regenerateToken) return; // đã có người bấm sau, bỏ kết quả cũ

    liveSessionId = next.sessionId ?? null;
    store.setState({
      meta: next.meta,
      series: next.series,
      scenario,
      seed,
      crop,
      source: next.source,
      dataSource: next.dataSource,
      mode: liveSessionId ? 'live' : 'replay',
      day: liveSessionId || !keepDay ? next.day : Math.min(state.day, next.series.length),
      appliedProfile: profile,
      simulationBusy: false,
      playing: false,
      previewAction: null,
    });
  },

  async applyProfile(profile) {
    await actions.regenerate({ scenario: profile.scenario, seed: profile.seed, crop: profile.crop, profile });
    store.setState({ view: 'monitor', activeTab: 'overview' });
    notify('Đã khởi tạo mô phỏng với cấu hình đã lưu.');
  },

  selectIrrigation(liters) {
    const state = store.getState();
    if (liters !== null) {
      const blocked = irrigationBlock(state, liters, headCount);
      if (blocked) {
        notify(blocked);
        return;
      }
    }
    store.setState({ previewAction: liters, playing: false });
  },

  /** Mức đã chọn được áp dụng đúng một lần. Các ngày sau dùng chính sách hiện tại. */
  stepDay() {
    const state = store.getState();
    if (state.dataSource !== 'api' || state.simulationBusy) return;
    const liters = state.previewAction ?? 0;
    const blocked = irrigationBlock(state, liters, headCount);
    if (blocked) {
      store.setState({ playing: false });
      notify(blocked);
      return;
    }
    const automatic = state.previewAction == null && state.autoIrrigation
      && !irrigationBlock(state, 1, headCount);
    void applyIrrigation(liters, Boolean(automatic));
  },
};

const overlay = document.getElementById('overlay');
const dashboard = createRoot(overlay);
flushSync(() => dashboard.render(createElement(Dashboard, { store, actions })));
const scene = createFieldScene(document.getElementById('scene-root'), store);
const app = mountApp(overlay, store, actions, scene);
notify = app.notify;
if (session.dataSource !== 'api' && !previewMode) {
  notify('Chưa kết nối FastAPI. Đang phát lại dữ liệu có sẵn.');
}

createPlayback(store, { onLiveStep: actions.stepDay });

// Tay nắm debug chỉ tồn tại ở chế độ dev (không lọt vào bản build).
if (import.meta.env.DEV) {
  window.__agriwater = { store, scene, actions };
}

window.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('button, input, select, textarea, [contenteditable]')) {
    return;
  }
  if (store.getState().view !== 'monitor') return;
  if (event.code === 'Space') {
    event.preventDefault();
    store.setState((state) => ({ playing: !state.playing }));
  } else if (event.key === 'r' || event.key === 'R') {
    if (!store.getState().simulationBusy) {
      store.setState({ day: 1, playing: false, previewAction: null });
    }
  }
});

const loader = document.getElementById('loader');
window.setTimeout(() => loader?.classList.add('is-done'), 520);
