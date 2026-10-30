export const TAU = Math.PI * 2;

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;

export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

export function normalize(x, y) {
  const l = Math.hypot(x, y);
  if (l < 0.00001) return { x: 1, y: 0 };
  return { x: x / l, y: y / l };
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

export const fmt = (n) => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function pad(n, len) {
  let s = String(Math.floor(n));
  while (s.length < len) s = '0' + s;
  return s;
}

// Deterministic-ish pseudo random for background stars
export function seeded(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
