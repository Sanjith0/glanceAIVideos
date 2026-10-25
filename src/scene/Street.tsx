// The complete 3D street: environment, lights, city, moving traffic, the two
// people and the glasses rig. Rendered inside @remotion/three's ThreeCanvas.

import React, { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { CAMERA_FAR, CAMERA_NEAR, CANVAS_H, CANVAS_W, FOV_CANVAS, cameraPose } from "../film/timeline";
import { CROSS_Z, ROAD_Y, SKY_UNIFORMS, makeEnvironmentMap, makeSkyDome, makeStaticCity } from "./City";
import { GlassesRig } from "./Glasses";
import { Person } from "./Person";
import { glassMaterial, paintMaterial, roundedBox } from "./materials";

const FOG_COLOR = "#dde2e5";

/** First-person camera driven purely by the frame. Runs in a layout effect so
 *  it is applied before @remotion/three advances the renderer. */
const CameraRig: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    const p = cameraPose(frame / fps);
    camera.position.set(p.x, p.y, p.z);
    camera.rotation.set(p.pitch, p.yaw, p.roll, "YXZ");
    camera.fov = FOV_CANVAS;
    camera.aspect = CANVAS_W / CANVAS_H;
    camera.near = CAMERA_NEAR;
    camera.far = CAMERA_FAR;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }, [frame, fps, camera]);
  return null;
};

const Environment: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const env = useMemo(() => makeEnvironmentMap(gl), [gl]);
  const sky = useMemo(makeSkyDome, []);
  return (
    <>
      <primitive attach="environment" object={env} />
      <fogExp2 attach="fog" args={[FOG_COLOR, 0.0021]} />
      <primitive object={sky} />
    </>
  );
};

const Lights: React.FC = () => {
  const sun = SKY_UNIFORMS.sunDir.value;
  const pos: [number, number, number] = [sun.x * 60, sun.y * 60, sun.z * 60];
  return (
    <>
      <hemisphereLight args={["#c3d2e2", "#b6ab9b", 0.75]} />
      <directionalLight
        castShadow
        position={pos}
        intensity={2.3}
        color="#fff1df"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00035}
        shadow-normalBias={0.025}
        shadow-camera-near={5}
        shadow-camera-far={140}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      {/* cool sky rim from the direction of the bay, no shadows */}
      <directionalLight position={[-20, 24, -40]} intensity={0.55} color="#cfdff3" />
    </>
  );
};

const City: React.FC = () => {
  const city = useMemo(makeStaticCity, []);
  return <primitive object={city} />;
};

/** Distant traffic: a couple of cars on the road ahead and one crossing the
 *  intersection, all positioned from time. */
const Traffic: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const mats = useMemo(() => [paintMaterial("#6a7480", 0.35), paintMaterial("#d9d4c8", 0.35), paintMaterial("#3a3d44", 0.35)], []);
  const glass = useMemo(glassMaterial, []);
  const car = (mat: THREE.Material, x: number, z: number, ry: number, key: string) => (
    <group key={key} position={[x, ROAD_Y, z]} rotation={[0, ry, 0]}>
      <mesh geometry={roundedBox(1.82, 0.58, 4.4, 0.16, 4)} material={mat} position={[0, 0.62, 0]} castShadow receiveShadow />
      <mesh geometry={roundedBox(1.6, 0.55, 2.3, 0.22, 4)} material={mat} position={[0, 1.15, -0.1]} castShadow />
      <mesh geometry={roundedBox(1.63, 0.34, 2.32, 0.14, 3)} material={glass} position={[0, 1.2, -0.1]} />
    </group>
  );
  return (
    <>
      {car(mats[0], 5.4, -44 - 6.5 * t, 0, "away")}
      {car(mats[1], 9.6, -128 + 5.5 * t, Math.PI, "toward")}
      {car(mats[2], -38 + 7.5 * t, CROSS_Z, Math.PI / 2, "cross")}
    </>
  );
};

export const Street: React.FC = () => {
  return (
    <>
      <CameraRig />
      <Environment />
      <Lights />
      <City />
      <Traffic />
      <Person id="alex" />
      <Person id="kim" />
      <GlassesRig />
    </>
  );
};
