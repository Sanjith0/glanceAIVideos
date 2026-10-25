// Composition root. Layers, bottom to top:
//   1. the 3D street (ThreeCanvas), rendered with a bleed and defocused via a
//      CSS blur that represents the viewer's perception
//   2. recognition overlays and the conversation UI (HTML/SVG, never blurred)
//   3. the ivory dissolve and the “Glance.” wordmark
//   plus the synthesized audio stems.

import React, { useEffect, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { ThreeCanvas } from "@remotion/three";
import { fontsReady } from "./fonts";
import { CANVAS_BLEED, CANVAS_H, CANVAS_W, CAMERA_FAR, CAMERA_NEAR, EYE_HEIGHT, FOV_CANVAS, blurPx } from "./film/timeline";
import { Street } from "./scene/Street";
import { Recognition } from "./overlays/Recognition";
import { ConversationUI } from "./overlays/ConversationUI";
import { Wordmark } from "./overlays/Wordmark";

const useFonts = () => {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("Loading Geist"));
  useEffect(() => {
    let cancelled = false;
    fontsReady.then(() => {
      if (!cancelled) {
        setReady(true);
        continueRender(handle);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [handle]);
  return ready;
};

const StreetLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const blur = blurPx(frame / fps);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", backgroundColor: "#dde2e5" }}>
      <div
        style={{
          position: "absolute",
          left: -CANVAS_BLEED,
          top: -CANVAS_BLEED,
          width: CANVAS_W,
          height: CANVAS_H,
          filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
        }}
      >
        <ThreeCanvas
          width={CANVAS_W}
          height={CANVAS_H}
          dpr={1}
          shadows="soft"
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 0.88,
            powerPreference: "high-performance",
          }}
          camera={{ fov: FOV_CANVAS, near: CAMERA_NEAR, far: CAMERA_FAR, position: [0, EYE_HEIGHT, 0] }}
        >
          <Street />
        </ThreeCanvas>
      </div>
    </div>
  );
};

const Soundtrack: React.FC = () => {
  const stems = ["ambience", "footsteps", "glasses", "recognition", "connection", "resolution"];
  return (
    <>
      {stems.map((s) => (
        <Audio key={s} src={staticFile(`audio/${s}.wav`)} />
      ))}
    </>
  );
};

export const GlanceFilm: React.FC = () => {
  const ready = useFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: "#dde2e5" }}>
      {ready ? <StreetLayer /> : null}
      <Recognition />
      <ConversationUI />
      <Wordmark />
      <Soundtrack />
    </AbsoluteFill>
  );
};
