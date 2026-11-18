export type SculptBrushKind = "raise" | "lower" | "smooth" | "flatten" | "pinch" | "inflate";
export type SculptFalloff = "smooth" | "sharp" | "flat";

export interface SculptParams {
  kind: SculptBrushKind;
  falloff: SculptFalloff;
  radiusMm: number;
  strength: number; // 0.05..1.0
  /** Target normalized height (0..1) captured at stroke start for Flatten brush */
  flattenTargetNorm: number;
}

function evalFalloff(dNorm: number, falloff: SculptFalloff): number {
  const t = Math.max(0, Math.min(1, 1 - dNorm));
  switch (falloff) {
    case "smooth":
      return t * t * (3 - 2 * t);
    case "sharp":
      return t * t * t;
    case "flat":
      return t > 0.15 ? 1.0 : t / 0.15;
  }
}

/**
 * Apply a 3D sculpting brush stroke onto `sculptDelta` using the current combined `currentHeights`
 * as reference, returning a new `Float32Array` for `sculptDelta`.
 */
export function apply3dSculptBrush(
  sculptDelta: Float32Array,
  currentHeights: Float32Array,
  gridW: number,
  gridH: number,
  plateWidthMm: number,
  plateDepthMm: number,
  hitXMm: number,
  hitYMm: number,
  params: SculptParams
): Float32Array {
  const next = new Float32Array(sculptDelta);
  const rxPx = (params.radiusMm / Math.max(1e-6, plateWidthMm)) * (gridW - 1);
  const ryPx = (params.radiusMm / Math.max(1e-6, plateDepthMm)) * (gridH - 1);

  const cxPx = ((hitXMm + plateWidthMm * 0.5) / Math.max(1e-6, plateWidthMm)) * (gridW - 1);
  const cyPx = ((0.5 - hitYMm / Math.max(1e-6, plateDepthMm)) * (gridH - 1));

  const x0 = Math.max(1, Math.floor(cxPx - rxPx));
  const x1 = Math.min(gridW - 2, Math.ceil(cxPx + rxPx));
  const y0 = Math.max(1, Math.floor(cyPx - ryPx));
  const y1 = Math.min(gridH - 2, Math.ceil(cyPx + ryPx));

  const amt = params.strength * 0.08;

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = (px - cxPx) / Math.max(1, rxPx);
      const dy = (py - cyPx) / Math.max(1, ryPx);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;

      const w = evalFalloff(d, params.falloff);
      const idx = py * gridW + px;
      const curH = currentHeights[idx];

      switch (params.kind) {
        case "raise":
          next[idx] = Math.min(1, next[idx] + w * amt);
          break;
        case "lower":
          next[idx] = Math.max(-1, next[idx] - w * amt);
          break;
        case "smooth": {
          const avg =
            0.25 *
            (currentHeights[idx - 1] +
              currentHeights[idx + 1] +
              currentHeights[idx - gridW] +
              currentHeights[idx + gridW]);
          next[idx] += (avg - curH) * w * params.strength * 0.45;
          break;
        }
        case "flatten": {
          next[idx] += (params.flattenTargetNorm - curH) * w * params.strength * 0.5;
          break;
        }
        case "pinch": {
          // Pull height toward sharp ridge/crease along radial direction
          const stepX = Math.round(dx * 1.5);
          const stepY = Math.round(dy * 1.5);
          const sampleIdx = Math.max(0, Math.min(gridW * gridH - 1, (py - stepY) * gridW + (px - stepX)));
          next[idx] += (currentHeights[sampleIdx] - curH) * w * params.strength * 0.4;
          break;
        }
        case "inflate": {
          // Boost local convexities outward
          next[idx] = Math.min(1, next[idx] + w * amt * (0.4 + curH * 0.9));
          break;
        }
      }
    }
  }
  return next;
}
