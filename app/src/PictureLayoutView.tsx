import React, { useEffect, useRef, useState } from "react";
import { JobConfig } from "./camEngine";
import { computePictureBoundsMm, PictureLayer, PicturePlacement } from "./reliefProcessor";

export type LayoutToolMode = "move" | "paintRaise" | "paintLower" | "paintSmooth";

interface Props {
  job: JobConfig;
  layers: PictureLayer[];
  activeLayerId: string;
  preserveAspect: boolean;
  toolMode: LayoutToolMode;
  brushRadiusMm: number;
  brushStrength: number;
  snapToGrid?: boolean;
  showMergedPreview?: boolean;
  mergedGrid?: Float32Array;
  mergedW?: number;
  mergedH?: number;
  onStrokeStart?: () => void;
  onSelectLayer: (id: string) => void;
  onChangePlacement: (id: string, next: PicturePlacement) => void;
  onPaintLayer: (id: string, newData: Float32Array) => void;
}

export const PictureLayoutView: React.FC<Props> = ({
  job,
  layers,
  activeLayerId,
  preserveAspect,
  toolMode,
  brushRadiusMm,
  brushStrength,
  snapToGrid = false,
  showMergedPreview = false,
  mergedGrid,
  mergedW = 0,
  mergedH = 0,
  onStrokeStart,
  onSelectLayer,
  onChangePlacement,
  onPaintLayer,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewZoom, setViewZoom] = useState(1.0);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [hoverWorld, setHoverWorld] = useState<{ x: number; y: number } | null>(null);
  const [resizeMode, setResizeMode] = useState(false);
  const dragMode = useRef<"none" | "pic" | "pan" | "paint" | "resize">("none");
  const resizeStart = useRef({ dist: 1, scale: 1 });
  const lastMouse = useRef({ x: 0, y: 0 });
  const bitmapCache = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const mergedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [paintTick, setPaintTick] = useState(0);

  // Cache offscreen merged 2D relief canvas so mouse hover/pan never rebuilds ImageData
  useEffect(() => {
    if (!showMergedPreview || !mergedGrid || mergedW <= 0 || mergedH <= 0) {
      mergedCanvasRef.current = null;
      return;
    }
    const off = document.createElement("canvas");
    off.width = mergedW;
    off.height = mergedH;
    const octx = off.getContext("2d");
    if (!octx) {
      mergedCanvasRef.current = null;
      return;
    }
    const img = octx.createImageData(mergedW, mergedH);
    for (let i = 0; i < mergedW * mergedH; i++) {
      const v = Math.round(Math.max(0, Math.min(1, mergedGrid[i])) * 255);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    mergedCanvasRef.current = off;
  }, [showMergedPreview, mergedGrid, mergedW, mergedH]);

  // Rebuild offscreen bitmaps when layer source/levels change
  useEffect(() => {
    const cache = bitmapCache.current;
    for (const layer of layers) {
      const off = document.createElement("canvas");
      off.width = layer.source.width;
      off.height = layer.source.height;
      const ctx = off.getContext("2d");
      if (!ctx) continue;
      const imgData = ctx.createImageData(layer.source.width, layer.source.height);
      const sClip = layer.placement.shadowClip || 0;
      const hClip = Math.max(sClip + 0.05, layer.placement.highlightClip ?? 1.0);
      const bright = layer.placement.brightness || 0;
      for (let i = 0; i < layer.source.width * layer.source.height; i++) {
        let v = layer.source.data[i] ?? 0;
        v = Math.min(1, Math.max(0, (v - sClip) / (hClip - sClip) + bright));
        const b = Math.round(v * 255);
        imgData.data[i * 4] = b;
        imgData.data[i * 4 + 1] = b;
        imgData.data[i * 4 + 2] = b;
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      cache.set(layer.id, off);
    }
  }, [layers, paintTick]);

  const getScalePxPerMm = (cw: number, ch: number) => {
    const base = Math.min((cw - 80) / Math.max(1, job.widthMm), (ch - 80) / Math.max(1, job.depthMm));
    return base * viewZoom;
  };

  const screenToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const pxPerMm = getScalePxPerMm(canvas.width, canvas.height);
    const cx = canvas.width * 0.5 + viewPan.x;
    const cy = canvas.height * 0.5 + viewPan.y;
    // +Y is up on screen, -Y is down on screen (matches CNC & 3D viewport)
    return { x: (mx - cx) / pxPerMm, y: -(my - cy) / pxPerMm };
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

    ctx.fillStyle = "#1a202c";
    ctx.fillRect(sx, sy, sw, sh);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
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

    // Optional Live Merged 2D Preview across the entire stock (from cached offscreen canvas)
    if (showMergedPreview && mergedCanvasRef.current) {
      ctx.drawImage(mergedCanvasRef.current, sx, sy, sw, sh);
    }

    // Draw all visible picture layers in stack order (+Y is up -> canvas py = cy - maxY * pxPerMm)
    let activeLayerBounds: { px: number; py: number; pw: number; ph: number; rotDeg: number } | null = null;

    for (const layer of layers) {
      if (!layer.visible) continue;
      const { minX, maxY, picW, picH } = computePictureBoundsMm(
        layer.source,
        job.widthMm,
        job.depthMm,
        layer.placement,
        preserveAspect
      );
      const px = cx + minX * pxPerMm;
      const py = cy - maxY * pxPerMm;
      const pw = picW * pxPerMm;
      const ph = picH * pxPerMm;
      const bmp = bitmapCache.current.get(layer.id);
      const isSelected = layer.id === activeLayerId;

      ctx.save();
      ctx.translate(px + pw * 0.5, py + ph * 0.5);
      ctx.rotate(((layer.placement.rotationDeg || 0) * Math.PI) / 180);
      if (bmp) {
        ctx.save();
        ctx.globalAlpha = isSelected ? 0.95 : 0.72;
        ctx.scale(layer.placement.flipX ? -1 : 1, layer.placement.flipY ? -1 : 1);
        ctx.drawImage(bmp, -pw * 0.5, -ph * 0.5, pw, ph);
        ctx.restore();
      }

      // In normal mode, draw layer boundary here
      if (!resizeMode || !isSelected) {
        ctx.strokeStyle = isSelected ? "var(--hc-accent-secondary, #38bdf8)" : "#64748b";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(-pw * 0.5, -ph * 0.5, pw, ph);
        ctx.setLineDash([]);
      }
      ctx.restore();

      if (isSelected) {
        activeLayerBounds = { px, py, pw, ph, rotDeg: layer.placement.rotationDeg || 0 };
      }
    }

    // In double-click resize mode, draw machine bed outline ON TOP of all pictures
    if (resizeMode) {
      ctx.save();

      // Dark underlay stroke for high contrast against light picture pixels
      ctx.strokeStyle = "rgba(11, 14, 20, 0.88)";
      ctx.lineWidth = 4;
      ctx.strokeRect(sx, sy, sw, sh);

      // Bright accent dashed machine bed outline
      ctx.strokeStyle = "var(--hc-accent-secondary, #38bdf8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);

      // Corner brackets for clear stock boundary reference
      const cornerLen = Math.max(8, Math.min(20, sw * 0.15, sh * 0.15));
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(sx, sy + cornerLen); ctx.lineTo(sx, sy); ctx.lineTo(sx + cornerLen, sy);
      // Top-right
      ctx.moveTo(sx + sw - cornerLen, sy); ctx.lineTo(sx + sw, sy); ctx.lineTo(sx + sw, sy + cornerLen);
      // Bottom-right
      ctx.moveTo(sx + sw, sy + sh - cornerLen); ctx.lineTo(sx + sw, sy + sh); ctx.lineTo(sx + sw - cornerLen, sy + sh);
      // Bottom-left
      ctx.moveTo(sx + cornerLen, sy + sh); ctx.lineTo(sx, sy + sh); ctx.lineTo(sx, sy + sh - cornerLen);
      ctx.stroke();

      // Top badge indicating machine bed outline & dimensions
      const badgeText = `Machine Bed: ${job.widthMm} × ${job.depthMm} mm`;
      ctx.font = "bold 11px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      const tm = ctx.measureText(badgeText);
      const bW = tm.width + 16;
      const bH = 20;
      const bX = sx + sw * 0.5 - bW * 0.5;
      const bY = Math.max(10, sy - bH - 4);
      ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
      ctx.strokeStyle = "var(--hc-accent-secondary, #38bdf8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bX, bY, bW, bH, 5);
      else ctx.rect(bX, bY, bW, bH);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#f8fafc";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, sx + sw * 0.5, bY + bH * 0.5);

      ctx.restore();

      // Draw the active layer's yellow resize box & 4 corner handles on top of the bed outline
      if (activeLayerBounds) {
        const { px, py, pw, ph, rotDeg } = activeLayerBounds;
        ctx.save();
        ctx.translate(px + pw * 0.5, py + ph * 0.5);
        ctx.rotate((rotDeg * Math.PI) / 180);

        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(-pw * 0.5, -ph * 0.5, pw, ph);
        ctx.setLineDash([]);

        const hs = 10;
        ctx.fillStyle = "#facc15";
        ctx.strokeStyle = "#0b0e14";
        ctx.lineWidth = 1.5;
        for (const [hx, hy] of [
          [-pw * 0.5, -ph * 0.5],
          [pw * 0.5, -ph * 0.5],
          [pw * 0.5, ph * 0.5],
          [-pw * 0.5, ph * 0.5],
        ]) {
          ctx.fillRect(hx - hs * 0.5, hy - hs * 0.5, hs, hs);
          ctx.strokeRect(hx - hs * 0.5, hy - hs * 0.5, hs, hs);
        }
        ctx.restore();
      }
    }

    // Origin marker
    const ox = job.xyOrigin.includes("left") ? sx : job.xyOrigin.includes("right") ? sx + sw : cx;
    const oy = job.xyOrigin.includes("front") ? sy + sh : job.xyOrigin.includes("back") ? sy : cy;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(ox, oy, 5, 0, Math.PI * 2);
    ctx.fill();

    // Paint Brush Cursor
    if (toolMode !== "move" && hoverWorld) {
      const bx = cx + hoverWorld.x * pxPerMm;
      const by = cy - hoverWorld.y * pxPerMm;
      const br = brushRadiusMm * pxPerMm;
      ctx.strokeStyle = toolMode === "paintRaise" ? "#4ade80" : toolMode === "paintLower" ? "#f87171" : "#facc15";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [job, layers, activeLayerId, preserveAspect, viewZoom, viewPan, toolMode, hoverWorld, brushRadiusMm, paintTick, resizeMode, showMergedPreview, mergedGrid]);

  const applyPaintAt = (wx: number, wy: number) => {
    const layer = layers.find((l) => l.id === activeLayerId);
    if (!layer) return;
    const { picW, picH } = computePictureBoundsMm(
      layer.source,
      job.widthMm,
      job.depthMm,
      layer.placement,
      preserveAspect
    );
    const rotRad = -((layer.placement.rotationDeg || 0) * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const dx = wx - layer.placement.offsetXMm;
    const dy = wy - layer.placement.offsetYMm;
    const lx = dx * cosR - dy * sinR;
    const ly = dx * sinR + dy * cosR;

    let su = lx / Math.max(1e-6, picW) + 0.5;
    let sv = 0.5 - ly / Math.max(1e-6, picH);
    if (layer.placement.flipX) su = 1 - su;
    if (layer.placement.flipY) sv = 1 - sv;
    if (su < 0 || su > 1 || sv < 0 || sv > 1) return;

    const w = layer.source.width;
    const h = layer.source.height;
    const cxPx = su * (w - 1);
    const cyPx = sv * (h - 1);
    const rxPx = (brushRadiusMm / Math.max(1e-6, picW)) * (w - 1);
    const ryPx = (brushRadiusMm / Math.max(1e-6, picH)) * (h - 1);

    const x0 = Math.max(0, Math.floor(cxPx - rxPx));
    const x1 = Math.min(w - 1, Math.ceil(cxPx + rxPx));
    const y0 = Math.max(0, Math.floor(cyPx - ryPx));
    const y1 = Math.min(h - 1, Math.ceil(cyPx + ryPx));

    const next = new Float32Array(layer.source.data);
    const str = brushStrength * 0.12;

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const nx = (px - cxPx) / Math.max(1, rxPx);
        const ny = (py - cyPx) / Math.max(1, ryPx);
        const d = Math.sqrt(nx * nx + ny * ny);
        if (d >= 1) continue;
        const t = 1 - d;
        const falloff = t * t * (3 - 2 * t);
        const idx = py * w + px;

        if (toolMode === "paintRaise") {
          next[idx] = Math.min(1, next[idx] + falloff * str);
        } else if (toolMode === "paintLower") {
          next[idx] = Math.max(0, next[idx] - falloff * str);
        } else if (toolMode === "paintSmooth" && px > 0 && px < w - 1 && py > 0 && py < h - 1) {
          const avg = 0.25 * (next[idx - 1] + next[idx + 1] + next[idx - w] + next[idx + w]);
          next[idx] = next[idx] + (avg - next[idx]) * falloff * brushStrength * 0.5;
        }
      }
    }

    onPaintLayer(layer.id, next);
    setPaintTick((t) => t + 1);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    lastMouse.current = { x: e.clientX, y: e.clientY };
    if (e.button === 2 || e.button === 1 || e.shiftKey) {
      dragMode.current = "pan";
      return;
    }

    const wPt = screenToWorld(e.clientX, e.clientY);
    if (toolMode !== "move") {
      onStrokeStart?.();
      dragMode.current = "paint";
      applyPaintAt(wPt.x, wPt.y);
      return;
    }

    // Check corner resize handles first if in resizeMode
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (resizeMode && activeLayer) {
      const b = computePictureBoundsMm(activeLayer.source, job.widthMm, job.depthMm, activeLayer.placement, preserveAspect);
      const handleTol = 12 / getScalePxPerMm(canvasRef.current?.width || 800, canvasRef.current?.height || 600);
      const corners = [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY },
      ];
      const hitCorner = corners.some((c) => Math.hypot(wPt.x - c.x, wPt.y - c.y) <= handleTol);
      if (hitCorner) {
        dragMode.current = "resize";
        resizeStart.current = {
          dist: Math.max(2, Math.hypot(wPt.x - activeLayer.placement.offsetXMm, wPt.y - activeLayer.placement.offsetYMm)),
          scale: activeLayer.placement.scale,
        };
        return;
      }
    }

    // Hit-test visible layers top-to-bottom
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.visible) continue;
      const b = computePictureBoundsMm(layer.source, job.widthMm, job.depthMm, layer.placement, preserveAspect);
      if (wPt.x >= b.minX && wPt.x <= b.maxX && wPt.y >= b.minY && wPt.y <= b.maxY) {
        onSelectLayer(layer.id);
        dragMode.current = "pic";
        return;
      }
    }
    setResizeMode(false);
    dragMode.current = "pan";
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (toolMode !== "move") return;
    const wPt = screenToWorld(e.clientX, e.clientY);
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.visible) continue;
      const b = computePictureBoundsMm(layer.source, job.widthMm, job.depthMm, layer.placement, preserveAspect);
      if (wPt.x >= b.minX && wPt.x <= b.maxX && wPt.y >= b.minY && wPt.y <= b.maxY) {
        onSelectLayer(layer.id);
        setResizeMode((r) => !r);
        return;
      }
    }
    setResizeMode(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wPt = screenToWorld(e.clientX, e.clientY);
    setHoverWorld(wPt);

    if (dragMode.current === "none") return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };

    if (dragMode.current === "pan") {
      setViewPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else if (dragMode.current === "paint") {
      applyPaintAt(wPt.x, wPt.y);
    } else if (dragMode.current === "resize") {
      const layer = layers.find((l) => l.id === activeLayerId);
      if (!layer) return;
      const d = Math.max(2, Math.hypot(wPt.x - layer.placement.offsetXMm, wPt.y - layer.placement.offsetYMm));
      const newScale = Math.max(0.05, Math.min(10, Number((resizeStart.current.scale * (d / resizeStart.current.dist)).toFixed(3))));
      onChangePlacement(layer.id, { ...layer.placement, scale: newScale });
    } else if (dragMode.current === "pic" && canvasRef.current) {
      const layer = layers.find((l) => l.id === activeLayerId);
      if (!layer) return;
      const pxPerMm = getScalePxPerMm(canvasRef.current.width, canvasRef.current.height);
      let nx = layer.placement.offsetXMm + dx / pxPerMm;
      let ny = layer.placement.offsetYMm + dy / pxPerMm;
      if (snapToGrid) {
        nx = Math.round(nx / 5) * 5;
        ny = Math.round(ny / 5) * 5;
      }
      onChangePlacement(layer.id, {
        ...layer.placement,
        offsetXMm: Number(nx.toFixed(2)),
        offsetYMm: Number((layer.placement.offsetYMm - dy / pxPerMm).toFixed(2)),
      });
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => (dragMode.current = "none")}
        onMouseLeave={() => {
          dragMode.current = "none";
          setHoverWorld(null);
        }}
        onWheel={(e) => {
          e.preventDefault();
          setViewZoom((z) => Math.max(0.25, Math.min(5, z * (e.deltaY < 0 ? 1.1 : 0.9))));
        }}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          cursor: toolMode === "move" ? "grab" : "crosshair",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 14,
          padding: "7px 12px",
          borderRadius: 8,
          background: "rgba(15, 23, 42, 0.88)",
          border: "1px solid var(--hc-border-strong, #334155)",
          fontSize: 12,
          color: "var(--hc-text, #e2e8f0)",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span>
          {toolMode === "move"
            ? resizeMode
              ? "Resize Mode Active: Drag Yellow Corners to Scale · Double-Click Picture to Exit"
              : "Drag Picture: Move · Double-Click Picture: Resize Mode · Scroll: Zoom"
            : "Click & Drag on Picture to Paint · Right-Drag: Pan · Scroll: Zoom"}
        </span>
        <button
          onClick={() => {
            setViewZoom(1);
            setViewPan({ x: 0, y: 0 });
          }}
          style={{
            padding: "3px 8px",
            borderRadius: 5,
            border: "1px solid #475569",
            background: "var(--hc-panel-bg, #1e293b)",
            color: "#fff",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Reset View
        </button>
      </div>
    </div>
  );
};
