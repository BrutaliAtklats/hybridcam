export type BaseMode = "solid" | "baseRemoval";
export type BaseRemovalType = "edgeConnected" | "allFlat";
export type CombineMode = "mergeHigh" | "add" | "subtract" | "mergeLow";

export interface ReliefSettings {
  maxZMm: number;
  baseHeightMm: number;
  resolution: number; // 640, 768, 1024, 1280, 1536
  smoothPasses: number; // 0..6
  debandPasses: number; // 0..3
  detailProtection: number; // 0..1.0
  microContrast: number; // 0..1.0
  pillowRound: number; // 0..1.0
  gamma: number; // 0.4..2.5
  contrast: number; // 0.5..2.0
  sharpen: number; // 0..1.0
  invert: boolean;
  preserveAspect: boolean;
  tiltDeg: number;
  draftAngleDeg: number;
  baseMode: BaseMode;
  baseRemovalType: BaseRemovalType;
  baseThreshold: number; // 0.01..0.35
}

export interface PicturePlacement {
  offsetXMm: number;
  offsetYMm: number;
  scale: number;
  rotationDeg: number;
  flipX: boolean;
  flipY: boolean;
  edgeFade: number;
  shadowClip: number;
  highlightClip: number;
  brightness: number;
}

export interface RawDepthSource {
  width: number;
  height: number;
  data: Float32Array;
  label: string;
}

export interface PictureLayer {
  id: string;
  name: string;
  visible: boolean;
  combineMode: CombineMode;
  /** Layer height multiplier (0.1..1.5) */
  weight: number;
  source: RawDepthSource;
  placement: PicturePlacement;
}

export const DEFAULT_RELIEF_SETTINGS: ReliefSettings = {
  maxZMm: 8,
  baseHeightMm: 0,
  resolution: 640,
  smoothPasses: 0,
  debandPasses: 0,
  detailProtection: 0.45,
  microContrast: 0.2,
  pillowRound: 0,
  gamma: 1.0,
  contrast: 1.0,
  sharpen: 0.25,
  invert: false,
  preserveAspect: true,
  tiltDeg: 0,
  draftAngleDeg: 0,
  baseMode: "solid",
  baseRemovalType: "edgeConnected",
  baseThreshold: 0.08,
};

export const DEFAULT_PLACEMENT: PicturePlacement = {
  offsetXMm: 0,
  offsetYMm: 0,
  scale: 1.0,
  rotationDeg: 0,
  flipX: false,
  flipY: false,
  edgeFade: 0,
  shadowClip: 0,
  highlightClip: 1.0,
  brightness: 0,
};

export function createSampleDepthSource(size = 256): RawDepthSource {
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      const ny = (y / (size - 1)) * 2 - 1;
      const boxDist = Math.max(Math.abs(nx), Math.abs(ny));
      if (boxDist > 0.86) {
        data[y * size + x] = 1.0;
      } else if (boxDist > 0.78) {
        data[y * size + x] = 0.25;
      } else {
        const r = Math.sqrt(nx * nx + ny * ny);
        const angle = Math.atan2(ny, nx);
        const petals = 0.14 * Math.cos(angle * 8) * Math.exp(-r * 1.6);
        const dome = Math.max(0, Math.cos(r * 4.2) * Math.exp(-r * 1.3) * 0.72 + petals + 0.22);
        data[y * size + x] = Math.min(1, Math.max(0, dome));
      }
    }
  }
  return { width: size, height: size, data, label: "Built-in Rectangular Plaque" };
}

export function createBuiltInShapeSource(
  kind: "ovalDish" | "rectFrame" | "raisedDome",
  size = 256
): RawDepthSource {
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      const ny = (y / (size - 1)) * 2 - 1;
      let val = 0;
      if (kind === "ovalDish") {
        const r = Math.sqrt(nx * nx + ny * ny);
        val = r >= 0.92 ? 1.0 : 0.15 + 0.85 * Math.pow(r / 0.92, 2.2);
      } else if (kind === "rectFrame") {
        const b = Math.max(Math.abs(nx), Math.abs(ny));
        if (b > 0.88) val = 0.85;
        else if (b > 0.78) val = 1.0;
        else if (b > 0.72) val = 0.55;
        else val = 0.15;
      } else {
        const r = Math.sqrt(nx * nx + ny * ny);
        val = r >= 0.92 ? 0.0 : Math.sqrt(Math.max(0, 1 - (r / 0.92) * (r / 0.92)));
      }
      data[y * size + x] = Math.min(1, Math.max(0, val));
    }
  }
  const labels = {
    ovalDish: "Oval Recessed Dish",
    rectFrame: "Molded Rectangular Frame",
    raisedDome: "Smooth Raised Dome",
  };
  return { width: size, height: size, data, label: labels[kind] };
}

export function computePictureBoundsMm(
  src: RawDepthSource,
  plateWidthMm: number,
  plateDepthMm: number,
  placement: PicturePlacement,
  preserveAspect: boolean
): { minX: number; minY: number; maxX: number; maxY: number; picW: number; picH: number } {
  let fitW = plateWidthMm;
  let fitH = plateDepthMm;
  if (preserveAspect) {
    const srcAspect = src.width / Math.max(1, src.height);
    const plateAspect = plateWidthMm / Math.max(1, plateDepthMm);
    if (srcAspect > plateAspect) {
      fitH = plateWidthMm / srcAspect;
    } else {
      fitW = plateDepthMm * srcAspect;
    }
  }
  const picW = fitW * placement.scale;
  const picH = fitH * placement.scale;
  const minX = placement.offsetXMm - picW * 0.5;
  const maxX = placement.offsetXMm + picW * 0.5;
  const minY = placement.offsetYMm - picH * 0.5;
  const maxY = placement.offsetYMm + picH * 0.5;
  return { minX, minY, maxX, maxY, picW, picH };
}

export function computeCombinedBoundsMm(
  layers: PictureLayer[],
  plateWidthMm: number,
  plateDepthMm: number,
  preserveAspect: boolean
): { minX: number; minY: number; maxX: number; maxY: number; picW: number; picH: number } {
  const visible = layers.filter((l) => l.visible);
  if (visible.length === 0) {
    return {
      minX: -plateWidthMm * 0.5,
      minY: -plateDepthMm * 0.5,
      maxX: plateWidthMm * 0.5,
      maxY: plateDepthMm * 0.5,
      picW: plateWidthMm,
      picH: plateDepthMm,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of visible) {
    const b = computePictureBoundsMm(l.source, plateWidthMm, plateDepthMm, l.placement, preserveAspect);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return { minX, minY, maxX, maxY, picW: maxX - minX, picH: maxY - minY };
}

function cubicHermite(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const b = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
  const c = -0.5 * p0 + 0.5 * p2;
  const d = p1;
  return a * t * t * t + b * t * t + c * t + d;
}

function sampleBicubic(src: RawDepthSource, su: number, sv: number): number {
  const fx = su * (src.width - 1);
  const fy = sv * (src.height - 1);
  const x1 = Math.floor(fx);
  const y1 = Math.floor(fy);
  const tx = fx - x1;
  const ty = fy - y1;

  const getPx = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(src.width - 1, x));
    const cy = Math.max(0, Math.min(src.height - 1, y));
    return src.data[cy * src.width + cx];
  };

  const r0 = cubicHermite(getPx(x1 - 1, y1 - 1), getPx(x1, y1 - 1), getPx(x1 + 1, y1 - 1), getPx(x1 + 2, y1 - 1), tx);
  const r1 = cubicHermite(getPx(x1 - 1, y1), getPx(x1, y1), getPx(x1 + 1, y1), getPx(x1 + 2, y1), tx);
  const r2 = cubicHermite(getPx(x1 - 1, y1 + 1), getPx(x1, y1 + 1), getPx(x1 + 1, y1 + 1), getPx(x1 + 2, y1 + 1), tx);
  const r3 = cubicHermite(getPx(x1 - 1, y1 + 2), getPx(x1, y1 + 2), getPx(x1 + 1, y1 + 2), getPx(x1 + 2, y1 + 2), tx);

  return Math.min(1, Math.max(0, cubicHermite(r0, r1, r2, r3, ty)));
}

/**
 * Merge all visible `PictureLayer`s into one unified 3D relief heightfield grid (`0..1`),
 * applying each layer's transform, levels, edge fade, and combine mode (`MergeHigh`, `Add`, `Subtract`, `MergeLow`).
 */
export function processReliefLayers(
  layers: PictureLayer[],
  gridW: number,
  gridH: number,
  s: ReliefSettings,
  plateWidthMm = 200,
  plateDepthMm = 150,
  sculptDelta?: Float32Array
): Float32Array {
  const len = gridW * gridH;
  let grid = new Float32Array(len);
  const covered = new Uint8Array(len);

  const visibleLayers = layers.filter((l) => l.visible);

  for (const layer of visibleLayers) {
    const src = layer.source;
    const pl = layer.placement;
    const { picW, picH } = computePictureBoundsMm(
      src,
      plateWidthMm,
      plateDepthMm,
      pl,
      s.preserveAspect
    );
    const cx = pl.offsetXMm;
    const cy = pl.offsetYMm;
    const rotRad = -((pl.rotationDeg || 0) * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const fade = pl.edgeFade || 0;
    const sClip = pl.shadowClip || 0;
    const hClip = Math.max(sClip + 0.05, pl.highlightClip ?? 1.0);
    const bright = pl.brightness || 0;
    const weight = layer.weight ?? 1.0;

    for (let y = 0; y < gridH; y++) {
      const wy = (0.5 - y / Math.max(1, gridH - 1)) * plateDepthMm;
      for (let x = 0; x < gridW; x++) {
        const wx = (x / Math.max(1, gridW - 1) - 0.5) * plateWidthMm;
        const dx = wx - cx;
        const dy = wy - cy;
        const lx = dx * cosR - dy * sinR;
        const ly = dx * sinR + dy * cosR;

        let su = lx / Math.max(1e-6, picW) + 0.5;
        let sv = 0.5 - ly / Math.max(1e-6, picH);

        if (su < 0 || su > 1 || sv < 0 || sv > 1) {
          continue;
        }

        const rawSu = su;
        const rawSv = sv;
        if (pl.flipX) su = 1 - su;
        if (pl.flipY) sv = 1 - sv;

        let val = sampleBicubic(src, su, sv);
        val = (val - sClip) / (hClip - sClip) + bright;
        val = Math.min(1, Math.max(0, val)) * weight;

        if (fade > 0.005) {
          const edgeDist = Math.min(rawSu, 1 - rawSu, rawSv, 1 - rawSv);
          if (edgeDist < fade) {
            const t = edgeDist / fade;
            val *= t * t * (3 - 2 * t);
          }
        }

        const idx = y * gridW + x;
        if (covered[idx] === 0) {
          grid[idx] = layer.combineMode === "subtract" ? 0 : Math.min(1, Math.max(0, val));
          covered[idx] = 1;
        } else {
          grid[idx] = matchCombine(grid[idx], val, layer.combineMode);
        }
      }
    }
  }

  // Fill uncovered stock pixels & apply Shape Pillow Rounding + Contrast + Gamma
  const uncoveredVal = s.baseMode === "baseRemoval" ? 0.0 : 1.0;
  const pillow = s.pillowRound ?? 0;
  for (let i = 0; i < len; i++) {
    let v = covered[i] ? grid[i] : uncoveredVal;
    if (covered[i]) {
      if (s.invert) v = 1 - v;
      if (pillow > 0.01) {
        const rounded = Math.sin(v * Math.PI * 0.5);
        v = v * (1 - pillow) + rounded * pillow;
      }
      v = Math.min(1, Math.max(0, (v - 0.5) * s.contrast + 0.5));
      v = Math.pow(v, Math.max(0.1, s.gamma));
    }
    grid[i] = v;
  }

  // Bilateral JPG De-Blocking / De-Banding (removes compression artifacts on flat regions while keeping sharp edges)
  if ((s.debandPasses ?? 0) > 0) {
    const tmp = new Float32Array(len);
    for (let pass = 0; pass < s.debandPasses; pass++) {
      tmp.set(grid);
      for (let y = 1; y < gridH - 1; y++) {
        for (let x = 1; x < gridW - 1; x++) {
          const idx = y * gridW + x;
          const c = tmp[idx];
          let sum = c;
          let wSum = 1.0;
          for (const ni of [idx - 1, idx + 1, idx - gridW, idx + gridW]) {
            const diff = tmp[ni] - c;
            const w = Math.exp(-(diff * diff) * 140.0);
            sum += tmp[ni] * w;
            wSum += w;
          }
          grid[idx] = sum / wSum;
        }
      }
    }
  }

  // Gentle edge-preserving smoothing (25% blend per step, shielded by detailProtection)
  if (s.smoothPasses > 0) {
    const tmp = new Float32Array(len);
    const prev = new Float32Array(len);
    const prot = s.detailProtection ?? 0.45;
    for (let pass = 0; pass < s.smoothPasses; pass++) {
      prev.set(grid);
      for (let y = 0; y < gridH; y++) {
        const row = y * gridW;
        tmp[row] = grid[row];
        tmp[row + gridW - 1] = grid[row + gridW - 1];
        for (let x = 1; x < gridW - 1; x++) {
          tmp[row + x] = 0.25 * grid[row + x - 1] + 0.5 * grid[row + x] + 0.25 * grid[row + x + 1];
        }
      }
      for (let y = 1; y < gridH - 1; y++) {
        for (let x = 0; x < gridW; x++) {
          const idx = y * gridW + x;
          const blurred =
            0.25 * tmp[(y - 1) * gridW + x] + 0.5 * tmp[idx] + 0.25 * tmp[(y + 1) * gridW + x];
          const edgeMag = Math.abs(blurred - prev[idx]);
          const edgeShield = Math.exp(-edgeMag * (4.0 + prot * 28.0));
          const blend = 0.25 * (1.0 - prot * 0.75 * (1.0 - edgeShield));
          grid[idx] = prev[idx] + blend * (blurred - prev[idx]);
        }
      }
    }
  }

  // Unsharp-mask detail sharpening
  if (s.sharpen > 0.01) {
    const blurred = new Float32Array(grid);
    const tmp = new Float32Array(len);
    for (let y = 0; y < gridH; y++) {
      const row = y * gridW;
      tmp[row] = blurred[row];
      tmp[row + gridW - 1] = blurred[row + gridW - 1];
      for (let x = 1; x < gridW - 1; x++) {
        tmp[row + x] = 0.25 * blurred[row + x - 1] + 0.5 * blurred[row + x] + 0.25 * blurred[row + x + 1];
      }
    }
    for (let y = 1; y < gridH - 1; y++) {
      for (let x = 0; x < gridW; x++) {
        blurred[y * gridW + x] =
          0.25 * tmp[(y - 1) * gridW + x] + 0.5 * tmp[y * gridW + x] + 0.25 * tmp[(y + 1) * gridW + x];
      }
    }
    const amt = s.sharpen * 1.6;
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = Math.min(1, Math.max(0, grid[i] + amt * (grid[i] - blurred[i])));
    }
    grid = out;
  }

  // Local Micro-Contrast (Multi-pass wide high-pass detail boost for feathers/hair/engraving)
  if ((s.microContrast ?? 0) > 0.01) {
    const wide = new Float32Array(grid);
    const tmp = new Float32Array(len);
    for (let p = 0; p < 4; p++) {
      for (let y = 0; y < gridH; y++) {
        const row = y * gridW;
        tmp[row] = wide[row];
        tmp[row + gridW - 1] = wide[row + gridW - 1];
        for (let x = 1; x < gridW - 1; x++) {
          tmp[row + x] = 0.25 * wide[row + x - 1] + 0.5 * wide[row + x] + 0.25 * wide[row + x + 1];
        }
      }
      for (let y = 1; y < gridH - 1; y++) {
        for (let x = 0; x < gridW; x++) {
          wide[y * gridW + x] =
            0.25 * tmp[(y - 1) * gridW + x] + 0.5 * tmp[y * gridW + x] + 0.25 * tmp[(y + 1) * gridW + x];
        }
      }
    }
    const mc = s.microContrast * 1.35;
    for (let i = 0; i < len; i++) {
      grid[i] = Math.min(1, Math.max(0, grid[i] + mc * (grid[i] - wide[i])));
    }
  }

  // Apply 3D Viewport Sculpting Delta (if any)
  if (sculptDelta && sculptDelta.length === len) {
    for (let i = 0; i < len; i++) {
      grid[i] = Math.min(1, Math.max(0, grid[i] + sculptDelta[i]));
    }
  }

  // Draft Angle / Side-Wall Taper: limits steepness of vertical cliffs for clean CNC machining
  if ((s.draftAngleDeg || 0) > 0.5 && s.maxZMm > 0) {
    const cellMm = Math.max(0.1, plateWidthMm / Math.max(1, gridW - 1));
    const slopeRad = ((90 - Math.min(45, s.draftAngleDeg)) * Math.PI) / 180;
    const maxStepNorm = (cellMm * Math.tan(slopeRad)) / s.maxZMm;
    for (let pass = 0; pass < 4; pass++) {
      for (let y = 1; y < gridH - 1; y++) {
        for (let x = 1; x < gridW - 1; x++) {
          const i = y * gridW + x;
          const maxN = Math.max(grid[i - 1], grid[i + 1], grid[i - gridW], grid[i + gridW]);
          if (maxN - grid[i] > maxStepNorm) {
            grid[i] = maxN - maxStepNorm;
          }
        }
      }
      for (let y = gridH - 2; y >= 1; y--) {
        for (let x = gridW - 2; x >= 1; x--) {
          const i = y * gridW + x;
          const maxN = Math.max(grid[i - 1], grid[i + 1], grid[i - gridW], grid[i + gridW]);
          if (maxN - grid[i] > maxStepNorm) {
            grid[i] = maxN - maxStepNorm;
          }
        }
      }
    }
  }

  return grid;
}

function matchCombine(a: number, b: number, mode: CombineMode): number {
  switch (mode) {
    case "mergeHigh":
      return Math.max(a, b);
    case "add":
      return Math.min(1, a + b);
    case "subtract":
      return Math.max(0, a - b);
    case "mergeLow":
      return Math.min(a, b);
  }
}

export function computeBaseMask(
  grid: Float32Array,
  gridW: number,
  gridH: number,
  s: ReliefSettings
): Uint8Array | undefined {
  if (s.baseMode !== "baseRemoval") return undefined;
  const len = gridW * gridH;
  const mask = new Uint8Array(len);
  mask.fill(1);
  const thresh = s.baseThreshold ?? 0.08;

  if (s.baseRemovalType === "allFlat") {
    for (let i = 0; i < len; i++) {
      if (grid[i] <= thresh) mask[i] = 0;
    }
    return mask;
  }

  const queue = new Int32Array(len);
  let head = 0;
  let tail = 0;

  const tryPush = (idx: number) => {
    if (mask[idx] === 1 && grid[idx] <= thresh) {
      mask[idx] = 0;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < gridW; x++) {
    tryPush(x);
    tryPush((gridH - 1) * gridW + x);
  }
  for (let y = 1; y < gridH - 1; y++) {
    tryPush(y * gridW);
    tryPush(y * gridW + (gridW - 1));
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % gridW;
    const y = (idx - x) / gridW;
    if (x > 0) tryPush(idx - 1);
    if (x + 1 < gridW) tryPush(idx + 1);
    if (y > 0) tryPush(idx - gridW);
    if (y + 1 < gridH) tryPush(idx + gridW);
  }

  return mask;
}

export function computeAutoLevelTiltDeg(
  heights: Float32Array,
  gridW: number,
  gridH: number,
  widthMm: number,
  maxZMm: number
): number {
  let sumX = 0;
  let sumZ = 0;
  let sumXX = 0;
  let sumXZ = 0;
  const n = gridW * gridH;
  if (n < 4 || widthMm <= 0) return 0;

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const xMm = (x / Math.max(1, gridW - 1) - 0.5) * widthMm;
      const zMm = heights[y * gridW + x] * maxZMm;
      sumX += xMm;
      sumZ += zMm;
      sumXX += xMm * xMm;
      sumXZ += xMm * zMm;
    }
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-9) return 0;
  const slope = (n * sumXZ - sumX * sumZ) / denom;
  const deg = (-Math.atan(slope) * 180) / Math.PI;
  return Number(deg.toFixed(2));
}
