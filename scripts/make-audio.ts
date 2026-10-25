// Synthesizes the film's audio stems from the same timeline the picture uses,
// so footsteps, the glasses clicks and the recognition cues land on their
// visual beats. Writes 20 s stereo 16-bit WAV files into public/audio/.
//
//   npx tsx scripts/make-audio.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bodyPose, BODY, PHASE_OFFSET } from "../src/film/gait";
import { frac, prng } from "../src/film/math";
import { DURATION_SECONDS, T, cameraPose, personPath, recognitionTiming, viewerWalkDistance } from "../src/film/timeline";

const SR = 44100;
const N = SR * DURATION_SECONDS;
const out = join(process.cwd(), "public", "audio");
mkdirSync(out, { recursive: true });

type Stereo = { l: Float32Array; r: Float32Array };
const stereo = (): Stereo => ({ l: new Float32Array(N), r: new Float32Array(N) });

const rnd = prng(424242);
const gauss = () => {
  // Box–Muller
  const u = Math.max(1e-9, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** One-pole low-pass applied in place. */
function lowpass(buf: Float32Array, cutoff: number) {
  const a = Math.exp((-2 * Math.PI * cutoff) / SR);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y = (1 - a) * buf[i] + a * y;
    buf[i] = y;
  }
}
/** One-pole high-pass applied in place. */
function highpass(buf: Float32Array, cutoff: number) {
  const a = Math.exp((-2 * Math.PI * cutoff) / SR);
  let yPrev = 0;
  let xPrev = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = a * (yPrev + x - xPrev);
    xPrev = x;
    yPrev = y;
    buf[i] = y;
  }
}
/** Biquad band-pass (constant skirt gain). */
function bandpass(buf: Float32Array, f0: number, q: number) {
  const w0 = (2 * Math.PI * f0) / SR;
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    buf[i] = y;
  }
}

/** Mix a mono clip into a stereo buffer at time t with a pan in [-1, 1]. */
function place(dst: Stereo, clip: Float32Array, t: number, gain: number, pan = 0) {
  const start = Math.round(t * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < clip.length; i++) {
    const j = start + i;
    if (j < 0 || j >= N) continue;
    dst.l[j] += clip[i] * gl;
    dst.r[j] += clip[i] * gr;
  }
}

function envelope(len: number, attack: number, decay: number, curve = 1): Float32Array {
  const e = new Float32Array(len);
  const a = Math.max(1, Math.round(attack * SR));
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const att = i < a ? i / a : 1;
    e[i] = att * Math.exp((-(t - (i < a ? 0 : attack)) * curve) / decay);
  }
  return e;
}

function noise(len: number): Float32Array {
  const b = new Float32Array(len);
  for (let i = 0; i < len; i++) b[i] = gauss() * 0.3;
  return b;
}

function mul(a: Float32Array, e: Float32Array): Float32Array {
  const o = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i] * e[i];
  return o;
}

function tone(freq: number, len: number, harmonics: Array<[number, number]> = [[1, 1]]): Float32Array {
  const b = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let v = 0;
    for (const [h, g] of harmonics) v += g * Math.sin(2 * Math.PI * freq * h * t);
    b[i] = v;
  }
  return b;
}

/** Master gain applied to every stem (the mix is summed by Remotion). */
const MASTER = Math.pow(10, 10 / 20);

function writeWav(name: string, s: Stereo) {
  for (let i = 0; i < N; i++) {
    s.l[i] *= MASTER;
    s.r[i] *= MASTER;
  }
  // soft-limit and convert
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(s.l[i]), Math.abs(s.r[i]));
  const data = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const l = Math.max(-1, Math.min(1, s.l[i]));
    const r = Math.max(-1, Math.min(1, s.r[i]));
    data.writeInt16LE(Math.round(l * 32767), i * 4);
    data.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(join(out, name), Buffer.concat([header, data]));
  console.log(`${name}: peak ${(20 * Math.log10(Math.max(peak, 1e-9))).toFixed(1)} dBFS`);
}

const db = (x: number) => Math.pow(10, x / 20);

// ---------------------------------------------------------------------------
// 1. Ambience: distant city, soft air, three far car passes. Fades with the
//    dissolve to ivory.
// ---------------------------------------------------------------------------
{
  const s = stereo();
  const rumble = noise(N);
  lowpass(rumble, 180);
  lowpass(rumble, 180);
  const air = noise(N);
  bandpass(air, 1400, 0.7);
  const airR = noise(N);
  bandpass(airR, 1700, 0.7);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const slow = 0.78 + 0.22 * Math.sin(2 * Math.PI * 0.045 * t + 1) * Math.sin(2 * Math.PI * 0.11 * t);
    const fade = t > T.ivoryStart - 0.1 ? Math.max(0, 1 - (t - (T.ivoryStart - 0.1)) / 2.0) : 1;
    const g = slow * fade;
    s.l[i] += (rumble[i] * 2.6 + air[i] * 0.55) * g;
    s.r[i] += (rumble[i] * 2.6 + airR[i] * 0.55) * g;
  }
  // far car passes: band-limited noise swelling and panning
  for (const [t0, dir] of [
    [1.2, 1],
    [8.0, -1],
    [14.2, 1],
    [21.6, -1],
  ] as Array<[number, number]>) {
    const len = Math.round(4.5 * SR);
    const n = noise(len);
    bandpass(n, 420, 0.9);
    lowpass(n, 900);
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const env = Math.pow(Math.sin(Math.PI * u), 2.2);
      const pan = dir * (u * 2 - 1) * 0.8;
      const gl = Math.cos(((pan + 1) * Math.PI) / 4);
      const gr = Math.sin(((pan + 1) * Math.PI) / 4);
      const j = Math.round(t0 * SR) + i;
      if (j >= N) break;
      const fade = j / SR > T.ivoryStart - 0.1 ? Math.max(0, 1 - (j / SR - (T.ivoryStart - 0.1)) / 2.0) : 1;
      s.l[j] += n[i] * env * 2.4 * gl * fade;
      s.r[j] += n[i] * env * 2.4 * gr * fade;
    }
  }
  // normalise to a quiet bed
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(s.l[i]), Math.abs(s.r[i]));
  const g = db(-23) / peak;
  for (let i = 0; i < N; i++) {
    s.l[i] *= g;
    s.r[i] *= g;
  }
  writeWav("ambience.wav", s);
}

// ---------------------------------------------------------------------------
// 2. Footsteps: the viewer's own steps (until the stop) and the approaching
//    pair, timed from the gait model and levelled by distance.
// ---------------------------------------------------------------------------
{
  const s = stereo();
  const step = (kind: "mine" | "leather" | "sneaker", variation: number): Float32Array => {
    const len = Math.round(0.16 * SR);
    const thump = mul(tone(kind === "sneaker" ? 70 : 95, len), envelope(len, 0.002, 0.03 + variation * 0.01, 1));
    const scuff = noise(len);
    bandpass(scuff, kind === "leather" ? 2600 : kind === "mine" ? 1500 : 900, 1.1);
    const sc = mul(scuff, envelope(len, 0.001, kind === "sneaker" ? 0.035 : 0.022, 1));
    const o = new Float32Array(len);
    for (let i = 0; i < len; i++) o[i] = thump[i] * (kind === "leather" ? 0.55 : 0.75) + sc[i] * (kind === "leather" ? 2.6 : 1.9);
    return o;
  };

  // viewer: a step every 0.62 m until the stop
  let next = 0.31;
  let k = 0;
  for (let i = 0; i <= 3.2 * SR; i++) {
    const t = i / SR;
    if (viewerWalkDistance(t) >= next) {
      place(s, step("mine", rnd()), t, db(-21) * (0.85 + rnd() * 0.3), k % 2 === 0 ? -0.18 : 0.18);
      next += 0.62;
      k++;
    }
  }
  // the settling step as the viewer stops
  place(s, step("mine", 0.5), T.walkStop + 0.05, db(-27), 0.1);

  // the pair: heel strikes when a foot's phase wraps (the gait itself handles
  // the stop and the restart), plus the closing step as each of them halts
  const stepAt = (id: "alex" | "kim", t: number, extraGain = 1) => {
    const cam = cameraPose(t);
    const pose = bodyPose(id, t);
    const dx = pose.position[0] - cam.x;
    const dz = pose.position[2] - cam.z;
    const dist = Math.hypot(dx, dz);
    const ang = Math.atan2(-dx, -dz) - cam.yaw; // 0 = ahead, +left
    const pan = Math.max(-1, Math.min(1, -Math.sin(ang)));
    const behind = Math.cos(ang) < 0 ? 0.55 : 1;
    const gain = db(-19) * behind * Math.min(1, 1.6 / (dist + 0.8)) * extraGain;
    place(s, step(id === "alex" ? "leather" : "sneaker", rnd()), t, gain * (0.85 + rnd() * 0.3), pan * 0.7);
  };
  for (const id of ["alex", "kim"] as const) {
    stepAt(id, T.pairStop + 0.5, 0.7);
    const scale = id === "alex" ? 1.0 : 0.94;
    const offset = PHASE_OFFSET[id];
    for (const footOff of [0, 0.5]) {
      let prev = frac(personPath(id, 0).distance / scale / BODY.stride + offset + footOff);
      for (let i = 1; i < 24.5 * SR; i += 32) {
        const t = i / SR;
        const p = frac(personPath(id, t).distance / scale / BODY.stride + offset + footOff);
        if (p < prev - 0.5) {
          stepAt(id, t);
        }
        prev = p;
      }
    }
  }
  writeWav("footsteps.wav", s);
}


// ---------------------------------------------------------------------------
// 3. Glasses: a soft acetate click and slide as they settle, and the quieter
//    inverse as they come off.
// ---------------------------------------------------------------------------
{
  const s = stereo();
  const click = (bright: number): Float32Array => {
    const len = Math.round(0.08 * SR);
    const n = noise(len);
    bandpass(n, 3600 * bright, 2.2);
    const a = mul(n, envelope(len, 0.0005, 0.006, 1));
    const n2 = noise(len);
    bandpass(n2, 1900, 1.5);
    const b = mul(n2, envelope(len, 0.0005, 0.012, 1));
    const o = new Float32Array(len);
    for (let i = 0; i < len; i++) o[i] = a[i] * 3.2 + b[i] * 1.4;
    return o;
  };
  const slide = (): Float32Array => {
    const len = Math.round(0.22 * SR);
    const n = noise(len);
    bandpass(n, 1200, 0.8);
    highpass(n, 500);
    return mul(n, envelope(len, 0.03, 0.06, 1));
  };
  // on: temples slide past the ears, then the frame settles on the nose
  place(s, slide(), T.glassesMainEnd - 0.1, db(-30), -0.5);
  place(s, slide(), T.glassesMainEnd - 0.07, db(-31), 0.5);
  place(s, click(1.0), T.glassesMainEnd + 0.07, db(-24), 0);
  place(s, click(0.8), T.glassesMainEnd + 0.1, db(-28), 0.1);
  // off
  place(s, click(0.9), T.glassesOffStart + 0.02, db(-27), 0.35);
  place(s, slide(), T.glassesOffStart + 0.12, db(-31), 0.4);
  writeWav("glasses.wav", s);
}

// ---------------------------------------------------------------------------
// 4. Recognition cues: two soft two-note chimes as each panel appears.
// ---------------------------------------------------------------------------
{
  const s = stereo();
  const chime = (f1: number, f2: number): Float32Array => {
    const len = Math.round(0.9 * SR);
    const h: Array<[number, number]> = [
      [1, 1],
      [2, 0.18],
      [3, 0.05],
    ];
    const a = mul(tone(f1, len, h), envelope(len, 0.006, 0.22, 1));
    const b = mul(tone(f2, len, h), envelope(len, 0.006, 0.3, 1));
    const o = new Float32Array(len);
    const gap = Math.round(0.07 * SR);
    for (let i = 0; i < len; i++) o[i] = a[i] * 0.8 + (i >= gap ? b[i - gap] : 0);
    return o;
  };
  const ta = recognitionTiming("alex").panelIn;
  const tk = recognitionTiming("kim").panelIn;
  place(s, chime(784, 1046.5), ta, db(-24), -0.25);
  place(s, chime(880, 1174.7), tk, db(-25), 0.25);
  writeWav("recognition.wav", s);
}

// ---------------------------------------------------------------------------
// 4b. Conversation UI: a tick as the summary starts, a soft double tick as
//     it resolves, a tiny tick when the hand is tracked, and a warm rising
//     three-note chime with a short air swell for the connection flash.
// ---------------------------------------------------------------------------
{
  const s = stereo();
  const tick = (freq: number, decay: number): Float32Array => {
    const len = Math.round(0.25 * SR);
    const h: Array<[number, number]> = [
      [1, 1],
      [2, 0.1],
    ];
    return mul(tone(freq, len, h), envelope(len, 0.002, decay, 1));
  };
  place(s, tick(1318.5, 0.06), T.summaryIn, db(-30), -0.2);
  place(s, tick(1174.7, 0.08), T.summaryResolved, db(-29), -0.2);
  place(s, tick(1568, 0.08), T.summaryResolved + 0.09, db(-30), -0.2);
  place(s, tick(1760, 0.05), T.landmarksIn, db(-31), 0.15);
  const chimeLen = Math.round(1.6 * SR);
  const h: Array<[number, number]> = [
    [1, 1],
    [2, 0.2],
    [3, 0.06],
    [4, 0.03],
  ];
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((f, i) => {
    const n = mul(tone(f, chimeLen, h), envelope(chimeLen, 0.008, 0.42 + i * 0.12, 1));
    place(s, n, T.flashStart + 0.02 + i * 0.1, db(-25 + i * 0.5), -0.15 + i * 0.15);
  });
  // air swell under the flash
  const swLen = Math.round(0.9 * SR);
  const sw = noise(swLen);
  bandpass(sw, 2600, 0.6);
  highpass(sw, 900);
  const swEnv = new Float32Array(swLen);
  for (let i = 0; i < swLen; i++) {
    const u = i / swLen;
    swEnv[i] = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.6)), 1.5) * (1 - u * 0.35);
  }
  place(s, mul(sw, swEnv), T.flashStart - 0.05, db(-27), 0);
  writeWav("connection.wav", s);
}

// ---------------------------------------------------------------------------
// 5. Resolution: a warm, quiet pad (F add9) under the wordmark, released
//    before the final frame.
// ---------------------------------------------------------------------------
{
  const s = stereo();
  const start = T.ivoryStart - 0.15;
  const notes = [174.61, 261.63, 392.0, 440.0, 523.25];
  const gains = [0.9, 0.7, 0.55, 0.5, 0.3];
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    if (t < start) continue;
    const u = t - start;
    const attack = Math.min(1, u / 1.4);
    const release = t > T.wordmarkOutStart ? Math.max(0, 1 - (t - T.wordmarkOutStart) / (DURATION_SECONDS - 0.1 - T.wordmarkOutStart)) : 1;
    const env = Math.pow(attack, 1.6) * Math.pow(release, 1.4);
    let l = 0;
    let r = 0;
    notes.forEach((f, k) => {
      const d = 1 + (k % 2 === 0 ? 0.0012 : -0.0012);
      const v1 = Math.sin(2 * Math.PI * f * t) + 0.12 * Math.sin(2 * Math.PI * f * 3 * t);
      const v2 = Math.sin(2 * Math.PI * f * d * t + 0.4) + 0.12 * Math.sin(2 * Math.PI * f * d * 3 * t);
      l += (v1 * 0.6 + v2 * 0.4) * gains[k];
      r += (v1 * 0.4 + v2 * 0.6) * gains[k];
    });
    const shimmer = 0.92 + 0.08 * Math.sin(2 * Math.PI * 0.35 * t);
    s.l[i] = l * env * shimmer * 0.045;
    s.r[i] = r * env * shimmer * 0.045;
  }
  lowpass(s.l, 2200);
  lowpass(s.r, 2200);
  writeWav("resolution.wav", s);
}
