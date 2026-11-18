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
  const [pendingDim, setPendingDim] = useState<PendingShapeDim | null>(null);
  const [draftPoly, setDraftPoly] = useState<[number, number][]>([]);
  const [hoverPt, setHoverPt] = useState<[number, number] | null>(null);
  const dragState = useRef<"none" | "move" | "draw" | "pan">("none");
  const lastMouse = useRef({ x: 0, y: 0 });
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
  }, [toolMode]);

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

  const updatePendingDim = (patch: Partial<Pick<PendingShapeDim, "wStr" | "hStr" | "sidesStr">>) => {
    setPendingDim((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...patch };
      const w = Math.max(0.5, Number.isFinite(parseFloat(next.wStr)) ? parseFloat(next.wStr) : 0.5);
      const h = Math.max(0.5, Number.isFinite(parseFloat(next.hStr)) ? parseFloat(next.hStr) : 0.5);
      setDraftRect({
        x0: next.x0,
        y0: next.y0,
        x1: next.x0 + next.dirX * w,
        y1: next.y0 + next.dirY * h,
      });
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
    const x1 = pendingDim.x0 + pendingDim.dirX * w;
    const y1 = pendingDim.y0 + pendingDim.dirY * h;
    const isSlot = pendingDim.tool === "slot";
    const kind: VectorShapeKind = isSlot ? "rect" : (pendingDim.tool as VectorShapeKind);
    const label = isSlot ? "Slot" : kind === "rect" ? "Rectangle" : kind === "circle" ? "Circle" : "Polygon";
    onAddShape({
      id: `vec-${Date.now()}`,
      name: `${label} ${shapes.length + 1}`,
      kind,
      visible: true,
      xMm: (pendingDim.x0 + x1) * 0.5,
      yMm: (pendingDim.y0 + y1) * 0.5,
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
          const factor = e.deltaY < 0 ? 1.12 : 0.89;
          setViewZoom((z) => Math.max(0.3, Math.min(8, z * factor)));
        }}
        onPointerDown={(e) => {
          lastMouse.current = { x: e.clientX, y: e.clientY };
          if (e.button === 2 || e.button === 1) {
            dragState.current = "pan";
            return;
          }
          if (pendingDim) {
            cancelPendingDim();
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
              const dirX = draftRect.x1 >= draftRect.x0 ? 1 : -1;
              const dirY = draftRect.y1 >= draftRect.y0 ? 1 : -1;
              setPendingDim({
                x0: draftRect.x0,
                y0: draftRect.y0,
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
            : "Click & drag to draw · Type exact size · Tab to switch · Enter to create"}
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
