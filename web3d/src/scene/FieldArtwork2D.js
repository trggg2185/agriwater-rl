import { growthWindow } from '../utils/growth.js';
import { clamp } from '../utils/math.js';
import { hash2 } from '../utils/noise.js';

const FIELD_SIZE = 10;
const HALF_WIDTH = 37;
const HALF_HEIGHT = 18;

export const fieldBounds = {
  minX: -FIELD_SIZE * HALF_WIDTH,
  maxX: FIELD_SIZE * HALF_WIDTH,
  minY: -FIELD_SIZE * HALF_HEIGHT - 88,
  maxY: FIELD_SIZE * HALF_HEIGHT,
};

export function projectField(col, row) {
  return [(col - row) * HALF_WIDTH, (col + row - FIELD_SIZE) * HALF_HEIGHT];
}

/** Lưới nền dùng cùng phép chiếu và hệ tọa độ với các ô đất. */
export function drawGroundGrid(ctx, { minX, maxX, minY, maxY, scale }) {
  const spacing = HALF_HEIGHT * 2;
  ctx.beginPath();
  for (const slope of [HALF_HEIGHT / HALF_WIDTH, -HALF_HEIGHT / HALF_WIDTH]) {
    const first = Math.floor((minY - Math.max(slope * minX, slope * maxX)) / spacing);
    const last = Math.ceil((maxY - Math.min(slope * minX, slope * maxX)) / spacing);
    for (let index = first; index <= last; index += 1) {
      const offset = index * spacing;
      ctx.moveTo(minX, slope * minX + offset);
      ctx.lineTo(maxX, slope * maxX + offset);
    }
  }
  ctx.strokeStyle = '#566f8529';
  ctx.lineWidth = 1 / scale;
  ctx.stroke();
}

/** Trạng thái hình học liên tục giữa các mốc do API trả về. */
export function cropGrowth(record, state) {
  const stage = clamp(record.stage, 0, 3);
  const { first, next } = growthWindow(state, record);
  const end = next ?? state.meta.maxDays;
  const progress = clamp((record.day - first) / Math.max(1, end - first), 0, 1);
  return { age: stage + progress, wilt: record.terminated ? 1 : 0 };
}

function traceTile(ctx, col, row) {
  const [x, y] = projectField(col, row);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + HALF_WIDTH, y + HALF_HEIGHT);
  ctx.lineTo(x, y + 2 * HALF_HEIGHT);
  ctx.lineTo(x - HALF_WIDTH, y + HALF_HEIGHT);
  ctx.closePath();
}

const tiles = [];
for (let row = 0; row < FIELD_SIZE; row += 1) {
  for (let col = 0; col < FIELD_SIZE; col += 1) {
    const seed = row * FIELD_SIZE + col;
    const [x, y] = projectField(col + .46 + hash2(seed, 6) * .08, row + .46 + hash2(seed, 7) * .08);
    const flecks = Array.from({ length: 10 }, (_, index) => {
      const [fx, fy] = projectField(col + hash2(seed, index + 190), row + hash2(seed, index + 285));
      return [fx, fy, .38 + hash2(seed, index + 30) * 1.04];
    });
    tiles.push({ col, row, seed, x, y, flecks });
  }
}
tiles.sort((a, b) => a.y - b.y);
export const plantCenters = tiles.map(({ x, y }) => [x, y]);

const heightAt = (age) => age < 1
  ? 11 + age * 16
  : age < 2 ? 27 + (age - 1) * 46
    : 73 + Math.min(age - 2, 1) * 9;

function ribbon(ctx, x, y, dx, dy, broad, color) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + dx * .14 - broad, y + dy * .58, x + dx * .53, y + dy * 1.16, x + dx, y + dy);
  ctx.bezierCurveTo(x + dx * .71, y + dy * 1.04, x + dx * .39 + broad, y + dy * .48, x, y);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawRice(ctx, { x, y, seed }, age, wilt) {
  const size = heightAt(age) * (.83 + hash2(seed, 78) * .29);
  const blades = Math.round(5 + Math.min(2, age) * 5);
  const ripe = age >= 3;
  const bloom = clamp((age - 1.94) * 3, 0, 1);
  const colors = ripe
    ? ['#586348', '#878459', '#ae9c64', '#727849', '#b4a766']
    : ['#435a46', '#607553', '#829668', '#506d53', '#9ba673'];

  for (let leaf = 0; leaf < blades; leaf += 1) {
    const side = leaf % 2 ? -1 : 1;
    const bend = side * size * (.12 + hash2(seed, leaf + 2) * .5);
    const rise = -size * (.32 + hash2(seed, leaf + 41) * .63) * (1 - wilt * .44);
    const broad = (1.3 + hash2(seed, leaf + 76) * 3) * Math.min(1, size / 37);
    const base = x + (hash2(seed, leaf + 101) - .5) * size * .17;
    ribbon(ctx, base, y, bend, rise, broad, wilt > .5 ? '#928350' : colors[leaf % colors.length]);
  }

  if (bloom <= 0) return;
  ctx.lineCap = 'round';
  for (let stem = 0; stem < 6; stem += 1) {
    const dir = stem % 2 ? -1 : 1;
    const dx = dir * size * (.13 + hash2(seed, stem + 34) * .27);
    const crest = y - size * (.82 + hash2(seed, stem + 129) * .24) * (1 - wilt * .35);
    const tipX = x + dx;
    const tipY = crest + size * .12;
    ctx.strokeStyle = ripe ? '#9a8650' : '#858552';
    ctx.lineWidth = .78;
    ctx.beginPath();
    ctx.moveTo(x + (stem - 2) * 1.4, y);
    ctx.quadraticCurveTo(x + dx * .43, crest - size * .17, tipX, tipY);
    ctx.stroke();

    for (let grain = 0; grain < 7; grain += 1) {
      const fraction = grain / 6;
      const gx = tipX - dx * .39 * (1 - fraction) + (grain % 2 ? 1.9 : -1.2);
      const gy = tipY - size * .18 * (1 - fraction);
      ctx.fillStyle = ripe ? ['#d8b878', '#f3d297'][grain % 2]
        : ['#e5dbad', '#f7eed1'][grain % 2];
      ctx.beginPath();
      ctx.ellipse(gx, gy, (1.2 + fraction * .45) * bloom, 2.3 * bloom, dir * -.66, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawMaize(ctx, { x, y, seed }, age, wilt) {
  const size = heightAt(age) * (1.17 + hash2(seed, 85) * .21) * (1 - wilt * .36);
  const leaves = Math.round(3 + Math.min(2, age) * 2);
  const ripe = age >= 3;
  ctx.strokeStyle = ripe ? '#8c8150' : '#576f44';
  ctx.lineWidth = Math.min(3.3, size / 16);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - 4, y - size * .54, x + 1.5, y - size);
  ctx.stroke();
  for (let leaf = 0; leaf < leaves; leaf += 1) {
    const side = leaf % 2 ? 1 : -1;
    const offset = (.1 + leaf * (.68 / leaves)) * size;
    const length = size * (.25 + hash2(seed, leaf + 55) * .24) * (1 - leaf / (leaves * 2));
    const color = ripe || wilt > .5 ? ['#8d8950', '#a8a061'] : ['#627e48', '#8c9c57'];
    ribbon(ctx, x, y - offset, side * length, -length * .42, length * .24, color[leaf % 2]);
  }
  if (age < 2) return;
  for (let i = -2; i <= 2; i += 1) {
    ribbon(ctx, x + 1, y - size * .88, i * (2 + size * .045), -size * .19, 1.15, '#ddc28a');
  }
  if (age >= 2.6) {
    ribbon(ctx, x, y - size * .26, size * .1, -size * .25, size * .08, '#c0ac67');
  }
}

export function drawField(ctx, { crop, age, wilt, heat, watering }) {
  const soil = ctx.createLinearGradient(-250, -120, 240, 150);
  soil.addColorStop(0, '#af946b');
  soil.addColorStop(.52, '#c8a97e');
  soil.addColorStop(1, '#d6b589');

  ctx.strokeStyle = '#9a784d6b';
  ctx.lineWidth = .75;
  for (const tile of tiles) {
    traceTile(ctx, tile.col, tile.row);
    ctx.fillStyle = soil;
    ctx.fill();
    ctx.fillStyle = tile.seed % 3 === 0 ? '#96755518' : '#eee3c81b';
    ctx.fill();
    if (watering && !heat) {
      ctx.fillStyle = '#52605217';
      ctx.fill();
    }
    if (heat) {
      ctx.fillStyle = `${heat[Math.floor(tile.col * heat.length / FIELD_SIZE)]}74`;
      ctx.fill();
    }
    ctx.stroke();
    if (watering && !heat) {
      const radius = 12 + hash2(tile.seed, 155) * 12;
      ctx.fillStyle = '#48636a29';
      ctx.beginPath();
      ctx.ellipse(tile.x + 2, tile.y + 1, radius, radius * .36, -.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#67482c27';
    for (const [x, y, r] of tile.flecks) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.5, r * .63, -.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const tile of tiles) {
    const radius = 3 + heightAt(age) * .11;
    ctx.fillStyle = '#594b3340';
    ctx.beginPath();
    ctx.ellipse(tile.x - radius * .32, tile.y + 2, radius, radius * .44, -.16, 0, Math.PI * 2);
    ctx.fill();
    if (crop === 'rice') drawRice(ctx, tile, age, wilt);
    else drawMaize(ctx, tile, age, wilt);
  }
}
