/**
 * Cầu nối Python → cảnh 3D.
 *
 * Python (`web3d/scripts/export_episode.py`) chạy môi trường thật rồi ghi ra
 * `public/data/episode-<scenario>-s<seed>.json`. File này chỉ làm hai việc:
 * tải JSON đó và chuẩn hoá về đúng hình dạng `series` mà `scene/` + `ui/`
 * đang đọc, để phần còn lại của app không phải biết dữ liệu đến từ đâu.
 *
 * Không tính lại công thức ở đây: mọi con số (độ ẩm, điểm, 6 thành phần) là
 * của `agriwater/environment` + `agriwater/agents/reward.py`. Nếu file thiếu
 * hoặc sai schema thì ném lỗi để `main.js` quay về mock, chứ không đoán số.
 */

import { META } from './mock.js';

export const EPISODE_SCHEMA = 'agriwater.episode/1';

/** Đường dẫn quy ước của một episode, đúng tên file exporter ghi ra. */
export function episodeUrl(scenario, seed, crop = 0) {
  const base = import.meta.env.BASE_URL ?? '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const cropSuffix = crop === 0 ? '' : `-c${crop}`;
  return `${prefix}data/episode-${scenario}-s${seed}${cropSuffix}.json`;
}

/**
 * Tải và chuẩn hoá một episode. `fetchImpl` chỉ dùng khi test.
 * Ném Error nếu không tải được hoặc file không đúng hợp đồng.
 */
export async function loadEpisode(url, { fetchImpl } = {}) {
  const request = fetchImpl ?? globalThis.fetch;
  if (typeof request !== 'function') throw new Error('Trình duyệt không hỗ trợ fetch');
  const response = await request(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} khi tải ${url}`);
  // Dev server trả index.html cho đường dẫn không tồn tại, nên kiểm tra kiểu
  // nội dung trước khi parse để lỗi báo đúng "chưa có episode" thay vì
  // "Unexpected token '<'".
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new Error(`không phải JSON (${contentType || 'không rõ kiểu'}) tại ${url}`);
  }
  return normalizeEpisode(await response.json());
}

const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const flag = (value) => value === true;

function bounds(value, fallback) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    ? [value[0], value[1]]
    : fallback;
}

/** Gộp meta của file với nhãn hiển thị sẵn có trong `mock.js` (tên cây, giai đoạn). */
function mergeMeta(meta = {}) {
  const moisture = meta.moisture ?? {};
  return {
    ...META,
    ...meta,
    maxDays: finite(meta.maxDays, META.maxDays),
    actionLiters:
      Array.isArray(meta.actionLiters) && meta.actionLiters.length === META.actionLiters.length
        ? meta.actionLiters.map((liters) => finite(liters))
        : META.actionLiters,
    growthStageDays: Array.isArray(meta.growthStageDays)
      ? meta.growthStageDays
      : META.growthStageDays,
    moisture: {
      ...META.moisture,
      idealDefault: bounds(moisture.idealDefault, META.moisture.idealDefault),
      idealStage2: bounds(moisture.idealStage2, META.moisture.idealStage2),
      stressBounds: bounds(moisture.stressBounds, META.moisture.stressBounds),
    },
    isIllustrative: true,
  };
}

function idealFor(meta, stage) {
  return stage === 2 ? meta.moisture.idealStage2 : meta.moisture.idealDefault;
}

/**
 * Kiểm tra + đổi tên trường. Mỗi bản ghi phải có `day` và `moisture`; các
 * trường khác thiếu thì lấy 0/false thay vì làm sập cả panel.
 */
function normalizeRecord(raw, index, meta) {
  if (!raw || !Number.isFinite(raw.day)) {
    throw new Error(`Bản ghi #${index} thiếu "day" hợp lệ`);
  }
  const stage = finite(raw.stage, 0);
  const moisture = finite(raw.moisture, 0);
  const [low, high] = idealFor(meta, stage);
  const [stressLow, stressHigh] = meta.moisture.stressBounds;
  const waterLiters = finite(raw.waterLiters);
  const action = Number.isFinite(raw.action)
    ? raw.action
    : Math.max(0, meta.actionLiters.indexOf(waterLiters));

  return {
    day: raw.day,
    crop: finite(raw.crop, 0),
    stage,
    action,
    waterLiters,
    moisture,
    previousMoisture: finite(raw.previousMoisture, moisture),
    temperature: finite(raw.temperature, 25),
    rainProbability: finite(raw.rainProbability),
    rainForecastMm: finite(raw.rainForecastMm),
    actualRainMm: finite(raw.actualRainMm),
    lastIrrigation: finite(raw.lastIrrigation),
    reward: finite(raw.reward),
    rewardParts: raw.rewardParts && typeof raw.rewardParts === 'object' ? raw.rewardParts : null,
    isIdeal: typeof raw.isIdeal === 'boolean' ? Boolean(raw.isIdeal) : moisture >= low && moisture <= high,
    isStressed: typeof raw.isStressed === 'boolean'
      ? Boolean(raw.isStressed)
      : moisture < stressLow || moisture > stressHigh,
    terminated: flag(raw.terminated),
    truncated: flag(raw.truncated),
    waterBalance: raw.waterBalance ?? null,
  };
}

/**
 * Chuẩn hoá payload thành state mà store/scene/ui đang dùng.
 * `dataSource` = 'python' (file JSON) hoặc 'api' (FastAPI live) để nhãn UI và
 * luật đi tiếp của `main.js` biết dữ liệu đến từ đâu.
 */
export function normalizeEpisode(payload, { dataSource = 'python' } = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('File episode rỗng');
  if (payload.schema && payload.schema !== EPISODE_SCHEMA) {
    throw new Error(`Schema lạ: ${payload.schema} (cần ${EPISODE_SCHEMA})`);
  }
  if (!Array.isArray(payload.series) || payload.series.length === 0) {
    throw new Error('File episode không có "series"');
  }

  const meta = mergeMeta(payload.meta);
  const series = payload.series.map((raw, index) => normalizeRecord(raw, index, meta));
  const day = Math.min(Math.max(1, Math.round(finite(payload.day, series.length))), series.length);

  return {
    meta,
    series,
    day,
    scenario: payload.scenario ?? 'dry',
    seed: finite(payload.seed, 42),
    crop: finite(payload.crop, 0),
    dataSource,
    source: payload.source ?? null,
  };
}
