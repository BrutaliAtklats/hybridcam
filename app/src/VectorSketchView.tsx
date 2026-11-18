import React, { useEffect, useRef, useState } from "react";
import { JobConfig } from "./camEngine";
import { shapeToPolylineMm, VectorRole, VectorShape, VectorShapeKind } from "./vectorSketch";

export type SketchToolMode = "select" | "rect" | "circle" | "slot" | "polygon" | "polyline";

interface Props {
  job: JobConfig;
  shapes: VectorShape[];
  activeShapeId: string;
  toolMode: SketchToolMode;
  snapToGrid: boolean;
  snapStepMm?: number;
  sketchPlaneLabel?: string;
  onSelectShape: (id: string) => void;
  onAddShape: (shape: VectorShape) => void;
  onUpdateShape: (id: string, patch: Partial<VectorShape>) => void;
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
  sketchPlaneLabel,
  onSelectShape,
  onAddShape,
  onUpdateShape,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewZoom, setViewZoom] = useState(1.0);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [draftRect, setDraftRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [draftPoly, setDraftPoly] = useState<[number, number][]>([]);
  const [hoverPt, setHoverPt] = useState<[number, number] | null>(null);
  const dragState = useRef<"none" | "move" | "draw" | "pan">("none");
  const lastMouse = useRef({ x: 0, y: 0 });

  const getScalePxPerMm = (cw: number, ch: number) =>
    Math.min((cw - 80) / Math.max(1, job.widthMm), (ch - 80) / Math.max(1, job.depthMm)) * viewZoom;

  const snap = (v: number) => (snapToGrid ? Math.round(v / snapStepMm) * snapStepMm : v);

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

    // 10mm Grid
    ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
    ctx.lineWidth = 1;
    const stepPx = 10 * pxPerMm;
    if (stepPx >= 6) {
      ctx.beginPath();
      for (let gx = sx; gx <= sx + sw + 0.5; gx += stepPx) {
        ctx.moveTo(gx, sy);
        ctx.lineTo(gx, sy + sh);
      }
      for (let gy = sy; gy <= sy + sh + 0.5; gy += stepPx) {
        ctx.moveTo(sx, gy);
        ctx.lineTo(sx + sw, gy);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);

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

      ctx.fillStyle = isSelected ? "rgba(56, 189, 248, 0.14)" : "rgba(148, 163, 184, 0.07)";
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#ffffff" : color;
      ctx.lineWidth = isSelected ? 2.4 : 1.6;
      ctx.stroke();

      if (shItem.kind === "text" && shItem.text) {
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.max(11, Math.round(shItem.heightMm * pxPerMm * 0.55))}px Georgia, serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(shItem.text, cx + shItem.xMm * pxPerMm, cy - shItem.yMm * pxPerMm);
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
    }

    if (toolMode === "polyline" && draftPoly.length > 0) {
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
    }

    // Origin marker
    const ox = job.xyOrigin.includes("left") ? sx : job.xyOrigin.includes("right") ? sx + sw : cx;
    const oy = job.xyOrigin.includes("front") ? sy + sh : job.xyOrigin.includes("back") ? sy : cy;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(ox, oy, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [job, shapes, activeShapeId, toolMode, viewZoom, viewPan, draftRect, draftPoly, hoverPt]);

  const finishPolyline = () => {
    if (draftPoly.length >= 2) {
      const xs = draftPoly.map((p) => p[0]);
      const ys = draftPoly.map((p) => p[1]);
      const midX = (Math.min(...xs) + Math.max(...xs)) * 0.5;
      const midY = (Math.min(...ys) + Math.max(...ys)) * 0.5;
      onAddShape({
        id: `vec-${Date.now()}`,
        name: `Polyline ${shapes.length + 1}`,
        kind: "polyline",
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

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#0b0e14" }}>
      <canvas
        ref={canvasRef}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.12 : 0.89;
          setViewZoom((z) => Math.max(0.3, Math.min(8, z * factor)));
        }}
        onPointerDown={(e) => {
          lastMouse.current = { x: e.clientX, y: e.clientY };
          if (e.button === 2 || e.button === 1) {
            dragState.current = "pan";
            return;
          }
          const [wx, wy] = screenToWorld(e.clientX, e.clientY).map(snap) as [number, number];
          if (toolMode === "polyline") {
            setDraftPoly((pts) => [...pts, [wx, wy]]);
            return;
          }
          if (toolMode !== "select") {
            dragState.current = "draw";
            setDraftRect({ x0: wx, y0: wy, x1: wx, y1: wy });
            return;
          }
          // Select hit test
          const hit = [...shapes].reverse().find((s) => {
            if (!s.visible) return false;
            return Math.abs(wx - s.xMm) <= s.widthMm * 0.55 && Math.abs(wy - s.yMm) <= s.heightMm * 0.55;
          });
          if (hit) {
            onSelectShape(hit.id);
            dragState.current = "move";
          }
        }}
        onPointerMove={(e) => {
          const [wx, wy] = screenToWorld(e.clientX, e.clientY).map(snap) as [number, number];
          setHoverPt([wx, wy]);
          if (dragState.current === "pan") {
            const dx = e.clientX - lastMouse.current.x;
            const dy = e.clientY - lastMouse.current.y;
            lastMouse.current = { x: e.clientX, y: e.clientY };
            setViewPan((p) => ({ x: p.x + dx, y: p.y + dy }));
            return;
          }
          if (dragState.current === "draw" && draftRect) {
            setDraftRect({ ...draftRect, x1: wx, y1: wy });
            return;
          }
          if (dragState.current === "move" && activeShapeId) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const pxPerMm = getScalePxPerMm(canvas.width, canvas.height);
            const dxMm = (e.clientX - lastMouse.current.x) / pxPerMm;
            const dyMm = -(e.clientY - lastMouse.current.y) / pxPerMm;
            lastMouse.current = { x: e.clientX, y: e.clientY };
            const cur = shapes.find((s) => s.id === activeShapeId);
            if (cur) {
              onUpdateShape(cur.id, {
                xMm: snap(cur.xMm + dxMm),
                yMm: snap(cur.yMm + dyMm),
              });
            }
          }
        }}
        onPointerUp={() => {
          if (dragState.current === "draw" && draftRect) {
            const w = Math.abs(draftRect.x1 - draftRect.x0);
            const h = Math.abs(draftRect.y1 - draftRect.y0);
            if (w >= 2 && h >= 2) {
              const isSlot = toolMode === "slot";
              const kind: VectorShapeKind = isSlot ? "rect" : (toolMode as VectorShapeKind);
              const label = isSlot ? "Slot" : kind === "rect" ? "Rectangle" : kind === "circle" ? "Circle" : "Polygon";
              onAddShape({
                id: `vec-${Date.now()}`,
                name: `${label} ${shapes.length + 1}`,
                kind,
                visible: true,
                xMm: (draftRect.x0 + draftRect.x1) * 0.5,
                yMm: (draftRect.y0 + draftRect.y1) * 0.5,
                widthMm: Number(w.toFixed(1)),
                heightMm: Number(h.toFixed(1)),
                rotationDeg: 0,
                cornerRadiusMm: isSlot ? Number((Math.min(w, h) * 0.5).toFixed(2)) : 0,
                sides: 6,
                depthMm: 4,
                role: "cutout",
              });
            }
            setDraftRect(null);
          }
          dragState.current = "none";
        }}
        onDoubleClick={() => {
          if (toolMode === "polyline") finishPolyline();
        }}
        style={{ width: "100%", height: "100%", display: "block", cursor: toolMode === "select" ? "default" : "crosshair" }}
      />
      <div
        style={{
          position: "absolute",
          top: 12,
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
          {toolMode === "select"
            ? "Vector Sketch: Click & drag shapes to move · Right-drag: Pan · Scroll: Zoom"
            : toolMode === "polyline"
            ? "Click points to draw polyline · Double-click to finish"
            : "Click & drag on the stock to draw shape"}
        </span>
        {toolMode === "polyline" && draftPoly.length >= 2 && (
          <button
            onClick={finishPolyline}
            style={{ padding: "3px 8px", borderRadius: 5, border: "none", background: "#16a34a", color: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            Finish Polyline
          </button>
        )}
      </div>
    </div>
  );
};
