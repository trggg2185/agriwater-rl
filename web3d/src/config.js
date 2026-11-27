/**
 * Hằng số GIAO DIỆN duy nhất.
 *
 * Không chứa luật mô phỏng: ngưỡng độ ẩm, 6 mức nước, kịch bản, tên giai đoạn
 * đều đến từ /api/meta (giai đoạn 1 dùng mock, giai đoạn 2 đọc CSV, giai đoạn 3
 * đọc backend). File này chỉ nói "trông như thế nào", không nói "tính ra sao".
 */

export const UI = {
  colors: {
    chartBlue: '#678294',
    chartBlueSoft: 'rgba(103, 130, 148, .55)',
    areaTop: 'rgba(103, 130, 148, .32)',
    areaBottom: 'rgba(103, 130, 148, .04)',
    band: 'rgba(59, 130, 246, .055)',
    grid: 'rgba(29, 38, 33, .09)',
    gridStrong: 'rgba(29, 38, 33, .16)',
    ideal: 'rgba(47, 179, 68, .10)',
    idealEdge: 'rgba(47, 179, 68, .32)',
    bar: '#2fb344',
    barMuted: '#cfd3d1',
    barBaseline: '#cfd3d1',
    irrigation: '#2fb344',
    rain: '#5ea8f0',
    ink: '#1d2621',
    label: '#8b958f',
    axis: '#a9b3ae',
    white: '#ffffff',
    amber: '#d9a13b',
    red: '#d4574f',
  },

  chart: {
    width: 340,
    lineHeight: 134,
    barHeight: 122,
    pad: { top: 10, right: 8, bottom: 20, left: 27 },
    barPad: { top: 8, right: 8, bottom: 18, left: 22 },
  },

  /** Dùng ở giai đoạn 2 khi dựng cảnh; giai đoạn 1 chỉ khai báo. */
  camera: {
    fov: 27,
    azimuth: 35,
    polar: 52,
    distance: 26,
    minDistance: 12,
    maxDistance: 44,
  },

  timing: {
    /** 1,5 giây cho mỗi ngày ở tốc độ x1 — đủ chậm để quan sát từng bước. */
    stepBaseMs: 1500,
    fadeMs: 250,
    countMs: 380,
    cameraFlyMs: 600,
  },

  speeds: [1, 2, 5, 10],

  views: [
    { id: 'environment', label: 'Thiết lập thông số môi trường', shortLabel: 'Thiết lập' },
    { id: 'training', label: 'Huấn luyện thuật toán RL', shortLabel: 'Huấn luyện' },
    { id: 'experiment', label: 'Thử nghiệm đa kịch bản', shortLabel: 'Thử nghiệm' },
    { id: 'compare', label: 'So sánh chiến lược', shortLabel: 'So sánh' },
    { id: 'monitor', label: 'Báo cáo & Dashboard', shortLabel: 'Báo cáo' },
  ],
};

/**
 * Hằng số CẢNH 3D (kích thước, bố cục, ánh sáng).
 * Chỉ là hình học/trình bày — không chứa luật mô phỏng.
 */
export const SCENE = {
  fog: { color: 0xe4edf2, near: 35, far: 105 },

  plot: {
    width: 11.6,
    depth: 7.0,
    soilInset: 0.26,
    ridges: 8,
    ridgeHeight: 0.12,
  },

  /**
   * Hệ đầu phun — CHỈ tham số hiển thị (bố cục, hình quạt, thời gian pop-up).
   * Số vòi mở, lưu lượng, mô hình m_i do utils/irrigationZones.js tính từ meta.
   */
  sprinklers: {
    /** Số đầu phun = số khu dải (2…6). */
    headCount: 6,
    /** "centerLine": các đầu nằm trên trục dọc giữa thửa, mỗi khu một dải. */
    headLayout: 'centerLine',
    /** Cung mỗi quạt (độ). Mỗi đầu có HAI quạt đối xứng qua trục dọc. */
    arcDegrees: 100,
    /** Biên quét qua lại quanh hướng chính (độ). */
    sweepDegrees: 25,
    /** Chu kỳ quét một vòng (giây). */
    sweepSeconds: 4,
    /** "bidirectional" (hai quạt quét qua lại) hoặc "rotary360". */
    mode: 'bidirectional',
    /** Số tia mỗi quạt. */
    streamsPerHead: 56,
    /** Khoảng góc phóng của tia so với phương ngang (độ). */
    launchAngleDeg: [22, 35],
    /** Trần tầm bắn = khoảng cách tới góc xa nhất của dải × hệ số này. */
    maxRadiusFactor: 1.05,
    /**
     * Chiều cao CỐ ĐỊNH của đầu phun so với mặt rãnh (m). Đầu phun kiểu ảnh
     * mẫu: đặt thấp, không thò/thụt; bán kính phun rộng do tầm bắn của tia.
     */
    riserHeight: 0.2,
    /** Có vẽ hệ ống chính + nhánh + hộp van hay không. */
    pipes: true,
  },

  camera: {
    fov: 26,
    azimuth: 36,
    polar: 42,
    shiftX: -0.35,
    shiftY: 0.15,
    shiftZ: 0.65,
    distanceFactor: 2.47,
    /** Cho phép lại gần để soi luống và lùi ra để thấy toàn thửa. */
    minDistanceFactor: 0.5,
    maxDistanceFactor: 2.0,
    polarRange: [20, 80],
    /** Xoay tự do 360° quanh thửa (không còn khoá một góc cố định). */
    azimuthRange: 180,
    /** Bán kính được kéo tâm nhìn quanh thửa. */
    panRadius: 6,
  },

  light: {
    hemiSky: 0xe8efdb,
    hemiGround: 0x60513e,
    hemiIntensity: 0.78,
    sunColor: 0xfff0d8,
    sunIntensity: 1.6,
    sunPosition: [-11, 17, -9],
    fillColor: 0x9fc4e0,
    fillIntensity: 0.45,
    fillPosition: [12, 8, 14],
    shadowMapSize: 2048,
    shadowRadius: 13,
  },
};

export default UI;
