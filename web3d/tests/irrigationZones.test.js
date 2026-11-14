import { describe, expect, it } from 'vitest';

import {
  ZONE_DEFAULTS,
  bandBounds,
  bandCornerDistance,
  clampHeadCount,
  flowPerOpen,
  headMaxRadius,
  headPositions,
  landingPoint,
  openCount,
  pickZones,
  plotEdgeDistance,
  simulateZoneField,
  streamRange,
  totalFlow,
  zoneIndexAt,
  zoneMoistures,
} from '../src/utils/irrigationZones.js';

/** Thửa hiện tại của cảnh web3d: 11,6 × 7,0, luống chạy dọc trục X. */
const PLOT = { width: 11.6, depth: 7.0 };
const MAX_LITERS = 25;
const ACTION_LITERS = [0, 5, 10, 15, 20, 25];

function seriesOf(entries) {
  return entries.map((entry, index) => ({
    day: index + 1,
    waterLiters: entry.liters,
    previousMoisture: entry.before,
    moisture: entry.after,
  }));
}

describe('vị trí đầu phun trên trục dọc giữa thửa', () => {
  for (const headCount of [2, 3, 4]) {
    it(`headCount = ${headCount}: đúng số đầu, nằm trên z = 0, cách đều`, () => {
      const heads = headPositions({ ...PLOT, headCount });
      expect(heads).toHaveLength(headCount);

      const band = PLOT.width / headCount;
      heads.forEach((head, index) => {
        expect(head.z).toBe(0);
        expect(head.x).toBeCloseTo(-PLOT.width / 2 + (index + 0.5) * band, 10);
        // Cách mép ≥ 10% kích thước thửa
        expect(PLOT.width / 2 - Math.abs(head.x)).toBeGreaterThanOrEqual(
          ZONE_DEFAULTS.edgeInset * PLOT.width - 1e-9,
        );
        // Không còn ở góc: z = 0 nên cách mép trước/sau cả nửa chiều sâu
        expect(Math.abs(head.z)).toBeLessThan(PLOT.depth / 2 - ZONE_DEFAULTS.edgeInset * PLOT.depth);
      });

      // Cách đều
      for (let i = 2; i < heads.length; i += 1) {
        expect(heads[i].x - heads[i - 1].x).toBeCloseTo(band, 10);
      }
      // Khoảng cách giữa hai đầu kề nhau ≥ 1 đơn vị cảnh (minSpacing)
      expect(band).toBeGreaterThan(1);
    });
  }

  it('headCount lẻ: đầu giữa trùng đúng tâm thửa', () => {
    const heads = headPositions({ ...PLOT, headCount: 3 });
    expect(heads[1].x).toBeCloseTo(0, 10);
    expect(heads[0].x).toBeCloseTo(-PLOT.width / 3, 10);
    expect(heads[2].x).toBeCloseTo(PLOT.width / 3, 10);
  });

  it('headCount ngoài khoảng 2…4 được kẹp lại', () => {
    expect(clampHeadCount(1)).toBe(2);
    expect(clampHeadCount(5)).toBe(4);
    expect(clampHeadCount(undefined)).toBe(ZONE_DEFAULTS.headCount);
  });
});

describe('dải khu (vuông góc trục dọc)', () => {
  for (const headCount of [2, 3, 4]) {
    it(`headCount = ${headCount}: dải phủ kín thửa, mỗi dải đúng một đầu`, () => {
      const heads = headPositions({ ...PLOT, headCount });
      const bands = heads.map((_, index) => bandBounds(index, { ...PLOT, headCount }));

      expect(bands[0][0]).toBeCloseTo(-PLOT.width / 2, 10);
      expect(bands.at(-1)[1]).toBeCloseTo(PLOT.width / 2, 10);
      for (let i = 1; i < bands.length; i += 1) expect(bands[i][0]).toBeCloseTo(bands[i - 1][1], 10);

      heads.forEach((head) => {
        const inside = bands.filter(([low, high]) => head.x >= low - 1e-9 && head.x <= high + 1e-9);
        expect(inside).toHaveLength(1);
        expect(zoneIndexAt(head.x, { ...PLOT, headCount })).toBe(head.index);
      });
    });
  }

  it('điểm ngoài biên vẫn quy về khu hợp lệ', () => {
    expect(zoneIndexAt(-PLOT.width, { ...PLOT, headCount: 3 })).toBe(0);
    expect(zoneIndexAt(PLOT.width, { ...PLOT, headCount: 3 })).toBe(2);
  });
});

describe('trần tầm bắn R_max', () => {
  it('bằng khoảng cách tới góc xa nhất của dải × 1,05 và không vượt quá', () => {
    for (const headCount of [2, 3, 4]) {
      headPositions({ ...PLOT, headCount }).forEach((head) => {
        const corner = bandCornerDistance(head.index, { ...PLOT, headCount });
        const radius = headMaxRadius(head.index, { ...PLOT, headCount });
        expect(radius).toBeCloseTo(corner * ZONE_DEFAULTS.radiusFactor, 10);
        expect(radius).toBeLessThanOrEqual(corner * ZONE_DEFAULTS.radiusFactor + 1e-9);
        expect(radius).toBeGreaterThan(PLOT.depth / 2);
      });
    }
  });
});

describe('số vòi mở và lưu lượng', () => {
  const expected = new Map([
    [0, 0],
    [5, 1],
    [10, 2],
    [15, 2],
    [20, 3],
    [25, 3],
  ]);

  it('bảng kỳ vọng với 3 đầu, mức tối đa 25 L', () => {
    for (const [liters, count] of expected) {
      expect(openCount(liters, MAX_LITERS, 3)).toBe(count);
    }
  });

  it('headCount 2 và 4 theo cùng công thức', () => {
    expect([5, 10, 15, 20, 25].map((l) => openCount(l, 25, 2))).toEqual([1, 1, 2, 2, 2]);
    expect([5, 10, 15, 20, 25].map((l) => openCount(l, 25, 4))).toEqual([1, 2, 3, 4, 4]);
  });

  it('flowPerOpen bảo toàn: tổng lưu lượng = lượng nước của đợt', () => {
    for (const liters of ACTION_LITERS) {
      const count = openCount(liters, MAX_LITERS, 3);
      const flow = flowPerOpen(liters, count);
      expect(totalFlow(new Array(count).fill(flow))).toBeCloseTo(liters, 12);
    }
    expect(flowPerOpen(15, 2)).toBeCloseTo(7.5, 12);
    expect(flowPerOpen(10, 2)).toBeCloseTo(5, 12);
    expect(flowPerOpen(25, 3)).toBeCloseTo(25 / 3, 12);
    expect(flowPerOpen(0, 0)).toBe(0);
  });
});

describe('pickZones', () => {
  it('chọn đúng số khu khô nhất, tất định', () => {
    const moisture = [0.52, 0.31, 0.44];
    // Hai khu khô nhất là khu 1 (0,31) và khu 2 (0,44) — trả về theo thứ tự chỉ số
    expect(pickZones({ zoneMoisture: moisture, count: 2, day: 1 })).toEqual([1, 2]);
    expect(pickZones({ zoneMoisture: moisture, count: 2, day: 1 })).toEqual([1, 2]);
    expect(pickZones({ zoneMoisture: moisture, count: 3, day: 7 })).toEqual([0, 1, 2]);
    expect(pickZones({ zoneMoisture: moisture, count: 0, day: 1 })).toEqual([]);
  });

  it('hòa độ ẩm thì xoay vòng theo ngày (không random)', () => {
    const even = [0.4, 0.4, 0.4];
    const day1 = pickZones({ zoneMoisture: even, count: 1, day: 1 });
    const day2 = pickZones({ zoneMoisture: even, count: 1, day: 2 });
    const day3 = pickZones({ zoneMoisture: even, count: 1, day: 3 });
    expect(day1).toEqual([1]);
    expect(day2).toEqual([2]);
    expect(day3).toEqual([0]);
  });
});

describe('mô hình ước lượng phân bố theo khu', () => {
  const series = seriesOf([
    { liters: 0, before: 0.44, after: 0.41 },
    { liters: 5, before: 0.41, after: 0.47 },
    { liters: 0, before: 0.47, after: 0.43 },
    { liters: 10, before: 0.43, after: 0.5 },
    { liters: 15, before: 0.5, after: 0.53 },
    { liters: 0, before: 0.53, after: 0.46 },
    { liters: 20, before: 0.46, after: 0.55 },
    { liters: 25, before: 0.55, after: 0.6 },
    { liters: 0, before: 0.6, after: 0.52 },
    // Ngày gần bão hoà: biên độ bị co để không vượt 1
    { liters: 25, before: 0.94, after: 0.995 },
    // Ngày gần khô kiệt: biên độ bị co để không xuống dưới 0
    { liters: 0, before: 0.05, after: 0.02 },
    { liters: 5, before: 0.02, after: 0.06 },
  ]);

  it('trung bình các khu = m(t) với sai số < 1e-9, kể cả khi bị co do kẹp biên', () => {
    const days = simulateZoneField({ series, headCount: 3, maxLiters: MAX_LITERS });
    expect(days).toHaveLength(series.length);

    days.forEach((day, index) => {
      expect(day.moisture).toHaveLength(3);
      const mean = day.moisture.reduce((sum, value) => sum + value, 0) / day.moisture.length;
      expect(Math.abs(mean - series[index].moisture)).toBeLessThan(1e-9);

      day.moisture.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });
  });

  it('số vòi mở và tổng lưu lượng khớp lượng nước từng ngày', () => {
    const days = simulateZoneField({ series, headCount: 3, maxLiters: MAX_LITERS });
    days.forEach((day, index) => {
      const liters = series[index].waterLiters ?? 0;
      expect(day.openCount).toBe(openCount(liters, MAX_LITERS, 3));
      expect(totalFlow(day.flows)).toBeCloseTo(liters, 9);
      expect(day.openZones).toHaveLength(day.openCount);
      day.openZones.forEach((zone) => expect(day.flows[zone]).toBeCloseTo(flowPerOpen(liters, day.openCount), 9));
    });
    // ngày không tưới: 0 vòi
    expect(days[0].openCount).toBe(0);
    expect(totalFlow(days[0].flows)).toBe(0);
  });

  it('tua replay tới ngày bất kỳ cho cùng kết quả với chạy tuần tự', () => {
    const full = simulateZoneField({ series, headCount: 3, maxLiters: MAX_LITERS });
    for (const dayIndex of [0, 3, 7, 10, series.length - 1]) {
      const partial = simulateZoneField({
        series: series.slice(0, dayIndex + 1),
        headCount: 3,
        maxLiters: MAX_LITERS,
      });
      expect(partial[dayIndex]).toEqual(full[dayIndex]);
    }
  });

  it('chế độ Đồng nhất cho m_i = m(t) đúng tuyệt đối', () => {
    const days = simulateZoneField({ series, headCount: 3, maxLiters: MAX_LITERS, mode: 'uniform' });
    days.forEach((day, index) => {
      day.moisture.forEach((value) => expect(value).toBeCloseTo(series[index].moisture, 12));
    });
  });

  it('headCount 2 và 4 cũng bảo toàn trung bình', () => {
    for (const headCount of [2, 4]) {
      const days = simulateZoneField({ series, headCount, maxLiters: MAX_LITERS });
      days.forEach((day, index) => {
        expect(day.moisture).toHaveLength(headCount);
        const mean = day.moisture.reduce((sum, value) => sum + value, 0) / headCount;
        expect(Math.abs(mean - series[index].moisture)).toBeLessThan(1e-9);
      });
    }
  });

  it('khu được tưới ướt hơn khu không tưới (phân bố có ý nghĩa)', () => {
    const days = simulateZoneField({ series, headCount: 3, maxLiters: MAX_LITERS });
    const watered = days[7]; // ngày 25 L, 3 vòi
    expect(watered.openCount).toBe(3);
    const oneZone = days[1]; // ngày 5 L, 1 vòi
    expect(oneZone.openCount).toBe(1);
    const wet = oneZone.moisture[oneZone.openZones[0]];
    const dry = Math.min(...oneZone.moisture.filter((_, i) => !oneZone.openZones.includes(i)));
    expect(wet).toBeGreaterThan(dry);
  });

  it('zoneMoistures giữ nguyên trung bình khi bị co vì kẹp biên', () => {
    const shares = [0.7, 0.2, 0.1];
    const nearFull = zoneMoistures(0.98, shares);
    const nearDry = zoneMoistures(0.02, shares);
    for (const field of [nearFull, nearDry]) {
      const mean = field.reduce((sum, value) => sum + value, 0) / field.length;
      expect(field.every((value) => value >= 0 && value <= 1)).toBe(true);
    }
    expect(Math.abs(nearFull.reduce((s, v) => s + v, 0) / 3 - 0.98)).toBeLessThan(1e-9);
    expect(Math.abs(nearDry.reduce((s, v) => s + v, 0) / 3 - 0.02)).toBeLessThan(1e-9);
  });
});

describe('quỹ đạo tia: mọi điểm rơi nằm trong thửa', () => {
  it('streamRange và landingPoint không ra ngoài khay', () => {
    const margin = ZONE_DEFAULTS.landMargin;
    for (const headCount of [2, 3, 4]) {
      const heads = headPositions({ ...PLOT, headCount });
      heads.forEach((head) => {
        const maxRadius = headMaxRadius(head.index, { ...PLOT, headCount });
        for (let step = 0; step < 72; step += 1) {
          const azimuth = (step / 72) * Math.PI * 2;
          const range = streamRange(head, azimuth, maxRadius, PLOT);
          expect(range).toBeLessThanOrEqual(maxRadius + 1e-9);
          const landing = landingPoint(head, azimuth, range);
          expect(Math.abs(landing.x)).toBeLessThanOrEqual(PLOT.width / 2 - margin + 1e-9);
          expect(Math.abs(landing.z)).toBeLessThanOrEqual(PLOT.depth / 2 - margin + 1e-9);
        }
      });
    }
  });

  it('plotEdgeDistance đo đúng khoảng cách tới mép theo hướng', () => {
    const origin = { x: 0, z: 0 };
    expect(plotEdgeDistance(origin, 1, 0, PLOT)).toBeCloseTo(PLOT.width / 2 - ZONE_DEFAULTS.landMargin, 10);
    expect(plotEdgeDistance(origin, 0, 1, PLOT)).toBeCloseTo(PLOT.depth / 2 - ZONE_DEFAULTS.landMargin, 10);
    // Hướng ra ngoài từ sát mép phải ≈ 0
    expect(plotEdgeDistance({ x: PLOT.width / 2, z: 0 }, 1, 0, PLOT)).toBeCloseTo(0, 10);
  });
});
