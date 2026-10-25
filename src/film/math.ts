// Small deterministic math helpers. Everything here is a pure function of its
// inputs so that preview and render agree frame for frame.

export const clamp = (x: number, a: number, b: number) =>
  Math.min(b, Math.max(a, x));
export const clamp01 = (x: number) => clamp(x, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const frac = (x: number) => x - Math.floor(x);

export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

/** Piecewise keyframe track. Between keys the value is eased (cubic in/out by
 *  default), outside the range it clamps to the first/last value. */
export function track(
  t: number,
  keys: Array<[number, number]>,
  ease: (x: number) => number = easeInOutCubic,
): number {
  if (keys.length === 0) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t <= t1) {
      if (t1 === t0) return v1;
      return lerp(v0, v1, ease((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

/** Closed-form step response of a damped spring (0 → 1, with overshoot when
 *  zeta < 1). `t` is seconds since the step. Fully reproducible from time. */
export function springStep(t: number, omega: number, zeta: number): number {
  if (t <= 0) return 0;
  if (zeta >= 1) {
    // critically damped
    const e = Math.exp(-omega * t);
    return 1 - e * (1 + omega * t);
  }
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const e = Math.exp(-zeta * omega * t);
  return 1 - e * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
}

/** Seeded PRNG (mulberry32). */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const deg = (d: number) => (d * Math.PI) / 180;

/** Gentle organic micro-motion: a sum of incommensurate sines. */
export function wobble(t: number, seed = 0): number {
  return (
    0.5 * Math.sin(t * 0.73 + seed) +
    0.3 * Math.sin(t * 1.31 + seed * 1.7) +
    0.2 * Math.sin(t * 2.17 + seed * 2.3)
  );
}
