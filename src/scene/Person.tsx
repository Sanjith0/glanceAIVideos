import React, { useMemo } from "react";
import * as THREE from "three";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { BODY, HAND, bodyPose, fingerCurlAngles, thumbAngles, type ArmPose, type HandPose } from "../film/gait";
import type { PersonId } from "../film/timeline";
import { blobShadowTexture, fabricMaterial, hairMaterial, paintMaterial, roundedBox, skinMaterial } from "./materials";

type Look = {
  skin: string;
  hair: string;
  hairStyle: "short" | "bun";
  outer: string;
  inner: string;
  trousers: string;
  shoe: string;
  sole: string;
  longCoat: boolean;
  scarf?: string;
};

const LOOKS: Record<PersonId, Look> = {
  alex: {
    skin: "#c99b76",
    hair: "#2d241f",
    hairStyle: "short",
    outer: "#393a3f",
    inner: "#d8d2c5",
    trousers: "#575744",
    shoe: "#2a2521",
    sole: "#2a2521",
    longCoat: false,
  },
  kim: {
    skin: "#8f6046",
    hair: "#1e1916",
    hairStyle: "bun",
    outer: "#cbbda4",
    inner: "#55657a",
    trousers: "#2e3441",
    shoe: "#e9e5dd",
    sole: "#cfcac0",
    longCoat: true,
    scarf: "#8d9a86",
  },
};

let blobTex: THREE.Texture | null = null;

const Blob: React.FC<{ x: number; z: number; size: number; opacity: number }> = ({ x, z, size, opacity }) => {
  const mat = useMemo(() => {
    blobTex ??= blobShadowTexture();
    return new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  }, []);
  mat.opacity = opacity;
  return (
    <mesh position={[x, 0.004, z]} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={1}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
};

/** Articulated hand (right-hand rig; mirror in X for the left hand). The
 *  group hierarchy mirrors `rightHandLandmarks` in gait.ts exactly. */
const Hand: React.FC<{ pose: HandPose; skin: THREE.Material }> = ({ pose, skin }) => {
  const sh = { castShadow: true, receiveShadow: true };
  const seg = (len: number, w: number, key: string | number) => (
    <mesh key={key} geometry={roundedBox(w, len + 0.004, w * 0.95, w * 0.42)} material={skin} position={[0, -len / 2, 0]} {...sh} />
  );
  const ta = thumbAngles(pose.thumb);
  return (
    <group>
      <mesh geometry={roundedBox(HAND.palmW, HAND.palmL + 0.01, HAND.thick, 0.012)} material={skin} position={[0, -HAND.palmL / 2, 0]} {...sh} />
      {/* thumb */}
      <group position={HAND.thumbBase} rotation={[0, 0, ta.base[2]]}>
        <group rotation={[0, ta.base[1], 0]}>
          <group rotation={[ta.base[0], 0, 0]}>
            {seg(HAND.thumbLen[0], 0.019, "t1")}
            <group position={[0, -HAND.thumbLen[0], 0]} rotation={[ta.tip * 0.5, 0, 0]}>
              {seg(HAND.thumbLen[1] * 0.55, 0.017, "t2")}
              <group position={[0, -HAND.thumbLen[1] * 0.55, 0]} rotation={[ta.tip, 0, 0]}>
                {seg(HAND.thumbLen[1] * 0.6, 0.015, "t3")}
              </group>
            </group>
          </group>
        </group>
      </group>
      {/* fingers */}
      {pose.fingers.map((f, i) => {
        const [c1, c2, c3] = fingerCurlAngles(f.curl);
        const L = HAND.fingerLen[i];
        const w = i === 3 ? 0.0145 : 0.0165;
        return (
          <group key={i} position={[HAND.fingerX[i], -HAND.palmL, 0]} rotation={[0, 0, f.spread]}>
            <group rotation={[c1, 0, 0]}>
              {seg(L[0], w, 0)}
              <group position={[0, -L[0], 0]} rotation={[c2, 0, 0]}>
                {seg(L[1], w * 0.95, 1)}
                <group position={[0, -L[1], 0]} rotation={[c3, 0, 0]}>
                  {seg(L[2], w * 0.9, 2)}
                </group>
              </group>
            </group>
          </group>
        );
      })}
    </group>
  );
};

export const Person: React.FC<{ id: PersonId }> = ({ id }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pose = useMemo(() => bodyPose(id, frame / fps), [id, frame, fps]);
  const look = LOOKS[id];

  const m = useMemo(
    () => ({
      skin: skinMaterial(look.skin),
      hair: hairMaterial(look.hair),
      outer: fabricMaterial(look.outer, look.longCoat ? 0.88 : 0.72),
      inner: fabricMaterial(look.inner, 0.9),
      trousers: fabricMaterial(look.trousers, 0.85),
      shoe: paintMaterial(look.shoe, look.longCoat ? 0.55 : 0.4),
      sole: paintMaterial(look.sole, 0.7),
      eye: paintMaterial("#241d1a", 0.3),
      mouth: paintMaterial("#9a6553", 0.6),
      mouthInner: paintMaterial("#4a2a26", 0.8),
      scarf: fabricMaterial(look.scarf ?? "#888", 0.95),
    }),
    [look],
  );

  const B = BODY;
  const P = pose;
  const sh = { castShadow: true, receiveShadow: true };

  const renderLeg = (side: "left" | "right") => {
    const leg = P.legs[side];
    const hipX = (side === "left" ? 1 : -1) * B.hipHalf;
    return (
      <group position={[hipX, 0, 0]}>
        <group rotation={[0, 0, leg.thighZ]}>
          <group rotation={[leg.thighX, 0, 0]}>
            <mesh geometry={roundedBox(0.145, 0.46, 0.155, 0.06)} material={m.trousers} position={[0, -0.2, 0]} {...sh} />
            <group position={[0, -B.thigh, 0]} rotation={[leg.shinX, 0, 0]}>
              <mesh geometry={roundedBox(0.125, 0.45, 0.135, 0.05)} material={m.trousers} position={[0, -0.21, 0.005]} {...sh} />
              <group position={[0, -B.shin, 0]} rotation={[leg.footX, 0, 0]}>
                <mesh geometry={roundedBox(0.1, 0.07, 0.27, 0.035)} material={m.shoe} position={[0, -0.032, 0.05]} {...sh} />
                <mesh geometry={roundedBox(0.104, 0.028, 0.275, 0.012)} material={m.sole} position={[0, -0.056, 0.05]} {...sh} />
              </group>
            </group>
          </group>
        </group>
      </group>
    );
  };

  const renderArm = (side: "left" | "right") => {
    const a: ArmPose = P.arms[side];
    const sx = (side === "left" ? 1 : -1) * B.shoulderX;
    return (
      <group position={[sx, B.shoulderY, 0]} rotation={[a.shoulderX, a.shoulderY, a.shoulderZ]}>
        <mesh geometry={roundedBox(0.11, 0.31, 0.11, 0.05)} material={m.outer} position={[0, -0.14, 0]} {...sh} />
        <group position={[0, -B.upperArm, 0]} rotation={[a.elbowX, 0, 0]}>
          <group rotation={[0, a.forearmY, 0]}>
            <mesh geometry={roundedBox(0.095, 0.26, 0.095, 0.042)} material={m.outer} position={[0, -0.12, 0]} {...sh} />
            <group position={[0, -B.forearm, 0]} rotation={[a.wristX, 0, 0]}>
              <group scale={[side === "left" ? -1 : 1, 1, 1]}>
                <Hand pose={a.hand} skin={m.skin} />
              </group>
            </group>
          </group>
        </group>
      </group>
    );
  };

  const headY = B.torsoHeight + 0.06 + B.neckToHead;
  const mouthOpen = P.face.mouthOpen;
  const eyeScaleY = 0.8 * (1 - 0.92 * P.face.blink);

  return (
    <group position={P.position} rotation={[0, P.yaw, 0]} scale={P.scale}>
      {/* contact shadows under each foot */}
      {(["left", "right"] as const).map((side) => {
        const leg = P.legs[side];
        const lift = Math.max(0, leg.ankle[1] - B.ankleHeight);
        return (
          <Blob
            key={side}
            x={leg.ankle[0] + P.pelvis.x}
            z={leg.ankle[2] + 0.04}
            size={0.42 + lift * 0.6}
            opacity={0.55 * Math.max(0, 1 - lift / 0.14)}
          />
        );
      })}

      {/* pelvis translation: legs hang from here */}
      <group position={[P.pelvis.x, P.pelvis.y, 0]}>
        {renderLeg("left")}
        {renderLeg("right")}

        {/* pelvis rotation: hips + everything above */}
        <group rotation={[0, P.pelvis.rotY, P.pelvis.rotZ]}>
          <mesh geometry={roundedBox(0.31, 0.21, 0.2, 0.075)} material={m.trousers} position={[0, 0.07, 0]} {...sh} />

          <group position={[0, B.waist, 0]} rotation={[P.torso.rotX, P.torso.rotY, P.torso.rotZ]} scale={[1, P.torso.breathe, 1]}>
            {/* inner top */}
            <mesh geometry={roundedBox(0.33, 0.5, 0.2, 0.08)} material={m.inner} position={[0, 0.25, 0]} {...sh} />
            {/* open outer layer, two panels */}
            {[-1, 1].map((s) => (
              <mesh
                key={s}
                geometry={roundedBox(0.175, look.longCoat ? 0.54 : 0.5, 0.25, 0.07)}
                material={m.outer}
                position={[s * 0.1, look.longCoat ? 0.25 : 0.26, 0.0]}
                {...sh}
              />
            ))}
            {/* collar */}
            <mesh geometry={roundedBox(0.25, 0.045, 0.2, 0.02)} material={m.outer} position={[0, 0.495, -0.012]} {...sh} />
            {look.scarf ? (
              <mesh material={m.scarf} position={[0, 0.49, 0.02]} rotation={[Math.PI / 2, 0.1, 0]} {...sh}>
                <torusGeometry args={[0.082, 0.03, 10, 24]} />
              </mesh>
            ) : null}
            {/* coat skirt panels swing with the gait */}
            {look.longCoat
              ? [-1, 1].map((s) => (
                  <group key={s} position={[0, 0.0, s * 0.07]} rotation={[s * P.hem, 0, 0]}>
                    <mesh geometry={roundedBox(0.4, 0.36, 0.12, 0.05)} material={m.outer} position={[0, -0.16, 0]} {...sh} />
                  </group>
                ))
              : null}

            {renderArm("left")}
            {renderArm("right")}

            {/* neck + head */}
            <mesh material={m.skin} position={[0, B.torsoHeight + 0.03, 0]} {...sh}>
              <cylinderGeometry args={[0.052, 0.06, 0.11, 16]} />
            </mesh>
            <group position={[0, headY, 0]} rotation={[P.head.rotX, P.head.rotY, P.head.rotZ]}>
              <mesh material={m.skin} scale={[1, 1.1, 1.02]} {...sh}>
                <sphereGeometry args={[B.headRadius, 32, 24]} />
              </mesh>
              {/* ears */}
              {[-1, 1].map((s) => (
                <mesh key={s} material={m.skin} position={[s * 0.104, -0.005, -0.005]} scale={[0.5, 1, 0.75]} {...sh}>
                  <sphereGeometry args={[0.024, 12, 10]} />
                </mesh>
              ))}
              {/* eyes, brows, nose, mouth */}
              {[-1, 1].map((s) => (
                <mesh key={s} material={m.eye} position={[s * 0.04, 0.012, 0.098]} scale={[1, eyeScaleY, 0.5]}>
                  <sphereGeometry args={[0.012, 12, 10]} />
                </mesh>
              ))}
              {[-1, 1].map((s) => (
                <mesh key={s} geometry={roundedBox(0.04, 0.009, 0.012, 0.004)} material={m.hair} position={[s * 0.04, 0.042, 0.1]} rotation={[0.2, 0, s * 0.08]} />
              ))}
              <mesh material={m.skin} position={[0, -0.012, 0.108]} scale={[0.8, 1, 0.8]} {...sh}>
                <sphereGeometry args={[0.017, 12, 10]} />
              </mesh>
              {/* the mouth opens as the character talks */}
              <group position={[0, -0.05 - mouthOpen * 0.009, 0.1]} rotation={[0.25, 0, 0]}>
                <mesh geometry={roundedBox(0.038, 0.008, 0.012, 0.004)} material={m.mouth} scale={[1 + mouthOpen * 0.15, 1 + mouthOpen * 2.6, 1]} />
                {mouthOpen > 0.05 ? (
                  <mesh geometry={roundedBox(0.026, 0.0065, 0.01, 0.0032)} material={m.mouthInner} position={[0, 0, 0.002]} scale={[1, 1 + mouthOpen * 2.4, 1]} />
                ) : null}
              </group>
              {/* hair */}
              {look.hairStyle === "short" ? (
                <>
                  <mesh material={m.hair} position={[0, 0.012, -0.012]} rotation={[-0.25, 0, 0]} {...sh}>
                    <sphereGeometry args={[B.headRadius * 1.06, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
                  </mesh>
                  <mesh geometry={roundedBox(0.15, 0.045, 0.07, 0.02)} material={m.hair} position={[0, 0.085, 0.07]} rotation={[0.35, 0, 0]} {...sh} />
                </>
              ) : (
                <>
                  <mesh material={m.hair} position={[0, 0.01, -0.01]} rotation={[-0.18, 0, 0]} {...sh}>
                    <sphereGeometry args={[B.headRadius * 1.07, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
                  </mesh>
                  <mesh geometry={roundedBox(0.19, 0.06, 0.08, 0.025)} material={m.hair} position={[0, 0.07, 0.065]} rotation={[0.4, 0, 0]} {...sh} />
                  <mesh material={m.hair} position={[0, -0.01, -0.115]} {...sh}>
                    <sphereGeometry args={[0.048, 18, 14]} />
                  </mesh>
                </>
              )}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
