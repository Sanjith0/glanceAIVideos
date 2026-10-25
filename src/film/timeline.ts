// The single source of truth for *when* things happen and *where* the
// first-person camera, the glasses and the two passers-by are at any time.
// Every function here is pure in `t` (seconds). The Three.js scene, the HTML
// overlays and the audio script all read from these so they can never drift.

import {
  clamp01,
  deg,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  lerp,
  smoothstep,
  springStep,
  track,
  wobble,
} from "./math";

export const FPS = 30;
export const DURATION_SECONDS = 30;
export const DURATION_FRAMES = FPS * DURATION_SECONDS; // 900
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** The WebGL canvas is rendered slightly larger than the frame and cropped,
 *  so the CSS defocus never produces faded edges. */
export const CANVAS_BLEED = 36;
export const CANVAS_W = WIDTH + CANVAS_BLEED * 2;
export const CANVAS_H = HEIGHT + CANVAS_BLEED * 2;

/** Vertical field of view of the *visible* 1920×1080 frame. */
export const FOV_VISIBLE = 52;
/** FOV the camera actually uses on the bled canvas so the crop matches. */
export const FOV_CANVAS =
  (2 * Math.atan(Math.tan(deg(FOV_VISIBLE / 2)) * (CANVAS_H / HEIGHT)) * 180) /
  Math.PI;
export const CAMERA_NEAR = 0.01;
export const CAMERA_FAR = 1600;

export const EYE_HEIGHT = 1.62;

// ---------------------------------------------------------------------------
// Story beats (seconds)
// ---------------------------------------------------------------------------
export const T = {
  walkStop: 3.0,
  glassesEnter: 3.0,
  glassesMainStart: 3.25,
  glassesHold: 3.85,
  glassesMainEnd: 4.3,
  glassesSettled: 4.75,
  focusStart: 4.35,
  focusEnd: 4.95,
  recognitionAlex: 5.05,
  recognitionKimDelay: 0.25,
  // the pair slows, stops and Alex turns to the viewer
  pairDecelStart: 9.3,
  pairStop: 10.2,
  faceStart: 10.1,
  faceEnd: 11.0,
  // the conversation
  talkStart: 11.1,
  talkEnd: 15.35,
  summaryIn: 11.6,
  summaryResolved: 13.1,
  summaryOut: 16.2, // the UI clears for the connection bar
  // the peace sign, hand tracking, and the connection
  peaceRaiseStart: 15.4,
  peaceRaiseEnd: 16.1,
  landmarksIn: 15.85,
  landmarksOut: 17.5,
  flashStart: 16.35,
  flashEnd: 16.9,
  notifyIn: 16.55,
  notifyOutStart: 19.45,
  notifyOutEnd: 19.95,
  peaceLowerStart: 17.7,
  peaceLowerEnd: 18.4,
  // they walk on past the viewer
  pairResume: 19.2,
  pairResumeEnd: 20.2,
  skylineTiltStart: 23.2,
  glassesOffReach: 25.0,
  glassesOffStart: 25.8,
  glassesOffMid: 26.25,
  glassesOffEnd: 26.7,
  glassesGone: 27.1,
  defocusStart: 25.85,
  defocusEnd: 26.5,
  ivoryStart: 27.15,
  ivoryEnd: 28.0,
  wordmarkIn: 27.6,
  wordmarkSettled: 28.65,
  wordmarkOutStart: 29.05,
  wordmarkOutEnd: 29.6,
};

export const BLUR_MAX_PX = 15;

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const WALK_SPEED = 0.9; // m/s at the start
const WALK_PLATEAU_END = 1.4;
const WALK_START_Z = -1.98;
const STEP_LENGTH = 0.62;

/** Distance walked by the viewer since t=0 (metres). Constant speed, then a
 *  smooth constant deceleration to a stop at T.walkStop. */
export function viewerWalkDistance(t: number): number {
  if (t <= 0) return 0;
  if (t <= WALK_PLATEAU_END) return WALK_SPEED * t;
  const decel = T.walkStop - WALK_PLATEAU_END;
  const u = Math.min(t, T.walkStop) - WALK_PLATEAU_END;
  return WALK_SPEED * WALK_PLATEAU_END + WALK_SPEED * u - (WALK_SPEED * u * u) / (2 * decel);
}

export function viewerWalkSpeed(t: number): number {
  if (t <= 0) return WALK_SPEED;
  if (t <= WALK_PLATEAU_END) return WALK_SPEED;
  if (t >= T.walkStop) return 0;
  return WALK_SPEED * (1 - (t - WALK_PLATEAU_END) / (T.walkStop - WALK_PLATEAU_END));
}

/** A gentle single nod: a short pitch dip starting at t0 (degrees). */
function nod(t: number, t0: number): number {
  const u = (t - t0) / 0.55;
  if (u <= 0 || u >= 1) return 0;
  return -2.4 * Math.sin(Math.PI * u) * Math.sin(Math.PI * u);
}

export type CameraPose = {
  x: number;
  y: number;
  z: number;
  /** radians, applied in YXZ order */
  yaw: number;
  pitch: number;
  roll: number;
};

export function cameraPose(t: number): CameraPose {
  const dist = viewerWalkDistance(t);
  const speed = viewerWalkSpeed(t);
  const gait = speed / WALK_SPEED; // 1 while walking, 0 once stopped
  const stepPhase = dist / STEP_LENGTH;

  // Walking bob: one gentle dip per step, lateral sway once per stride.
  const bobY = -0.011 * gait * (1 - Math.cos(2 * Math.PI * stepPhase)) * 0.5;
  const swayX = 0.007 * gait * Math.sin(Math.PI * stepPhase);
  const rollWalk = deg(0.35) * gait * Math.sin(Math.PI * stepPhase);

  // Coming to a halt: a tiny forward lean that settles back.
  const haltLean = t > T.walkStop ? 0.012 * springStep(t - T.walkStop, 9, 0.45) - 0.012 * clamp01((t - T.walkStop) / 0.6) : 0;

  // Breathing.
  const breathe = 0.0028 * Math.sin(2 * Math.PI * 0.21 * t + 0.6);

  const yawDeg = track(t, [
    [0.0, 0],
    [0.45, 0],
    [1.25, -17],
    [1.8, -17],
    [2.75, 0],
    [6.5, 0],
    [8.8, -5],
    [10.6, -13.5],
    [11.3, -14.5],
    [15.6, -14.5],
    [16.2, -11], // the raised hand draws the eye a little
    [18.0, -11],
    [19.0, -14],
    [20.4, -26],
    [21.5, -36],
    [22.4, -36],
    [23.6, 0],
  ]);
  // small nods while listening and when the connection lands
  const nods = [12.4, 14.1, 16.75].reduce((acc, t0) => acc + nod(t, t0), 0);
  const pitchDeg =
    track(t, [
      [0.0, 0],
      [3.15, 0],
      [3.9, -4.5],
      [4.2, -4.5],
      [4.95, 0],
      [T.skylineTiltStart, 0],
      [24.8, 11.5],
      [DURATION_SECONDS, 11.5],
    ]) + nods;

  // Micro-motion so the head never feels locked.
  const microYaw = deg(0.22) * wobble(t, 1.3);
  const microPitch = deg(0.16) * wobble(t, 4.1);

  return {
    x: swayX,
    y: EYE_HEIGHT + bobY + breathe,
    z: WALK_START_Z + dist + haltLean,
    yaw: deg(yawDeg) + microYaw,
    pitch: deg(pitchDeg) + microPitch,
    roll: rollWalk,
  };
}

// ---------------------------------------------------------------------------
// Defocus (CSS blur applied to the whole rendered street, never to overlays)
// ---------------------------------------------------------------------------
export function blurPx(t: number): number {
  const sharpen = smoothstep(T.focusStart, T.focusEnd, t);
  const defocus = smoothstep(T.defocusStart, T.defocusEnd, t);
  return BLUR_MAX_PX * (1 - sharpen) + BLUR_MAX_PX * defocus;
}

// ---------------------------------------------------------------------------
// Glasses + hands, in camera space (x right, y up, -z forward). The camera is
// the wearer's left eye, and the glasses model's origin is the centre of the
// left lens, so "worn" means the lens sits centred just in front of the eye.
// ---------------------------------------------------------------------------
export type Vec3 = [number, number, number];

export type GlassesState = {
  visible: boolean;
  position: Vec3;
  rotation: Vec3; // euler XYZ radians
  /** 0 = hands gripping both temples, 1 = hands have released and withdrawn. */
  leftHand: { visible: boolean; release: number };
  rightHand: { visible: boolean; release: number; reach: number };
};

const WORN_POS: Vec3 = [0, 0, -0.013];
const PRESETTLE_POS: Vec3 = [0.004, 0.0065, -0.034];
const PRESETTLE_ROT: Vec3 = [deg(3.5), deg(-1), deg(-1.5)];
/** Held up in front of the eyes, both lenses in view, before the push on. */
const HOLD_POS: Vec3 = [0.014, -0.014, -0.175];
const HOLD_ROT: Vec3 = [deg(9), deg(-3), deg(-2.5)];
const START_POS: Vec3 = [0.06, -0.25, -0.31];
const START_ROT: Vec3 = [deg(27), deg(-7), deg(-5)];
const ENTRY_POS: Vec3 = [0.075, -0.43, -0.36];
const ENTRY_ROT: Vec3 = [deg(34), deg(-9), deg(-6)];
const OFF_MID_POS: Vec3 = [0.03, -0.03, -0.19];
const OFF_MID_ROT: Vec3 = [deg(12), deg(-9), deg(6)];
const OFF_LOW_POS: Vec3 = [0.06, -0.29, -0.33];
const OFF_LOW_ROT: Vec3 = [deg(24), deg(-13), deg(9)];
const OFF_END_POS: Vec3 = [0.08, -0.62, -0.40];
const OFF_END_ROT: Vec3 = [deg(28), deg(-13), deg(9)];

const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [
  lerp(a[0], b[0], k),
  lerp(a[1], b[1], k),
  lerp(a[2], b[2], k),
];

export function glassesState(t: number): GlassesState {
  const hidden: GlassesState = {
    visible: false,
    position: WORN_POS,
    rotation: [0, 0, 0],
    leftHand: { visible: false, release: 1 },
    rightHand: { visible: false, release: 1, reach: 0 },
  };
  if (t < T.glassesEnter || t > T.glassesGone) return hidden;

  // ---- putting them on -------------------------------------------------
  if (t < T.glassesSettled + 0.6) {
    let position: Vec3;
    let rotation: Vec3;
    if (t < T.glassesMainStart) {
      const k = easeOutCubic(clamp01((t - T.glassesEnter) / (T.glassesMainStart - T.glassesEnter)));
      position = lerp3(ENTRY_POS, START_POS, k);
      rotation = lerp3(ENTRY_ROT, START_ROT, k);
    } else if (t < T.glassesHold) {
      // lift them up in front of the eyes
      const k = easeInOutCubic(clamp01((t - T.glassesMainStart) / (T.glassesHold - T.glassesMainStart)));
      position = lerp3(START_POS, HOLD_POS, k);
      rotation = lerp3(START_ROT, HOLD_ROT, k);
    } else {
      // push them on
      const k = easeInOutCubic(clamp01((t - T.glassesHold) / (T.glassesMainEnd - T.glassesHold)));
      position = lerp3(HOLD_POS, PRESETTLE_POS, k);
      rotation = lerp3(HOLD_ROT, PRESETTLE_ROT, k);
      // Damped-spring settle onto the face.
      const s = springStep(t - T.glassesMainEnd, 17, 0.5);
      position = lerp3(position, WORN_POS, s);
      rotation = lerp3(rotation, [0, 0, 0], s);
    }
    const release = smoothstep(T.glassesSettled - 0.05, T.glassesSettled + 0.5, t);
    return {
      visible: true,
      position,
      rotation,
      leftHand: { visible: release < 1, release },
      rightHand: { visible: release < 1, release, reach: 1 },
    };
  }

  // ---- worn ---------------------------------------------------------------
  if (t < T.glassesOffReach) {
    return { ...hidden, visible: true };
  }

  // ---- taking them off ----------------------------------------------------
  const reach = smoothstep(T.glassesOffReach, T.glassesOffStart, t);
  let position: Vec3 = WORN_POS;
  let rotation: Vec3 = [0, 0, 0];
  if (t >= T.glassesOffStart) {
    if (t < T.glassesOffMid) {
      // pull them off the nose and away from the face
      const k = easeInOutCubic(clamp01((t - T.glassesOffStart) / (T.glassesOffMid - T.glassesOffStart)));
      const lift = 0.004 * Math.sin(Math.PI * Math.min(1, k * 2.2));
      position = lerp3(WORN_POS, OFF_MID_POS, k);
      position = [position[0], position[1] + lift, position[2]];
      rotation = lerp3([0, 0, 0], OFF_MID_ROT, k);
    } else if (t < T.glassesOffEnd) {
      const k = easeInOutCubic(clamp01((t - T.glassesOffMid) / (T.glassesOffEnd - T.glassesOffMid)));
      position = lerp3(OFF_MID_POS, OFF_LOW_POS, k);
      rotation = lerp3(OFF_MID_ROT, OFF_LOW_ROT, k);
    } else {
      const k = easeInCubic(clamp01((t - T.glassesOffEnd) / (T.glassesGone - T.glassesOffEnd)));
      position = lerp3(OFF_LOW_POS, OFF_END_POS, k);
      rotation = lerp3(OFF_LOW_ROT, OFF_END_ROT, k);
    }
  }
  return {
    visible: true,
    position,
    rotation,
    leftHand: { visible: false, release: 1 },
    rightHand: { visible: true, release: 0, reach },
  };
}

// ---------------------------------------------------------------------------
// The two people. Their shared progress along the sidewalk is a path
// parameter `s` (metres of forward travel) with a speed profile: walk at
// 1 m/s, decelerate to a stop in front of the viewer, stand and talk, then
// accelerate away again. Positions are functions of `s`; time enters only
// through `pairParam(t)`, so standing still is exact.
// ---------------------------------------------------------------------------
export type PersonId = "alex" | "kim";

export type PersonPath = {
  x: number;
  z: number;
  /** render heading: path heading blended toward the viewer while talking */
  yaw: number;
  /** heading along the path itself (used for footfall placement) */
  pathYaw: number;
  /** signed distance travelled along this person's own path (world metres) */
  distance: number;
  /** 0 = walking heading, 1 = squared up to the viewer */
  facing: number;
};

const PAIR_SPEED = 1.0;
const PAIR_Z0 = -11.2; // pair centre at s = 0
export const PAIR_STOP_S = PAIR_SPEED * T.pairDecelStart + (PAIR_SPEED * (T.pairStop - T.pairDecelStart)) / 2;

/** Forward progress along the sidewalk, metres. */
export function pairParam(t: number): number {
  const t1 = T.pairDecelStart;
  const t2 = T.pairStop;
  const t3 = T.pairResume;
  const t4 = T.pairResumeEnd;
  const v = PAIR_SPEED;
  if (t < t1) return v * t;
  if (t < t2) {
    const u = t - t1;
    const D = t2 - t1;
    return v * t1 + v * u - (v * u * u) / (2 * D);
  }
  if (t < t3) return PAIR_STOP_S;
  if (t < t4) {
    const u = t - t3;
    const D = t4 - t3;
    return PAIR_STOP_S + (v * u * u) / (2 * D);
  }
  return PAIR_STOP_S + (v * (t4 - t3)) / 2 + v * (t - t4);
}

export function pairSpeed(t: number): number {
  if (t < T.pairDecelStart) return PAIR_SPEED;
  if (t < T.pairStop) return PAIR_SPEED * (1 - (t - T.pairDecelStart) / (T.pairStop - T.pairDecelStart));
  if (t < T.pairResume) return 0;
  if (t < T.pairResumeEnd) return PAIR_SPEED * ((t - T.pairResume) / (T.pairResumeEnd - T.pairResume));
  return PAIR_SPEED;
}

/** Pair centre: drifts toward the curb side to stop just right of the viewer,
 *  then a little further to pass with clearance. */
function pairCentreAt(s: number): { x: number; z: number } {
  const z = PAIR_Z0 + s;
  const x = 0.9 * smoothstep(-5.5, -1.6, z) + 0.4 * smoothstep(-1.4, 0.0, z);
  return { x, z };
}

function personPosAt(id: PersonId, s: number): { x: number; z: number } {
  const h = 0.01;
  const a = pairCentreAt(s - h);
  const b = pairCentreAt(s + h);
  const heading = Math.atan2(b.x - a.x, b.z - a.z);
  const c = pairCentreAt(s);
  const perpX = Math.cos(heading);
  const perpZ = -Math.sin(heading);
  const side = id === "alex" ? -1 : 1; // Alex on the viewer's left
  const gap = id === "alex" ? 0.45 : 0.5;
  // Kim drops half a step behind as they slow, and stays there
  const back = id === "alex" ? 0 : -0.08 - 0.42 * smoothstep(PAIR_STOP_S - 1.1, PAIR_STOP_S, s);
  return {
    x: c.x + side * gap * perpX + back * Math.sin(heading),
    z: c.z + side * gap * perpZ + back * Math.cos(heading),
  };
}

/** Signed path length of this person's position from s=0 to s. */
function personDistanceAt(id: PersonId, s: number): number {
  const sign = s < 0 ? -1 : 1;
  const span = Math.abs(s);
  const steps = Math.max(1, Math.ceil(span / 0.02));
  const ds = (sign * span) / steps;
  let d = 0;
  let prev = personPosAt(id, 0);
  for (let i = 1; i <= steps; i++) {
    const p = personPosAt(id, i * ds);
    d += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return sign * d;
}

/** How squared-up to the viewer the body is (0..1). */
export function facingAmount(t: number): number {
  return smoothstep(T.faceStart, T.faceEnd, t) * (1 - smoothstep(T.pairResume - 0.35, T.pairResume + 0.55, t));
}

const lerpAngle = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * k;
};

export function personPath(id: PersonId, t: number): PersonPath {
  const s = pairParam(t);
  const h = 0.01;
  const pos = personPosAt(id, s);
  const a = personPosAt(id, s - h);
  const b = personPosAt(id, s + h);
  const pathYaw = Math.atan2(b.x - a.x, b.z - a.z);
  // the viewer stands at the origin once stopped
  const toViewer = Math.atan2(0 - pos.x, 0 - pos.z);
  const facing = facingAmount(t);
  return {
    x: pos.x,
    z: pos.z,
    yaw: lerpAngle(pathYaw, toViewer, facing),
    pathYaw,
    distance: personDistanceAt(id, s),
    facing,
  };
}

/** Distance (world metres) at which this person's feet come to rest. */
export function personStopDistance(id: PersonId): number {
  return personDistanceAt(id, PAIR_STOP_S);
}

// ---------------------------------------------------------------------------
// The conversation, the peace sign and the connection UI
// ---------------------------------------------------------------------------
export type ConversationState = {
  /** 0..1 how much Alex is talking right now (drives the mouth) */
  talk: number;
  /** 0..1 Alex's right hand raised into the peace sign */
  peace: number;
  /** 0..1 both people in their standing (not walking) pose */
  standing: number;
  /** 0..1 hand-landmark overlay visibility */
  landmarks: number;
  /** 0..1 green connection flash intensity */
  flash: number;
};

/** Speech in phrases: a few bursts with pauses, each with syllable-rate
 *  mouth motion. Deterministic in t. */
export function talkAmount(t: number): number {
  const phrases: Array<[number, number]> = [
    [11.15, 12.55],
    [12.95, 14.35],
    [14.7, 15.3],
  ];
  let env = 0;
  for (const [a, b] of phrases) env = Math.max(env, smoothstep(a, a + 0.12, t) * (1 - smoothstep(b - 0.12, b, t)));
  if (env <= 0) return 0;
  const syll = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4.6 * t) * Math.sin(2 * Math.PI * 1.7 * t + 1.1);
  return env * clamp01(Math.abs(syll) * 1.15);
}

export function conversationState(t: number): ConversationState {
  const standing = smoothstep(T.pairStop - 0.3, T.pairStop + 0.45, t) * (1 - smoothstep(T.pairResume - 0.15, T.pairResume + 0.6, t));
  const peace = smoothstep(T.peaceRaiseStart, T.peaceRaiseEnd, t) * (1 - smoothstep(T.peaceLowerStart, T.peaceLowerEnd, t));
  const landmarks = smoothstep(T.landmarksIn, T.landmarksIn + 0.3, t) * (1 - smoothstep(T.landmarksOut - 0.3, T.landmarksOut, t));
  // two quick green pulses
  let flash = 0;
  if (t >= T.flashStart && t <= T.flashEnd) {
    const u = (t - T.flashStart) / (T.flashEnd - T.flashStart);
    flash = Math.pow(Math.max(0, Math.sin(Math.PI * u * 2)), 1.4) * (u < 0.5 ? 1 : 0.7);
  }
  return { talk: talkAmount(t), peace, standing, landmarks, flash };
}

export const CONVERSATION_SUMMARY =
  "Alex mentions you should attend the Meta AI Hackathon. If you win, you can intern at Meta!";
export const CONNECTION_TITLE = "New connection made";
export const CONNECTION_DETAIL = "Summary available · Contacts exchanged with Alex";

// ---------------------------------------------------------------------------
// Recognition overlay timings
// ---------------------------------------------------------------------------
export type RecognitionTiming = {
  bracketIn: number;
  scanStart: number;
  scanEnd: number;
  bracketOut: number;
  panelIn: number;
  fadeStart: number;
  fadeEnd: number;
};

export function recognitionTiming(id: PersonId): RecognitionTiming {
  const base = id === "alex" ? T.recognitionAlex : T.recognitionAlex + T.recognitionKimDelay;
  return {
    bracketIn: base,
    scanStart: base + 0.22,
    scanEnd: base + 0.62,
    bracketOut: base + 0.95,
    panelIn: base + 0.58,
    fadeStart: T.summaryOut,
    fadeEnd: T.summaryOut + 0.4,
  };
}

export const PEOPLE: Record<PersonId, { name: string; title: string }> = {
  alex: { name: "Alex", title: "Software Engineer · Meta" },
  kim: { name: "Kim", title: "Product Manager · Meta" },
};
