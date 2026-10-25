import React from "react";
import { Composition } from "remotion";
import { GlanceFilm } from "./GlanceFilm";
import { DURATION_FRAMES, FPS, HEIGHT, WIDTH } from "./film/timeline";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="GlanceFilm"
      component={GlanceFilm}
      durationInFrames={DURATION_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
