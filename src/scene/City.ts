// A procedural, stylised San Francisco street. Built once, imperatively, into
// a THREE.Group. Nothing here animates; moving traffic lives in City.tsx.
//
// Layout (metres):  the viewer walks along x=0 toward -Z.
//   buildings (left)  facade at x = -2.6
//   sidewalk          x ∈ [-2.6, 2.4]
//   road              x ∈ [2.4, 12.4]   (y = -0.15)
//   far sidewalk      x ∈ [12.4, 16.4]
//   buildings (right) facade at x = 16.4
//   cross street / intersection at z ≈ -62, downhill toward downtown beyond.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { prng } from "../film/math";
import {
  PALETTE,
  asphaltTexture,
  concreteTexture,
  fabricMaterial,
  glassMaterial,
  metalMaterial,
  paintMaterial,
  plasterMaterial,
  roundedBox,
  sidingTexture,
  signTexture,
} from "./materials";

export const SIDEWALK_LEFT = -2.6;
export const SIDEWALK_RIGHT = 2.4;
export const ROAD_RIGHT = 12.4;
export const FAR_FACADE = 16.4;
export const ROAD_Y = -0.15;
export const CROSS_Z = -62;
export const SLOPE = 0.045; // downhill grade past the intersection

type BuildingSpec = {
  z0: number; // near edge (local frame: spans z0 .. z0 - width)
  width: number;
  depth: number;
  floors: number;
  floorH: number;
  color: string;
  bays: number[]; // bay-window column indices
  kind: "flat" | "shop" | "bay";
  darkTrim: boolean;
  sign?: { text: string; bg: string; fg: string };
};

const trimMat = plasterMaterial(PALETTE.trim, 0.7);
const glassMat = glassMaterial();
const charcoalMat = paintMaterial(PALETTE.charcoal, 0.55);
const frameMatDark = paintMaterial("#35363b", 0.55);
const stepMat = plasterMaterial("#bfb7aa", 0.95);
const metalMat = metalMaterial("#3a3b40", 0.4);
const roofMat = plasterMaterial("#b5ab9b", 0.95);

function box(w: number, h: number, d: number) {
  return new THREE.BoxGeometry(w, h, d);
}

function placed(geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0): THREE.BufferGeometry {
  const g = geo.clone();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(1, 1, 1),
  );
  g.applyMatrix4(m);
  return g;
}

const frameCache = new Map<string, THREE.BufferGeometry>();
/** A hollow window frame (four bars) centred at the origin, opening in the YZ
 *  plane, facing +X. `w` is the clear opening along Z, `h` along Y. */
function frameGeo(w: number, h: number, bar = 0.075, depth = 0.1): THREE.BufferGeometry {
  const key = `${w}|${h}|${bar}|${depth}`;
  let g = frameCache.get(key);
  if (!g) {
    const parts = [
      placed(box(depth, bar, w + 2 * bar), 0, h / 2 + bar / 2, 0),
      placed(box(depth, bar, w + 2 * bar), 0, -h / 2 - bar / 2, 0),
      placed(box(depth, h, bar), 0, 0, w / 2 + bar / 2),
      placed(box(depth, h, bar), 0, 0, -w / 2 - bar / 2),
    ];
    g = mergeGeometries(parts, false)!;
    frameCache.set(key, g);
  }
  return g;
}
/** The glass pane sitting a little behind the frame. */
function paneGeo(w: number, h: number): THREE.BufferGeometry {
  const key = `pane|${w}|${h}`;
  let g = frameCache.get(key);
  if (!g) {
    g = box(0.02, h, w);
    g.translate(-0.045, 0, 0);
    frameCache.set(key, g);
  }
  return g;
}

function meshOf(geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = true): THREE.Mesh | null {
  if (geos.length === 0) return null;
  const merged = mergeGeometries(geos, false);
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Facade in a local frame: plane x=0, normal +x, spanning z ∈ [-width, 0]. */
function buildBuilding(spec: BuildingSpec, detail: "near" | "far"): THREE.Group {
  const g = new THREE.Group();
  const { width, depth, floors, floorH } = spec;
  const H = floors * floorH + 0.6;
  const wallMat = plasterMaterial(spec.color);
  wallMat.map = sidingTexture();
  wallMat.map.repeat.set(width / 2.4, H / 2.4);
  wallMat.map.needsUpdate = true;

  const body = new THREE.Mesh(box(depth, H, width), wallMat);
  body.position.set(-depth / 2, H / 2, -width / 2);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // plinth, cornice, parapet, corner pilasters
  const trims: THREE.BufferGeometry[] = [];
  trims.push(placed(box(0.14, 0.95, width + 0.04), 0.04, 0.475, -width / 2));
  trims.push(placed(box(0.55, 0.32, width + 0.55), 0.12, H - 0.3, -width / 2));
  trims.push(placed(box(0.3, 0.14, width + 0.3), 0.08, H - 0.62, -width / 2));
  trims.push(placed(box(0.16, H - 1, 0.42), 0.06, (H - 1) / 2 + 0.95, -0.18));
  trims.push(placed(box(0.16, H - 1, 0.42), 0.06, (H - 1) / 2 + 0.95, -width + 0.18));
  for (let f = 1; f < floors; f++) {
    trims.push(placed(box(0.12, 0.12, width), 0.04, f * floorH + 0.1, -width / 2));
  }
  const trimMesh = meshOf(trims, trimMat);
  if (trimMesh) g.add(trimMesh);

  // roof parapet + set-back box
  const parapet = new THREE.Mesh(box(depth - 0.4, 0.5, width - 0.6), roofMat);
  parapet.position.set(-depth / 2 - 0.2, H + 0.2, -width / 2);
  parapet.castShadow = true;
  g.add(parapet);

  // windows
  const frames: THREE.BufferGeometry[] = [];
  const panes: THREE.BufferGeometry[] = [];
  const sills: THREE.BufferGeometry[] = [];
  const nBays = Math.max(2, Math.round(width / 2.9));
  const bayW = width / nBays;
  const winW = Math.min(1.1, bayW * 0.4);
  const winH = 1.8;
  for (let f = 1; f < floors; f++) {
    const y = f * floorH + 0.6 + winH / 2;
    for (let b = 0; b < nBays; b++) {
      const z = -(b + 0.5) * bayW;
      if (spec.bays.includes(b)) continue;
      frames.push(placed(frameGeo(winW, winH), 0.0, y, z));
      panes.push(placed(paneGeo(winW, winH), 0.0, y, z));
      sills.push(placed(box(0.3, 0.1, winW + 0.4), 0.1, y - winH / 2 - 0.08, z));
    }
  }
  // bay windows: trapezoid plan, full height of the upper floors
  for (const b of spec.bays) {
    const z = -(b + 0.5) * bayW;
    const bw = Math.min(2.6, bayW * 0.9);
    const bh = (floors - 1) * floorH;
    const shape = new THREE.Shape();
    shape.moveTo(0, -bw / 2);
    shape.lineTo(0.75, -bw / 2 + 0.55);
    shape.lineTo(0.75, bw / 2 - 0.55);
    shape.lineTo(0, bw / 2);
    shape.closePath();
    const bayGeo = new THREE.ExtrudeGeometry(shape, { depth: bh, bevelEnabled: false });
    // extrude is along +z; rotate so it goes up (+y), shape x → x, shape y → z
    bayGeo.rotateX(-Math.PI / 2);
    const bay = new THREE.Mesh(bayGeo, wallMat);
    bay.position.set(0, floorH, z);
    bay.castShadow = true;
    bay.receiveShadow = true;
    g.add(bay);
    // bay roof/cap and base
    trims.length = 0;
    const cap = new THREE.Mesh(box(0.95, 0.22, bw + 0.3), trimMat);
    cap.position.set(0.42, floorH + bh + 0.08, z);
    cap.castShadow = true;
    g.add(cap);
    const base = new THREE.Mesh(box(0.85, 0.3, bw + 0.1), trimMat);
    base.position.set(0.38, floorH - 0.1, z);
    base.castShadow = true;
    g.add(base);
    const frontW = bw - 1.1;
    for (let f = 1; f < floors; f++) {
      const y = f * floorH + 0.6 + winH / 2;
      // front pane
      frames.push(placed(frameGeo(frontW * 0.8, winH), 0.75, y, z));
      panes.push(placed(paneGeo(frontW * 0.8, winH), 0.75, y, z));
      // angled panes
      const ang = Math.atan2(0.55, 0.75);
      const sideLen = Math.hypot(0.55, 0.75);
      for (const s of [-1, 1]) {
        const cx = 0.375;
        const cz = z + s * (bw / 2 - 0.275);
        frames.push(placed(frameGeo(sideLen * 0.6, winH), cx, y, cz, s * ang));
        panes.push(placed(paneGeo(sideLen * 0.6, winH), cx, y, cz, s * ang));
      }
    }
  }

  // ground floor
  const doorBay = spec.kind === "shop" ? nBays - 1 : 0;
  for (let b = 0; b < nBays; b++) {
    const z = -(b + 0.5) * bayW;
    if (b === doorBay) {
      const door = new THREE.Mesh(box(0.06, 2.45, 1.15), charcoalMat);
      door.position.set(-0.04, 0.95 + 1.225, z);
      door.castShadow = true;
      g.add(door);
      // a recessed panel pattern on the door
      for (const dy of [0.6, 1.7]) {
        const panel = new THREE.Mesh(box(0.02, 0.8, 0.8), frameMatDark);
        panel.position.set(-0.005, 0.95 + dy, z);
        g.add(panel);
      }
      frames.push(placed(frameGeo(1.15, 2.45, 0.09, 0.12), 0.0, 0.95 + 1.225, z));
      frames.push(placed(frameGeo(1.0, 0.45, 0.06, 0.1), 0.0, 0.95 + 2.45 + 0.09 + 0.3, z));
      panes.push(placed(paneGeo(1.0, 0.45), 0.0, 0.95 + 2.45 + 0.09 + 0.3, z));
      const s1 = new THREE.Mesh(box(0.45, 0.3, 1.9), stepMat);
      s1.position.set(0.225, 0.15, z);
      const s2 = new THREE.Mesh(box(0.25, 0.6, 1.7), stepMat);
      s2.position.set(0.125, 0.3, z);
      s1.castShadow = s2.castShadow = true;
      s1.receiveShadow = s2.receiveShadow = true;
      g.add(s1, s2);
      // lamp beside the door
      const lamp = new THREE.Mesh(roundedBox(0.11, 0.18, 0.11, 0.03), paintMaterial("#55565c", 0.5));
      lamp.position.set(0.07, 2.75, z + 0.85);
      g.add(lamp);
    } else if (spec.kind === "shop" && b < doorBay) {
      // storefront glazing with a centre mullion and a transom bar
      frames.push(placed(frameGeo(bayW - 0.75, 2.35, 0.1, 0.12), 0.0, 0.95 + 1.3, z));
      panes.push(placed(paneGeo(bayW - 0.75, 2.35), 0.0, 0.95 + 1.3, z));
      frames.push(placed(box(0.1, 2.35, 0.07), 0.0, 0.95 + 1.3, z));
      frames.push(placed(box(0.1, 0.07, bayW - 0.75), 0.0, 0.95 + 1.3 + 0.7, z));
    } else {
      frames.push(placed(frameGeo(winW, winH), 0.0, 0.95 + 1.1 + winH / 2 - 0.3, z));
      panes.push(placed(paneGeo(winW, winH), 0.0, 0.95 + 1.1 + winH / 2 - 0.3, z));
      sills.push(placed(box(0.3, 0.1, winW + 0.4), 0.1, 0.95 + 1.1 - 0.38, z));
    }
  }

  // shop sign + awning across the glazed bays
  if (spec.kind === "shop" && spec.sign) {
    const span = bayW * doorBay;
    const cz = -span / 2;
    const signMat = new THREE.MeshStandardMaterial({
      map: signTexture(spec.sign.text, "#2c2d31", "#efe8da"),
      roughness: 0.75,
    });
    const signBoard = new THREE.Mesh(box(0.12, 0.55, span - 0.3), signMat);
    // the textured +x face shows the text; rotate so the map's long axis runs along z
    signBoard.rotation.y = Math.PI / 2;
    signBoard.geometry = box(span - 0.3, 0.55, 0.12);
    signBoard.position.set(0.1, 4.35, cz);
    signBoard.castShadow = true;
    g.add(signBoard);
    const awningMat = fabricMaterial(spec.sign.bg, 0.95);
    const awning = new THREE.Mesh(box(1.35, 0.06, span - 0.4), awningMat);
    awning.position.set(0.66, 3.3, cz);
    awning.rotation.z = -0.32;
    awning.castShadow = true;
    g.add(awning);
    const valance = new THREE.Mesh(box(0.05, 0.28, span - 0.4), awningMat);
    valance.position.set(1.3, 2.95, cz);
    valance.castShadow = true;
    g.add(valance);
    // thin metal support rods
    for (const s of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), metalMat);
      rod.position.set(0.72, 3.72, cz + s * (span / 2 - 0.45));
      rod.rotation.z = 0.9;
      g.add(rod);
    }
  }

  const fm = meshOf(frames, spec.darkTrim ? frameMatDark : trimMat);
  if (fm) g.add(fm);
  const pm = meshOf(panes, glassMat, false);
  if (pm) g.add(pm);
  const sm = meshOf(sills, trimMat);
  if (sm) g.add(sm);

  if (detail === "far") {
    // far buildings don't need per-window shadow casting
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== body) (o as THREE.Mesh).castShadow = false;
    });
  }
  return g;
}

function buildingRow(rnd: () => number, startZ: number, endZ: number, detail: "near" | "far", signs: BuildingSpec["sign"][]): THREE.Group {
  const row = new THREE.Group();
  let z = startZ;
  let i = 0;
  while (z > endZ) {
    const width = 7.5 + rnd() * 4.5;
    const floors = 3 + (rnd() > 0.55 ? 1 : 0);
    const color = PALETTE.plaster[Math.floor(rnd() * PALETTE.plaster.length)];
    const kindRoll = rnd();
    const kind: BuildingSpec["kind"] = kindRoll < 0.3 ? "shop" : kindRoll < 0.75 ? "bay" : "flat";
    const nBays = Math.max(2, Math.round(width / 2.9));
    const bays: number[] = [];
    if (kind === "bay") {
      bays.push(Math.floor(rnd() * nBays));
      if (nBays >= 4 && rnd() > 0.5) bays.push((bays[0] + 2) % nBays);
    }
    const spec: BuildingSpec = {
      z0: z,
      width,
      depth: 14,
      floors,
      floorH: 3.4 + rnd() * 0.3,
      color,
      bays,
      kind,
      darkTrim: rnd() > 0.55,
      sign: kind === "shop" ? signs[i % signs.length] : undefined,
    };
    const b = buildBuilding(spec, detail);
    b.position.z = z;
    row.add(b);
    z -= width + 0.05;
    i++;
  }
  return row;
}

function makeCar(rnd: () => number, color: string): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = paintMaterial(color, 0.35);
  bodyMat.metalness = 0.2;
  const body = new THREE.Mesh(roundedBox(1.82, 0.58, 4.4, 0.16, 4), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  body.receiveShadow = true;
  const cabin = new THREE.Mesh(roundedBox(1.6, 0.55, 2.3, 0.22, 4), bodyMat);
  cabin.position.set(0, 1.15, -0.1);
  cabin.castShadow = true;
  const glass = new THREE.Mesh(roundedBox(1.63, 0.34, 2.32, 0.14, 3), glassMat);
  glass.position.set(0, 1.2, -0.1);
  g.add(body, cabin, glass);
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const tyre = paintMaterial("#1e1f22", 0.9);
  for (const [x, z] of [
    [-0.85, 1.35],
    [0.85, 1.35],
    [-0.85, -1.35],
    [0.85, -1.35],
  ]) {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.position.set(x, 0.33, z);
    w.castShadow = true;
    g.add(w);
  }
  void rnd;
  return g;
}

const CAR_COLOURS = ["#5d6670", "#d8d2c4", "#2f3034", "#7f8a95", "#b9b2a4", "#4a5563", "#e4e0d8"];

export function makeStaticCity(): THREE.Group {
  const city = new THREE.Group();
  const rnd = prng(2026);

  // --- ground planes -------------------------------------------------------
  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: concreteTexture(),
    color: PALETTE.sidewalk,
    roughness: 0.95,
    envMapIntensity: 0.5,
  });
  const sidewalkLen = 100; // from z=+44 back to the cross street at -56
  const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(SIDEWALK_RIGHT - SIDEWALK_LEFT, sidewalkLen), sidewalkMat);
  sidewalk.rotation.x = -Math.PI / 2;
  sidewalk.position.set((SIDEWALK_LEFT + SIDEWALK_RIGHT) / 2, 0, CROSS_Z + 6 + sidewalkLen / 2);
  sidewalk.receiveShadow = true;
  city.add(sidewalk);

  const farSidewalk = new THREE.Mesh(new THREE.PlaneGeometry(FAR_FACADE - ROAD_RIGHT, sidewalkLen), sidewalkMat);
  farSidewalk.rotation.x = -Math.PI / 2;
  farSidewalk.position.set((ROAD_RIGHT + FAR_FACADE) / 2, 0, sidewalk.position.z);
  farSidewalk.receiveShadow = true;
  city.add(farSidewalk);

  const curbMat = plasterMaterial(PALETTE.curb, 0.9);
  for (const x of [SIDEWALK_RIGHT, ROAD_RIGHT]) {
    const curb = new THREE.Mesh(box(0.2, 0.15, sidewalkLen), curbMat);
    curb.position.set(x, -0.075, sidewalk.position.z);
    curb.receiveShadow = true;
    city.add(curb);
  }

  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltTexture(),
    color: "#8c8d90",
    roughness: 0.92,
    envMapIntensity: 0.4,
  });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_RIGHT - SIDEWALK_RIGHT, sidewalkLen), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set((SIDEWALK_RIGHT + ROAD_RIGHT) / 2, ROAD_Y, sidewalk.position.z);
  road.receiveShadow = true;
  city.add(road);

  // cross street at the intersection
  const crossMat = roadMat.clone();
  crossMat.map = (roadMat.map as THREE.Texture).clone();
  crossMat.map.repeat.set(14, 3);
  crossMat.map.needsUpdate = true;
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(140, 12), crossMat);
  cross.rotation.x = -Math.PI / 2;
  cross.position.set(7, ROAD_Y - 0.001, CROSS_Z);
  cross.receiveShadow = true;
  city.add(cross);
  // crosswalk stripes before the intersection
  const stripeMat = paintMaterial("#e9e6df", 0.9);
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(box(0.55, 0.012, 3.2), stripeMat);
    s.position.set(SIDEWALK_RIGHT + 1.0 + i * 1.4, ROAD_Y + 0.006, CROSS_Z + 7.8);
    city.add(s);
  }

  // --- downhill ground beyond the intersection -----------------------------
  const slopeLen = 420;
  const slopeAngle = Math.atan(SLOPE);
  const hazeGround = new THREE.MeshStandardMaterial({ color: "#aeb0ae", roughness: 1 });
  const slope = new THREE.Mesh(new THREE.PlaneGeometry(220, slopeLen), hazeGround);
  slope.rotation.x = -Math.PI / 2 + slopeAngle;
  slope.position.set(7, ROAD_Y - (slopeLen / 2) * SLOPE, CROSS_Z - 6 - (slopeLen / 2) * Math.cos(slopeAngle));
  slope.receiveShadow = true;
  city.add(slope);

  // --- buildings -----------------------------------------------------------
  const signsLeft = [
    { text: "MARINA CAFÉ", bg: "#2f3a3a", fg: "#efe8d8" },
    { text: "BOOKS", bg: "#6b4f3a", fg: "#f1e9dc" },
  ];
  const signsRight = [
    { text: "LAUNDRY", bg: "#3b4a5a", fg: "#eef0ea" },
    { text: "FLOWERS", bg: "#5a6a4e", fg: "#f1efe6" },
  ];
  const leftRow = buildingRow(rnd, 26, CROSS_Z + 8, "near", signsLeft);
  leftRow.position.x = SIDEWALK_LEFT;
  city.add(leftRow);

  const rightRow = buildingRow(rnd, -(CROSS_Z + 8), -26, "far", signsRight);
  rightRow.position.x = FAR_FACADE;
  rightRow.rotation.y = Math.PI;
  city.add(rightRow);

  // blocks beyond the intersection, stepping down the hill
  const beyondL = buildingRow(rnd, CROSS_Z - 10, CROSS_Z - 150, "far", signsLeft);
  beyondL.position.set(SIDEWALK_LEFT, 0, 0);
  beyondL.children.forEach((b) => {
    b.position.y = -(CROSS_Z - 6 - b.position.z) * SLOPE;
  });
  city.add(beyondL);
  const beyondR = buildingRow(rnd, -(CROSS_Z - 150), -(CROSS_Z - 10), "far", signsRight);
  beyondR.position.set(FAR_FACADE, 0, 0);
  beyondR.rotation.y = Math.PI;
  beyondR.children.forEach((b) => {
    // local z is negated by the row rotation
    b.position.y = -(CROSS_Z - 6 + b.position.z) * SLOPE;
  });
  city.add(beyondR);

  // corner building across the intersection on the left (closes the view)
  // (left as open sky toward downtown on the right)

  // --- street furniture ----------------------------------------------------
  const lampMat = paintMaterial("#2a2b2f", 0.5);
  for (const z of [17, -11, -29, -47]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.6, 12), lampMat);
    pole.position.set(1.95, 2.3, z);
    pole.castShadow = true;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 12), lampMat);
    foot.position.set(1.95, 0.25, z);
    const head = new THREE.Mesh(roundedBox(0.42, 0.5, 0.42, 0.08), lampMat);
    head.position.set(1.95, 4.75, z);
    head.castShadow = true;
    const lens = new THREE.Mesh(roundedBox(0.3, 0.28, 0.3, 0.06), paintMaterial("#e9e3d2", 0.6));
    lens.position.set(1.95, 4.6, z);
    city.add(pole, foot, head, lens);
  }
  // trees in sidewalk wells
  const trunkMat = fabricMaterial(PALETTE.trunk, 0.95);
  const wellMat = paintMaterial("#6f6558", 0.95);
  const canopyGeo = new THREE.SphereGeometry(1, 20, 14);
  for (const [z, seed] of [
    [12, 1],
    [-34, 3],
    [-54, 4],
  ]) {
    const r = prng(seed + 40);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.4, 10), trunkMat);
    trunk.position.set(1.75, 1.7, z);
    trunk.castShadow = true;
    const well = new THREE.Mesh(box(1.1, 0.04, 1.1), wellMat);
    well.position.set(1.75, 0.01, z);
    city.add(trunk, well);
    for (let i = 0; i < 5; i++) {
      const mat = fabricMaterial(PALETTE.foliage[i % 3], 0.9);
      const s = 0.7 + r() * 0.45;
      const c = new THREE.Mesh(canopyGeo, mat);
      c.scale.set(s, s * 0.85, s);
      c.position.set(1.75 + (r() - 0.5) * 1.0, 4.4 + (r() - 0.5) * 0.9 + i * 0.22, z + (r() - 0.5) * 1.0);
      c.castShadow = true;
      c.receiveShadow = true;
      city.add(c);
    }
  }
  // parked cars along both curbs
  const parked: Array<[number, number, number]> = [
    [3.6, 10, 0],
    [3.6, -2, 0],
    [3.6, -13.5, 0],
    [3.6, -30, 0],
    [3.6, -41, 0],
    [11.2, 6, Math.PI],
    [11.2, -9, Math.PI],
    [11.2, -22, Math.PI],
    [11.2, -36, Math.PI],
    [11.2, -50, Math.PI],
  ];
  parked.forEach(([x, z, ry], i) => {
    const car = makeCar(rnd, CAR_COLOURS[(i * 3) % CAR_COLOURS.length]);
    car.position.set(x, ROAD_Y, z);
    car.rotation.y = ry;
    city.add(car);
  });
  // a fire hydrant and a bench for scale
  const hydrantMat = paintMaterial("#7d6b5a", 0.7);
  const hydrant = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.75, 12), hydrantMat);
  hydrant.position.set(2.0, 0.37, -36.5);
  hydrant.castShadow = true;
  const hydrantCap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), hydrantMat);
  hydrantCap.position.set(2.0, 0.78, -36.5);
  city.add(hydrant, hydrantCap);

  const benchMat = fabricMaterial("#4a4238", 0.85);
  const bench = new THREE.Mesh(roundedBox(0.45, 0.06, 1.8, 0.02), benchMat);
  bench.position.set(1.9, 0.46, -20.5);
  bench.castShadow = true;
  const benchBack = new THREE.Mesh(roundedBox(0.06, 0.4, 1.8, 0.02), benchMat);
  benchBack.position.set(2.1, 0.7, -20.5);
  benchBack.castShadow = true;
  for (const dz of [-0.75, 0.75]) {
    const leg = new THREE.Mesh(box(0.4, 0.44, 0.06), metalMat);
    leg.position.set(1.92, 0.22, -20.5 + dz);
    city.add(leg);
  }
  city.add(bench, benchBack);

  // --- downtown skyline ----------------------------------------------------
  const skyline = new THREE.Group();
  const towerMat = new THREE.MeshStandardMaterial({ color: "#8f9aa7", roughness: 0.8, envMapIntensity: 0.4 });
  const towerMat2 = new THREE.MeshStandardMaterial({ color: "#7f8a99", roughness: 0.8, envMapIntensity: 0.4 });
  const sr = prng(77);
  const baseY = -12;
  // mid-rise blocks layered in front of the towers
  for (let i = 0; i < 14; i++) {
    const w = 16 + sr() * 24;
    const d = 16 + sr() * 24;
    const h = 24 + Math.pow(sr(), 1.4) * 40;
    const x = -70 + sr() * 170;
    const z = -170 - sr() * 90;
    const m = new THREE.Mesh(box(w, h, d), sr() > 0.5 ? towerMat : towerMat2);
    m.position.set(x, baseY + 4 + h / 2, z);
    skyline.add(m);
  }
  for (let i = 0; i < 22; i++) {
    const w = 14 + sr() * 24;
    const d = 14 + sr() * 24;
    const h = 50 + Math.pow(sr(), 1.5) * 130;
    const x = -50 + sr() * 170;
    const z = -240 - sr() * 190;
    const m = new THREE.Mesh(box(w, h, d), sr() > 0.5 ? towerMat : towerMat2);
    m.position.set(x, baseY + h / 2, z);
    skyline.add(m);
  }
  // Transamerica Pyramid: four-sided, with the two "wings" and a spire
  const pyramid = new THREE.Mesh(new THREE.ConeGeometry(21, 182, 4, 1), towerMat2);
  pyramid.rotation.y = Math.PI / 4;
  pyramid.position.set(44, baseY + 91, -310);
  skyline.add(pyramid);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(box(5, 58, 5), towerMat2);
    wing.position.set(44 + s * 10.5, baseY + 138, -310);
    skyline.add(wing);
  }
  const spire = new THREE.Mesh(box(1.8, 38, 1.8), towerMat2);
  spire.position.set(44, baseY + 182 + 17, -310);
  skyline.add(spire);
  // a rounded tapered tower
  const rounded = new THREE.Mesh(new THREE.CylinderGeometry(11, 15.5, 150, 24), towerMat);
  rounded.position.set(-34, baseY + 75, -370);
  skyline.add(rounded);
  const roundedCap = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), towerMat);
  roundedCap.position.set(-34, baseY + 150, -370);
  skyline.add(roundedCap);
  skyline.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).castShadow = false;
      (o as THREE.Mesh).receiveShadow = false;
    }
  });
  city.add(skyline);

  return city;
}

/** Sky dome shader shared by the visible sky and the environment map. */
export const SKY_UNIFORMS = {
  zenith: { value: new THREE.Color("#9db2c9") },
  horizon: { value: new THREE.Color("#e2e5e3") },
  ground: { value: new THREE.Color("#8d8a82") },
  sunDir: { value: new THREE.Vector3(0.72, 0.55, 0.24).normalize() },
  sunStrength: { value: 1.0 },
};

export const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

export const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform vec3 sunDir;
  uniform float sunStrength;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 col;
    if (y >= 0.0) {
      float k = pow(y, 0.55);
      col = mix(horizon, zenith, k);
    } else {
      col = mix(horizon, ground, pow(-y, 0.5));
    }
    float s = max(dot(d, sunDir), 0.0);
    col += vec3(1.0, 0.93, 0.8) * (pow(s, 220.0) * 6.0 + pow(s, 9.0) * 0.35) * sunStrength;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function makeSkyDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(SKY_UNIFORMS),
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  mat.uniforms.sunStrength.value = 0.35;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 24), mat);
  mesh.frustumCulled = false;
  return mesh;
}

export function makeEnvironmentMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(SKY_UNIFORMS),
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
  });
  mat.uniforms.sunStrength.value = 1.0;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat);
  scene.add(sky);
  // a warm "street" below the horizon so reflections pick up the ivory city
  const street = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ color: new THREE.Color("#b4ada2") }),
  );
  street.rotation.x = -Math.PI / 2;
  street.position.y = -1.6;
  scene.add(street);
  const rt = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  return rt.texture;
}
