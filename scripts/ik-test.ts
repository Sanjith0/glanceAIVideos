// Sanity check for the gait solver: forward kinematics must land on the IK
// target, planted feet must not slide in world space (including through the
// stop, the closing step and the restart), and the solve must stay cheap.
import * as THREE from "three";
import { bodyPose, BODY } from "../src/film/gait";
import { DURATION_FRAMES, FPS } from "../src/film/timeline";

let maxErr = 0;
const slides: Array<[number, string, number]> = [];
const last: Record<string, THREE.Vector3 | null> = {};
const t0 = performance.now();
for (const id of ["alex", "kim"] as const) {
  for (let f = 0; f < DURATION_FRAMES; f++) {
    const t = f / FPS;
    const b = bodyPose(id, t);
    const root = new THREE.Matrix4().compose(
      new THREE.Vector3(...b.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.yaw, 0)),
      new THREE.Vector3(b.scale, b.scale, b.scale),
    );
    for (const side of ["left", "right"] as const) {
      const leg = b.legs[side];
      const hipX = (side === "left" ? 1 : -1) * BODY.hipHalf;
      const m = new THREE.Matrix4()
        .makeTranslation(hipX, b.pelvis.y, 0)
        .multiply(new THREE.Matrix4().makeRotationZ(leg.thighZ))
        .multiply(new THREE.Matrix4().makeRotationX(leg.thighX))
        .multiply(new THREE.Matrix4().makeTranslation(0, -BODY.thigh, 0))
        .multiply(new THREE.Matrix4().makeRotationX(leg.shinX))
        .multiply(new THREE.Matrix4().makeTranslation(0, -BODY.shin, 0));
      const fk = new THREE.Vector3().setFromMatrixPosition(m);
      maxErr = Math.max(maxErr, fk.distanceTo(new THREE.Vector3(...leg.ankle)));
      const w = new THREE.Vector3(...leg.ankle).add(new THREE.Vector3(b.pelvis.x, 0, 0)).applyMatrix4(root);
      const key = id + side;
      if (leg.planted) {
        if (last[key]) slides.push([Math.hypot(w.x - last[key]!.x, w.z - last[key]!.z), key, t]);
        last[key] = w;
      } else last[key] = null;
      if (w.y < BODY.ankleHeight * b.scale - 0.003) console.log("ankle below ground", id, side, t.toFixed(2), w.y.toFixed(3));
    }
    if (id === "alex" && (f % 30 === 0 || (t > 9.2 && t < 11 && f % 6 === 0) || (t > 19 && t < 21 && f % 6 === 0))) {
      console.log(
        t.toFixed(2),
        "pos", b.position.map((v) => v.toFixed(2)).join(","),
        "yaw", ((b.yaw * 180) / Math.PI).toFixed(1),
        "L", b.legs.left.ankle.map((v) => v.toFixed(2)).join(","), b.legs.left.planted ? "P" : "s",
        "R", b.legs.right.ankle.map((v) => v.toFixed(2)).join(","), b.legs.right.planted ? "P" : "s",
        "armR sh", ((b.arms.right.shoulderX * 180) / Math.PI).toFixed(0), "mouth", b.face.mouthOpen.toFixed(2),
      );
    }
  }
}
const ms = (performance.now() - t0) / (2 * DURATION_FRAMES);
slides.sort((a, b) => b[0] - a[0]);
console.log("max FK/IK error (m):", maxErr.toFixed(5));
console.log("worst planted-foot horizontal slide per frame (m):", slides.slice(0, 3).map((s) => `${s[0].toFixed(4)}@${s[1]}:${s[2].toFixed(2)}`).join("  "));
console.log("bodyPose cost per call (ms):", ms.toFixed(2));
