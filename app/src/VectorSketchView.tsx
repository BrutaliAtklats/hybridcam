import React, { useEffect, useRef, useState } from "react";
import { JobConfig } from "./camEngine";
import { shapeToPolylineMm, VectorRole, VectorShape, VectorShapeKind } from "./vectorSketch";

export type SketchToolMode =
  | "select"
  | "rect"
  | "centerRect"
  | "circle"
  | "slot"
  | "polygon"
  | "polyline"
  | "arc"
  | "spline"
  | "trim"
  | "dimension";

interface Props {
  job: JobConfig;
  shapes: VectorShape[];
  activeShapeId: string;
  toolMode: SketchToolMode;
  snapToGrid: boolean;
  snapStepMm?: number;
  showDimensions?: boolean;
  sketchPlaneLabel?: string;
  referenceBodies?: Array<{ xMm: number; yMm: number; widthMm: number; depthMm: number; isRound: boolean; name: string }>;
  onSelectShape: (id: string) => void;
  onAddShape: (shape: VectorShape) => void;
  onUpdateShape: (id: string, patch: Partial<VectorShape>) => void;
  onDeleteShape?: (id: string) => void;
  onSketchContextMenu?: (clientX: number, clientY: number) => void;
}

interface PendingShapeDim {
  x0: number;
  y0: number;
  dirX: number;
  dirY: number;
  tool: SketchToolMode;
  wStr: string;
  hStr: string;
  sidesStr: string;
}

type SnapKind = "none" | "origin" | "endpoint" | "midpoint" | "center" | "horiz" | "vert" | "perp" | "grid";

interface SnapInference {
  x: number;
  y: number;
  kind: SnapKind;
  guideFrom?: [number, number];
  perpCorner?: [number, number];
  perpPrev?: [number, number];
}

const ROLE_COLORS: Record<VectorRole, string> = {
  cutout: "var(--hc-accent-secondary, #38bdf8)",
  carve: "#fbbf24",
  vcarve: "#f472b6",
  model3d: "#4ade80",
};

export const VectorSketchView: React.FC<Props> = ({
  job,
  shapes,
  activeShapeId,
  toolMode,
  snapToGrid,
  snapStepMm = 5,
  showDimensions = true,
  sketchPlaneLabel,
  referenceBodies = [],
  onSelectShape,
  onAddShape,
  onUpdateShape,
  onDeleteShape,
  onSketchContextMenu,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewZoom, setViewZoom] = useState(1.0);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [draftRect, setDraftRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [pendingDim, setPendingDim] = useState<PendingShapeDim | null>(null);
  const [draftPoly, setDraftPoly] = useState<[number, number][]>([]);
  const [hoverPt, setHoverPt] = useState<[number, number] | null>(null);
  const [snapInfo, setSnapInfo] = useState<SnapInference | null>(null);
  const dragState = useRef<"none" | "move" | "draw" | "pan">("none");
  const lastMouse = useRef({ x: 0, y: 0 });
  const rightClickStart = useRef<{ x: number; y: number } | null>(null);
  const drawOrigin = useRef<{ x: number; y: number } | null>(null);
  const moveStart = useRef<{ id: string; rawX: number; rawY: number; shapeX: number; shapeY: number } | null>(null);
  const widthInputRef = useRef<HTMLInputElement | null>(null);
  const heightInputRef = useRef<HTMLInputElement | null>(null);
  const sidesInputRef = useRef<HTMLInputElement | null>(null);
  const isPendingOpen = pendingDim !== null;

  useEffect(() => {
    if (isPendingOpen) {
      const id = window.setTimeout(() => {
        widthInputRef.current?.focus();
        widthInputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [isPendingOpen]);

  useEffect(() => {
    setPendingDim(null);
    setDraftRect(null);
    setDraftPoly([]);
  }, [toolMode]);

  // Enter / Escape finishes active Line or Spline chain just like Autodesk Fusion 360
  useEffect(() => {
    if (draftPoly.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (draftPoly.length >= 2) finishPolyline();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (draftPoly.length >= 2) finishPolyline();
        else setDraftPoly([]);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [draftPoly, toolMode]);

  const getScalePxPerMm = (cw: number, ch: number) =>
    Math.min((cw - 80) / Math.max(1, job.widthMm), (ch - 80) / Math.max(1, job.depthMm)) * viewZoom;

  const getAdaptiveGridMm = (pxPerMm: number): { majorMm: number; minorMm: number } => {
    const candidates = [0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500];
    let majorMm = 500;
    for (const c of candidates) {
      if (c * pxPerMm >= 55) {
        majorMm = c;
        break;
      }
    }
    const minorMm = majorMm === 25 ? 5 : Number((majorMm / 5).toFixed(3));
    return { majorMm, minorMm };
  };

  const snap = (v: number) => (snapToGrid ? Math.round(v / snapStepMm) * snapStepMm : v);

  // Fusion 360-style Smart Inference & Snap Resolver (Origin, Endpoint, Midpoint, Center, H/V, 90° Perp, Grid)
  const resolveInference = (rawX: number, rawY: number): SnapInference => {
    const canvas = canvasRef.current;
    const pxPerMm = canvas ? getScalePxPerMm(canvas.width, canvas.height) : 4;
    const tolMm = Math.max(1.2, 11 / Math.max(0.2, pxPerMm));

    // 1. Origin (0, 0)
    if (Math.hypot(rawX, rawY) <= tolMm) {
      return { x: 0, y: 0, kind: "origin" };
    }

    // 2. Existing shape endpoints, midpoints, and centers (+ stock corners/midpoints)
    let bestPt: SnapInference | null = null;
    let bestDist = tolMm;

    const consider = (x: number, y: number, kind: SnapKind) => {
      const d = Math.hypot(rawX - x, rawY - y);
      if (d < bestDist) {
        bestDist = d;
        bestPt = { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), kind };
      }
    };

    // Stock midpoints & corners
    const hw = job.widthMm * 0.5;
    const hd = job.depthMm * 0.5;
    consider(0, hd, "midpoint");
    consider(0, -hd, "midpoint");
    consider(-hw, 0, "midpoint");
    consider(hw, 0, "midpoint");
    consider(-hw, -hd, "endpoint");
    consider(hw, -hd, "endpoint");
    consider(hw, hd, "endpoint");
    consider(-hw, hd, "endpoint");

    // First point of active polyline (to snap-close loop!)
    if (draftPoly.length >= 2) {
      consider(draftPoly[0][0], draftPoly[0][1], "endpoint");
    }

    for (const s of shapes) {
      if (!s.visible) continue;
      consider(s.xMm, s.yMm, "center");
      const pts = shapeToPolylineMm(s);
      if (pts.length >= 2 && pts.length <= 16) {
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          consider(a[0], a[1], "endpoint");
          if (s.kind !== "polyline" || i < pts.length - 1) {
            consider((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, "midpoint");
          }
        }
      } else if (pts.length > 16) {
        // Circle/slot quadrant midpoints
        consider(s.xMm - s.widthMm * 0.5, s.yMm, "midpoint");
        consider(s.xMm + s.widthMm * 0.5, s.yMm, "midpoint");
        consider(s.xMm, s.yMm - s.heightMm * 0.5, "midpoint");
        consider(s.xMm, s.yMm + s.heightMm * 0.5, "midpoint");
      }
    }

    if (bestPt) return bestPt;

    // 3. Polyline / Spline Horizontal, Vertical & 90° Right-Angle Perpendicular Inference
    if ((toolMode === "polyline" || toolMode === "spline") && draftPoly.length > 0) {
      const prev = draftPoly[draftPoly.length - 1];
      const dx = rawX - prev[0];
      const dy = rawY - prev[1];
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        // Check 90° perpendicular to previous segment first
        if (draftPoly.length >= 2) {
          const prev2 = draftPoly[draftPoly.length - 2];
          const vx = prev[0] - prev2[0];
          const vy = prev[1] - prev2[1];
          const vlen = Math.hypot(vx, vy);
          if (vlen > 0.5) {
            const ux = vx / vlen;
            const uy = vy / vlen;
            // Perpendicular unit vectors: (-uy, ux) and (uy, -ux)
            const dot = (dx * ux + dy * uy) / len;
            if (Math.abs(dot) < 0.085) {
              const projPerp = dx * -uy + dy * ux;
              const sx = Number((prev[0] + -uy * projPerp).toFixed(2));
              const sy = Number((prev[1] + ux * projPerp).toFixed(2));
              return { x: sx, y: sy, kind: "perp", guideFrom: prev, perpCorner: prev, perpPrev: prev2 };
            }
          }
        }
        // Horizontal (0° / 180°)
        if (Math.abs(dy) / len < 0.085) {
          return { x: Number(snap(rawX).toFixed(2)), y: prev[1], kind: "horiz", guideFrom: prev };
        }
        // Vertical (90° / 270°)
        if (Math.abs(dx) / len < 0.085) {
          return { x: prev[0], y: Number(snap(rawY).toFixed(2)), kind: "vert", guideFrom: prev };
        }
      }
    }

    // 4. Adaptive Grid Snap (magnet-snaps to the exact visible minor grid intersections at every zoom level!)
    if (snapToGrid) {
      const { minorMm } = getAdaptiveGridMm(pxPerMm);
      const step = minorMm > 0 ? minorMm : snapStepMm;
      return {
        x: Number((Math.round(rawX / step) * step).toFixed(3)),
        y: Number((Math.round(rawY / step) * step).toFixed(3)),
        kind: "grid",
      };
    }
    return { x: Number(rawX.toFixed(2)), y: Number(rawY.toFixed(2)), kind: "none" };
  };

  const screenToWorld = (clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const pxPerMm = getScalePxPerMm(canvas.width, canvas.height);
    const cx = canvas.width * 0.5 + viewPan.x;
    const cy = canvas.height * 0.5 + viewPan.y;
    return [(mx - cx) / pxPerMm, -(my - cy) / pxPerMm];
  };

  const worldToScreen = (wx: number, wy: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 100, y: 100 };
    const pxPerMm = getScalePxPerMm(canvas.width, canvas.height);
    const cx = canvas.width * 0.5 + viewPan.x;
    const cy = canvas.height * 0.5 + viewPan.y;
    return { x: cx + wx * pxPerMm, y: cy - wy * pxPerMm };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = Math.max(300, Math.floor(rect.width));
      canvas.height = Math.max(300, Math.floor(rect.height));
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const pxPerMm = getScalePxPerMm(cw, ch);
    const cx = cw * 0.5 + viewPan.x;
    const cy = ch * 0.5 + viewPan.y;

    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, cw, ch);

    const sw = job.widthMm * pxPerMm;
    const sh = job.depthMm * pxPerMm;
    const sx = cx - sw * 0.5;
    const sy = cy - sh * 0.5;

    ctx.fillStyle = "#141a24";
    ctx.fillRect(sx, sy, sw, sh);

    // Fusion 360-style Adaptive Major / Minor Grid (auto-scales with zoom across full canvas)
    const { majorMm, minorMm } = getAdaptiveGridMm(pxPerMm);
    const minWorldX = -cx / pxPerMm;
    const maxWorldX = (cw - cx) / pxPerMm;
    const minWorldY = -(ch - cy) / pxPerMm;
    const maxWorldY = cy / pxPerMm;

    if (minorMm * pxPerMm >= 8) {
      ctx.strokeStyle = "rgba(148, 163, 184, 0.065)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startX = Math.floor(minWorldX / minorMm) * minorMm;
      for (let wx = startX; wx <= maxWorldX; wx += minorMm) {
        const px = cx + wx * pxPerMm;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, ch);
      }
      const startY = Math.floor(minWorldY / minorMm) * minorMm;
      for (let wy = startY; wy <= maxWorldY; wy += minorMm) {
        const py = cy - wy * pxPerMm;
        ctx.moveTo(0, py);
        ctx.lineTo(cw, py);
      }
      ctx.stroke();
    }

    if (majorMm * pxPerMm >= 12) {
      ctx.strokeStyle = "rgba(148, 163, 184, 0.19)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startX = Math.floor(minWorldX / majorMm) * majorMm;
      for (let wx = startX; wx <= maxWorldX; wx += majorMm) {
        const px = cx + wx * pxPerMm;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, ch);
      }
      const startY = Math.floor(minWorldY / majorMm) * majorMm;
      for (let wy = startY; wy <= maxWorldY; wy += majorMm) {
        const py = cy - wy * pxPerMm;
        ctx.moveTo(0, py);
        ctx.lineTo(cw, py);
      }
      ctx.stroke();
    }

    // Subtle Fusion-style Origin X (red) and Y (green) center axes
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(239, 68, 68, 0.32)";
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(cw, cy);
    ctx.stroke();
    ctx.strokeStyle = "rgba(34, 197, 94, 0.32)";
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, ch);
    ctx.stroke();

    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);

    // Draw subtle ghost silhouettes of 3D bodies under the sketch plane (like Fusion 360 face sketching!)
    for (const rb of referenceBodies) {
      const bx = cx + (rb.xMm - rb.widthMm * 0.5) * pxPerMm;
      const by = cy - (rb.yMm + rb.depthMm * 0.5) * pxPerMm;
      const bw = rb.widthMm * pxPerMm;
      const bh = rb.depthMm * pxPerMm;
      ctx.save();
      ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
      ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
      ctx.lineWidth = 1.4;
      if (rb.isRound) {
        ctx.beginPath();
        ctx.ellipse(bx + bw * 0.5, by + bh * 0.5, Math.max(1, bw * 0.5), Math.max(1, bh * 0.5), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
      }
      ctx.restore();
    }

    // Draw all vector shapes
    for (const shItem of shapes) {
      if (!shItem.visible) continue;
      const pts = shapeToPolylineMm(shItem);
      if (pts.length < 2) continue;
      const isSelected = shItem.id === activeShapeId;
      const color = ROLE_COLORS[shItem.role];

      ctx.save();
      ctx.beginPath();
      pts.forEach(([wx, wy], i) => {
        const px = cx + wx * pxPerMm;
        const py = cy - wy * pxPerMm;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (shItem.kind !== "polyline" || pts.length >= 3) ctx.closePath();

      ctx.fillStyle = shItem.construction
        ? "transparent"
        : isSelected
        ? "rgba(56, 189, 248, 0.14)"
        : "rgba(148, 163, 184, 0.07)";
      if (!shItem.construction && shItem.kind !== "arc" && shItem.kind !== "spline") ctx.fill();
      if (shItem.construction) ctx.setLineDash([7, 4]);
      ctx.strokeStyle = shItem.construction ? "#f59e0b" : isSelected ? "#ffffff" : color;
      ctx.lineWidth = isSelected ? 2.4 : 1.6;
      ctx.stroke();
      ctx.setLineDash([]);

      if (shItem.kind === "text" && shItem.text) {
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.max(11, Math.round(shItem.heightMm * pxPerMm * 0.55))}px Georgia, serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(shItem.text, cx + shItem.xMm * pxPerMm, cy - shItem.yMm * pxPerMm);
      }
      if (showDimensions && shItem.kind !== "text") {
        ctx.fillStyle = isSelected ? "#f8fafc" : "#94a3b8";
        ctx.font = "600 10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const dimTxt =
          shItem.kind === "circle" && Math.abs(shItem.widthMm - shItem.heightMm) < 0.2
            ? `Ø${shItem.widthMm.toFixed(1)}`
            : `${shItem.widthMm.toFixed(1)} × ${shItem.heightMm.toFixed(1)}`;
        ctx.fillText(dimTxt, cx + shItem.xMm * pxPerMm, cy - (shItem.yMm + shItem.heightMm * 0.5) * pxPerMm - 4);
      }
      ctx.restore();
    }

    // Live shape drawing preview
    if (draftRect) {
      const x0 = Math.min(draftRect.x0, draftRect.x1);
      const x1 = Math.max(draftRect.x0, draftRect.x1);
      const y0 = Math.min(draftRect.y0, draftRect.y1);
      const y1 = Math.max(draftRect.y0, draftRect.y1);
      const px0 = cx + x0 * pxPerMm;
      const py0 = cy - y1 * pxPerMm;
      const pw = (x1 - x0) * pxPerMm;
      const ph = (y1 - y0) * pxPerMm;
      ctx.strokeStyle = "var(--hc-accent-secondary, #38bdf8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      if (toolMode === "circle") {
        ctx.beginPath();
        ctx.ellipse(px0 + pw * 0.5, py0 + ph * 0.5, Math.max(1, pw * 0.5), Math.max(1, ph * 0.5), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(px0, py0, pw, ph);
      }
      ctx.setLineDash([]);

      // Show Fusion 90° corner square + Equal (=) square indicator when W ≈ H
      const wMm = Math.abs(draftRect.x1 - draftRect.x0);
      const hMm = Math.abs(draftRect.y1 - draftRect.y0);
      if (wMm > 3 && hMm > 3) {
        if (toolMode !== "circle") {
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 1.2;
          ctx.strokeRect(px0, py0 + ph - 8, 8, 8);
        }
        if (Math.abs(wMm - hMm) < 1.5) {
          ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = 1;
          ctx.fillRect(px0 + pw * 0.5 - 12, py0 + ph * 0.5 - 9, 24, 18);
          ctx.strokeRect(px0 + pw * 0.5 - 12, py0 + ph * 0.5 - 9, 24, 18);
          ctx.fillStyle = "#4ade80";
          ctx.font = "bold 11px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("=", px0 + pw * 0.5, py0 + ph * 0.5);
        }
      }
    }

    if ((toolMode === "polyline" || toolMode === "spline") && draftPoly.length > 0) {
      ctx.beginPath();
      draftPoly.forEach(([wx, wy], i) => {
        const px = cx + wx * pxPerMm;
        const py = cy - wy * pxPerMm;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (hoverPt) {
        ctx.lineTo(cx + hoverPt[0] * pxPerMm, cy - hoverPt[1] * pxPerMm);
      }
      ctx.strokeStyle = "var(--hc-accent-secondary, #38bdf8)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Live length & angle badge on active line segment
      if (hoverPt) {
        const prev = draftPoly[draftPoly.length - 1];
        const segLen = Math.hypot(hoverPt[0] - prev[0], hoverPt[1] - prev[1]);
        const angDeg = ((Math.atan2(hoverPt[1] - prev[1], hoverPt[0] - prev[0]) * 180) / Math.PI + 360) % 360;
        const midPx = cx + ((prev[0] + hoverPt[0]) * 0.5) * pxPerMm;
        const midPy = cy - ((prev[1] + hoverPt[1]) * 0.5) * pxPerMm - 14;
        const txt = `${segLen.toFixed(1)} mm · ${angDeg.toFixed(0)}°`;
        ctx.font = "bold 10px system-ui, sans-serif";
        const tw = ctx.measureText(txt).width + 10;
        ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1;
        ctx.fillRect(midPx - tw * 0.5, midPy - 8, tw, 16);
        ctx.strokeRect(midPx - tw * 0.5, midPy - 8, tw, 16);
        ctx.fillStyle = "#f8fafc";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(txt, midPx, midPy);
      }
    }

    // Fusion 360 Live Snap Symbols & Inference Guides (Origin, Endpoint □, Midpoint △, Center ◎, H/V, 90° ∟, Grid +)
    if (snapInfo && toolMode !== "select" && toolMode !== "trim" && toolMode !== "dimension") {
      const sxp = cx + snapInfo.x * pxPerMm;
      const syp = cy - snapInfo.y * pxPerMm;
      ctx.save();

      // Dashed tracking guide line for Horizontal / Vertical / Perpendicular
      if (snapInfo.guideFrom) {
        const gx = cx + snapInfo.guideFrom[0] * pxPerMm;
        const gy = cy - snapInfo.guideFrom[1] * pxPerMm;
        ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(sxp, syp);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 90° Right-Angle Square (∟) right at the corner vertex!
      if (snapInfo.kind === "perp" && snapInfo.perpCorner && snapInfo.perpPrev) {
        const corner = snapInfo.perpCorner;
        const prev = snapInfo.perpPrev;
        const u1x = prev[0] - corner[0];
        const u1y = -(prev[1] - corner[1]);
        const l1 = Math.hypot(u1x, u1y) || 1;
        const u2x = snapInfo.x - corner[0];
        const u2y = -(snapInfo.y - corner[1]);
        const l2 = Math.hypot(u2x, u2y) || 1;
        const sz = 11;
        const cpx = cx + corner[0] * pxPerMm;
        const cpy = cy - corner[1] * pxPerMm;
        const p1x = cpx + (u1x / l1) * sz;
        const p1y = cpy + (u1y / l1) * sz;
        const p2x = cpx + (u2x / l2) * sz;
        const p2y = cpy + (u2y / l2) * sz;
        const p3x = p1x + (u2x / l2) * sz;
        const p3y = p1y + (u2y / l2) * sz;
        ctx.strokeStyle = "#4ade80";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p3x, p3y);
        ctx.lineTo(p2x, p2y);
        ctx.stroke();
      }

      // Draw Fusion Snap Glyph at cursor
      if (snapInfo.kind === "origin") {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sxp, syp, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(sxp, syp, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (snapInfo.kind === "endpoint") {
        ctx.strokeStyle = "#38bdf8";
        ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
        ctx.lineWidth = 2;
        ctx.fillRect(sxp - 5, syp - 5, 10, 10);
        ctx.strokeRect(sxp - 5, syp - 5, 10, 10);
      } else if (snapInfo.kind === "midpoint") {
        // Fusion iconic Midpoint Triangle △
        ctx.strokeStyle = "#38bdf8";
        ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sxp, syp - 7);
        ctx.lineTo(sxp + 6.5, syp + 5);
        ctx.lineTo(sxp - 6.5, syp + 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (snapInfo.kind === "center") {
        // Fusion Center Crosshair Circle ◎
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(sxp, syp, 6, 0, Math.PI * 2);
        ctx.moveTo(sxp - 9, syp); ctx.lineTo(sxp + 9, syp);
        ctx.moveTo(sxp, syp - 9); ctx.lineTo(sxp, syp + 9);
        ctx.stroke();
      } else if (snapInfo.kind === "grid") {
        // Autodesk Fusion 360 Snap-to-Grid Target Pointer (crosshair + blue snap square + white center dot)
        ctx.strokeStyle = "rgba(6, 150, 215, 0.75)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sxp - 13, syp); ctx.lineTo(sxp + 13, syp);
        ctx.moveTo(sxp, syp - 13); ctx.lineTo(sxp, syp + 13);
        ctx.stroke();

        ctx.strokeStyle = "#38bdf8";
        ctx.fillStyle = "rgba(6, 150, 215, 0.28)";
        ctx.lineWidth = 1.8;
        ctx.fillRect(sxp - 4, syp - 4, 8, 8);
        ctx.strokeRect(sxp - 4, syp - 4, 8, 8);

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(sxp, syp, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Active tool pointer even when Grid Snap is OFF
        ctx.strokeStyle = "rgba(226, 232, 240, 0.65)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sxp - 10, syp); ctx.lineTo(sxp + 10, syp);
        ctx.moveTo(sxp, syp - 10); ctx.lineTo(sxp, syp + 10);
        ctx.stroke();
      }

      // Small Fusion Constraint + Live (X, Y) Coordinate Badge next to pointer
      const coordStr = `${snapInfo.x.toFixed(1)}, ${snapInfo.y.toFixed(1)}`;
      const badgeLabel =
        snapInfo.kind === "origin"
          ? `⊙ Origin (${coordStr})`
          : snapInfo.kind === "endpoint"
          ? `□ Endpoint (${coordStr})`
          : snapInfo.kind === "midpoint"
          ? `△ Midpoint (${coordStr})`
          : snapInfo.kind === "center"
          ? `◎ Center (${coordStr})`
          : snapInfo.kind === "horiz"
          ? `― Horiz (${coordStr})`
          : snapInfo.kind === "vert"
          ? `| Vert (${coordStr})`
          : snapInfo.kind === "perp"
          ? `∟ 90° (${coordStr})`
          : snapInfo.kind === "grid"
          ? `+ ${coordStr}`
          : coordStr;
      if (badgeLabel) {
        ctx.font = "700 10px system-ui, sans-serif";
        const bw = ctx.measureText(badgeLabel).width + 8;
        const bx = sxp + 10;
        const by = syp - 18;
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.strokeStyle = snapInfo.kind === "perp" ? "#4ade80" : "#38bdf8";
        ctx.lineWidth = 1;
        ctx.fillRect(bx, by, bw, 15);
        ctx.strokeRect(bx, by, bw, 15);
        ctx.fillStyle = snapInfo.kind === "perp" ? "#4ade80" : "#e2e8f0";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeLabel, bx + 4, by + 7.5);
      }

      ctx.restore();
    }

    // Origin marker
    const ox = job.xyOrigin.includes("left") ? sx : job.xyOrigin.includes("right") ? sx + sw : cx;
    const oy = job.xyOrigin.includes("front") ? sy + sh : job.xyOrigin.includes("back") ? sy : cy;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(ox, oy, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [job, shapes, activeShapeId, toolMode, viewZoom, viewPan, draftRect, draftPoly, hoverPt, snapInfo]);

  const finishPolyline = () => {
    if (draftPoly.length >= 2) {
      const xs = draftPoly.map((p) => p[0]);
      const ys = draftPoly.map((p) => p[1]);
      const midX = (Math.min(...xs) + Math.max(...xs)) * 0.5;
      const midY = (Math.min(...ys) + Math.max(...ys)) * 0.5;
      onAddShape({
        id: `vec-${Date.now()}`,
        name: `${toolMode === "spline" ? "Spline" : "Polyline"} ${shapes.length + 1}`,
        kind: toolMode === "spline" ? "spline" : "polyline",
        visible: true,
        xMm: midX,
        yMm: midY,
        widthMm: Math.max(2, Math.max(...xs) - Math.min(...xs)),
        heightMm: Math.max(2, Math.max(...ys) - Math.min(...ys)),
        rotationDeg: 0,
        cornerRadiusMm: 0,
        sides: draftPoly.length,
        points: draftPoly.map(([px, py]) => [px - midX, py - midY]),
        depthMm: 4,
        role: "cutout",
      });
    }
    setDraftPoly([]);
  };

  const updatePendingDim = (patch: Partial<Pick<PendingShapeDim, "wStr" | "hStr" | "sidesStr">>) => {
    setPendingDim((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...patch };
      const w = Math.max(0.5, Number.isFinite(parseFloat(next.wStr)) ? parseFloat(next.wStr) : 0.5);
      const h = Math.max(0.5, Number.isFinite(parseFloat(next.hStr)) ? parseFloat(next.hStr) : 0.5);
      if (next.tool === "centerRect") {
        setDraftRect({
          x0: next.x0 - w * 0.5,
          y0: next.y0 - h * 0.5,
          x1: next.x0 + w * 0.5,
          y1: next.y0 + h * 0.5,
        });
      } else {
        setDraftRect({
          x0: next.x0,
          y0: next.y0,
          x1: next.x0 + next.dirX * w,
          y1: next.y0 + next.dirY * h,
        });
      }
      return next;
    });
  };

  const cancelPendingDim = () => {
    setPendingDim(null);
    setDraftRect(null);
  };

  const commitPendingDim = () => {
    if (!pendingDim) return;
    const w = Math.max(0.5, parseFloat(pendingDim.wStr) || 10);
    const h = Math.max(0.5, parseFloat(pendingDim.hStr) || 10);
    const sides = Math.max(3, Math.min(24, Math.round(parseFloat(pendingDim.sidesStr) || 6)));
    const isCenter = pendingDim.tool === "centerRect";
    const x1 = pendingDim.x0 + pendingDim.dirX * w;
    const y1 = pendingDim.y0 + pendingDim.dirY * h;
    const isSlot = pendingDim.tool === "slot";
    const kind: VectorShapeKind = isSlot || isCenter ? "rect" : (pendingDim.tool as VectorShapeKind);
    const label = isSlot ? "Slot" : kind === "rect" ? "Rectangle" : kind === "circle" ? "Circle" : "Polygon";
    onAddShape({
      id: `vec-${Date.now()}`,
      name: `${label} ${shapes.length + 1}`,
      kind,
      visible: true,
      xMm: isCenter ? pendingDim.x0 : (pendingDim.x0 + x1) * 0.5,
      yMm: isCenter ? pendingDim.y0 : (pendingDim.y0 + y1) * 0.5,
      widthMm: Number(w.toFixed(2)),
      heightMm: Number(h.toFixed(2)),
      rotationDeg: 0,
      cornerRadiusMm: isSlot ? Number((Math.min(w, h) * 0.5).toFixed(2)) : 0,
      sides,
      depthMm: 4,
      role: "cutout",
    });
    setPendingDim(null);
    setDraftRect(null);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#0b0e14" }}>
      <canvas
        ref={canvasRef}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.14 : 0.88;
          setViewZoom((z) => Math.max(0.25, Math.min(30, z * factor)));
        }}
        onPointerDown={(e) => {
          lastMouse.current = { x: e.clientX, y: e.clientY };
          if (e.button === 2 || e.button === 1) {
            if (e.button === 2) rightClickStart.current = { x: e.clientX, y: e.clientY };
            dragState.current = "pan";
            return;
          }
          if (pendingDim) {
            cancelPendingDim();
          }
          const [rawX, rawY] = screenToWorld(e.clientX, e.clientY);
          const inf = resolveInference(rawX, rawY);
          const [wx, wy] = [inf.x, inf.y];
          setSnapInfo(inf);
          if (toolMode === "polyline" || toolMode === "spline") {
            // Clicking back on start point with >= 3 points auto-closes & finishes the loop!
            if (draftPoly.length >= 3 && Math.hypot(wx - draftPoly[0][0], wy - draftPoly[0][1]) < 1.0) {
              const closedPts: [number, number][] = [...draftPoly, draftPoly[0]];
              const xs = closedPts.map((p) => p[0]);
              const ys = closedPts.map((p) => p[1]);
              const midX = (Math.min(...xs) + Math.max(...xs)) * 0.5;
              const midY = (Math.min(...ys) + Math.max(...ys)) * 0.5;
              onAddShape({
                id: `vec-${Date.now()}`,
                name: `${toolMode === "spline" ? "Spline" : "Line Loop"} ${shapes.length + 1}`,
                kind: toolMode === "spline" ? "spline" : "polyline",
                visible: true,
                xMm: midX,
                yMm: midY,
                widthMm: Math.max(2, Math.max(...xs) - Math.min(...xs)),
                heightMm: Math.max(2, Math.max(...ys) - Math.min(...ys)),
                rotationDeg: 0,
                cornerRadiusMm: 0,
                sides: closedPts.length,
                points: closedPts.map(([px, py]) => [px - midX, py - midY]),
                depthMm: 4,
                role: "cutout",
              });
              setDraftPoly([]);
              return;
            }
            setDraftPoly((pts) => [...pts, [wx, wy]]);
            return;
          }
          if (toolMode !== "select" && toolMode !== "trim" && toolMode !== "dimension") {
            dragState.current = "draw";
            drawOrigin.current = { x: wx, y: wy };
            setDraftRect({ x0: wx, y0: wy, x1: wx, y1: wy });
            return;
          }
          // Select hit test (uses unsnapped rawX/rawY + polyline bounds with 4mm padding)
          const hit = [...shapes].reverse().find((s) => {
            if (!s.visible) return false;
            const pts = shapeToPolylineMm(s);
            if (pts.length >= 2) {
              let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
              for (const [px, py] of pts) {
                if (px < minX) minX = px;
                if (px > maxX) maxX = px;
                if (py < minY) minY = py;
                if (py > maxY) maxY = py;
              }
              return rawX >= minX - 4 && rawX <= maxX + 4 && rawY >= minY - 4 && rawY <= maxY + 4;
            }
            return Math.abs(rawX - s.xMm) <= s.widthMm * 0.55 + 4 && Math.abs(rawY - s.yMm) <= s.heightMm * 0.55 + 4;
          });
          if (hit) {
            if (toolMode === "trim" && onDeleteShape) {
              onDeleteShape(hit.id);
              return;
            }
            onSelectShape(hit.id);
            if (toolMode === "select") {
              moveStart.current = { id: hit.id, rawX, rawY, shapeX: hit.xMm, shapeY: hit.yMm };
              dragState.current = "move";
            }
          } else {
            onSelectShape("");
          }
        }}
        onPointerMove={(e) => {
          const [rawX, rawY] = screenToWorld(e.clientX, e.clientY);
          const inf = resolveInference(rawX, rawY);
          const [wx, wy] = [inf.x, inf.y];
          setSnapInfo(inf);
          setHoverPt([wx, wy]);
          if (dragState.current === "pan") {
            const dx = e.clientX - lastMouse.current.x;
            const dy = e.clientY - lastMouse.current.y;
            lastMouse.current = { x: e.clientX, y: e.clientY };
            setViewPan((p) => ({ x: p.x + dx, y: p.y + dy }));
            return;
          }
          if (dragState.current === "draw" && draftRect) {
            if (toolMode === "centerRect" && drawOrigin.current) {
              const ox = drawOrigin.current.x;
              const oy = drawOrigin.current.y;
              const hw = Math.abs(wx - ox);
              const hh = Math.abs(wy - oy);
              setDraftRect({ x0: ox - hw, y0: oy - hh, x1: ox + hw, y1: oy + hh });
            } else {
              setDraftRect({ ...draftRect, x1: wx, y1: wy });
            }
            return;
          }
          if (dragState.current === "move" && moveStart.current) {
            const ms = moveStart.current;
            onUpdateShape(ms.id, {
              xMm: Number(snap(ms.shapeX + (rawX - ms.rawX)).toFixed(2)),
              yMm: Number(snap(ms.shapeY + (rawY - ms.rawY)).toFixed(2)),
            });
          }
        }}
        onPointerUp={(e) => {
          if (e.button === 2 && rightClickStart.current) {
            const moved = Math.hypot(e.clientX - rightClickStart.current.x, e.clientY - rightClickStart.current.y);
            rightClickStart.current = null;
            if (moved < 5 && onSketchContextMenu) {
              dragState.current = "none";
              onSketchContextMenu(e.clientX, e.clientY);
              return;
            }
          }
          if (dragState.current === "draw" && draftRect) {
            const w = Math.abs(draftRect.x1 - draftRect.x0);
            const h = Math.abs(draftRect.y1 - draftRect.y0);
            if (w >= 2 && h >= 2) {
              const isCenter = toolMode === "centerRect";
              const dirX = draftRect.x1 >= draftRect.x0 ? 1 : -1;
              const dirY = draftRect.y1 >= draftRect.y0 ? 1 : -1;
              setPendingDim({
                x0: isCenter ? (drawOrigin.current?.x ?? (draftRect.x0 + draftRect.x1) * 0.5) : draftRect.x0,
                y0: isCenter ? (drawOrigin.current?.y ?? (draftRect.y0 + draftRect.y1) * 0.5) : draftRect.y0,
                dirX,
                dirY,
                tool: toolMode,
                wStr: w.toFixed(1),
                hStr: h.toFixed(1),
                sidesStr: "6",
              });
            } else {
              setDraftRect(null);
            }
          }
          dragState.current = "none";
          moveStart.current = null;
        }}
        onDoubleClick={() => {
          if (toolMode === "polyline" || toolMode === "spline") finishPolyline();
        }}
        style={{ width: "100%", height: "100%", display: "block", cursor: toolMode === "select" ? "default" : "crosshair" }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 14,
          padding: "6px 10px",
          borderRadius: 8,
          background: "rgba(18, 22, 30, 0.9)",
          border: "1px solid var(--hc-border-strong, #334155)",
          fontSize: 12,
          color: "var(--hc-muted, #cbd5e1)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span>
          {sketchPlaneLabel ? `${sketchPlaneLabel} · ` : ""}
          {(() => {
            const cw = canvasRef.current?.width ?? 800;
            const ch = canvasRef.current?.height ?? 600;
            const { majorMm, minorMm } = getAdaptiveGridMm(getScalePxPerMm(cw, ch));
            return `Grid: ${majorMm}mm (${minorMm}mm) · `;
          })()}
          {toolMode === "select"
            ? "Click & drag shapes to move · Right-drag: Pan · Scroll: Zoom"
            : toolMode === "polyline"
            ? "Click points to draw polyline · Double-click to finish"
            : "Click & drag to draw · Type exact size · Tab to switch · Enter to create"}
        </span>
        {(toolMode === "polyline" || toolMode === "spline") && draftPoly.length >= 2 && (
          <button
            type="button"
            onClick={finishPolyline}
            style={{ padding: "3px 10px", borderRadius: 5, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            ✓ Finish {toolMode === "spline" ? "Spline" : "Line"} (Enter)
          </button>
        )}
      </div>
      {/* Fusion 360 Floating Green Checkmark next to active Line/Spline endpoint */}
      {(toolMode === "polyline" || toolMode === "spline") && draftPoly.length >= 2 && (() => {
        const last = draftPoly[draftPoly.length - 1];
        const pt = worldToScreen(last[0], last[1]);
        const cw = canvasRef.current?.width ?? 640;
        const ch = canvasRef.current?.height ?? 480;
        const left = Math.max(12, Math.min(cw - 44, pt.x + 14));
        const top = Math.max(96, Math.min(ch - 56, pt.y - 14));
        return (
          <button
            type="button"
            title="Finish Line (Enter / Esc)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={finishPolyline}
            style={{
              position: "absolute",
              left,
              top,
              zIndex: 22,
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "2px solid #ffffff",
              background: "#16a34a",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            }}
          >
            ✓
          </button>
        );
      })()}
      {pendingDim && draftRect && (() => {
        const anchor = worldToScreen(Math.max(draftRect.x0, draftRect.x1), Math.min(draftRect.y0, draftRect.y1));
        const cw = canvasRef.current?.width ?? 640;
        const ch = canvasRef.current?.height ?? 480;
        const boxW = pendingDim.tool === "polygon" ? 290 : 228;
        const left = Math.max(12, Math.min(cw - boxW - 12, anchor.x + 12));
        const top = Math.max(56, Math.min(ch - 88, anchor.y + 12));
        const handleDimKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const refs = pendingDim.tool === "polygon"
              ? [widthInputRef.current, heightInputRef.current, sidesInputRef.current]
              : [widthInputRef.current, heightInputRef.current];
            const validRefs = refs.filter((el): el is HTMLInputElement => el !== null);
            const idx = validRefs.indexOf(e.currentTarget);
            if (validRefs.length > 0) {
              const nextIdx = (idx + (e.shiftKey ? -1 : 1) + validRefs.length) % validRefs.length;
              validRefs[nextIdx].focus();
              validRefs[nextIdx].select();
            }
          } else if (e.key === "Enter") {
            e.preventDefault();
            commitPendingDim();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelPendingDim();
          }
        };
        const inputStyle: React.CSSProperties = {
          width: 58,
          padding: "4px 6px",
          borderRadius: 5,
          border: "1px solid var(--hc-accent-secondary, #38bdf8)",
          background: "#0f172a",
          color: "#f8fafc",
          fontSize: 12,
          fontWeight: 600,
          outline: "none",
        };
        return (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left,
              top,
              zIndex: 20,
              padding: "8px 10px",
              borderRadius: 9,
              background: "rgba(15, 23, 42, 0.96)",
              border: "1px solid var(--hc-accent-secondary, #38bdf8)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.55)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#cbd5e1" }}>
                <span>{pendingDim.tool === "circle" ? "WØ" : "W"}</span>
                <input
                  ref={widthInputRef}
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={pendingDim.wStr}
                  onChange={(e) => updatePendingDim({ wStr: e.target.value })}
                  onKeyDown={handleDimKeyDown}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#cbd5e1" }}>
                <span>{pendingDim.tool === "circle" ? "HØ" : "H"}</span>
                <input
                  ref={heightInputRef}
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={pendingDim.hStr}
                  onChange={(e) => updatePendingDim({ hStr: e.target.value })}
                  onKeyDown={handleDimKeyDown}
                  style={inputStyle}
                />
              </label>
              {pendingDim.tool === "polygon" && (
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#cbd5e1" }}>
                  <span>S</span>
                  <input
                    ref={sidesInputRef}
                    type="number"
                    step="1"
                    min="3"
                    max="24"
                    value={pendingDim.sidesStr}
                    onChange={(e) => updatePendingDim({ sidesStr: e.target.value })}
                    onKeyDown={handleDimKeyDown}
                    style={{ ...inputStyle, width: 44 }}
                  />
                </label>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 10, color: "#94a3b8" }}>
              <span>mm · Tab: switch · Enter: OK</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  onClick={cancelPendingDim}
                  style={{ padding: "2px 7px", borderRadius: 4, border: "1px solid #475569", background: "transparent", color: "#cbd5e1", fontSize: 11, cursor: "pointer" }}
                >
                  Esc
                </button>
                <button
                  type="button"
                  onClick={commitPendingDim}
                  style={{ padding: "2px 8px", borderRadius: 4, border: "none", background: "#16a34a", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
