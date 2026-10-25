// Procedural walking and standing: feet planted at fixed world positions on
// the path, a two-bone leg solve, counter-swinging arms, pelvis/shoulder
// rotation, a closing step when the pair stops, talking, gestures, the peace
// sign and the hand landmarks the overlay draws. Pure in (time, person).

import * as THREE from "three";
import { clamp01, deg, easeInOutCubic, easeInOutSine, frac, lerp, smoothstep, wobble } from "./math";
import { T, conversationState, personPath, personStopDistance, type PersonId } from "./timeline";

export const BODY = {
  hipHalf: 0.09,
  thigh: 0.43,
  shin: 0.43,
  hipBase: 0.885,
  hipBob: 0.025,
  ankleHeight: 0.07,
  toeReach: 0.13,
  stride: 1.1, // two steps, in character-local metres
  stanceFraction: 0.6,
  strikeAhead: 0.33,
  swingHeight: 0.075,
  waist: 0.1, // pelvis joint → torso base
  torsoHeight: 0.5,
  shoulderY: 0.44,
  shoulderX: 0.215,
  upperArm: 0.29,
  forearm: 0.25,
  neckToHead: 0.11,
  headRadius: 0.108,
};

/** Hand rig, modelled for a RIGHT hand hanging relaxed: fingers run along
 *  -Y from the knuckle line, the palm faces +Z, the thumb is on the -X side.
 *  The left hand is the same rig mirrored in X. */
export const HAND = {
  palmW: 0.076,
  palmL: 0.082, // wrist → knuckle line
  thick: 0.028,
  // knuckle x offsets (index → pinky) for the right hand
  fingerX: [-0.027, -0.009, 0.009, 0.027],
  fingerLen: [
    [0.038, 0.024, 0.02],
    [0.042, 0.027, 0.021],
    [0.038, 0.025, 0.02],
    [0.03, 0.02, 0.017],
  ],
  thumbBase: [-0.036, -0.03, 0.008] as [number, number, number],
  thumbLen: [0.034, 0.028],
};

export type FingerPose = {
  /** 0 = straight, 1 = fully curled into the palm */
  curl: number;
  /** sideways spread in radians (positive = away from the middle finger) */
  spread: number;
};

export type HandPose = {
  fingers: [FingerPose, FingerPose, FingerPose, FingerPose];
  thumb: { curl: number; across: number };
};

export type ArmPose = {
  shoulderX: number;
  shoulderY: number;
  shoulderZ: number;
  elbowX: number;
  /** twist about the forearm (Y) */
  forearmY: number;
  wristX: number;
  hand: HandPose;
};

const RELAXED_HAND: HandPose = {
  fingers: [
    { curl: 0.28, spread: deg(4) },
    { curl: 0.3, spread: deg(1) },
    { curl: 0.32, spread: -deg(1) },
    { curl: 0.36, spread: -deg(5) },
  ],
  thumb: { curl: 0.25, across: 0.2 },
};

const PEACE_HAND: HandPose = {
  fingers: [
    { curl: 0.02, spread: deg(20) },
    { curl: 0.02, spread: -deg(14) },
    { curl: 0.96, spread: 0 },
    { curl: 0.98, spread: -deg(3) },
  ],
  thumb: { curl: 0.85, across: 0.9 },
};

const lerpHand = (a: HandPose, b: HandPose, k: number): HandPose => ({
  fingers: [0, 1, 2, 3].map((i) => ({
    curl: lerp(a.fingers[i].curl, b.fingers[i].curl, k),
    spread: lerp(a.fingers[i].spread, b.fingers[i].spread, k),
  })) as HandPose["fingers"],
  thumb: { curl: lerp(a.thumb.curl, b.thumb.curl, k), across: lerp(a.thumb.across, b.thumb.across, k) },
});

export type Appearance = {
  scale: number;
  armSwing: number;
};

export const APPEARANCE: Record<PersonId, Appearance> = {
  alex: { scale: 1.0, armSwing: deg(21) },
  kim: { scale: 0.94, armSwing: deg(17) },
};

/** Phase offsets are chosen so that, at the moment the pair stops, each
 *  person's right foot has just landed (phase 0.1) and the left foot is about
 *  to leave the ground (phase 0.6) and can take the closing step. */
export const PHASE_OFFSET: Record<PersonId, number> = {
  alex: frac(0.1 - frac(personStopDistance("alex") / APPEARANCE.alex.scale / BODY.stride)),
  kim: frac(0.1 - frac(personStopDistance("kim") / APPEARANCE.kim.scale / BODY.stride)),
};

export type LegPose = {
  thighZ: number;
  thighX: number;
  shinX: number;
  footX: number;
  /** ankle target relative to the pelvis translation group, local metres */
  ankle: [number, number, number];
  planted: boolean;
};

export type BodyPose = {
  id: PersonId;
  position: [number, number, number];
  yaw: number;
  scale: number;
  pelvis: { x: number; y: number; rotY: number; rotZ: number };
  torso: { rotX: number; rotY: number; rotZ: number; breathe: number };
  head: { rotX: number; rotY: number; rotZ: number };
  face: { mouthOpen: number; blink: number };
  arms: { left: ArmPose; right: ArmPose };
  legs: { left: LegPose; right: LegPose };
  /** coat hem swing, radians */
  hem: number;
  /** world-space landmarks for the overlays */
  world: {
    head: THREE.Vector3;
    headTop: THREE.Vector3;
    chest: THREE.Vector3;
    shoulderL: THREE.Vector3;
    shoulderR: THREE.Vector3;
  };
};

function rootMatrix(id: PersonId, t: number, scale: number, usePathYaw = false): THREE.Matrix4 {
  const p = personPath(id, t);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, 0, p.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, usePathYaw ? p.pathYaw : p.yaw, 0)),
    new THREE.Vector3(scale, scale, scale),
  );
}

/** Inverse of the (monotonic, with a plateau) path distance. Bisection, so it
 *  is exact and stable; on the plateau it returns a time inside it. */
function timeAtDistance(id: PersonId, dist: number): number {
  let lo = -5;
  let hi = 40;
  for (let i = 0; i < 36; i++) {
    const mid = 0.5 * (lo + hi);
    if (personPath(id, mid).distance < dist) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** World position of one foot's plant. The foot lands a little ahead of the
 *  body (strikeAhead) and a hip's width to the side, along the path heading. */
function plantWorld(id: PersonId, scale: number, sideX: number, strikeDistLocal: number): THREE.Vector3 {
  const tStrike = timeAtDistance(id, strikeDistLocal * scale);
  const m = rootMatrix(id, tStrike, scale, true);
  return new THREE.Vector3(sideX, 0, BODY.strikeAhead).applyMatrix4(m);
}

type FootState = { local: [number, number, number]; pitch: number; planted: boolean; phase: number };

function footCycle(
  id: PersonId,
  t: number,
  scale: number,
  sideX: number,
  dLocal: number,
  phaseOffset: number,
  closing: boolean,
): FootState {
  const B = BODY;
  const cyc = dLocal / B.stride + phaseOffset;
  const p = frac(cyc);
  const k = Math.floor(cyc);
  const strikeDist = (k - phaseOffset) * B.stride;

  const here = plantWorld(id, scale, sideX, strikeDist);
  let world: THREE.Vector3;
  let lift = 0;
  let pitch = 0;
  let planted = true;
  if (p < B.stanceFraction) {
    world = here;
    if (p < 0.08) pitch = -deg(11) * (1 - p / 0.08);
    if (p > 0.44) {
      const q = (p - 0.44) / (B.stanceFraction - 0.44);
      pitch = deg(30) * Math.pow(q, 1.4);
      lift = B.toeReach * Math.sin(pitch);
    }
  } else {
    planted = false;
    const next = plantWorld(id, scale, sideX, strikeDist + B.stride);
    const u = (p - B.stanceFraction) / (1 - B.stanceFraction);
    world = here.clone().lerp(next, easeInOutSine(Math.pow(u, 0.9)));
    const toeOffLift = B.toeReach * Math.sin(deg(30)) * Math.pow(1 - u, 2);
    lift = B.swingHeight * Math.sin(Math.PI * u) + toeOffLift;
    pitch = lerp(deg(30), -deg(11), easeInOutSine(u));
  }

  // --- the stop: the closing foot steps up beside the planted one ----------
  const dStopLocal = personStopDistance(id) / scale;
  const kStop = Math.floor(dStopLocal / B.stride + phaseOffset);
  if (closing && t >= T.pairStop - 1e-6 && k === kStop && p >= B.stanceFraction - 1e-9) {
    const stopRoot = rootMatrix(id, T.pairStop, scale, true);
    // the other foot's plant at the stop: it struck half a cycle before this
    // foot's toe-off, i.e. at (k - rho) * stride with rho = phaseOffset - 0.5
    const rightPlant = plantWorld(id, scale, -sideX, (k - phaseOffset + 0.5) * B.stride);
    const rightLocal = rightPlant.clone().applyMatrix4(stopRoot.clone().invert());
    const spot = new THREE.Vector3(sideX, 0, rightLocal.z - 0.2).applyMatrix4(stopRoot);
    if (t <= T.pairResume) {
      const u = clamp01((t - T.pairStop) / 0.5);
      const e = easeInOutCubic(u);
      world = here.clone().lerp(spot, e);
      lift = 0.05 * Math.sin(Math.PI * u) + B.toeReach * Math.sin(deg(30)) * Math.pow(1 - u, 2);
      pitch = lerp(deg(30), 0, e);
      planted = u >= 1;
    } else {
      // resuming: ease out of the standing spot into the gait's swing
      const w = smoothstep(B.stanceFraction, B.stanceFraction + 0.2, p);
      world = spot.clone().lerp(world, w);
      lift = lerp(0, lift, w);
      pitch = lerp(0, pitch, w);
      planted = w <= 0;
    }
  }

  // Back into the character's root frame (unscaled local metres).
  const inv = rootMatrix(id, t, scale).invert();
  const local = world.clone().applyMatrix4(inv);
  return { local: [local.x, B.ankleHeight + lift, local.z], pitch, planted, phase: p };
}

/** Two-bone solve. The thigh first tilts sideways (about Z) toward the target,
 *  then thigh and shin swing in that plane (about X). */
function solveLeg(hipX: number, hipY: number, target: [number, number, number]) {
  const { thigh: l1, shin: l2 } = BODY;
  const dx = target[0] - hipX;
  const dy = hipY - target[1];
  const dz = target[2];
  const thighZ = Math.atan2(dx, dy);
  const dyEff = Math.hypot(dx, dy);
  const D = Math.min(Math.hypot(dz, dyEff), l1 + l2 - 0.002);
  const phi = Math.atan2(dz, dyEff);
  const alpha = Math.acos(clamp01((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D)));
  const knee = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2))));
  return { thighZ, thighX: -(phi + alpha), shinX: Math.PI - knee };
}

/** Deterministic blinks: a quick close every few seconds, offset per person. */
function blinkAmount(t: number, seed: number): number {
  const period = 3.7 + 0.6 * Math.sin(seed * 3.1);
  const u = frac((t + seed * 1.37) / period) * period;
  if (u > 0.14) return 0;
  return Math.sin((Math.PI * u) / 0.14);
}

export function bodyPose(id: PersonId, t: number): BodyPose {
  const B = BODY;
  const look = APPEARANCE[id];
  const path = personPath(id, t);
  const conv = conversationState(t);
  const standing = conv.standing;
  const d = path.distance / look.scale; // local-metre distance
  const phaseOffset = PHASE_OFFSET[id];
  const p = frac(d / B.stride + phaseOffset); // right-foot phase

  // Walking motion fades into a quiet idle while standing.
  const walk = 1 - standing;
  const idle = standing;
  const sway = Math.sin(2 * Math.PI * 0.16 * t + (id === "alex" ? 0.4 : 2.9));

  const hipY = B.hipBase - B.hipBob * Math.cos(4 * Math.PI * p) * walk - 0.004 * idle * (0.5 + 0.5 * sway);
  const pelvisX = -0.012 * Math.sin(2 * Math.PI * p) * walk + 0.012 * idle * sway;
  const pelvisYaw = deg(4) * Math.cos(2 * Math.PI * p) * walk;
  const pelvisRoll = -deg(1.6) * Math.sin(2 * Math.PI * p) * walk - deg(0.8) * idle * sway;
  const torsoYaw = -deg(7.5) * Math.cos(2 * Math.PI * p) * walk + deg(1.5) * idle * wobble(t * 0.5, id === "alex" ? 1 : 5);
  const torsoRoll = deg(1.0) * Math.sin(2 * Math.PI * p) * walk + deg(0.6) * idle * sway;
  const torsoLean = deg(2.5) * walk + deg(1.0) * idle;
  const breathe = 1 + 0.008 * Math.sin(2 * Math.PI * 0.27 * t + (id === "alex" ? 0 : 2));

  // Legs hang from the pelvis *translation* (not its rotation) so planted feet
  // are unaffected by the pelvis swivel. The person's right is -X.
  const right = footCycle(id, t, look.scale, -B.hipHalf, d, phaseOffset, false);
  const left = footCycle(id, t, look.scale, B.hipHalf, d, phaseOffset + 0.5, true);
  const legFor = (side: -1 | 1, f: FootState): LegPose => {
    const hipX = side * B.hipHalf;
    const target: [number, number, number] = [f.local[0] - pelvisX, f.local[1], f.local[2]];
    const ik = solveLeg(hipX, hipY, target);
    return {
      thighZ: ik.thighZ,
      thighX: ik.thighX,
      shinX: ik.shinX,
      footX: f.pitch - (ik.thighX + ik.shinX),
      ankle: target,
      planted: f.planted,
    };
  };
  const legR = legFor(-1, right);
  const legL = legFor(1, left);

  // --- arms -----------------------------------------------------------------
  const swing = Math.cos(2 * Math.PI * p);
  const walkArmR = { shoulderX: look.armSwing * swing + deg(4), elbowX: -deg(14) - deg(12) * Math.max(0, -swing) };
  const walkArmL = { shoulderX: -look.armSwing * swing + deg(4), elbowX: -deg(14) - deg(12) * Math.max(0, swing) };
  const restArm = { shoulderX: deg(3), elbowX: -deg(18) };

  // Alex gestures with his right hand while talking, then raises the peace sign.
  const talk = id === "alex" ? conv.talk : 0;
  const gestureEnv = id === "alex" ? smoothstep(T.talkStart, T.talkStart + 0.5, t) * (1 - smoothstep(T.peaceRaiseStart - 0.5, T.peaceRaiseStart, t)) : 0;
  const gesture = gestureEnv * (0.45 + 0.35 * Math.sin(2 * Math.PI * 0.9 * t) + 0.2 * talk);
  const peace = id === "alex" ? conv.peace : 0;
  const peaceK = easeInOutCubic(peace);

  const armR: ArmPose = (() => {
    let shoulderX = lerp(walkArmR.shoulderX, restArm.shoulderX, standing);
    let elbowX = lerp(walkArmR.elbowX, restArm.elbowX, standing);
    let shoulderZ = -deg(5);
    let shoulderY = 0;
    let forearmY = 0;
    let wristX = 0;
    // talking gesture: forearm comes up a little, palm turning out
    shoulderX += -deg(14) * gesture;
    elbowX += -deg(48) * gesture;
    forearmY += deg(35) * gesture;
    // peace sign: upper arm forward, forearm up, palm to the viewer
    shoulderX = lerp(shoulderX, -deg(70), peaceK);
    shoulderZ = lerp(shoulderZ, -deg(18), peaceK);
    shoulderY = lerp(shoulderY, deg(12), peaceK);
    elbowX = lerp(elbowX, -deg(112), peaceK);
    // supinate so the palm faces the viewer
    forearmY = lerp(forearmY, deg(172), peaceK);
    wristX = lerp(wristX, -deg(10), peaceK);
    const hand = lerpHand(RELAXED_HAND, PEACE_HAND, smoothstep(0.15, 0.75, peace));
    return { shoulderX, shoulderY, shoulderZ, elbowX, forearmY, wristX, hand };
  })();
  const armL: ArmPose = {
    shoulderX: lerp(walkArmL.shoulderX, restArm.shoulderX, standing),
    shoulderY: 0,
    shoulderZ: deg(5),
    elbowX: lerp(walkArmL.elbowX, restArm.elbowX, standing),
    forearmY: 0,
    wristX: 0,
    hand: RELAXED_HAND,
  };

  // --- head and face ---------------------------------------------------------
  const listenNod = id === "alex" ? 0 : -deg(3) * Math.max(0, Math.sin(2 * Math.PI * 0.8 * (t - 13.6))) * smoothstep(13.5, 13.7, t) * (1 - smoothstep(14.8, 15.0, t));
  const talkNod = id === "alex" ? -deg(1.6) * talk * Math.sin(2 * Math.PI * 1.3 * t) : 0;
  const headYaw = -(pelvisYaw + torsoYaw) * 0.55 + deg(1.2) * wobble(t, id === "alex" ? 7 : 11);
  const headPitch = deg(0.8) * wobble(t * 0.8, id === "alex" ? 2 : 5) + listenNod + talkNod;
  const headRoll = -(pelvisRoll + torsoRoll) * 0.4;
  const mouthOpen = id === "alex" ? talk : 0.1 * idle * smoothstep(16.6, 17.0, t) * (1 - smoothstep(18.4, 18.8, t));
  const blink = blinkAmount(t, id === "alex" ? 1 : 2);

  const hem = deg(3.5) * Math.sin(2 * Math.PI * p) * walk;

  // --- world landmarks: compose the same transforms the scene uses ----------
  const root = rootMatrix(id, t, look.scale);
  const pelvisM = new THREE.Matrix4().compose(
    new THREE.Vector3(pelvisX, hipY, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pelvisYaw, pelvisRoll)),
    new THREE.Vector3(1, 1, 1),
  );
  const torsoM = new THREE.Matrix4().compose(
    new THREE.Vector3(0, B.waist, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(torsoLean, torsoYaw, torsoRoll)),
    new THREE.Vector3(1, breathe, 1),
  );
  const m = root.clone().multiply(pelvisM).multiply(torsoM);
  const headCentreY = B.torsoHeight + 0.06 + B.neckToHead;
  const world = {
    head: new THREE.Vector3(0, headCentreY, 0).applyMatrix4(m),
    headTop: new THREE.Vector3(0, headCentreY + B.headRadius * 1.15, 0).applyMatrix4(m),
    chest: new THREE.Vector3(0, B.shoulderY - 0.16, 0.02).applyMatrix4(m),
    shoulderL: new THREE.Vector3(B.shoulderX, B.shoulderY, 0).applyMatrix4(m),
    shoulderR: new THREE.Vector3(-B.shoulderX, B.shoulderY, 0).applyMatrix4(m),
  };

  return {
    id,
    position: [path.x, 0, path.z],
    yaw: path.yaw,
    scale: look.scale,
    pelvis: { x: pelvisX, y: hipY, rotY: pelvisYaw, rotZ: pelvisRoll },
    torso: { rotX: torsoLean, rotY: torsoYaw, rotZ: torsoRoll, breathe },
    head: { rotX: headPitch, rotY: headYaw, rotZ: headRoll },
    face: { mouthOpen, blink },
    arms: { left: armL, right: armR },
    legs: { left: legL, right: legR },
    hem,
    world,
  };
}

// ---------------------------------------------------------------------------
// Hand landmarks (MediaPipe-style, 21 points) for the RIGHT hand, in world
// space. The matrix chain here mirrors the groups in Person.tsx exactly.
// ---------------------------------------------------------------------------
export const HAND_EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, order: THREE.EulerOrder = "XYZ") =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)),
    new THREE.Vector3(1, 1, 1),
  );

/** Joint angles of one finger for a curl amount (0..1), per segment. */
export function fingerCurlAngles(curl: number): [number, number, number] {
  return [-deg(78) * curl, -deg(92) * curl, -deg(55) * curl];
}

/** Thumb: a sideways rotation across the palm plus a curl. */
export function thumbAngles(pose: HandPose["thumb"]): { base: [number, number, number]; tip: number } {
  // base: swing out of the palm plane (Y), then flex across (Z), then curl (X)
  return {
    base: [-deg(35) * pose.curl, deg(40) - deg(48) * pose.across, deg(28) + deg(30) * pose.across],
    tip: -deg(75) * pose.curl,
  };
}

/** Local transform of the right hand group relative to the torso group. */
function rightArmChain(pose: BodyPose): THREE.Matrix4 {
  const B = BODY;
  const a = pose.arms.right;
  const sx = -B.shoulderX;
  return M(sx, B.shoulderY, 0)
    .multiply(M(0, 0, 0, a.shoulderX, a.shoulderY, a.shoulderZ))
    .multiply(M(0, -B.upperArm, 0))
    .multiply(M(0, 0, 0, a.elbowX, 0, 0))
    .multiply(M(0, 0, 0, 0, a.forearmY, 0))
    .multiply(M(0, -B.forearm, 0))
    .multiply(M(0, 0, 0, a.wristX, 0, 0));
}

export function rightHandLandmarks(pose: BodyPose): THREE.Vector3[] {
  const B = BODY;
  const root = new THREE.Matrix4().compose(
    new THREE.Vector3(...pose.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pose.yaw, 0)),
    new THREE.Vector3(pose.scale, pose.scale, pose.scale),
  );
  const pelvisM = M(pose.pelvis.x, pose.pelvis.y, 0, 0, pose.pelvis.rotY, pose.pelvis.rotZ);
  const torsoM = new THREE.Matrix4().compose(
    new THREE.Vector3(0, B.waist, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.torso.rotX, pose.torso.rotY, pose.torso.rotZ)),
    new THREE.Vector3(1, pose.torso.breathe, 1),
  );
  const hand = root.clone().multiply(pelvisM).multiply(torsoM).multiply(rightArmChain(pose));
  const h = pose.arms.right.hand;
  const pts: THREE.Vector3[] = [];
  const at = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m);
  pts.push(at(hand)); // 0 wrist
  // thumb
  const ta = thumbAngles(h.thumb);
  let m = hand.clone().multiply(M(HAND.thumbBase[0], HAND.thumbBase[1], HAND.thumbBase[2], ta.base[0], ta.base[1], ta.base[2], "ZYX"));
  pts.push(at(m)); // 1 CMC
  m = m.multiply(M(0, -HAND.thumbLen[0], 0, ta.tip * 0.5, 0, 0));
  pts.push(at(m)); // 2 MCP
  m = m.multiply(M(0, -HAND.thumbLen[1] * 0.55, 0, ta.tip, 0, 0));
  pts.push(at(m)); // 3 IP
  m = m.multiply(M(0, -HAND.thumbLen[1] * 0.6, 0));
  pts.push(at(m)); // 4 TIP
  // fingers
  for (let f = 0; f < 4; f++) {
    const fp = h.fingers[f];
    const [c1, c2, c3] = fingerCurlAngles(fp.curl);
    let fm = hand.clone().multiply(M(HAND.fingerX[f], -HAND.palmL, 0, c1, 0, fp.spread, "ZYX"));
    pts.push(at(fm)); // MCP
    fm = fm.multiply(M(0, -HAND.fingerLen[f][0], 0, c2, 0, 0));
    pts.push(at(fm)); // PIP
    fm = fm.multiply(M(0, -HAND.fingerLen[f][1], 0, c3, 0, 0));
    pts.push(at(fm)); // DIP
    fm = fm.multiply(M(0, -HAND.fingerLen[f][2], 0));
    pts.push(at(fm)); // TIP
  }
  return pts;
}
