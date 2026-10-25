// Projected, lightly damped body landmarks shared by the recognition panels
// and the conversation UI, so every overlay anchors to the same points.

import { bodyPose } from "../film/gait";
import type { PersonId } from "../film/timeline";
import { projectAt } from "./project";

export type Pt = { x: number; y: number };

export type Landmarks = {
  headTop: Pt;
  chest: Pt;
  shoulderL: Pt;
  shoulderR: Pt;
  head: Pt;
  anchorNdcX: number;
  inFront: boolean;
};

export const PANEL_GAP = 34;
export const PANEL_W = 345;
export const PANEL_H = 92;

/** Projected landmarks, smoothed over the last few frames (weights sum to 1)
 *  so the overlay follows the person with slight damping instead of jitter. */
export function smoothedLandmarks(id: PersonId, t: number, fps: number): Landmarks {
  const weights = [0.46, 0.28, 0.17, 0.09];
  const acc = { headTop: [0, 0], chest: [0, 0], shoulderL: [0, 0], shoulderR: [0, 0], head: [0, 0] };
  let anchorNdcX = 0;
  let inFront = true;
  weights.forEach((w, i) => {
    const tt = Math.max(0, t - i / fps);
    const pose = bodyPose(id, tt);
    const pts = projectAt(tt, [pose.world.headTop, pose.world.chest, pose.world.shoulderL, pose.world.shoulderR, pose.world.head]);
    const keys = ["headTop", "chest", "shoulderL", "shoulderR", "head"] as const;
    keys.forEach((k, j) => {
      acc[k][0] += pts[j].x * w;
      acc[k][1] += pts[j].y * w;
    });
    if (i === 0) {
      inFront = pts.every((p) => p.inFront);
      // the panel hangs off the shoulder on the far side from the other person
      anchorNdcX = id === "alex" ? pts[3].ndcX : pts[2].ndcX;
    }
  });
  const pt = (a: number[]) => ({ x: a[0], y: a[1] });
  return {
    headTop: pt(acc.headTop),
    chest: pt(acc.chest),
    shoulderL: pt(acc.shoulderL),
    shoulderR: pt(acc.shoulderR),
    head: pt(acc.head),
    anchorNdcX,
    inFront,
  };
}

/** Where a person's name panel sits: beside the outer shoulder. */
export function panelPlacement(id: PersonId, lm: Landmarks) {
  const side = id === "alex" ? -1 : 1; // -1: panel on the person's screen-left
  const anchor = id === "alex" ? lm.shoulderR : lm.shoulderL;
  const panelY = anchor.y - 12;
  const panelX = anchor.x + side * PANEL_GAP; // edge nearest the person
  return { side, anchor, panelX, panelY };
}
