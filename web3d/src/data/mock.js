/**
 * Dữ liệu MOCK cho giai đoạn 1 — chưa nối backend.
 *
 * Toàn bộ ngưỡng, 6 mức nước, kịch bản, tên giai đoạn ở đây chép đúng
 * `configs/*.yaml` và `docs/DESIGN_CONTRACT.md` để giao diện không tự bịa luật.
 * Giai đoạn 2 thay bằng CSV, giai đoạn 3 thay bằng /api/meta.
 *
 * `reward` trong file này CHỈ để hiển thị thẻ KPI/thanh cột; nguồn chân lý vẫn
 * là `agriwater/agents/reward.py` ở backend.
 */

export const META = {
  maxDays: 30,
  actionLiters: [0, 5, 10, 15, 20, 25],
  moisture: {
    idealDefault: [0.4, 0.7],
    idealStage2: [0.5, 0.75],
    stressBounds: [0.2, 0.85],
  },
  growthStageDays: [8, 16, 24],
  stages: ['Cây con', 'Sinh trưởng', 'Ra hoa', 'Chín'],
  crops: [
    { code: 0, key: 'maize', label: 'Ngô', icon: 'crop-maize' },
    { code: 1, key: 'rice', label: 'Lúa', icon: 'crop-rice' },
  ],
  scenarios: [
    { key: 'dry', label: 'Khô hạn' },
    { key: 'stormy', label: 'Mưa nhiều' },
    { key: 'random', label: 'Ngẫu nhiên' },
  ],
  agents: [
    { key: 'random', label: 'Ngẫu nhiên (demo)', available: true },
    { key: 'fixed', label: 'Cố định 0–5 L', available: true },
    { key: 'baseline', label: 'Baseline', available: false, reason: 'chưa triển khai' },
    { key: 'q_learning', label: 'Q-Learning', available: false, reason: 'chưa triển khai' },
    { key: 'dqn', label: 'DQN', available: false, reason: 'chưa triển khai' },
  ],
  stepLabel: '1 step = 1 ngày',
  isIllustrative: true,
};

const STAGE_FACTORS = [0.6, 0.9, 1.15, 0.8];
const SOIL_CAPACITY = 50;
const IRRIGATION_EFFICIENCY = 0.8;

/** RNG nhỏ, tất định: cùng seed luôn ra cùng chuỗi. */
function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function stageOf(day) {
  return Math.min(3, META.growthStageDays.filter((milestone) => day >= milestone).length);
}

function idealFor(stage) {
  return stage === 2 ? META.moisture.idealStage2 : META.moisture.idealDefault;
}

/**
 * Ước lượng reward CHỈ để hiển thị mock.
 * Bản thật nằm ở agriwater/agents/reward.py và được backend trả về ở giai đoạn 3.
 */
function mockReward({ moisture, nextMoisture, action, stage, rainProbability, rainForecastMm, lastIrrigation }) {
  const parts = { R_health: 0, R_stress: 0, R_water: -2 * action, R_waste: 0, R_rain: 0, R_delay: 0 };
  const [low, high] = idealFor(stage);
  if (nextMoisture >= low && nextMoisture <= high) parts.R_health = 10;
  if (nextMoisture < 0.2 || nextMoisture > 0.85) parts.R_stress = -100;
  if (action > 0 && moisture >= 0.6) parts.R_waste = -10 * action;
  if (action > 0 && rainProbability >= 0.7 && rainForecastMm >= 15) parts.R_rain = -5 * action;
  if (action > 0 && lastIrrigation >= 12.5) parts.R_delay = -8 * action;
  return parts;
}

/** Sinh một episode mock hoàn chỉnh cho một kịch bản + seed. */
export function createMockSession({ scenario = 'dry', seed = 42, crop = 0 } = {}) {
  const rng = lcg(seed * 31 + crop * 137 + scenario.length * 7);
  const series = [];
  let moisture = 0.44;
  let lastIrrigation = 0;

  for (let day = 1; day <= META.maxDays; day += 1) {
    const stage = stageOf(day);
    const dry = scenario === 'dry';
    const stormy = scenario === 'stormy';

    const temperature = dry ? 34 + rng() * 7 : stormy ? 23 + rng() * 7 : 22 + rng() * 14;
    const rainProbability = dry ? rng() * 0.08 : stormy ? 0.35 + rng() * 0.55 : rng();
    const rainForecastMm = dry ? rng() * 4 : stormy ? 8 + rng() * 30 : rng() * 34;
    const actualRainMm = rng() < rainProbability ? rainForecastMm : 0;

    // Policy mock: giữ ẩm quanh vùng lý tưởng nhưng CÓ NGÀY NGHỈ — tưới dồn
    // dập mỗi ngày là hành vi bị R_delay/R_waste phạt, không phải chính sách tốt.
    let action;
    if (moisture < 0.3) action = 4;
    else if (moisture < 0.38) action = 3;
    else if (moisture < 0.5) action = 1;
    else action = 0;
    if (lastIrrigation >= 12.5 && moisture >= 0.4) action = 0;
    const waterLiters = META.actionLiters[action];

    const irrigation = waterLiters * IRRIGATION_EFFICIENCY;
    const rain = actualRainMm;
    const demand = 0.25 * (temperature - 15) * STAGE_FACTORS[stage];
    const available = moisture * SOIL_CAPACITY + irrigation + rain;
    const et = Math.min(available, demand);
    const remaining = available - et;
    let drainage = Math.min(Math.max(0, remaining - SOIL_CAPACITY * 0.85), 5);
    drainage += Math.max(0, remaining - drainage - SOIL_CAPACITY);
    const nextMoisture = Math.min(1, Math.max(0, (remaining - drainage) / SOIL_CAPACITY));

    const parts = mockReward({
      moisture,
      nextMoisture,
      action,
      stage,
      rainProbability,
      rainForecastMm,
      lastIrrigation,
    });
    const reward = Object.values(parts).reduce((total, value) => total + value, 0);
    const [idealLow, idealHigh] = idealFor(stageOf(day + 1));

    series.push({
      day,
      stage,
      action,
      waterLiters,
      moisture: nextMoisture,
      previousMoisture: moisture,
      temperature,
      rainProbability,
      rainForecastMm,
      actualRainMm,
      reward,
      rewardParts: parts,
      isIdeal: nextMoisture >= idealLow && nextMoisture <= idealHigh,
      isStressed: nextMoisture < 0.2 || nextMoisture > 0.85,
    });

    lastIrrigation = waterLiters;
    moisture = nextMoisture;
  }

  return {
    meta: META,
    series,
    day: 16,
    scenario,
    seed,
    crop,
  };
}

export default META;
