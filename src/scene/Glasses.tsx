// Black rounded smart glasses and the viewer's hands, rigged to the camera.
// Local frame: origin at the centre of the LEFT lens, +x toward the right
// lens, +z toward the wearer (temples run along +z), -z faces the street.

import React, { useMemo } from "react";
import * as THREE from "three";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { cameraPose, glassesState, type Vec3 } from "../film/timeline";
import { easeInOutCubic, lerp } from "../film/math";
import { acetateMaterial, fabricMaterial, lensMaterial, metalMaterial, paintMaterial, roundedBox, skinMaterial } from "./materials";

const LENS_W = 0.052;
const LENS_H = 0.044;
const RIM = 0.0046;
const PD = 0.064;

function roundedRect(w: number, h: number, rTop: number, rBottom: number, path: THREE.Path) {
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  path.moveTo(x0 + rBottom, y0);
  path.lineTo(x1 - rBottom, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + rBottom);
  path.lineTo(x1, y1 - rTop);
  path.quadraticCurveTo(x1, y1, x1 - rTop, y1);
  path.lineTo(x0 + rTop, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - rTop);
  path.lineTo(x0, y0 + rBottom);
  path.quadraticCurveTo(x0, y0, x0 + rBottom, y0);
  return path;
}

function rimGeometry(): THREE.BufferGeometry {
  const outer = roundedRect(LENS_W + RIM * 2, LENS_H + RIM * 2, 0.0135, 0.019, new THREE.Shape()) as THREE.Shape;
  const hole = roundedRect(LENS_W, LENS_H, 0.011, 0.016, new THREE.Path());
  outer.holes.push(hole);
  const depth = 0.0055;
  const g = new THREE.ExtrudeGeometry(outer, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.0011,
    bevelSize: 0.001,
    bevelSegments: 3,
    curveSegments: 18,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

function lensGeometry(): THREE.BufferGeometry {
  const s = roundedRect(LENS_W + 0.001, LENS_H + 0.001, 0.011, 0.016, new THREE.Shape()) as THREE.Shape;
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0015, bevelEnabled: false, curveSegments: 18 });
  g.translate(0, 0, -0.00075);
  return g;
}

const Frame: React.FC = () => {
  const rim = useMemo(rimGeometry, []);
  const lens = useMemo(lensGeometry, []);
  const acetate = useMemo(acetateMaterial, []);
  const lensMat = useMemo(lensMaterial, []);
  const ring = useMemo(() => metalMaterial("#9aa0a8", 0.3), []);
  const cam = useMemo(() => paintMaterial("#0b0d12", 0.15), []);
  const temple = (side: -1 | 1) => {
    const hingeX = side === -1 ? -LENS_W / 2 - RIM - 0.0015 : PD + LENS_W / 2 + RIM + 0.0015;
    return (
      <group key={side} position={[hingeX, LENS_H / 2 - 0.006, 0.002]} rotation={[0, side * 0.07, 0]}>
        {/* end piece / hinge block */}
        <mesh geometry={roundedBox(0.0075, 0.0095, 0.012, 0.002)} material={acetate} position={[0, 0, 0.003]} />
        {/* temple arm */}
        <mesh geometry={roundedBox(0.0042, 0.0078, 0.118, 0.0018)} material={acetate} position={[0, -0.0005, 0.067]} />
        {/* ear hook, bending down */}
        <group position={[0, -0.001, 0.124]} rotation={[-0.55, 0, 0]}>
          <mesh geometry={roundedBox(0.004, 0.0068, 0.045, 0.0016)} material={acetate} position={[0, 0, 0.02]} />
        </group>
        {/* small camera lens on the front of the end piece (smart-glasses cue) */}
        <mesh material={ring} position={[0, 0.0005, -0.0035]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0032, 0.0032, 0.0012, 20]} />
        </mesh>
        <mesh material={cam} position={[0, 0.0005, -0.0041]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0022, 0.0022, 0.0008, 16]} />
        </mesh>
      </group>
    );
  };
  return (
    <group>
      <mesh geometry={rim} material={acetate} />
      <mesh geometry={rim} material={acetate} position={[PD, 0, 0]} />
      <mesh geometry={lens} material={lensMat} />
      <mesh geometry={lens} material={lensMat} position={[PD, 0, 0]} />
      {/* keyhole bridge */}
      <mesh geometry={roundedBox(0.016, 0.0062, 0.0052, 0.0022)} material={acetate} position={[PD / 2, LENS_H / 2 - 0.007, 0]} />
      <mesh geometry={roundedBox(0.009, 0.0045, 0.0045, 0.002)} material={acetate} position={[PD / 2, LENS_H / 2 - 0.013, 0.0015]} />
      {temple(-1)}
      {temple(1)}
    </group>
  );
};

/** A stylised hand gripping a temple. Modelled for the left hand in the
 *  glasses frame; the right hand is a mirrored copy. */
const Hand: React.FC<{ skin: THREE.Material; sleeve: THREE.Material; cuff: THREE.Material }> = ({ skin, sleeve, cuff }) => {
  return (
    <group>
      {/* palm, slightly cupped around the temple */}
      <mesh geometry={roundedBox(0.03, 0.082, 0.078, 0.013)} material={skin} position={[0, -0.012, 0.008]} rotation={[0.1, 0, -0.12]} />
      {/* thumb, lying along the top of the temple */}
      <group position={[0.012, 0.028, -0.02]} rotation={[0, -0.25, 0.55]}>
        <mesh geometry={roundedBox(0.017, 0.017, 0.05, 0.0075)} material={skin} position={[0, 0, 0.018]} />
      </group>
      {/* index + middle fingers curled under the temple */}
      {[0, 1, 2].map((i) => (
        <group key={i} position={[0.014, 0.015 - i * 0.016, 0.03 + i * 0.004]} rotation={[0, 0, 1.0 + i * 0.12]}>
          <mesh geometry={roundedBox(0.015, 0.015, 0.046, 0.0068)} material={skin} position={[0, 0, 0.016]} />
          <group position={[0, 0, 0.038]} rotation={[0, 0, 0]}>
            <mesh geometry={roundedBox(0.014, 0.014, 0.032, 0.0065)} material={skin} position={[0.006, -0.01, 0.0]} rotation={[0, 0, 1.0]} />
          </group>
        </group>
      ))}
      {/* wrist, cuff and sleeve heading down toward the body */}
      <group position={[-0.008, -0.05, 0.03]} rotation={[-0.75, 0, -0.2]}>
        <mesh geometry={roundedBox(0.052, 0.045, 0.05, 0.02)} material={skin} position={[0, -0.01, 0]} />
        <mesh geometry={roundedBox(0.066, 0.06, 0.035, 0.014)} material={cuff} position={[0, -0.045, 0]} />
        <mesh geometry={roundedBox(0.08, 0.3, 0.072, 0.03)} material={sleeve} position={[0, -0.2, 0]} />
      </group>
    </group>
  );
};

const GRIP_L: Vec3 = [-LENS_W / 2 - RIM - 0.02, -0.004, 0.03];
const GRIP_R: Vec3 = [PD + LENS_W / 2 + RIM + 0.02, -0.004, 0.03];
const ENTRY_R: Vec3 = [0.24, -0.26, -0.3];
const MID_R: Vec3 = [0.085, -0.03, -0.21];
const ENTRY_R_ROT: Vec3 = [0.35, -0.5, 0.3];
const bez = (a: Vec3, b: Vec3, c: Vec3, k: number): Vec3 => {
  const u = 1 - k;
  return [
    u * u * a[0] + 2 * u * k * b[0] + k * k * c[0],
    u * u * a[1] + 2 * u * k * b[1] + k * k * c[1],
    u * u * a[2] + 2 * u * k * b[2] + k * k * c[2],
  ];
};

export const GlassesRig: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const g = useMemo(() => glassesState(t), [t]);
  const cam = useMemo(() => cameraPose(t), [t]);
  const camQuat = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(cam.pitch, cam.yaw, cam.roll, "YXZ")), [cam]);

  const skin = useMemo(() => skinMaterial("#c9a07e"), []);
  const sleeve = useMemo(() => fabricMaterial("#3e3f45", 0.9), []);
  const cuff = useMemo(() => fabricMaterial("#2f3035", 0.95), []);

  if (!g.visible) return null;

  const leftRelease = g.leftHand.release;
  const rightRelease = g.rightHand.release;
  const rel = (k: number, side: -1 | 1): { pos: Vec3; rot: Vec3 } => ({
    pos: [side * 0.07 * k, -0.035 * k, 0.045 * k],
    rot: [0.3 * k, side * 0.5 * k, side * 0.25 * k],
  });
  const relL = rel(easeInOutCubic(leftRelease), -1);
  const relR = rel(easeInOutCubic(rightRelease), 1);

  // During the removal the right hand flies in from the lower right.
  const reach = g.rightHand.reach;
  const reaching = g.rightHand.visible && reach < 1;
  let reachPos: Vec3 = GRIP_R;
  let reachRot: Vec3 = [0, 0, 0];
  if (reaching) {
    const k = easeInOutCubic(reach);
    const gripCam: Vec3 = [g.position[0] + GRIP_R[0], g.position[1] + GRIP_R[1], g.position[2] + GRIP_R[2]];
    reachPos = bez(ENTRY_R, MID_R, gripCam, k);
    reachRot = [lerp(ENTRY_R_ROT[0], 0, k), lerp(ENTRY_R_ROT[1], 0, k), lerp(ENTRY_R_ROT[2], 0, k)];
  }

  return (
    <group position={[cam.x, cam.y, cam.z]} quaternion={camQuat}>
      <group position={g.position} rotation={g.rotation}>
        <Frame />
        {g.leftHand.visible ? (
          <group position={[GRIP_L[0] + relL.pos[0], GRIP_L[1] + relL.pos[1], GRIP_L[2] + relL.pos[2]]} rotation={relL.rot}>
            <Hand skin={skin} sleeve={sleeve} cuff={cuff} />
          </group>
        ) : null}
        {g.rightHand.visible && !reaching ? (
          <group position={[GRIP_R[0] + relR.pos[0], GRIP_R[1] + relR.pos[1], GRIP_R[2] + relR.pos[2]]} rotation={relR.rot} scale={[-1, 1, 1]}>
            <Hand skin={skin} sleeve={sleeve} cuff={cuff} />
          </group>
        ) : null}
      </group>
      {reaching ? (
        <group position={reachPos} rotation={reachRot} scale={[-1, 1, 1]}>
          <Hand skin={skin} sleeve={sleeve} cuff={cuff} />
        </group>
      ) : null}
    </group>
  );
};
