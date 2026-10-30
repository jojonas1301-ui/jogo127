import { AudioKit } from './audio.js';
import { Game } from './game.js';
import { fmt } from './util.js';

const canvas = document.getElementById('game');
const audio = new AudioKit();

let deadAt = 0;

const game = new Game(canvas, audio, {
  onEnd(data) {
    deadAt = performance.now();
    // pequeno atraso para a explosão respirar antes do painel
    setTimeout(() => {
      if (game.state === 'dead') showOver(data);
    }, 420);
  },
});

// ---------------- elementos de UI ----------------
const el = {
  start: document.getElementById('screen-start'),
  over: document.getElementById('screen-over'),
  pause: document.getElementById('screen-pause'),
  bestStart: document.getElementById('best-start'),
  overScore: document.getElementById('over-score'),
  overTime: document.getElementById('over-time'),
  overCombo: document.getElementById('over-combo'),
  overKills: document.getElementById('over-kills'),
  overDashes: document.getElementById('over-dashes'),
  overRecord: document.getElementById('over-record'),
  overEyebrow: document.getElementById('over-eyebrow'),
  btnPlay: document.getElementById('btn-play'),
  btnRetry: document.getElementById('btn-retry'),
  btnResume: document.getElementById('btn-resume'),
  btnMenu: document.getElementById('btn-menu'),
  btnMute: document.getElementById('btn-mute'),
  btnPause: document.getElementById('btn-pause'),
  muteIcon: document.getElementById('mute-icon'),
};

function show(screen, on) {
  screen.classList.toggle('hidden', !on);
}

function syncBest() {
  el.bestStart.textContent = fmt(game.best);
}

function showOver(data) {
  el.overScore.textContent = fmt(data.score);
  el.overTime.textContent = `${data.time.toFixed(1)}s`;
  el.overCombo.textContent = `x${Math.min(data.maxCombo, 10)}`;
  el.overKills.textContent = fmt(data.kills);
  el.overDashes.textContent = fmt(data.dashes);
  el.overRecord.classList.toggle('hidden', !data.newRecord);
  el.overEyebrow.textContent = data.newRecord ? 'novo recorde pessoal' : 'run encerrada';
  show(el.over, true);
}

function startGame() {
  audio.resume();
  show(el.start, false);
  show(el.over, false);
  show(el.pause, false);
  game.start();
}

function togglePause(force) {
  if (game.state !== 'playing') return;
  const next = typeof force === 'boolean' ? force : !game.paused;
  game.pause(next);
  show(el.pause, next);
  audio.ui();
}

function toMenu() {
  game.toMenu();
  show(el.pause, false);
  show(el.over, false);
  show(el.start, true);
  syncBest();
  audio.setMusicDuck(false);
}

function toggleMute() {
  audio.resume();
  const muted = audio.toggleMute();
  el.btnMute.classList.toggle('off', muted);
  el.muteIcon.textContent = muted ? '🔇' : '🔊';
}

// ---------------- entrada ----------------
function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', (e) => {
  audio.resume();
  const p = pointerPos(e);
  game.setPointer(p.x, p.y, true);

  if (game.state === 'menu') {
    startGame();
    return;
  }
  if (game.state === 'dead') {
    if (performance.now() - deadAt > 550) startGame();
    return;
  }
  if (game.state === 'playing' && !game.paused) {
    e.preventDefault();
    game.dashTo(p.x, p.y);
  }
});

window.addEventListener(
  'pointermove',
  (e) => {
    const p = pointerPos(e);
    game.setPointer(p.x, p.y, true);
  },
  { passive: true }
);

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'enter') {
    e.preventDefault();
    audio.resume();
    if (game.state === 'menu') startGame();
    else if (game.state === 'dead' && performance.now() - deadAt > 400) startGame();
    else if (game.state === 'playing' && game.paused) togglePause(false);
    else if (game.state === 'playing') {
      const p = game.player;
      if (game.pointer.active) game.dashTo(game.pointer.x, game.pointer.y);
      else game.dashTo(p.x + Math.cos(p.angle) * 240, p.y + Math.sin(p.angle) * 240);
    }
    return;
  }
  if (k === 'escape' || k === 'p') {
    e.preventDefault();
    togglePause();
    return;
  }
  if (k === 'm') {
    toggleMute();
    return;
  }
  if (k === 'enter' && game.state === 'playing' && game.paused) togglePause(false);
});

el.over.addEventListener('click', (e) => {
  if (e.target === el.over || e.target.classList.contains('panel')) startGame();
});

el.btnPlay.addEventListener('click', (e) => {
  e.stopPropagation();
  startGame();
});
el.btnRetry.addEventListener('click', (e) => {
  e.stopPropagation();
  startGame();
});
el.btnResume.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePause(false);
});
el.btnMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  toMenu();
});
el.btnMute.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMute();
});
el.btnPause.addEventListener('click', (e) => {
  e.stopPropagation();
  if (game.state === 'playing') togglePause();
  else if (game.state === 'menu') startGame();
});

// ---------------- ciclo principal ----------------
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.update(dt);
  game.draw(now / 1000);
  requestAnimationFrame(frame);
}

let resizeTimer = 0;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    game.resize();
    syncBest();
  }, 80);
}

window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing' && !game.paused) togglePause(true);
});

// tira o foco dos botões para o ESPAÇO não re-clicar
document.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => b.blur());
});

syncBest();
el.muteIcon.textContent = audio.muted ? '🔇' : '🔊';
el.btnMute.classList.toggle('off', audio.muted);
requestAnimationFrame(frame);
