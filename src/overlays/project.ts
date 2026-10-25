// Projects world points through the same first-person camera the 3D scene
// uses, into 1920×1080 pixel coordinates. Used by the recognition overlays,
// which live in plain HTML above the (blurrable) canvas.

import * as THREE from "three";
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  CANVAS_BLEED,
  CANVAS_H,
  CANVAS_W,
  FOV_CANVAS,
  cameraPose,
} from "../film/timeline";

const cam = new THREE.PerspectiveCamera(FOV_CANVAS, CANVAS_W / CANVAS_H, CAMERA_NEAR, CAMERA_FAR);

export type Projected = { x: number; y: number; ndcX: number; ndcY: number; inFront: boolean };

export function projectAt(t: number, points: THREE.Vector3[]): Projected[] {
  const p = cameraPose(t);
  cam.position.set(p.x, p.y, p.z);
  cam.rotation.set(p.pitch, p.yaw, p.roll, "YXZ");
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return points.map((w) => {
    const v = w.clone().project(cam);
    return {
      x: ((v.x + 1) / 2) * CANVAS_W - CANVAS_BLEED,
      y: ((1 - v.y) / 2) * CANVAS_H - CANVAS_BLEED,
      ndcX: v.x,
      ndcY: v.y,
      inFront: v.z < 1,
    };
  });
}
