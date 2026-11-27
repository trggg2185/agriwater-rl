import { hash2 } from '../utils/noise.js';

const JETS = 6;
const TURN = 2 * Math.PI;
const NOZZLE_HEIGHT = 17;
const FLIGHT = .56;

/** Chia toàn bộ bụi cây cho vòi đang mở gần nhất trên mặt phẳng ruộng. */
export function sprayTargets(plants, heads, flows) {
  const targets = heads.map(() => []);
  const active = heads.map((_, index) => index).filter((index) => flows[index] > 0);
  if (!active.length) return targets;

  for (const plant of plants) {
    const distance = (index) => {
      const [x, y] = heads[index];
      return (plant[0] - x) ** 2 + ((plant[1] - y) * 2.05) ** 2;
    };
    const nearest = active.reduce((best, index) => distance(index) < distance(best) ? index : best);
    targets[nearest].push(plant);
  }

  targets.forEach((group, index) => {
    const [x, y] = heads[index];
    group.sort((a, b) => Math.atan2(a[1] - y, a[0] - x) - Math.atan2(b[1] - y, b[0] - x));
  });
  return targets;
}

function aim(group, time, lane) {
  const sweep = time * 2.5 + lane;
  const index = ((Math.floor(sweep) % group.length) + group.length) % group.length;
  const [ax, ay] = group[index];
  const [bx, by] = group[(index + 1) % group.length];
  const t = sweep - Math.floor(sweep);
  const weight = t * t * (3 - 2 * t);
  return [ax + (bx - ax) * weight, ay + (by - ay) * weight];
}

function trajectory(dx, dy, t) {
  const rise = 19 + Math.min(32, Math.hypot(dx, dy) * .23);
  return [dx * t, -NOZZLE_HEIGHT * (1 - t) + dy * t - 4 * rise * t * (1 - t)];
}

function drawJet(ctx, x, y, dx, dy, strength) {
  for (let segment = 0; segment < 5; segment += 1) {
    const [ax, ay] = trajectory(dx, dy, segment * .085);
    const [bx, by] = trajectory(dx, dy, (segment + 1.05) * .085);
    ctx.beginPath();
    ctx.moveTo(x + ax, y + ay);
    ctx.lineTo(x + bx, y + by);
    ctx.strokeStyle = '#d9f3ff';
    ctx.globalAlpha = strength * (1 - .17 * segment);
    ctx.lineWidth = 1.8 - segment * .18;
    ctx.stroke();
  }
}

function drawDrop(ctx, x, y, dx, dy, progress, spread, strength) {
  const [px, py] = trajectory(dx, dy, progress);
  const [tx, ty] = trajectory(dx, dy, progress + .018);
  ctx.beginPath();
  ctx.moveTo(x + px + spread * progress, y + py);
  ctx.lineTo(x + tx + spread * progress, y + ty);
  ctx.strokeStyle = '#e5f7ff';
  ctx.globalAlpha = strength;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawImpact(ctx, x, y, phase, strength) {
  const radius = 2 + phase * 8;
  ctx.globalAlpha = (1 - phase) * strength;
  ctx.strokeStyle = '#d6f0fb';
  ctx.lineWidth = .85;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * .43, 0, 0, TURN);
  ctx.stroke();

  if (phase < .35) {
    ctx.fillStyle = '#eff9ff';
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.arc(x + side * (1 + phase * 13), y - Math.sin(phase * 9) * 3, .8, 0, TURN);
      ctx.fill();
    }
  }
}

export function drawSpray(ctx, heads, targets, flows, time, stationary) {
  const clock = stationary ? 4.42 : time / 1000;
  ctx.lineCap = 'round';
  for (const [index, [x, y]] of heads.entries()) {
    const group = targets[index] ?? [];
    if (!group.length) continue;
    const count = Math.min(JETS, group.length);
    const rate = 10 + Math.min(8, flows[index]);
    const strength = Math.min(.98, .68 + flows[index] * .045);

    for (let jet = 0; jet < count; jet += 1) {
      const lane = jet * group.length / count + index * .34;
      const [targetX, targetY] = aim(group, clock, lane);
      drawJet(ctx, x, y, targetX - x, targetY - y, strength);

      const phase = (index * .43 + jet * .19) % 1;
      const flight = FLIGHT + (jet % 3) * .027;
      const emission = Math.floor(clock * rate + phase);
      const dropCount = Math.ceil(flight * rate);
      for (let step = 0; step <= dropCount; step += 1) {
        const sequence = emission - step;
        const start = (sequence - phase) / rate;
        const progress = (clock - start) / flight;
        if (progress > 1) continue;
        const [landX, landY] = aim(group, start, lane);
        const jitter = (hash2(sequence, index * JETS + jet) - .5) * 7;
        drawDrop(ctx, x, y, landX - x, landY - y, progress, jitter, strength * (1 - progress * .28));
      }

      const impactSlot = Math.floor((clock - flight) * 3 + phase);
      const impactAge = (clock - flight) * 3 + phase - impactSlot;
      const [landX, landY] = aim(group, (impactSlot - phase) / 3, lane);
      drawImpact(ctx, landX, landY, impactAge, strength * .83);
    }
  }
  ctx.globalAlpha = 1;
}
