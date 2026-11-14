/** Texture sinh hoàn toàn bằng canvas — không tải asset ngoài. */

import * as THREE from 'three';
import { fbm, valueNoise } from './noise.js';

function createCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function toTexture(canvas, { repeat = 1, srgb = true, anisotropy = 8 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = anisotropy;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Đất: map màu gần trung tính (để material.color quyết định nâu/ẩm) + bumpMap.
 * Dùng chung một trường nhiễu để bump khớp với các cục đất nhìn thấy.
 */
export function createSoilMaps(size = 512) {
  const colorCanvas = createCanvas(size);
  const bumpCanvas = createCanvas(size);
  const colorCtx = colorCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  const colorData = colorCtx.createImageData(size, size);
  const bumpData = bumpCtx.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const u = (x / size) * 16;
      const v = (y / size) * 16;

      const base = fbm(u, v, 5);
      const clod = valueNoise(u * 5.2, v * 5.2);
      const grain = valueNoise(u * 46, v * 46);

      let luminance = 0.68 + base * 0.4;
      if (clod > 0.79) luminance *= 1.14;
      else if (clod < 0.18) luminance *= 0.78;
      luminance *= 0.93 + grain * 0.14;

      const value = Math.min(255, Math.max(0, luminance * 226));
      colorData.data[index] = value;
      colorData.data[index + 1] = value * 0.985;
      colorData.data[index + 2] = value * 0.955;
      colorData.data[index + 3] = 255;

      const height = Math.min(255, Math.max(0, (base * 0.72 + clod * 0.28) * 255));
      bumpData.data[index] = height;
      bumpData.data[index + 1] = height;
      bumpData.data[index + 2] = height;
      bumpData.data[index + 3] = 255;
    }
  }

  colorCtx.putImageData(colorData, 0, 0);
  bumpCtx.putImageData(bumpData, 0, 0);

  // Vài hạt sạn rõ hơn cho gần
  colorCtx.globalAlpha = 0.22;
  for (let i = 0; i < 220; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 0.6 + Math.random() * 1.9;
    colorCtx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#2a2118';
    colorCtx.beginPath();
    colorCtx.arc(x, y, radius, 0, Math.PI * 2);
    colorCtx.fill();
  }
  colorCtx.globalAlpha = 1;

  return {
    map: toTexture(colorCanvas, { repeat: 3 }),
    bumpMap: toTexture(bumpCanvas, { repeat: 3, srgb: false }),
  };
}

/** Tile panel xám xanh có rãnh sọc song song + nhiễu bề mặt. */
export function createTileTexture(size = 256, stripes = 7) {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#87908a';
  ctx.fillRect(0, 0, size, size);

  const image = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const n = fbm((x / size) * 9, (y / size) * 9, 4);
      const shift = (n - 0.5) * 26;
      image.data[index] += shift;
      image.data[index + 1] += shift;
      image.data[index + 2] += shift * 0.9;
    }
  }
  ctx.putImageData(image, 0, 0);

  const step = size / stripes;
  for (let i = 0; i < stripes; i += 1) {
    const x = i * step;
    const groove = ctx.createLinearGradient(x, 0, x + step * 0.3, 0);
    groove.addColorStop(0, 'rgba(38, 47, 43, 0.55)');
    groove.addColorStop(1, 'rgba(38, 47, 43, 0)');
    ctx.fillStyle = groove;
    ctx.fillRect(x, 0, step * 0.3, size);

    ctx.fillStyle = 'rgba(74, 82, 78, 0.85)';
    ctx.fillRect(x - 1, 0, 2.4, size);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(x + 2.4, 0, 1.6, size);
  }

  return toTexture(canvas, { repeat: 1 });
}

/**
 * Bề mặt nền một ô: rãnh sọc song song + đường phân ô ở mép.
 * Mỗi lần lặp texture = đúng một ô lưới, nên đường phân ô trùng khít thửa.
 */
export function createFieldTexture({ size = 512, grooves = 6, seam = true } = {}) {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#8b948e';
  ctx.fillRect(0, 0, size, size);

  const image = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const n = fbm((x / size) * 7, (y / size) * 7, 4);
      const shift = (n - 0.5) * 22;
      image.data[index] += shift;
      image.data[index + 1] += shift;
      image.data[index + 2] += shift * 0.9;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Rãnh chạy dọc trục X (song song luống của thửa)
  const step = size / grooves;
  for (let i = 0; i < grooves; i += 1) {
    const y = i * step;
    const groove = ctx.createLinearGradient(0, y, 0, y + step * 0.32);
    groove.addColorStop(0, 'rgba(34, 43, 39, 0.5)');
    groove.addColorStop(1, 'rgba(34, 43, 39, 0)');
    ctx.fillStyle = groove;
    ctx.fillRect(0, y, size, step * 0.32);

    ctx.fillStyle = 'rgba(66, 75, 71, 0.8)';
    ctx.fillRect(0, y - 1, size, 2.2);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, y + 2.2, size, 1.4);
  }

  // Đường phân ô ở mép texture (tắt khi chỉ cần một sân liền)
  if (seam) {
    ctx.strokeStyle = 'rgba(38, 46, 42, 0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, size - 6, size - 6);
  }

  return toTexture(canvas, { repeat: 1 });
}

/** Mặt đường phẳng (ít sọc, tối hơn). */
export function createRoadTexture(size = 256) {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6d7671';
  ctx.fillRect(0, 0, size, size);

  const image = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const n = fbm((x / size) * 18, (y / size) * 18, 3);
      const shift = (n - 0.5) * 30;
      image.data[index] += shift;
      image.data[index + 1] += shift;
      image.data[index + 2] += shift;
    }
  }
  ctx.putImageData(image, 0, 0);
  return toTexture(canvas, { repeat: 2 });
}

/** Heatmap độ ẩm: gradient xanh dương → xanh lá → vàng → đỏ theo trường nhiễu. */
export function createMoistureHeatTexture(size = 256) {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const stops = [
    { at: 0, color: [59, 130, 246] },
    { at: 0.35, color: [47, 179, 68] },
    { at: 0.7, color: [224, 198, 62] },
    { at: 1, color: [212, 87, 79] },
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const field = fbm((x / size) * 4.5, (y / size) * 3.2, 4) * 0.72 + 0.16;
      const t = Math.min(1, Math.max(0, field));
      let color = stops[stops.length - 1].color;
      for (let i = 0; i < stops.length - 1; i += 1) {
        if (t >= stops[i].at && t <= stops[i + 1].at) {
          const local = (t - stops[i].at) / (stops[i + 1].at - stops[i].at);
          color = stops[i].color.map(
            (channel, channelIndex) =>
              channel + (stops[i + 1].color[channelIndex] - channel) * local,
          );
          break;
        }
      }
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = 210;
    }
  }

  ctx.putImageData(image, 0, 0);
  return toTexture(canvas, { repeat: 1 });
}
