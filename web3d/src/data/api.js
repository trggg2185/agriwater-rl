/**
 * Kết nối backend Python (`/api/meta`, `/api/session`) cho web3d,
 * kèm dự phòng phát lại dữ liệu DQN thật đã xuất sẵn (`/dqn-replay.json`)
 * khi người dùng chỉ chạy Vite mà chưa bật server Python.
 */

let replayCache = null;

export async function fetchMeta() {
  const response = await fetch('/api/meta');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function fetchSession({ scenario, seed, crop, agent }) {
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, seed, crop, agent }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

export async function loadStaticReplay() {
  if (replayCache) return replayCache;
  const response = await fetch('/dqn-replay.json');
  if (!response.ok) return null;
  replayCache = await response.json();
  return replayCache;
}

export function pickStaticReplay(bundle, { scenario, crop, agent }) {
  if (!bundle?.sessions) return null;
  const exact = bundle.sessions[`${agent}|${scenario}|${crop}`];
  if (exact) return { meta: bundle.meta, ...exact };
  const fallbackCrop = bundle.sessions[`${agent}|${scenario}|0`];
  if (fallbackCrop) return { meta: bundle.meta, ...fallbackCrop };
  return null;
}
