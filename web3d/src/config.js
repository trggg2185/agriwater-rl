/**
 * Hằng số GIAO DIỆN duy nhất.
 *
 * Không chứa luật mô phỏng: ngưỡng độ ẩm, 6 mức nước, kịch bản, tên giai đoạn
 * đều đến từ /api/meta (giai đoạn 1 dùng mock, giai đoạn 2 đọc CSV, giai đoạn 3
 * đọc backend). File này chỉ nói "trông như thế nào", không nói "tính ra sao".
 */

export const UI = {
  colors: {
    chartBlue: '#5ea8f0',
    chartBlueSoft: 'rgba(94, 168, 240, .55)',
    areaTop: 'rgba(94, 168, 240, .30)',
    areaBottom: 'rgba(94, 168, 240, 0)',
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

  /** Nhãn hiển thị của 3 mục điều hướng. */
  views: [
    { id: 'monitor', label: 'Giám sát cây trồng', icon: 'leaf' },
    { id: 'device', label: 'Điều khiển thiết bị', icon: 'monitor' },
    { id: 'smart', label: 'Tưới thông minh', icon: 'spark' },
  ],
};

/**
 * Hằng số CẢNH 3D (kích thước, bố cục, ánh sáng).
 * Chỉ là hình học/trình bày — không chứa luật mô phỏng.
 */
export const SCENE = {
  fog: { color: 0x2f3634, near: 34, far: 104 },

  /**
   * Không dùng lưới ô: chỉ một sân vỉa hè rộng bằng thửa × apronScale,
   * nên xung quanh thửa không còn ô trống nào.
   */
  /** Chỉ một sân vỉa hè sát thửa, không có lưới ô trống xung quanh. */
  grid: { apronScale: 1, thickness: 0.32 },

  plot: {
    width: 11.6,
    depth: 7.0,
    trayHeight: 0.62,
    rimThickness: 0.4,
    soilInset: 0.26,
    ridges: 8,
    ridgeHeight: 0.12,
    /** Số đầu phun ở 4 góc cũ — bước 2 thay bằng SCENE.sprinklers.headCount. */
    sprinklerCount: 4,
  },

  /**
   * Hệ đầu phun — CHỈ tham số hiển thị (bố cục, hình quạt, thời gian pop-up).
   * Số vòi mở, lưu lượng, mô hình m_i do utils/irrigationZones.js tính từ meta.
   */
  sprinklers: {
    /** Số đầu phun = số khu dải (2…4). */
    headCount: 3,
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
    /** Dịch target để thửa chính nằm nửa trái-giữa khung hình. */
    shiftX: 5.4,
    shiftY: 1.9,
    shiftZ: 0.4,
    distanceFactor: 2.22,
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
    hemiSky: 0xcfe3d6,
    hemiGround: 0x2a2420,
    hemiIntensity: 0.55,
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
