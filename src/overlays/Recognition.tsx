// Recognition overlays: a corner bracket that finds the person, one orange
// scan pass, then a compact name/title panel that tracks them with a little
// damping. Rendered in HTML above the 3D layer so it is never defocused.

import React, { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp01, smoothstep } from "../film/math";
import { PEOPLE, recognitionTiming, type PersonId } from "../film/timeline";
import { PANEL_W, panelPlacement, smoothedLandmarks } from "./landmarks";

const ORANGE = "#e4702c";
const CHARCOAL = "#2b2c30";

const PersonOverlay: React.FC<{ id: PersonId }> = ({ id }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const timing = recognitionTiming(id);
  const lm = useMemo(() => smoothedLandmarks(id, t, fps), [id, t, fps]);

  if (t < timing.bracketIn - 0.05 || t > timing.fadeEnd + 0.1 || !lm.inFront) return null;

  // ---- bracket geometry ----------------------------------------------------
  const left = Math.min(lm.shoulderL.x, lm.shoulderR.x) - 4;
  const right = Math.max(lm.shoulderL.x, lm.shoulderR.x) + 4;
  const top = lm.headTop.y - 6;
  const bottom = lm.chest.y + 8;
  const w = right - left;
  const h = bottom - top;
  const tick = Math.max(12, Math.min(20, w * 0.16));

  const bracketIn = interpolate(t, [timing.bracketIn, timing.bracketIn + 0.18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.2, 0.9, 0.3, 1),
  });
  const bracketOut = interpolate(t, [timing.bracketOut, timing.bracketOut + 0.3], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.6, 1),
  });
  const bracketOpacity = bracketIn * bracketOut;
  const bracketScale = 1.06 - 0.06 * bracketIn;

  const scanU = clamp01((t - timing.scanStart) / (timing.scanEnd - timing.scanStart));
  const scanVisible = t >= timing.scanStart && t <= timing.scanEnd + 0.08;
  const scanY = top + h * Easing.bezier(0.3, 0, 0.5, 1)(scanU);
  const scanOpacity = scanVisible ? Math.sin(Math.PI * clamp01(scanU)) * 0.9 : 0;

  // ---- panel ---------------------------------------------------------------
  const panelSpring = spring({
    frame: frame - Math.round(timing.panelIn * fps),
    fps,
    config: { damping: 200, stiffness: 140, mass: 0.9 },
  });
  const timeFade = interpolate(t, [timing.fadeStart, timing.fadeEnd], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.6, 1),
  });
  const { side, anchor, panelX, panelY } = panelPlacement(id, lm);
  const settle = (1 - panelSpring) * 10;

  // Never let a panel linger near or past the edge of the frame: fade on the
  // panel's far edge (its width is roughly PANEL_W) and on the anchor itself.
  const farX = panelX + side * PANEL_W;
  const edgeDistance = side === -1 ? farX : 1920 - farX;
  const edgeFade = smoothstep(-10, 90, edgeDistance) * (1 - smoothstep(0.9, 1.0, Math.abs(lm.anchorNdcX)));
  const panelOpacity = (t >= timing.panelIn ? panelSpring : 0) * Math.min(timeFade, edgeFade);

  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;

  return (
    <>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {bracketOpacity > 0.01 ? (
          <g
            opacity={bracketOpacity}
            transform={`translate(${cx} ${cy}) scale(${bracketScale}) translate(${-cx} ${-cy})`}
            fill="none"
            stroke={ORANGE}
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d={`M${left} ${top + tick} V${top + 4} Q${left} ${top} ${left + 4} ${top} H${left + tick}`} />
            <path d={`M${right - tick} ${top} H${right - 4} Q${right} ${top} ${right} ${top + 4} V${top + tick}`} />
            <path d={`M${left} ${bottom - tick} V${bottom - 4} Q${left} ${bottom} ${left + 4} ${bottom} H${left + tick}`} />
            <path d={`M${right - tick} ${bottom} H${right - 4} Q${right} ${bottom} ${right} ${bottom - 4} V${bottom - tick}`} />
            {scanOpacity > 0 ? (
              <>
                <rect x={left + 2} y={scanY - 18} width={w - 4} height={18} fill="url(#scanGlow)" stroke="none" opacity={scanOpacity * 0.55} />
                <line x1={left + 2} x2={right - 2} y1={scanY} y2={scanY} strokeWidth={1.5} opacity={scanOpacity} />
              </>
            ) : null}
          </g>
        ) : null}
        {panelOpacity > 0.01 ? (
          <line
            x1={anchor.x + side * 7}
            y1={anchor.y}
            x2={panelX}
            y2={panelY}
            stroke={CHARCOAL}
            strokeWidth={1}
            opacity={panelOpacity * 0.45}
          />
        ) : null}
        <defs>
          <linearGradient id="scanGlow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={ORANGE} stopOpacity="0" />
            <stop offset="1" stopColor={ORANGE} stopOpacity="0.6" />
          </linearGradient>
        </defs>
      </svg>
      {panelOpacity > 0.01 ? (
        <div
          style={{
            position: "absolute",
            left: side === -1 ? undefined : panelX,
            right: side === -1 ? 1920 - panelX : undefined,
            top: panelY,
            translate: `0 calc(-50% + ${settle}px)`,
            opacity: panelOpacity,
            scale: String(0.985 + 0.015 * panelSpring),
            padding: "14px 22px 15px 18px",
            background: "rgba(252, 250, 246, 0.92)",
            border: "1px solid rgba(43, 44, 48, 0.12)",
            borderRadius: 12,
            boxShadow: "0 8px 28px rgba(30, 32, 40, 0.14), 0 1px 2px rgba(30, 32, 40, 0.08)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            fontFamily: "Geist, 'Helvetica Neue', Arial, sans-serif",
            color: CHARCOAL,
            whiteSpace: "nowrap",
            display: "flex",
            flexDirection: "column",
            gap: 3,
            lineHeight: 1.15,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 34, fontWeight: 600, letterSpacing: "-0.012em" }}>
            <span style={{ width: 9, height: 9, borderRadius: 9, background: ORANGE, display: "inline-block" }} />
            {PEOPLE[id].name}
          </div>
          <div style={{ fontSize: 23, fontWeight: 400, color: "#5b5c62", paddingLeft: 19, letterSpacing: "0.004em" }}>{PEOPLE[id].title}</div>
        </div>
      ) : null}
    </>
  );
};

export const Recognition: React.FC = () => {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <PersonOverlay id="alex" />
      <PersonOverlay id="kim" />
    </AbsoluteFill>
  );
};
