// Particles, expanding rings, floating text, screen shake and hitstop.
import { TAU, rand, clamp } from './util.js';

export class Fx {
  constructor() {
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.hitstop = 0;
    this.flash = 0;
    this.flashColor = '255,255,255';
    this.maxParticles = 420;
  }

  reset() {
    this.particles.length = 0;
    this.rings.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.hitstop = 0;
    this.flash = 0;
  }

  burst(x, y, opts = {}) {
    const {
      count = 12,
      color = '125,249,255',
      speed = 260,
      speedVar = 0.7,
      life = 0.55,
      lifeVar = 0.5,
      size = 3,
      angle = null,
      spread = TAU,
      drag = 2.6,
      gravity = 0,
      streak = 1,
    } = opts;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const a = angle === null ? rand(0, TAU) : angle + rand(-spread / 2, spread / 2);
      const sp = speed * rand(1 - speedVar, 1 + speedVar);
      const l = life * rand(1 - lifeVar * 0.5, 1 + lifeVar);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: l,
        maxLife: l,
        size: size * rand(0.6, 1.5),
        color,
        drag,
        gravity,
        streak,
      });
    }
  }

  ring(x, y, opts = {}) {
    const { color = '125,249,255', from = 4, to = 90, life = 0.42, width = 3, fill = 0 } = opts;
    this.rings.push({ x, y, r: from, from, to, life, maxLife: life, color, width, fill });
  }

  text(x, y, str, opts = {}) {
    const { color = '#ffffff', size = 20, life = 0.8, vy = -60, weight = 800 } = opts;
    this.texts.push({ x, y, str, color, size, life, maxLife: life, vy, weight });
  }

  addShake(v) {
    this.shake = Math.min(28, this.shake + v);
  }

  addHitstop(v) {
    this.hitstop = Math.min(0.14, this.hitstop + v);
  }

  addFlash(v, color = '255,255,255') {
    this.flash = Math.min(0.7, this.flash + v);
    this.flashColor = color;
  }

  update(dt) {
    const p = this.particles;
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      q.life -= dt;
      if (q.life <= 0) {
        p[i] = p[p.length - 1];
        p.pop();
        continue;
      }
      const d = Math.exp(-q.drag * dt);
      q.vx *= d;
      q.vy *= d;
      q.vy += q.gravity * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const k = 1 - r.life / r.maxLife;
      r.r = r.from + (r.to - r.from) * (1 - Math.pow(1 - k, 2.2));
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-2.2 * dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    this.shake *= Math.exp(-9 * dt);
    if (this.shake < 0.15) this.shake = 0;
    const s = this.shake;
    this.shakeX = rand(-s, s);
    this.shakeY = rand(-s, s);
    this.flash *= Math.exp(-6.5 * dt);
    if (this.flash < 0.004) this.flash = 0;
  }

  drawAdditive(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // particles as streaks
    for (const q of this.particles) {
      const k = clamp(q.life / q.maxLife, 0, 1);
      const a = k * k;
      const tail = 0.016 * q.streak;
      ctx.strokeStyle = `rgba(${q.color},${a})`;
      ctx.lineWidth = Math.max(0.6, q.size * k);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(q.x - q.vx * tail, q.y - q.vy * tail);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();

      ctx.fillStyle = `rgba(${q.color},${a * 0.85})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, Math.max(0.4, q.size * k * 0.6), 0, TAU);
      ctx.fill();
    }

    for (const r of this.rings) {
      const k = clamp(r.life / r.maxLife, 0, 1);
      const a = k * k;
      if (r.fill) {
        ctx.fillStyle = `rgba(${r.color},${a * r.fill})`;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(${r.color},${a})`;
      ctx.lineWidth = r.width * k + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = clamp(t.life / t.maxLife, 0, 1);
      const pop = 1 + (1 - k) * 0.15;
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.font = `800 ${Math.round(t.size * pop)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }
}
