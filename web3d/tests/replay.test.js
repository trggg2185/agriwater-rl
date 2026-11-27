import { describe, expect, it } from 'vitest';

import { EPISODE_SCHEMA, episodeUrl, normalizeEpisode } from '../src/data/replay.js';

const META = {
  maxDays: 30,
  actionLiters: [0, 5, 10, 15, 20, 25],
  moisture: {
    idealDefault: [0.4, 0.7],
    idealStage2: [0.5, 0.75],
    stressBounds: [0.2, 0.85],
  },
  growthStageDays: [8, 16, 24],
};

function payload(series, extra = {}) {
  return {
    schema: EPISODE_SCHEMA,
    meta: META,
    series,
    day: 2,
    scenario: 'dry',
    seed: 42,
    crop: 0,
    source: { policy: 'baseline', days: series.length, config: 'configs/environment.yaml' },
    ...extra,
  };
}

const record = {
  day: 1,
  action: 1,
  waterLiters: 5,
  stage: 0,
  moisture: 0.42,
  previousMoisture: 0.5,
  temperature: 36,
  rainProbability: 0.1,
  rainForecastMm: 2,
  actualRainMm: 0,
  lastIrrigation: 0,
  reward: 8,
  rewardParts: { R_health: 10, R_water: -2 },
  isIdeal: true,
  isStressed: false,
};

describe('normalizeEpisode', () => {
  it('giữ nguyên số của Python và đánh dấu nguồn', () => {
    const session = normalizeEpisode(payload([record]));
    expect(session.dataSource).toBe('python');
    expect(session.series).toHaveLength(1);
    expect(session.series[0]).toMatchObject({
      day: 1,
      action: 1,
      waterLiters: 5,
      moisture: 0.42,
      previousMoisture: 0.5,
      temperature: 36,
      reward: 8,
      isIdeal: true,
    });
    expect(session.source.policy).toBe('baseline');
  });

  it('gộp meta của file với nhãn hiển thị sẵn có', () => {
    const session = normalizeEpisode(payload([record]));
    expect(session.meta.actionLiters).toEqual(META.actionLiters);
    expect(session.meta.moisture.idealStage2).toEqual([0.5, 0.75]);
    // Nhãn hiển thị (tên cây, tên giai đoạn) đến từ mock, không từ Python.
    expect(session.meta.stages).toHaveLength(4);
    expect(session.meta.crops[0].label).toBe('Ngô');
  });

  it('kẹp "day" vào khoảng dữ liệu có thật', () => {
    const session = normalizeEpisode(payload([record, { ...record, day: 2 }], { day: 99 }));
    expect(session.day).toBe(2);
    expect(normalizeEpisode(payload([record], { day: 0 })).day).toBe(1);
  });

  it('từ chối file không có series', () => {
    expect(() => normalizeEpisode({ ...payload([]), series: [] })).toThrow(/series/);
    expect(() => normalizeEpisode(null)).toThrow(/rỗng/);
  });

  it('từ chối schema lạ để không đọc nhầm định dạng', () => {
    expect(() => normalizeEpisode(payload([record], { schema: 'other/9' }))).toThrow(/Schema/);
  });

  it('bản ghi thiếu trường phụ thì lấy mặc định, không làm sập panel', () => {
    const minimal = { day: 3, moisture: 0.9, stage: 2 };
    const [normalized] = normalizeEpisode(payload([minimal])).series;
    expect(normalized.waterLiters).toBe(0);
    expect(normalized.temperature).toBe(25);
    expect(normalized.reward).toBe(0);
    // 0.9 > ngưỡng stress 0.85 nên phải tự suy ra là cây đang bị úng.
    expect(normalized.isStressed).toBe(true);
    expect(normalized.isIdeal).toBe(false);
  });

  it('đường dẫn episode theo đúng quy ước tên file của exporter', () => {
    expect(episodeUrl('dry', 42)).toMatch(/data\/episode-dry-s42\.json$/);
    expect(episodeUrl('dry', 42, 1)).toMatch(/data\/episode-dry-s42-c1\.json$/);
  });
});
