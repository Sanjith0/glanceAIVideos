// The closing treatment: the defocused skyline dissolves into warm ivory, and
// “Glance.” settles in — charcoal, with a restrained orange period.

import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { T } from "../film/timeline";

const IVORY = "#f3eee4";
const CHARCOAL = "#2a2b2f";
const ORANGE = "#e4702c";

export const Wordmark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const ivory = interpolate(t, [T.ivoryStart, T.ivoryEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.3, 1),
  });
  const wordIn = interpolate(t, [T.wordmarkIn, T.wordmarkSettled], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const wordOut = interpolate(t, [T.wordmarkOutStart, T.wordmarkOutEnd], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.5, 0, 0.75, 0.6),
  });
  const opacity = Math.min(wordIn, wordOut);

  if (ivory <= 0) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: IVORY, opacity: ivory, justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily: "Geist, 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 600,
          fontSize: 184,
          letterSpacing: "-0.035em",
          color: CHARCOAL,
          opacity,
          translate: `0 ${(1 - wordIn) * 14}px`,
          lineHeight: 1,
          paddingBottom: 18, // optical centring for the descender-free word
        }}
      >
        Glance<span style={{ color: ORANGE }}>.</span>
      </div>
    </AbsoluteFill>
  );
};
