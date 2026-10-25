# Glance — 30-second launch film

A first-person walk down a San Francisco sidewalk, built as a Remotion project
with Three.js (via `@remotion/three`) for the street, the two passers-by, the
smart glasses and the camera; Remotion drives timing, the perception blur,
the recognition overlays, the closing wordmark, the audio and the MP4 export.

Everything animated derives from the frame number, so Studio preview and the
rendered file match frame for frame.

## Run it

```bash
npm install
npx remotion studio          # interactive preview (composition "GlanceFilm")
npx remotion render          # 1920×1080 · 30 fps · 900 frames · H.264 → out/glance.mp4
```

`remotion.config.ts` is set up for headless cloud rendering (system Chrome at
`/opt/google/chrome/chrome`, software WebGL via `--gl=swangle`, concurrency 1).
On a laptop with a GPU, point `REMOTION_BROWSER` at your Chrome or delete the
`setBrowserExecutable` / `setChromiumOpenGlRenderer` lines and raise the
concurrency.

To regenerate the synthesized audio stems:

```bash
npx tsx scripts/make-audio.ts   # writes public/audio/*.wav
```

## Where things live

| Path | What |
| --- | --- |
| `src/film/timeline.ts` | **The timeline.** Story beats (`T`), camera pose, glasses/hands pose, blur curve, the pair's path with its stop-and-go speed profile, the conversation / peace-sign / flash states, the exact overlay strings. |
| `src/film/gait.ts` | Walking and standing: feet planted at fixed world positions on the path, two-bone leg solve, the closing step when they stop, arm counter-swing and talking gestures, the peace-sign hand pose, the 21 MediaPipe-style hand landmarks. |
| `src/film/math.ts` | Easing, keyframe tracks, closed-form damped spring, seeded PRNG. |
| `src/scene/City.ts` | Procedural street, buildings (bays, cornices, storefronts, canvas-textured signs), furniture, parked cars, downhill blocks, downtown skyline with the Transamerica silhouette, sky dome + environment map. |
| `src/scene/Person.tsx` | The articulated stylised characters (Alex, Kim) — rounded forms, clothing layers, hair, contact shadows. |
| `src/scene/Glasses.tsx` | Satin-acetate rounded smart glasses (extruded rims, lenses, temples, camera dot) and the viewer's hands, rigged to the camera. |
| `src/scene/Street.tsx` | Lights, fog, env map, camera rig, moving traffic; composes the scene inside `<ThreeCanvas>`. |
| `src/overlays/Recognition.tsx` | Brackets, single orange scan pass, name/title panels with damped tracking and edge-aware fades. |
| `src/overlays/ConversationUI.tsx` | The conversation layer: summary card (thinking dots → summary), hand-landmark skeleton, the green field-of-view flash, the “New connection made” bar. |
| `src/overlays/landmarks.ts` | Shared projected/damped body landmarks and panel placement. |
| `src/overlays/Wordmark.tsx` | Ivory dissolve and the “Glance.” wordmark. |
| `src/GlanceFilm.tsx` | Layer stack: bled 3D canvas with CSS defocus → overlays → wordmark → audio stems. |
| `scripts/make-audio.ts` | Synthesizes ambience, footsteps (timed from the gait), glasses clicks, recognition cues and the closing pad from the same timeline. |
| `scripts/ik-test.ts` | Sanity check that the leg solve lands on its targets and planted feet never slide. |

## Timeline (seconds)

| Beat | Time |
| --- | --- |
| Anonymous, defocused street; glance across the street | 0.0 – 3.0 |
| Stop; hands lift the glasses, push them on; focus pull | 3.0 – 4.95 |
| Recognition: Alex, then Kim 0.25 s later | 5.05 – 6.8 |
| Hold with both panels readable | 6.8 – 9.3 |
| The pair slows, stops, Alex turns to the viewer | 9.3 – 11.0 |
| Conversation (mouth, gestures); “Summarizing conversation…” → summary | 11.1 – 15.35 |
| Peace sign; hand landmarks tracked | 15.4 – 17.5 |
| Green field-of-view flash; “New connection made” bar | 16.35 – 19.95 |
| They walk on and pass on the viewer's right | 19.2 – 23.0 |
| Turn forward, tilt up to the skyline | 23.2 – 25.0 |
| Hand reaches; glasses off; blur returns | 25.0 – 27.1 |
| Ivory dissolve; “Glance.” in, hold, out | 27.15 – 29.6 |

## Notes

- Geist (SIL OFL) is bundled under `public/fonts`; license in `public/fonts/LICENSE-Geist.txt`.
- The audio is fully synthesized (no sampled recordings) — quiet city bed,
  footsteps (they stop and restart with the gait), acetate clicks, the two
  recognition chimes, UI ticks, the connection chime and an F add9 pad.
- Alex and Kim are fictional; the panels are illustrative concept overlays.
