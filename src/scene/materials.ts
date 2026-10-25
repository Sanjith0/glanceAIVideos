// Canvas-generated textures and shared PBR materials. Everything is created
// once per module load; nothing here depends on time.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { prng } from "../film/math";

export const PALETTE = {
  ivory: "#f3eee4",
  ivoryDeep: "#e9e0d0",
  plaster: ["#ece2d1", "#e1d4bd", "#f0e9dc", "#d6c8b2", "#e4d6c0", "#ded0ba", "#cfc3ad"],
  trim: "#f7f4ee",
  charcoal: "#2e2f33",
  charcoalSoft: "#3c3d42",
  sidewalk: "#c9c3b8",
  curb: "#b8b2a7",
  asphalt: "#5b5c60",
  orange: "#e4702c",
  hazeSky: "#dfe4e8",
  glass: "#aab7c1",
  foliage: ["#6e7c58", "#788462", "#667551"],
  trunk: "#5c4d40",
};

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

function finish(c: HTMLCanvasElement, repeatX = 1, repeatY = 1, srgb = true) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, rnd: () => number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rnd() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

/** Pavement: warm grey with scoring lines; one tile = 2.5 m × 2.5 m. */
export function concreteTexture(): THREE.Texture {
  const s = 512;
  const c = canvas(s, s);
  const ctx = c.getContext("2d")!;
  const rnd = prng(11);
  ctx.fillStyle = "#cfc9be";
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, s, 9000, rnd, 0.08);
  // soft blotches
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(rnd() * s, rnd() * s, 0, rnd() * s, rnd() * s, 60 + rnd() * 120);
    g.addColorStop(0, `rgba(80,70,60,${0.04 + rnd() * 0.05})`);
    g.addColorStop(1, "rgba(80,70,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  // scoring lines (expansion joints) – two per tile
  ctx.strokeStyle = "rgba(60,55,50,0.45)";
  ctx.lineWidth = 3;
  for (const p of [0.5, 1.0]) {
    ctx.beginPath();
    ctx.moveTo(0, p * s - 1);
    ctx.lineTo(s, p * s - 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p * s - 1, 0);
    ctx.lineTo(p * s - 1, s);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  for (const p of [0.5, 1.0]) {
    ctx.beginPath();
    ctx.moveTo(0, p * s + 1.5);
    ctx.lineTo(s, p * s + 1.5);
    ctx.stroke();
  }
  return finish(c, 2, 40);
}

/** Road: dark asphalt with a faint dashed centre line; tile = 10 m × 4 m. */
export function asphaltTexture(): THREE.Texture {
  const w = 512;
  const h = 256;
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  const rnd = prng(23);
  ctx.fillStyle = "#5e5f63";
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 7000, rnd, 0.12);
  for (let i = 0; i < 30; i++) {
    const g = ctx.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, 40 + rnd() * 100);
    g.addColorStop(0, `rgba(20,20,22,${0.05 + rnd() * 0.08})`);
    g.addColorStop(1, "rgba(20,20,22,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  // centre dashes (yellow, worn)
  ctx.fillStyle = "rgba(214,186,110,0.55)";
  ctx.fillRect(w / 2 - 4, 20, 8, 110);
  return finish(c, 1, 25);
}

/** Painted horizontal siding: a near-white tile with faint board lines and
 *  grain, multiplied onto each building's own colour. One tile = 2.4 m. */
let sidingBase: THREE.Texture | null = null;
export function sidingTexture(): THREE.Texture {
  if (sidingBase) return sidingBase.clone();
  const s = 512;
  const c = canvas(s, s);
  const ctx = c.getContext("2d")!;
  const rnd = prng(31);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, s, 5000, rnd, 0.035);
  const boards = 12;
  for (let i = 0; i < boards; i++) {
    const y = Math.round((i / boards) * s);
    ctx.fillStyle = "rgba(60,50,40,0.11)";
    ctx.fillRect(0, y, s, 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(0, y + 2, s, 2);
    // slight tonal variation per board
    ctx.fillStyle = `rgba(80,70,55,${rnd() * 0.035})`;
    ctx.fillRect(0, y + 4, s, s / boards - 4);
  }
  sidingBase = finish(c, 1, 1);
  return sidingBase.clone();
}

/** A fine grey noise used as a roughness map for plaster and fabric. */
export function noiseTexture(): THREE.Texture {
  const s = 256;
  const c = canvas(s, s);
  const ctx = c.getContext("2d")!;
  const rnd = prng(5);
  const img = ctx.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const v = 170 + rnd() * 70;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, 6, 6, false);
}

/** A shop sign / awning valance with restrained lettering. */
export function signTexture(text: string, bg: string, fg: string, w = 1024, h = 192): THREE.Texture {
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `600 ${Math.floor(h * 0.42)}px Geist, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // letter-spacing by hand
  const spacing = h * 0.08;
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + spacing;
  let x = w / 2 - total / 2;
  for (const ch of text) {
    const cw = ctx.measureText(ch).width;
    ctx.fillText(ch, x + cw / 2, h / 2 + h * 0.02);
    x += cw + spacing;
  }
  return finish(c, 1, 1);
}

/** Soft radial gradient for contact shadows under the characters. */
export function blobShadowTexture(): THREE.Texture {
  const s = 256;
  const c = canvas(s, s);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.45, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Shared geometries (rounded forms are the visual signature of the piece)
// ---------------------------------------------------------------------------
const geoCache = new Map<string, THREE.BufferGeometry>();
export function roundedBox(w: number, h: number, d: number, r: number, segments = 3): THREE.BufferGeometry {
  const key = `${w}|${h}|${d}|${r}|${segments}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, segments, Math.min(r, w / 2, h / 2, d / 2));
    geoCache.set(key, g);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------
let noise: THREE.Texture | null = null;
const getNoise = () => (noise ??= noiseTexture());

export function plasterMaterial(color: string, roughness = 0.92): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    roughnessMap: getNoise(),
    envMapIntensity: 0.6,
  });
}

export function paintMaterial(color: string, roughness = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, envMapIntensity: 0.8 });
}

export function metalMaterial(color: string, roughness = 0.45): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.85, envMapIntensity: 1.0 });
}

export function glassMaterial(color = PALETTE.glass): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.15, envMapIntensity: 0.9 });
}

export function fabricMaterial(color: string, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    roughnessMap: getNoise(),
    envMapIntensity: 0.5,
  });
}

export function skinMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0, envMapIntensity: 0.55 });
}

export function hairMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.9 });
}

/** Satin black acetate for the glasses frame. */
export function acetateMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: "#17171a",
    roughness: 0.32,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.35,
    envMapIntensity: 1.3,
  });
}

export function lensMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: "#b9c6d2",
    roughness: 0.04,
    metalness: 0.0,
    transparent: true,
    opacity: 0.1,
    envMapIntensity: 1.6,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
