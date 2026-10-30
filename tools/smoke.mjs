// Verificação headless: roda o jogo sem navegador (canvas/DOM falsos) para
// garantir que update/draw não estouram em milhares de frames.
// Uso: npm test
import assert from 'node:assert';

const gradient = { addColorStop() {} };

function makeCtx() {
  const target = {
    canvas: { width: 900, height: 600 },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 12 }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

function makeCanvas(w = 900, h = 600) {
  return {
    width: 0,
    height: 0,
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
  };
}

globalThis.window = { devicePixelRatio: 1, innerWidth: 900, innerHeight: 600 };
globalThis.document = {
  createElement: () => makeCanvas(),
};
globalThis.localStorage = {
  _v: {},
  getItem(k) {
    return k in this._v ? this._v[k] : null;
  },
  setItem(k, v) {
    this._v[k] = String(v);
  },
};

const { Game } = await import('../js/game.js');

const audio = new Proxy(
  {},
  {
    get: () => () => {},
  }
);

const runs = [];
const game = new Game(makeCanvas(), audio, {
  onEnd: (data) => runs.push(data),
});

const DT = 1 / 60;
let frames = 0;
let nanCheck = 0;

function step(dt = DT) {
  game.update(dt);
  game.draw(frames / 60);
  frames++;
  const p = game.player;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.energy)) {
    throw new Error('posição/energia inválida (NaN)');
  }
  if (p.energy < -0.001 || p.energy > p.maxEnergy + 0.001) {
    throw new Error(`energia fora dos limites: ${p.energy}`);
  }
  if (game.enemies.length > 70) {
    throw new Error(`excesso de inimigos: ${game.enemies.length}`);
  }
  nanCheck++;
}

// ---- menu ----
for (let i = 0; i < 90; i++) step();
assert.equal(game.state, 'menu', 'deve começar no menu');

// ---- partidas ----
for (let run = 0; run < 3; run++) {
  game.start();
  assert.equal(game.state, 'playing');
  let idle = 0;
  while (game.state === 'playing' && idle < 60 * 240) {
    idle++;
    // "jogador" simples: mira no inimigo mais perto e dá dash quando pode
    const p = game.player;
    let best = null;
    let bestD = Infinity;
    for (const e of game.enemies) {
      if (e.arm > 0 || e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best && p.energy >= 55 && !p.dashing) {
      game.setPointer(best.x, best.y, true);
      game.dashTo(best.x, best.y);
    } else {
      game.setPointer(
        p.x + Math.cos(idle * 0.05) * 200,
        p.y + Math.sin(idle * 0.05) * 200,
        true
      );
    }
    game.spawnTimer = Math.min(game.spawnTimer, 0.05); // acelera a dificuldade no teste
    step();
  }
  // espera o fim da animação de morte
  for (let i = 0; i < 90 && game.state !== 'dead'; i++) step();
  assert.equal(game.state, 'dead', 'a run deve terminar (morrer)');
  assert.ok(game.best >= 0);
}
for (let i = 0; i < 30; i++) step();

assert.ok(runs.length >= 1, 'onEnd deve ser chamado');
assert.ok(runs.every((r) => Number.isFinite(r.score)), 'score finito');
assert.ok(
  runs.some((r) => r.score > 0),
  'o jogador simulado deveria pontuar'
);

console.log(`ok — ${frames} frames simulados, ${runs.length} runs, melhor score ${game.best}`);
console.log(
  'última run:',
  JSON.stringify({ score: runs.at(-1).score, tempo: runs.at(-1).time.toFixed(1), abates: runs.at(-1).kills })
);
