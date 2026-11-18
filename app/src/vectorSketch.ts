export type VectorShapeKind = "rect" | "circle" | "polygon" | "polyline" | "text";
export type VectorRole = "carve" | "cutout" | "vcarve" | "model3d";

export interface VectorShape {
  id: string;
  name: string;
  kind: VectorShapeKind;
  visible: boolean;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  cornerRadiusMm: number;
  sides: number;
  points?: [number, number][];
  text?: string;
  depthMm: number;
  role: VectorRole;
}

/**
 * Convert a VectorShape into a 2D polyline in stock-centered world coordinates (mm).
 */
export function shapeToPolylineMm(shape: VectorShape): [number, number][] {
  const hw = Math.max(0.5, shape.widthMm * 0.5);
  const hd = Math.max(0.5, shape.heightMm * 0.5);
  const raw: [number, number][] = [];

  if (shape.kind === "rect" || shape.kind === "text") {
    const cr = shape.kind === "rect" ? Math.min(shape.cornerRadiusMm || 0, hw * 0.9, hd * 0.9) : 0;
    if (cr <= 0.05) {
      raw.push([-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]);
    } else {
      const segs = 6;
      const corners: Array<[number, number, number]> = [
        [hw - cr, -hd + cr, -Math.PI / 2],
        [hw - cr, hd - cr, 0],
        [-hw + cr, hd - cr, Math.PI / 2],
        [-hw + cr, -hd + cr, Math.PI],
      ];
      for (const [cx, cy, a0] of corners) {
        for (let i = 0; i <= segs; i++) {
          const a = a0 + (i / segs) * (Math.PI / 2);
          raw.push([cx + cr * Math.cos(a), cy + cr * Math.sin(a)]);
        }
      }
    }
  } else if (shape.kind === "circle") {
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      raw.push([hw * Math.cos(a), hd * Math.sin(a)]);
    }
  } else if (shape.kind === "polygon") {
    const n = Math.max(3, Math.min(24, Math.round(shape.sides || 6)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      raw.push([hw * Math.cos(a), hd * Math.sin(a)]);
    }
  } else if (shape.kind === "polyline" && shape.points && shape.points.length >= 2) {
    for (const [px, py] of shape.points) {
      raw.push([px, py]);
    }
  }

  const rad = ((shape.rotationDeg || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return raw.map(([px, py]) => [
    shape.xMm + px * c - py * s,
    shape.yMm + px * s + py * c,
  ]);
}

/**
 * Parse basic SVG geometry (<rect>, <circle>, <ellipse>, <polygon>, <polyline>, <path M/L/H/V/Z>)
 * into VectorShape entries centered on the stock.
 */
export function parseSvgToVectorShapes(svgText: string, stockW: number, stockD: number): VectorShape[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return [];

  let vbX = 0;
  let vbY = 0;
  let vbW = parseFloat(svgEl.getAttribute("width") || "100") || 100;
  let vbH = parseFloat(svgEl.getAttribute("height") || "100") || 100;
  const vb = svgEl.getAttribute("viewBox");
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      [vbX, vbY, vbW, vbH] = parts;
    }
  }

  const scale = Math.min((stockW * 0.75) / vbW, (stockD * 0.75) / vbH);
  const toWorldX = (x: number) => (x - vbX - vbW * 0.5) * scale;
  const toWorldY = (y: number) => -(y - vbY - vbH * 0.5) * scale;

  const out: VectorShape[] = [];
  let idx = 1;

  svgEl.querySelectorAll("rect").forEach((el) => {
    const x = parseFloat(el.getAttribute("x") || "0") || 0;
    const y = parseFloat(el.getAttribute("y") || "0") || 0;
    const w = (parseFloat(el.getAttribute("width") || "0") || 0) * scale;
    const h = (parseFloat(el.getAttribute("height") || "0") || 0) * scale;
    const rx = (parseFloat(el.getAttribute("rx") || "0") || 0) * scale;
    if (w > 0.5 && h > 0.5) {
      out.push({
        id: `vec-${Date.now()}-${idx++}`,
        name: `SVG Rect ${idx - 1}`,
        kind: "rect",
        visible: true,
        xMm: toWorldX(x + (w / scale) * 0.5),
        yMm: toWorldY(y + (h / scale) * 0.5),
        widthMm: w,
        heightMm: h,
        rotationDeg: 0,
        cornerRadiusMm: rx,
        sides: 4,
        depthMm: 4,
        role: "cutout",
      });
    }
  });

  svgEl.querySelectorAll("circle, ellipse").forEach((el) => {
    const cx = parseFloat(el.getAttribute("cx") || "0") || 0;
    const cy = parseFloat(el.getAttribute("cy") || "0") || 0;
    const rx = (parseFloat(el.getAttribute("rx") || el.getAttribute("r") || "0") || 0) * scale;
    const ry = (parseFloat(el.getAttribute("ry") || el.getAttribute("r") || "0") || 0) * scale;
    if (rx > 0.25 && ry > 0.25) {
      out.push({
        id: `vec-${Date.now()}-${idx++}`,
        name: `SVG Circle ${idx - 1}`,
        kind: "circle",
        visible: true,
        xMm: toWorldX(cx),
        yMm: toWorldY(cy),
        widthMm: rx * 2,
        heightMm: ry * 2,
        rotationDeg: 0,
        cornerRadiusMm: 0,
        sides: 40,
        depthMm: 4,
        role: "cutout",
      });
    }
  });

  svgEl.querySelectorAll("polygon, polyline").forEach((el) => {
    const ptsAttr = (el.getAttribute("points") || "").trim();
    const nums = ptsAttr.split(/[\s,]+/).map(Number).filter(Number.isFinite);
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pts.push([toWorldX(nums[i]), toWorldY(nums[i + 1])]);
    }
    if (pts.length >= 2) {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) * 0.5;
      const cy = (Math.min(...ys) + Math.max(...ys)) * 0.5;
      out.push({
        id: `vec-${Date.now()}-${idx++}`,
        name: `SVG Poly ${idx - 1}`,
        kind: "polyline",
        visible: true,
        xMm: cx,
        yMm: cy,
        widthMm: Math.max(1, Math.max(...xs) - Math.min(...xs)),
        heightMm: Math.max(1, Math.max(...ys) - Math.min(...ys)),
        rotationDeg: 0,
        cornerRadiusMm: 0,
        sides: pts.length,
        points: pts.map(([px, py]) => [px - cx, py - cy]),
        depthMm: 4,
        role: "cutout",
      });
    }
  });

  svgEl.querySelectorAll("path").forEach((el) => {
    const d = el.getAttribute("d") || "";
    const tokens = d.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
    if (!tokens) return;
    const pts: [number, number][] = [];
    let cmd = "M";
    let cx = 0;
    let cy = 0;
    let i = 0;
    while (i < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[i])) {
        cmd = tokens[i++];
        if (cmd === "Z" || cmd === "z") continue;
      }
      const nextNum = () => parseFloat(tokens[i++] || "0") || 0;
      if (cmd === "M" || cmd === "L") {
        cx = nextNum();
        cy = nextNum();
        pts.push([toWorldX(cx), toWorldY(cy)]);
        if (cmd === "M") cmd = "L";
      } else if (cmd === "m" || cmd === "l") {
        cx += nextNum();
        cy += nextNum();
        pts.push([toWorldX(cx), toWorldY(cy)]);
        if (cmd === "m") cmd = "l";
      } else if (cmd === "H") {
        cx = nextNum();
        pts.push([toWorldX(cx), toWorldY(cy)]);
      } else if (cmd === "h") {
        cx += nextNum();
        pts.push([toWorldX(cx), toWorldY(cy)]);
      } else if (cmd === "V") {
        cy = nextNum();
        pts.push([toWorldX(cx), toWorldY(cy)]);
      } else if (cmd === "v") {
        cy += nextNum();
        pts.push([toWorldX(cx), toWorldY(cy)]);
      } else if (cmd === "C") {
        nextNum(); nextNum(); nextNum(); nextNum();
        cx = nextNum();
        cy = nextNum();
        pts.push([toWorldX(cx), toWorldY(cy)]);
      } else if (cmd === "c") {
        nextNum(); nextNum(); nextNum(); nextNum();
        cx += nextNum();
        cy += nextNum();
        pts.push([toWorldX(cx), toWorldY(cy)]);
      } else {
        i += 1;
      }
    }
    if (pts.length >= 2) {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const midX = (Math.min(...xs) + Math.max(...xs)) * 0.5;
      const midY = (Math.min(...ys) + Math.max(...ys)) * 0.5;
      out.push({
        id: `vec-${Date.now()}-${idx++}`,
        name: `SVG Path ${idx - 1}`,
        kind: "polyline",
        visible: true,
        xMm: midX,
        yMm: midY,
        widthMm: Math.max(1, Math.max(...xs) - Math.min(...xs)),
        heightMm: Math.max(1, Math.max(...ys) - Math.min(...ys)),
        rotationDeg: 0,
        cornerRadiusMm: 0,
        sides: pts.length,
        points: pts.map(([px, py]) => [px - midX, py - midY]),
        depthMm: 4,
        role: "cutout",
      });
    }
  });

  return out;
}

function pointInPoly(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Rasterize vector shapes marked `model3d` or `carve` into a [0..1] relief grid
 * so Vector Sketches merge cleanly with Picture and 3D Model layers.
 */
export function rasterizeVectorShapesToGrid(
  shapes: VectorShape[],
  w: number,
  h: number,
  stockW: number,
  stockD: number,
  maxZMm: number
): Float32Array | null {
  const active = shapes.filter((s) => s.visible && (s.role === "model3d" || s.role === "carve"));
  if (active.length === 0) return null;

  const grid = new Float32Array(w * h);
  grid.fill(1.0);
  let hasCarve = false;
  let hasRaise = false;

  const polys = active.map((s) => ({ shape: s, poly: shapeToPolylineMm(s) })).filter((x) => x.poly.length >= 3);
  if (polys.length === 0) return null;

  for (const p of polys) {
    if (p.shape.role === "carve") hasCarve = true;
    else hasRaise = true;
  }
  if (hasRaise && !hasCarve) grid.fill(0.0);

  for (let row = 0; row < h; row++) {
    const wy = (0.5 - row / Math.max(1, h - 1)) * stockD;
    for (let col = 0; col < w; col++) {
      const wx = (col / Math.max(1, w - 1) - 0.5) * stockW;
      const idx = row * w + col;
      for (const { shape, poly } of polys) {
        if (pointInPoly(wx, wy, poly)) {
          const normDepth = Math.min(1, Math.max(0, shape.depthMm / Math.max(0.5, maxZMm)));
          if (shape.role === "carve") {
            grid[idx] = Math.min(grid[idx], 1.0 - normDepth);
          } else {
            grid[idx] = Math.max(grid[idx], normDepth);
          }
        }
      }
    }
  }
  return grid;
}

/**
 * Lightweight ASCII DXF parser for 2D CNC vectors (LINE, LWPOLYLINE, CIRCLE, ARC).
 * Automatically centers and scales geometry to fit inside `plateW × plateD` if oversized.
 */
export function parseDxfToVectorShapes(dxfText: string, plateW: number, plateD: number): VectorShape[] {
  const lines = dxfText.split(/\r?\n/);
  const pairs: Array<[number, string]> = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!Number.isNaN(code)) pairs.push([code, lines[i + 1].trim()]);
  }

  interface RawEnt {
    type: string;
    pts: Array<[number, number]>;
    cx?: number;
    cy?: number;
    r?: number;
    closed?: boolean;
  }

  const ents: RawEnt[] = [];
  let inEntities = false;
  let cur: RawEnt | null = null;
  let lx1 = 0, ly1 = 0, lx2 = 0, ly2 = 0;
  let px = 0;

  const flush = () => {
    if (!cur) return;
    if (cur.type === "LINE") {
      cur.pts = [[lx1, ly1], [lx2, ly2]];
      ents.push(cur);
    } else if (cur.type === "CIRCLE" && cur.r && cur.r > 0) {
      ents.push(cur);
    } else if (cur.type === "LWPOLYLINE" && cur.pts.length >= 2) {
      if (cur.closed && cur.pts.length >= 2) {
        cur.pts.push([cur.pts[0][0], cur.pts[0][1]]);
      }
      ents.push(cur);
    }
    cur = null;
  };

  for (const [code, val] of pairs) {
    if (code === 2 && val === "ENTITIES") { inEntities = true; continue; }
    if (code === 0 && val === "ENDSEC" && inEntities) { flush(); break; }
    if (!inEntities) continue;

    if (code === 0) {
      flush();
      if (val === "LINE" || val === "LWPOLYLINE" || val === "CIRCLE") {
        cur = { type: val, pts: [] };
        lx1 = ly1 = lx2 = ly2 = 0;
      }
      continue;
    }
    if (!cur) continue;
    const num = parseFloat(val);
    if (cur.type === "LINE") {
      if (code === 10) lx1 = num;
      else if (code === 20) ly1 = num;
      else if (code === 11) lx2 = num;
      else if (code === 21) ly2 = num;
    } else if (cur.type === "CIRCLE") {
      if (code === 10) cur.cx = num;
      else if (code === 20) cur.cy = num;
      else if (code === 40) cur.r = num;
    } else if (cur.type === "LWPOLYLINE") {
      if (code === 70) cur.closed = (parseInt(val, 10) & 1) === 1;
      else if (code === 10) px = num;
      else if (code === 20) cur.pts.push([px, num]);
    }
  }

  if (ents.length === 0) return [];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const e of ents) {
    if (e.type === "CIRCLE" && e.cx !== undefined && e.cy !== undefined && e.r !== undefined) {
      minX = Math.min(minX, e.cx - e.r);
      maxX = Math.max(maxX, e.cx + e.r);
      minY = Math.min(minY, e.cy - e.r);
      maxY = Math.max(maxY, e.cy + e.r);
    } else {
      for (const [x, y] of e.pts) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const spanW = Math.max(1, maxX - minX);
  const spanH = Math.max(1, maxY - minY);
  const fitScale = spanW > plateW * 0.95 || spanH > plateD * 0.95
    ? Math.min((plateW * 0.85) / spanW, (plateD * 0.85) / spanH)
    : 1;
  const midX = (minX + maxX) * 0.5;
  const midY = (minY + maxY) * 0.5;

  const baseTs = Date.now();
  return ents.map((e, idx): VectorShape => {
    if (e.type === "CIRCLE") {
      const d = Math.max(1, (e.r ?? 5) * 2 * fitScale);
      return {
        id: `dxf-${baseTs}-${idx}`,
        name: `DXF Circle ${idx + 1}`,
        kind: "circle",
        visible: true,
        xMm: ((e.cx ?? 0) - midX) * fitScale,
        yMm: ((e.cy ?? 0) - midY) * fitScale,
        widthMm: d,
        heightMm: d,
        rotationDeg: 0,
        cornerRadiusMm: 0,
        sides: 32,
        depthMm: 3,
        role: "cutout",
      };
    }
    const pts = e.pts.map(([x, y]): [number, number] => [(x - midX) * fitScale, (y - midY) * fitScale]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    return {
      id: `dxf-${baseTs}-${idx}`,
      name: `DXF ${e.type === "LINE" ? "Line" : "Poly"} ${idx + 1}`,
      kind: "polyline",
      visible: true,
      xMm: (x0 + x1) * 0.5,
      yMm: (y0 + y1) * 0.5,
      widthMm: Math.max(1, x1 - x0),
      heightMm: Math.max(1, y1 - y0),
      rotationDeg: 0,
      cornerRadiusMm: 0,
      sides: 4,
      points: pts,
      depthMm: 3,
      role: "cutout",
    };
  });
}

/**
 * Export visible VectorShapes as a clean ASCII DXF (LWPOLYLINE entities).
 */
export function exportVectorShapesToDxf(shapes: VectorShape[]): string {
  const out: string[] = [
    "0", "SECTION",
    "2", "ENTITIES",
  ];
  for (const sh of shapes) {
    if (!sh.visible) continue;
    const pts = shapeToPolylineMm(sh);
    if (pts.length < 2) continue;
    const closed = sh.kind !== "polyline" || (
      pts.length > 2 &&
      Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.01
    );
    out.push("0", "LWPOLYLINE", "8", "0", "90", String(pts.length), "70", closed ? "1" : "0");
    for (const [x, y] of pts) {
      out.push("10", x.toFixed(3), "20", y.toFixed(3));
    }
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\n");
}
