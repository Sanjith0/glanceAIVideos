// The AR layer for the conversation with Alex:
//   · a live "Summarizing conversation…" card under his name panel that
//     resolves into the summary,
//   · computer-vision style hand landmarks when he holds up the peace sign,
//   · a brief green flash across the whole field of view,
//   · the "New connection made" bar in the middle of the screen.
// All HTML/SVG above the 3D layer, never blurred, driven purely by the frame.

import React, { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { bodyPose, HAND_EDGES, rightHandLandmarks } from "../film/gait";
import { clamp01, smoothstep } from "../film/math";
import {
  CONNECTION_DETAIL,
  CONNECTION_TITLE,
  CONVERSATION_SUMMARY,
  T,
  conversationState,
} from "../film/timeline";
import { PANEL_H, panelPlacement, smoothedLandmarks } from "./landmarks";
import { projectAt } from "./project";

const ORANGE = "#e4702c";
const CHARCOAL = "#2b2c30";
const GREEN = "#2fc98a";
const GREEN_DEEP = "#1f9d68";
const FONT = "Geist, 'Helvetica Neue', Arial, sans-serif";

const cardStyle: React.CSSProperties = {
  position: "absolute",
  background: "rgba(252, 250, 246, 0.92)",
  border: "1px solid rgba(43, 44, 48, 0.12)",
  borderRadius: 12,
  boxShadow: "0 8px 28px rgba(30, 32, 40, 0.14), 0 1px 2px rgba(30, 32, 40, 0.08)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  fontFamily: FONT,
  color: CHARCOAL,
};

/** A four-point sparkle used as the "AI summary" glyph. */
const Sparkle: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
    <path d="M12 2 C12.6 8 16 11.4 22 12 C16 12.6 12.6 16 12 22 C11.4 16 8 12.6 2 12 C8 11.4 11.4 8 12 2 Z" fill={color} />
  </svg>
);

const SummaryCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const lm = useMemo(() => smoothedLandmarks("alex", t, fps), [t, fps]);
  if (t < T.summaryIn - 0.05 || t > T.summaryOut + 0.6 || !lm.inFront) return null;

  const { panelX, panelY } = panelPlacement("alex", lm);
  const enter = spring({ frame: frame - Math.round(T.summaryIn * fps), fps, config: { damping: 200, stiffness: 140, mass: 0.9 } });
  const out = interpolate(t, [T.summaryOut, T.summaryOut + 0.4], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.6, 1),
  });
  const opacity = (t >= T.summaryIn ? enter : 0) * out;
  if (opacity < 0.01) return null;

  // the "thinking" dots pulse until the summary resolves
  const resolved = smoothstep(T.summaryResolved, T.summaryResolved + 0.45, t);
  const dots = [0, 1, 2].map((i) => 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * 1.1 * t - i * 0.9), 2));
  const bodyH = 82;
  const cardW = 660;

  // stacked under the name panel, right edges aligned, extending away from Alex
  const left = panelX - cardW;
  const top = panelY + PANEL_H / 2 + 14;

  return (
    <div
      style={{
        ...cardStyle,
        left,
        top,
        width: cardW,
        padding: "14px 22px 16px 18px",
        opacity,
        translate: `0 ${(1 - enter) * 10}px`,
        scale: String(0.985 + 0.015 * enter),
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 24, fontWeight: 500, letterSpacing: "-0.005em", color: "#4a4b51" }}>
        <Sparkle size={18} color={ORANGE} />
        <span style={{ opacity: 1 - 0.9 * Math.sin(Math.PI * resolved) }}>{resolved < 0.5 ? "Summarizing conversation" : "Conversation summary"}</span>
        {resolved < 0.99 ? (
          <span style={{ display: "inline-flex", gap: 5, marginLeft: 2, opacity: 1 - resolved }}>
            {dots.map((d, i) => (
              <span key={i} style={{ width: 6, height: 6, borderRadius: 6, background: ORANGE, opacity: d, display: "inline-block" }} />
            ))}
          </span>
        ) : null}
      </div>
      <div style={{ height: resolved * bodyH, overflow: "hidden" }}>
        <div
          style={{
            paddingTop: 10,
            fontSize: 26,
            lineHeight: 1.3,
            fontWeight: 400,
            letterSpacing: "-0.003em",
            opacity: resolved,
            translate: `0 ${(1 - resolved) * 8}px`,
          }}
        >
          {CONVERSATION_SUMMARY}
        </div>
      </div>
    </div>
  );
};

const HandLandmarks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const conv = conversationState(t);
  const pts = useMemo(() => {
    if (conv.landmarks <= 0) return null;
    const pose = bodyPose("alex", t);
    return projectAt(t, rightHandLandmarks(pose));
  }, [t, conv.landmarks]);
  if (!pts || conv.landmarks <= 0.01) return null;
  const k = conv.landmarks;
  const inFront = pts.every((p) => p.inFront);
  if (!inFront) return null;

  // bounding box of the hand for a faint tracking frame
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = 26;
  const bx = Math.min(...xs) - pad;
  const by = Math.min(...ys) - pad;
  const bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const bh = Math.max(...ys) - Math.min(...ys) + pad * 2;

  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <g opacity={k}>
        <rect x={bx} y={by} width={bw} height={bh} rx={14} fill="none" stroke={GREEN} strokeWidth={1.5} strokeDasharray="6 7" opacity={0.55} />
        <text x={bx + 4} y={by - 10} fill={GREEN_DEEP} fontFamily={FONT} fontSize={22} fontWeight={500} letterSpacing="0.02em">
          HAND · PEACE SIGN
        </text>
        {HAND_EDGES.map(([a, b], i) => (
          <line
            key={i}
            x1={pts[a].x}
            y1={pts[a].y}
            x2={pts[b].x}
            y2={pts[b].y}
            stroke={GREEN}
            strokeWidth={2.8}
            strokeLinecap="round"
            opacity={smoothstep(0, 0.6, k - i * 0.012)}
          />
        ))}
        {pts.map((p, i) => {
          const pop = clamp01((k - i * 0.015) / 0.45);
          const r = 5.2 * (1.25 - 0.25 * pop);
          return <circle key={i} cx={p.x} cy={p.y} r={r} fill="#ffffff" stroke={GREEN_DEEP} strokeWidth={1.8} opacity={pop} />;
        })}
      </g>
    </svg>
  );
};

const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { flash } = conversationState(frame / fps);
  if (flash <= 0.005) return null;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, rgba(47, 201, 138, 0.1) 0%, rgba(47, 201, 138, 0.34) 60%, rgba(47, 201, 138, 0.7) 100%)`,
        opacity: flash,
        mixBlendMode: "normal",
      }}
    />
  );
};

const ConnectionBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < T.notifyIn || t > T.notifyOutEnd + 0.1) return null;
  const enter = spring({ frame: frame - Math.round(T.notifyIn * fps), fps, config: { damping: 18, stiffness: 170, mass: 0.8 } });
  const out = interpolate(t, [T.notifyOutStart, T.notifyOutEnd], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.6, 1),
  });
  const opacity = Math.min(enter * 1.4, 1) * out;
  const checkDraw = clamp01((t - T.notifyIn - 0.08) / 0.3);
  return (
    <div
      style={{
        ...cardStyle,
        left: "50%",
        top: "54%",
        translate: "-50% -50%",
        scale: String(0.94 + 0.06 * enter),
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "20px 34px 20px 24px",
        borderRadius: 18,
        border: `1px solid rgba(31, 157, 104, 0.35)`,
        boxShadow: "0 14px 44px rgba(30, 32, 40, 0.18), 0 0 0 6px rgba(47, 201, 138, 0.14)",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 52,
          background: GREEN,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
        }}
      >
        <svg width={30} height={30} viewBox="0 0 30 30">
          <path
            d="M7 15.5 L12.5 21 L23 9.5"
            fill="none"
            stroke="#ffffff"
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={30}
            strokeDashoffset={30 * (1 - checkDraw)}
          />
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, whiteSpace: "nowrap" }}>
        <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.1 }}>{CONNECTION_TITLE}</div>
        <div style={{ fontSize: 24, fontWeight: 400, color: "#5b5c62", letterSpacing: "0.002em" }}>{CONNECTION_DETAIL}</div>
      </div>
    </div>
  );
};

export const ConversationUI: React.FC = () => {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <Flash />
      <HandLandmarks />
      <SummaryCard />
      <ConnectionBar />
    </AbsoluteFill>
  );
};
