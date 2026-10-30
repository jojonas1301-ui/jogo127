import { TAU, clamp, lerp, rand, normalize, dist2 } from './util.js';

let uid = 0;

export function makeEnemy(type, x, y, t, target) {
  const speed = lerp(52, 190, clamp(t / 100, 0, 1));
  const base = {
    id: ++uid,
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    r: 15,
    speed,
    homing: 2.4,
    arm: 0.55,
    age: 0,
    angle: rand(0, TAU),
    spin: rand(-1.6, 1.6),
    col: '255,92,160',
    dead: false,
    pulse: rand(0, TAU),
    fireT: 0,
  };

  switch (type) {
    case 'mini':
      return { ...base, r: 9, speed: speed * 1.45, homing: 4.2, arm: 0.3, col: '196,150,255' };
    case 'splitter':
      return { ...base, r: 24, speed: speed * 0.6, homing: 1.5, arm: 0.7, col: '154,107,255' };
    case 'mine': {
      const a = rand(0, TAU);
      const sp = rand(48, 92);
      return {
        ...base,
        r: 17,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        arm: 0.9,
        col: '255,59,80',
        spin: rand(-0.8, 0.8),
      };
    }
    case 'shooter': {
      const tx = target ? target.x + rand(-180, 180) : x;
      const ty = target ? target.y + rand(-140, 140) : y;
      return {
        ...base,
        r: 16,
        speed: speed * 1.15,
        homing: 2.0,
        arm: 0.65,
        col: '255,209,102',
        tx,
        ty,
        fireT: rand(1.4, 2.6),
      };
    }
    default:
      return { ...base, r: 15, speed, homing: 2.8, col: '255,92,160' };
  }
}

export function updateEnemy(e, dt, game) {
  e.age += dt;
  e.pulse += dt * 3;
  e.angle += e.spin * dt;
  if (e.arm > 0) e.arm -= dt;

  const px = game.player.x;
  const py = game.player.y;
  const dx = px - e.x;
  const dy = py - e.y;
  const d = Math.hypot(dx, dy) || 1;

  switch (e.type) {
    case 'drone':
    case 'mini':
    case 'splitter': {
      const homeK = clamp(e.homing * dt, 0, 1);
      const wob = Math.sin(e.age * 2.2 + e.pulse) * 0.35;
      const nx = dx / d - (dy / d) * wob;
      const ny = dy / d + (dx / d) * wob;
      e.vx = lerp(e.vx, nx * e.speed, homeK);
      e.vy = lerp(e.vy, ny * e.speed, homeK);
      break;
    }
    case 'mine': {
      // drifts straight, bounces softly on the arena walls
      if (e.x < e.r && e.vx < 0) e.vx = Math.abs(e.vx) * 0.95;
      if (e.x > game.w - e.r && e.vx > 0) e.vx = -Math.abs(e.vx) * 0.95;
      if (e.y < e.r && e.vy < 0) e.vy = Math.abs(e.vy) * 0.95;
      if (e.y > game.h - e.r && e.vy > 0) e.vy = -Math.abs(e.vy) * 0.95;
      break;
    }
    case 'shooter': {
      // fly to a hover point, then hold position and fire
      const tdx = e.tx - e.x;
      const tdy = e.ty - e.y;
      const td = Math.hypot(tdx, tdy);
      if (td > 22) {
        e.vx = lerp(e.vx, (tdx / td) * e.speed, clamp(3 * dt, 0, 1));
        e.vy = lerp(e.vy, (tdy / td) * e.speed, clamp(3 * dt, 0, 1));
      } else {
        e.vx = lerp(e.vx, Math.cos(e.age * 1.3) * 26, clamp(3 * dt, 0, 1));
        e.vy = lerp(e.vy, Math.sin(e.age * 1.1) * 26, clamp(3 * dt, 0, 1));
        if (e.arm <= 0) {
          e.fireT -= dt;
          if (e.fireT <= 0) {
            e.fireT = clamp(2.5 - game.time * 0.008, 1.25, 2.5) * rand(0.85, 1.15);
            game.spawnBullet(e.x, e.y, px, py, e.age);
          }
        }
      }
      break;
    }
    default:
      break;
  }

  e.x += e.vx * dt;
  e.y += e.vy * dt;
}

export function enemyHitsPlayer(e, px, py, pr) {
  return dist2(e.x, e.y, px, py) < (e.r + pr) * (e.r + pr);
}

// ---------------- drawing ----------------

function polygon(ctx, r, sides, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function star(ctx, r, spikes, rot = 0, inner = 0.55) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = rot + (i / (spikes * 2)) * TAU;
    const rr = i % 2 === 0 ? r : r * inner;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawEnemy(ctx, e, time, player, lowFx = false) {
  const arming = e.arm > 0;
  const alpha = arming ? 0.35 : 1;
  const k = arming ? 1 - e.arm / 0.75 : 1;

  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';

  if (arming) {
    ctx.strokeStyle = `rgba(${e.col},0.5)`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 16 * (1 - clamp(k, 0, 1)), 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const glow = (fn, blur = 18, col = e.col) => {
    ctx.shadowColor = `rgba(${col},1)`;
    ctx.shadowBlur = lowFx ? blur * 0.35 : blur;
    fn();
    ctx.shadowBlur = 0;
  };

  if (e.type === 'drone') {
    const s = 1 + Math.sin(e.pulse) * 0.05;
    ctx.rotate(e.angle * 0.6);
    glow(() => {
      ctx.fillStyle = `rgba(${e.col},0.16)`;
      polygon(ctx, e.r * s, 6, 0);
      ctx.fill();
      ctx.strokeStyle = `rgba(${e.col},0.95)`;
      ctx.lineWidth = 2;
      polygon(ctx, e.r * s, 6, 0);
      ctx.stroke();
    }, 16);
    ctx.rotate(-e.angle * 0.6);
    ctx.fillStyle = `rgba(255,255,255,0.95)`;
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.28, 0, TAU);
    ctx.fill();
  } else if (e.type === 'mini') {
    ctx.rotate(e.angle * 1.4);
    glow(() => {
      ctx.fillStyle = `rgba(${e.col},0.85)`;
      ctx.beginPath();
      ctx.moveTo(0, -e.r);
      ctx.lineTo(e.r * 0.9, e.r * 0.8);
      ctx.lineTo(-e.r * 0.9, e.r * 0.8);
      ctx.closePath();
      ctx.fill();
    }, 14);
  } else if (e.type === 'splitter') {
    ctx.rotate(e.angle * 0.4);
    glow(() => {
      ctx.fillStyle = `rgba(${e.col},0.14)`;
      polygon(ctx, e.r, 5, 0);
      ctx.fill();
      ctx.strokeStyle = `rgba(${e.col},0.95)`;
      ctx.lineWidth = 2.4;
      polygon(ctx, e.r, 5, 0);
      ctx.stroke();
    }, 22);
    for (let i = 0; i < 3; i++) {
      const a = e.age * 2 + (i / 3) * TAU;
      ctx.fillStyle = `rgba(${e.col},0.9)`;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * e.r * 0.45, Math.sin(a) * e.r * 0.45, 3.2, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.4;
    polygon(ctx, e.r * 0.3, 5, e.angle);
    ctx.stroke();
  } else if (e.type === 'mine') {
    const pulse = 1 + Math.sin(e.age * 6) * 0.09;
    ctx.rotate(e.angle);
    glow(() => {
      ctx.fillStyle = `rgba(${e.col},0.9)`;
      star(ctx, e.r * pulse, 8, 0, 0.5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.2;
      star(ctx, e.r * pulse, 8, 0, 0.5);
      ctx.stroke();
    }, 24);
    ctx.rotate(-e.angle);
    const ringK = (e.age * 0.9) % 1;
    ctx.strokeStyle = `rgba(${e.col},${0.45 * (1 - ringK)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 10 + ringK * 34, 0, TAU);
    ctx.stroke();
  } else if (e.type === 'shooter') {
    const charge = 1 - clamp(e.fireT / 1.0, 0, 1);
    const pa = Math.atan2((player ? player.y : e.y) - e.y, (player ? player.x : e.x) - e.x);
    // corpo
    ctx.rotate(e.angle * 0.3);
    glow(() => {
      ctx.fillStyle = `rgba(${e.col},0.14)`;
      polygon(ctx, e.r, 6, 0);
      ctx.fill();
      ctx.strokeStyle = `rgba(${e.col},0.95)`;
      ctx.lineWidth = 2;
      polygon(ctx, e.r, 6, 0);
      ctx.stroke();
    }, 16);
    ctx.rotate(-e.angle * 0.3);
    // cano apontando para o jogador
    ctx.save();
    ctx.rotate(pa);
    glow(() => {
      ctx.strokeStyle = `rgba(${e.col},0.9)`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(e.r * 1.55, 0);
      ctx.stroke();
    }, 12);
    ctx.restore();
    // núcleo carregando
    ctx.fillStyle = `rgba(255,255,255,${0.3 + charge * 0.7})`;
    ctx.beginPath();
    ctx.arc(0, 0, 3 + charge * 3.5, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

export function drawBullet(ctx, b) {
  const a = Math.atan2(b.vy, b.vx);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(a);
  ctx.shadowColor = 'rgba(255,120,120,1)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = 'rgba(255,90,110,0.95)';
  ctx.beginPath();
  ctx.moveTo(b.r * 1.9, 0);
  ctx.lineTo(-b.r, b.r * 0.9);
  ctx.lineTo(-b.r * 0.4, 0);
  ctx.lineTo(-b.r, -b.r * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawPlayer(ctx, p, time) {
  const energyK = clamp(p.energy / p.maxEnergy, 0, 1);
  const flicker = p.invuln > 0 && Math.sin(time * 60) > 0 ? 0.45 : 1;

  ctx.save();
  ctx.translate(p.x, p.y);

  // energy ring
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(90,220,255,0.16)';
  ctx.beginPath();
  ctx.arc(0, 0, p.r + 11, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = energyK > 0.999 ? 'rgba(125,249,255,0.95)' : 'rgba(125,249,255,0.6)';
  ctx.shadowColor = 'rgba(125,249,255,0.9)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(0, 0, p.r + 11, -Math.PI / 2, -Math.PI / 2 + TAU * energyK);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.rotate(p.angle);
  ctx.globalAlpha = flicker;

  const dashing = p.dashing;
  const bodyGlow = dashing ? 34 : 18;

  ctx.shadowColor = dashing ? 'rgba(255,255,255,1)' : 'rgba(125,249,255,1)';
  ctx.shadowBlur = bodyGlow;
  const grad = ctx.createLinearGradient(-14, 0, 20, 0);
  grad.addColorStop(0, dashing ? 'rgba(180,255,255,0.9)' : 'rgba(60,180,220,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(p.r + 6, 0);
  ctx.lineTo(-p.r * 0.85, p.r * 0.72);
  ctx.lineTo(-p.r * 0.4, 0);
  ctx.lineTo(-p.r * 0.85, -p.r * 0.72);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // engine flare
  const flare = dashing ? 26 : 10 + Math.sin(time * 12) * 3;
  ctx.fillStyle = `rgba(125,249,255,${dashing ? 0.75 : 0.35})`;
  ctx.beginPath();
  ctx.moveTo(-p.r * 0.42, 4.5);
  ctx.lineTo(-flare, 0);
  ctx.lineTo(-p.r * 0.42, -4.5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
