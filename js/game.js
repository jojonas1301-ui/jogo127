import { TAU, clamp, lerp, rand, randInt, pick, chance, dist2, normalize, fmt } from './util.js';
import { Fx } from './fx.js';
import { makeEnemy, updateEnemy, drawEnemy, drawBullet, drawPlayer } from './entities.js';

const DASH_COST = 55;
const ENERGY_REGEN = 80;
const DASH_SPEED = 2150;
const DASH_TIME = 0.135;
const DASH_GRACE = 0.14;
const KILL_REFUND = 30;
const COMBO_WINDOW = 2.6;
const MAX_MULT = 10;

const COL = {
  cyan: '125,249,255',
  pink: '255,92,160',
  violet: '154,107,255',
  red: '255,59,80',
  gold: '255,209,102',
  white: '255,255,255',
};

const BASE_SCORE = { drone: 10, mini: 6, splitter: 25, shooter: 18, mine: 0 };

export class Game {
  constructor(canvas, audio, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audio;
    this.hooks = hooks;
    this.fx = new Fx();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = 800;
    this.h = 600;
    this.state = 'menu';
    this.paused = false;
    this.best = 0;
    try {
      this.best = Number(localStorage.getItem('neonrift.best') || 0) || 0;
    } catch (err) {
      this.best = 0;
    }
    this.pointer = { x: 0, y: 0, active: false };
    this.frameAvg = 1 / 60;
    this.lowFx = false;
    try {
      this.hasPlayed = localStorage.getItem('neonrift.played') === '1';
    } catch (err) {
      this.hasPlayed = false;
    }
    this.time = 0;
    this.player = this.makePlayer(400, 300);
    this.enemies = [];
    this.bullets = [];
    this.trail = [];
    this.bgCanvas = null;
    this.vignette = null;
    this.resize();
    this.reset();
  }

  makePlayer(x, y) {
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      r: 13,
      angle: -Math.PI / 2,
      energy: 120,
      maxEnergy: 120,
      dashing: false,
      dashT: 0,
      invuln: 0,
    };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(320, Math.round(rect.width || window.innerWidth));
    this.h = Math.max(320, Math.round(rect.height || window.innerHeight));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.player) {
      this.player.x = clamp(this.player.x, 40, this.w - 40);
      this.player.y = clamp(this.player.y, 40, this.h - 40);
    }
    this.buildBackground();
  }

  buildBackground() {
    const { w, h } = this;
    const dpr = this.dpr || 1;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    const g = c.getContext('2d');
    g.scale(dpr, dpr);

    const grad = g.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    grad.addColorStop(0, '#080f26');
    grad.addColorStop(0.45, '#050916');
    grad.addColorStop(1, '#010206');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    // nebula blobs
    const blobs = [
      { x: w * 0.18, y: h * 0.26, r: Math.max(w, h) * 0.42, col: '86,54,190', a: 0.15 },
      { x: w * 0.85, y: h * 0.75, r: Math.max(w, h) * 0.4, col: '0,120,170', a: 0.13 },
      { x: w * 0.6, y: h * 0.1, r: Math.max(w, h) * 0.3, col: '180,30,110', a: 0.08 },
    ];
    g.globalCompositeOperation = 'lighter';
    for (const b of blobs) {
      const rg = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      rg.addColorStop(0, `rgba(${b.col},${b.a})`);
      rg.addColorStop(1, `rgba(${b.col},0)`);
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
    }
    g.globalCompositeOperation = 'source-over';

    // stars
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const s = Math.random() < 0.85 ? 1 : 1.8;
      g.fillStyle = `rgba(200,235,255,${rand(0.06, 0.32)})`;
      g.fillRect(x, y, s, s);
    }
    this.bgCanvas = c;

    const v = document.createElement('canvas');
    v.width = Math.max(1, Math.round(w * dpr));
    v.height = Math.max(1, Math.round(h * dpr));
    const vg = v.getContext('2d');
    vg.scale(dpr, dpr);
    const rg = vg.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.72);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    rg.addColorStop(1, 'rgba(0,0,0,0.88)');
    vg.fillStyle = rg;
    vg.fillRect(0, 0, w, h);
    this.vignette = v;
  }

  reset() {
    this.player = this.makePlayer(this.w / 2, this.h / 2);
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.trail.length = 0;
    this.fx.reset();
    this.time = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.kills = 0;
    this.dashes = 0;
    this.spawnTimer = 1.35;
    this.beatBest = false;
    this.nextSurge = 22;
    this.deathT = 0;
    this.endData = null;
  }

  start() {
    this.reset();
    this.state = 'playing';
    this.paused = false;
    this.player.invuln = 1.1;
    this.audio.startMusic();
    this.audio.start();
    this.fx.ring(this.player.x, this.player.y, { color: COL.cyan, from: 10, to: 190, life: 0.6, width: 3 });
    this.fx.addFlash(0.18, '125,249,255');
    if (!this.hasPlayed) {
      this.hasPlayed = true;
      try {
        localStorage.setItem('neonrift.played', '1');
      } catch (err) {
        /* ignora */
      }
      this.fx.text(this.w / 2, this.h * 0.66, 'CLIQUE PARA DASH', {
        color: '#7df9ff',
        size: 18,
        life: 2.4,
        vy: -8,
      });
      this.fx.text(this.w / 2, this.h * 0.66 + 30, 'atravesse os inimigos · evite as minas', {
        color: 'rgba(205,228,245,0.75)',
        size: 12,
        life: 2.4,
        vy: -8,
      });
    }
    this.emitState();
  }

  pause(v) {
    if (this.state !== 'playing') return;
    this.paused = v;
    this.audio.setMusicDuck(v);
    this.emitState();
  }

  emitState() {
    if (this.hooks.onState) {
      this.hooks.onState(this.state, {
        score: this.score,
        best: this.best,
        maxCombo: this.maxCombo,
        time: this.time,
        kills: this.kills,
        dashes: this.dashes,
        paused: this.paused,
      });
    }
  }

  setPointer(x, y, active = true) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = active;
  }

  dashTo(x, y) {
    if (this.state !== 'playing' || this.paused) return false;
    const p = this.player;
    if (p.dashing) return false;
    if (p.energy < DASH_COST) {
      this.audio.dashFail();
      this.fx.ring(p.x, p.y, { color: COL.red, from: p.r + 14, to: p.r + 22, life: 0.22, width: 2 });
      return false;
    }
    const dir = normalize(x - p.x, y - p.y);
    p.energy -= DASH_COST;
    p.dashing = true;
    p.dashT = DASH_TIME;
    p.vx = dir.x * DASH_SPEED;
    p.vy = dir.y * DASH_SPEED;
    p.angle = Math.atan2(dir.y, dir.x);
    this.dashes++;
    this.audio.dash();
    this.fx.burst(p.x, p.y, {
      count: 16,
      color: COL.cyan,
      angle: Math.atan2(-dir.y, -dir.x),
      spread: 1.2,
      speed: 380,
      life: 0.32,
      size: 2.8,
    });
    this.fx.ring(p.x, p.y, { color: COL.cyan, from: p.r, to: p.r + 42, life: 0.3, width: 2.4 });
    this.fx.addShake(1.6);
    return true;
  }

  // ---------------- update ----------------

  update(rawDt) {
    const dt = Math.min(rawDt, 1 / 20);
    this.frameAvg = lerp(this.frameAvg, Math.min(rawDt, 0.1), 0.04);
    this.lowFx = this.frameAvg > 0.027;

    if (this.state === 'menu') {
      this.updateMenu(dt);
      this.fx.update(dt);
      return;
    }
    if (this.paused || this.state === 'dead') {
      this.fx.update(dt * 0.2);
      return;
    }

    let scale = 1;
    if (this.fx.hitstop > 0) {
      this.fx.hitstop -= dt;
      scale = 0.08;
    }
    if (this.state === 'dying') {
      this.deathT += dt;
      scale *= clamp(1 - this.deathT / 0.6, 0.12, 1);
    }
    const d = dt * scale;

    if (this.state === 'playing') {
      this.time += d;
      this.updatePlayer(d);
      this.updateSpawn(d);
      this.updateCombo(d);
    } else if (this.state === 'dying') {
      this.updateDeathCamera(dt);
    }

    this.updateEnemies(d);
    this.updateBullets(d);
    if (this.state === 'playing') {
      this.collide();
      this.checkRecord();
    }

    this.fx.update(d);

    if (this.state === 'dying' && this.deathT > 1.15) {
      this.finishRun();
    }
  }

  updateMenu(dt) {
    this.time += dt;
    if (chance(dt * 8)) {
      this.fx.burst(rand(0, this.w), this.h + 20, {
        count: 1,
        color: pick([COL.cyan, COL.violet, COL.pink]),
        angle: -Math.PI / 2 + rand(-0.3, 0.3),
        speed: rand(20, 70),
        life: rand(3, 7),
        size: 2,
        drag: 0.1,
      });
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    if (p.invuln > 0) p.invuln -= dt;
    p.energy = Math.min(p.maxEnergy, p.energy + ENERGY_REGEN * dt);

    if (p.dashing) {
      p.dashT -= dt;
      this.trail.push({ x: p.x, y: p.y, angle: p.angle, life: 0.36, max: 0.36 });
      if (p.dashT <= 0) {
        p.dashing = false;
        p.invuln = Math.max(p.invuln, DASH_GRACE);
        p.vx *= 0.28;
        p.vy *= 0.28;
      }
    } else {
      const damp = Math.exp(-7 * dt);
      p.vx *= damp;
      p.vy *= damp;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // arena walls: soft bounce
    const pad = p.r + 4;
    if (p.x < pad) {
      p.x = pad;
      p.vx = Math.abs(p.vx) * 0.4;
    } else if (p.x > this.w - pad) {
      p.x = this.w - pad;
      p.vx = -Math.abs(p.vx) * 0.4;
    }
    if (p.y < pad) {
      p.y = pad;
      p.vy = Math.abs(p.vy) * 0.4;
    } else if (p.y > this.h - pad) {
      p.y = this.h - pad;
      p.vy = -Math.abs(p.vy) * 0.4;
    }

    if (this.pointer.active) {
      const target = Math.atan2(this.pointer.y - p.y, this.pointer.x - p.x);
      if (!p.dashing) {
        let diff = target - p.angle;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        p.angle += diff * clamp(14 * dt, 0, 1);
      }
    }

    for (let i = this.trail.length - 1; i >= 0; i--) {
      const t = this.trail[i];
      t.life -= dt;
      if (t.life <= 0) this.trail.splice(i, 1);
    }
  }

  updateCombo(dt) {
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
      }
    }
  }

  updateSpawn(dt) {
    if (this.enemies.length < 54) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const interval = lerp(1.0, 0.3, clamp(this.time / 100, 0, 1));
        this.spawnTimer = interval * rand(0.72, 1.28);
        this.spawnOne(this.chooseType());
        if (this.time > 26 && chance(0.18) && this.enemies.length < 48) {
          this.spawnOne('drone');
          this.spawnOne('drone');
        }
      }
    }

    if (this.time > this.nextSurge) {
      this.nextSurge += 24;
      this.surge();
    }
  }

  chooseType() {
    const t = this.time;
    const table = [
      ['drone', 1],
      ['splitter', t > 12 ? 0.42 : 0],
      ['mine', t > 22 && this.countType('mine') < 6 ? 0.55 : 0],
      ['shooter', t > 36 && this.countType('shooter') < 3 ? 0.42 : 0],
    ].filter(([, w]) => w > 0);
    let total = 0;
    for (const [, w] of table) total += w;
    let r = Math.random() * total;
    for (const [type, w] of table) {
      r -= w;
      if (r <= 0) return type;
    }
    return 'drone';
  }

  countType(type) {
    let n = 0;
    for (const e of this.enemies) if (e.type === type) n++;
    return n;
  }

  spawnOne(type) {
    const m = 70;
    let x;
    let y;
    if (type === 'mine') {
      const side = randInt(0, 3);
      if (side === 0) {
        x = rand(30, this.w - 30);
        y = 30;
      } else if (side === 1) {
        x = rand(30, this.w - 30);
        y = this.h - 30;
      } else if (side === 2) {
        x = 30;
        y = rand(30, this.h - 30);
      } else {
        x = this.w - 30;
        y = rand(30, this.h - 30);
      }
    } else {
      const side = randInt(0, 3);
      if (side === 0) {
        x = rand(-20, this.w + 20);
        y = -m;
      } else if (side === 1) {
        x = rand(-20, this.w + 20);
        y = this.h + m;
      } else if (side === 2) {
        x = -m;
        y = rand(-20, this.h + 20);
      } else {
        x = this.w + m;
        y = rand(-20, this.h + 20);
      }
    }
    // never spawn right on top of the player
    const p = this.player;
    if (dist2(x, y, p.x, p.y) < 240 * 240) {
      const dir = normalize(x - p.x, y - p.y);
      x = p.x + dir.x * 300;
      y = p.y + dir.y * 300;
    }
    const e = makeEnemy(type, x, y, this.time, p);
    e.arm = type === 'shooter' ? 0.75 : type === 'mine' ? 0.85 : 0.5;
    this.enemies.push(e);
    return e;
  }

  surge() {
    const p = this.player;
    const n = clamp(4 + Math.floor(this.time / 30), 4, 8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.15, 0.15);
      const r = Math.max(this.w, this.h) * 0.55;
      const e = makeEnemy(i % 3 === 0 ? 'mini' : 'drone', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, this.time, p);
      e.arm = 0.7;
      this.enemies.push(e);
    }
    this.fx.ring(p.x, p.y, { color: COL.pink, from: 20, to: Math.max(this.w, this.h) * 0.6, life: 0.85, width: 2 });
    this.fx.text(this.w / 2, this.h * 0.28, 'SURTO', { color: '#ff5ea8', size: 30, life: 1.1, vy: -20 });
    this.fx.addFlash(0.1, '255,92,160');
    this.audio.comboMilestone(3);
  }

  updateEnemies(dt) {
    const arr = this.enemies;
    for (let i = arr.length - 1; i >= 0; i--) {
      const e = arr[i];
      if (e.dead) {
        arr.splice(i, 1);
        continue;
      }
      updateEnemy(e, dt, this);
      const out = 520;
      if (e.x < -out || e.x > this.w + out || e.y < -out || e.y > this.h + out) {
        arr.splice(i, 1);
        continue;
      }
      if (e.arm <= 0 && e.type !== 'mine') this.separate(e);
    }
  }

  separate(e) {
    const arr = this.enemies;
    for (const o of arr) {
      if (o === e || o.dead) continue;
      const min = e.r + o.r + 4;
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5;
        e.vx -= dx * push * 0.6;
        e.vy -= dy * push * 0.6;
      }
    }
  }

  checkRecord() {
    if (this.beatBest || this.best <= 0 || this.score <= this.best) return;
    this.beatBest = true;
    this.fx.text(this.w / 2, this.h * 0.34, 'NOVO RECORDE', {
      color: '#ffd166',
      size: 28,
      life: 1.3,
      vy: -26,
    });
    this.fx.ring(this.w / 2, this.h * 0.34, { color: COL.gold, from: 10, to: 240, life: 0.8, width: 2 });
    this.fx.addFlash(0.08, '255,209,102');
    this.audio.comboMilestone(5);
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -60 || b.x > this.w + 60 || b.y < -60 || b.y > this.h + 60) {
        this.bullets.splice(i, 1);
      }
    }
  }

  spawnBullet(x, y, tx, ty, age) {
    const dir = normalize(tx - x, ty - y);
    const speed = 210 + clamp(this.time * 0.8, 0, 150);
    const spread = 0.06;
    const a = Math.atan2(dir.y, dir.x) + rand(-spread, spread);
    this.bullets.push({
      x: x + Math.cos(a) * 18,
      y: y + Math.sin(a) * 18,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: 6,
      life: 6,
    });
    this.fx.ring(x, y, { color: COL.red, from: 4, to: 24, life: 0.25, width: 1.5 });
    this.audio.shoot();
  }

  collide() {
    const p = this.player;
    const hitR = p.dashing ? p.r + 13 : p.r;

    for (const e of this.enemies) {
      if (e.dead || e.arm > 0) continue;
      const rr = e.r + hitR;
      if (dist2(e.x, e.y, p.x, p.y) > rr * rr) continue;

      if (e.type === 'mine') {
        if (p.invuln <= 0) {
          this.die('mine');
          return;
        }
        continue;
      }
      if (p.dashing) {
        this.killEnemy(e);
      } else if (p.invuln <= 0) {
        this.die(e.type);
        return;
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const rr = b.r + hitR;
      if (dist2(b.x, b.y, p.x, p.y) > rr * rr) continue;
      if (p.dashing) {
        this.bullets.splice(i, 1);
        this.score += 3;
        this.fx.burst(b.x, b.y, { count: 8, color: COL.gold, speed: 190, life: 0.28, size: 2 });
        this.fx.ring(b.x, b.y, { color: COL.gold, from: 3, to: 26, life: 0.24, width: 2 });
        this.audio.bulletPop();
      } else if (p.invuln <= 0) {
        this.bullets.splice(i, 1);
        this.die('bullet');
        return;
      }
    }
  }

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    const p = this.player;

    this.combo++;
    this.comboTimer = COMBO_WINDOW;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.kills++;
    const mult = Math.min(this.combo, MAX_MULT);
    const gain = (BASE_SCORE[e.type] || 10) * mult;
    this.score += gain;
    p.energy = Math.min(p.maxEnergy, p.energy + KILL_REFUND);

    const col = e.col;
    this.fx.burst(e.x, e.y, {
      count: e.type === 'splitter' ? 24 : 14,
      color: col,
      speed: e.type === 'splitter' ? 340 : 260,
      life: 0.5,
      size: e.type === 'splitter' ? 3.4 : 2.6,
      drag: 3,
    });
    this.fx.burst(e.x, e.y, { count: 6, color: COL.white, speed: 420, life: 0.24, size: 2, drag: 5 });
    this.fx.ring(e.x, e.y, { color: col, from: e.r * 0.5, to: e.r * 3.4, life: 0.38, width: 2.4 });
    this.fx.text(e.x, e.y - e.r - 8, '+' + gain, {
      color: mult >= 5 ? '#ffd166' : '#ffffff',
      size: mult >= 5 ? 22 : 18,
      life: 0.7,
      vy: -70,
    });
    this.fx.addShake(2.2 + Math.min(mult, 8) * 0.35);
    this.fx.addHitstop(e.type === 'splitter' ? 0.055 : 0.035);
    this.audio.kill(this.combo);

    if (e.type === 'splitter') {
      this.audio.bigKill();
      this.fx.addFlash(0.06, '154,107,255');
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rand(-0.4, 0.4);
        const m = makeEnemy('mini', e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, this.time, p);
        m.arm = 0.22;
        this.enemies.push(m);
      }
    }

    if (this.combo === 5 || this.combo === 10 || this.combo === 15 || (this.combo > 15 && this.combo % 10 === 0)) {
      this.audio.comboMilestone(this.combo / 5);
      this.fx.text(p.x, p.y - 60, `COMBO x${Math.min(this.combo, MAX_MULT)}`, {
        color: '#7df9ff',
        size: 26,
        life: 0.9,
        vy: -40,
      });
      this.fx.addFlash(0.07, '125,249,255');
      this.fx.ring(p.x, p.y, { color: COL.cyan, from: 10, to: 120, life: 0.5, width: 2 });
    }
  }

  die(cause) {
    if (this.state !== 'playing') return;
    const p = this.player;
    this.state = 'dying';
    this.deathT = 0;
    this.deathCause = cause;
    this.combo = 0;
    this.audio.death();
    this.audio.stopMusic(0.8);
    this.fx.addShake(24);
    this.fx.addFlash(0.42, '255,70,110');
    this.fx.addHitstop(0.1);
    this.fx.burst(p.x, p.y, {
      count: 40,
      color: COL.cyan,
      speed: 520,
      life: 0.9,
      size: 3.4,
      drag: 1.6,
    });
    this.fx.burst(p.x, p.y, { count: 16, color: COL.white, speed: 700, life: 0.5, size: 2.4, drag: 2.4 });
    this.fx.ring(p.x, p.y, { color: COL.cyan, from: 8, to: 260, life: 0.75, width: 4 });
    this.fx.ring(p.x, p.y, { color: COL.red, from: 8, to: 150, life: 0.5, width: 3 });
  }

  updateDeathCamera(dt) {
    this.player.vx *= Math.exp(-4 * dt);
    this.player.vy *= Math.exp(-4 * dt);
  }

  toMenu() {
    this.reset();
    this.state = 'menu';
    this.paused = false;
    this.audio.setMusicDuck(false);
    this.emitState();
  }

  finishRun() {
    this.state = 'dead';
    const newRecord = this.score > this.best;
    if (newRecord) {
      this.best = this.score;
      try {
        localStorage.setItem('neonrift.best', String(this.best));
      } catch (err) {
        /* storage blocked, ignore */
      }
    }
    this.endData = {
      score: this.score,
      best: this.best,
      newRecord,
      maxCombo: this.maxCombo,
      time: this.time,
      kills: this.kills,
      dashes: this.dashes,
    };
    if (this.hooks.onEnd) this.hooks.onEnd(this.endData);
    this.emitState();
  }

  // ---------------- rendering ----------------

  draw(time) {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (this.bgCanvas) ctx.drawImage(this.bgCanvas, 0, 0, w, h);
    this.drawGrid(time);

    const fx = this.fx;
    fx.maxParticles = this.lowFx ? 180 : 420;
    ctx.save();
    ctx.translate(fx.shakeX, fx.shakeY);

    if (this.state !== 'menu') {
      this.drawTrail(ctx);
      fx.drawAdditive(ctx);
      for (const b of this.bullets) drawBullet(ctx, b);
      const ref = this.state === 'dying' ? null : this.player;
      for (const e of this.enemies) drawEnemy(ctx, e, time, ref, this.lowFx);
      if (this.state === 'playing' || this.state === 'dying') {
        if (this.state === 'playing') this.drawAim(ctx, time);
        if (this.state === 'playing') drawPlayer(ctx, this.player, time);
      }
      if (this.state === 'playing') this.drawEnergyBar(ctx);
      fx.drawTexts(ctx);
    } else {
      fx.drawAdditive(ctx);
    }
    ctx.restore();

    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, w, h);

    if (fx.flash > 0.002) {
      ctx.fillStyle = `rgba(${fx.flashColor},${fx.flash * 0.5})`;
      ctx.fillRect(0, 0, w, h);
    }

    if (this.state !== 'menu') this.drawHud(ctx, time);
  }

  drawGrid(time) {
    const { ctx, w, h } = this;
    const spacing = 72;
    const drift = (time * 6) % spacing;
    const ox = (-this.player.x * 0.035 - drift) % spacing;
    const oy = (-this.player.y * 0.035 - drift * 0.5) % spacing;
    ctx.save();
    ctx.lineWidth = 1;
    for (let x = ox; x < w + spacing; x += spacing) {
      const major = Math.round((x - ox) / spacing) % 4 === 0;
      ctx.strokeStyle = major ? 'rgba(110,210,255,0.1)' : 'rgba(110,210,255,0.04)';
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
      ctx.stroke();
    }
    for (let y = oy; y < h + spacing; y += spacing) {
      const major = Math.round((y - oy) / spacing) % 4 === 0;
      ctx.strokeStyle = major ? 'rgba(110,210,255,0.1)' : 'rgba(110,210,255,0.04)';
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTrail(ctx) {
    const t = this.trail;
    if (t.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // halo largo
    const n = t.length;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < n; i++) {
        const a = t[i - 1];
        const b = t[i];
        const kAge = clamp(b.life / b.max, 0, 1);
        const k = Math.pow(i / (n - 1), 1.4) * kAge;
        if (pass === 0) {
          ctx.strokeStyle = `rgba(60,190,255,${0.3 * k})`;
          ctx.lineWidth = 30 * k + 1;
        } else {
          ctx.strokeStyle = `rgba(210,255,255,${0.65 * k})`;
          ctx.lineWidth = 8 * k + 0.5;
        }
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawAim(ctx, time) {
    const p = this.player;
    if (!this.pointer.active || p.dashing) return;
    const dx = this.pointer.x - p.x;
    const dy = this.pointer.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 24) return;
    const nx = dx / d;
    const ny = dy / d;
    const reach = Math.min(d, 360);
    const ready = p.energy >= DASH_COST;
    const col = ready ? '125,249,255' : '255,90,110';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.setLineDash([7, 11]);
    ctx.lineDashOffset = -(time * 60) % 18;
    ctx.strokeStyle = `rgba(${col},${ready ? 0.3 : 0.24})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + nx * (p.r + 16), p.y + ny * (p.r + 16));
    ctx.lineTo(p.x + nx * reach, p.y + ny * reach);
    ctx.stroke();
    ctx.setLineDash([]);

    const ex = p.x + nx * reach;
    const ey = p.y + ny * reach;
    ctx.strokeStyle = `rgba(${col},${ready ? 0.85 : 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex, ey, 8 + Math.sin(time * 8) * 1.6, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex - 14, ey);
    ctx.lineTo(ex - 9, ey);
    ctx.moveTo(ex + 9, ey);
    ctx.lineTo(ex + 14, ey);
    ctx.moveTo(ex, ey - 14);
    ctx.lineTo(ex, ey - 9);
    ctx.moveTo(ex, ey + 9);
    ctx.lineTo(ex, ey + 14);
    ctx.stroke();
    ctx.restore();
  }

  drawEnergyBar(ctx) {
    const p = this.player;
    const wBar = Math.min(300, this.w * 0.44);
    const x = (this.w - wBar) / 2;
    const y = this.h - 34;
    const k = clamp(p.energy / p.maxEnergy, 0, 1);
    const ready = p.energy >= DASH_COST;

    ctx.save();
    this.rr(ctx, x, y, wBar, 8, 4);
    ctx.fillStyle = 'rgba(10,25,45,0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,249,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const fillW = wBar * k;
    if (fillW > 2) {
      this.rr(ctx, x, y, fillW, 8, 4);
      const g = ctx.createLinearGradient(x, 0, x + wBar, 0);
      g.addColorStop(0, 'rgba(70,170,255,0.9)');
      g.addColorStop(1, ready ? 'rgba(125,249,255,1)' : 'rgba(125,249,255,0.6)');
      ctx.fillStyle = g;
      ctx.fill();
      if (ready) {
        ctx.shadowColor = 'rgba(125,249,255,0.9)';
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // dash threshold marker
    const mx = x + wBar * (DASH_COST / p.maxEnergy);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(mx, y - 3);
    ctx.lineTo(mx, y + 11);
    ctx.stroke();

    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = ready ? 'rgba(125,249,255,0.9)' : 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(ready ? 'DASH PRONTO' : 'RECARREGANDO', this.w / 2, y + 14);
    ctx.restore();
  }

  drawHud(ctx, time) {
    const mult = Math.min(this.combo, MAX_MULT);
    ctx.save();
    ctx.textBaseline = 'top';

    // score
    ctx.textAlign = 'left';
    ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(160,200,230,0.65)';
    ctx.fillText('PONTOS', 26, 22);

    ctx.font = '800 40px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.shadowColor = 'rgba(125,249,255,0.8)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#eafcff';
    ctx.fillText(fmt(this.score), 26, 38);
    ctx.shadowBlur = 0;

    // best
    ctx.textAlign = 'right';
    ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(160,200,230,0.65)';
    ctx.fillText('RECORDE', this.w - 26, 22);
    ctx.font = '700 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = this.score > this.best ? '#ffd166' : 'rgba(220,235,255,0.8)';
    ctx.fillText(fmt(Math.max(this.best, this.score)), this.w - 26, 40);

    // timer
    ctx.textAlign = 'left';
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(160,200,230,0.45)';
    ctx.fillText(`${this.time.toFixed(1)}s`, 26, 86);

    // combo
    if (this.combo > 1) {
      const k = clamp(this.comboTimer / COMBO_WINDOW, 0, 1);
      const pop = this.fx.hitstop > 0 ? 1.08 : 1;
      const cx = this.w / 2;
      const cy = 34;
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pop, pop);
      const size = 26 + Math.min(mult, 10) * 2.2;
      ctx.font = `900 ${Math.round(size)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const hue = mult >= 8 ? '255,209,102' : mult >= 5 ? '255,92,160' : '125,249,255';
      ctx.shadowColor = `rgba(${hue},0.95)`;
      ctx.shadowBlur = 22;
      ctx.fillStyle = `rgb(${hue})`;
      ctx.fillText(`x${mult}`, 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();

      const bw = 120 * k;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      this.rr(ctx, cx - 60, cy + 34, 120, 4, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(125,249,255,0.75)';
      this.rr(ctx, cx - 60, cy + 34, Math.max(0, bw), 4, 2);
      ctx.fill();

      ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = 'rgba(180,215,240,0.55)';
      ctx.fillText(`COMBO ${this.combo}`, cx, cy + 42);
    }

    ctx.restore();
  }

  rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, rad);
      return;
    }
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
}
