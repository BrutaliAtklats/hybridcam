export type Units = "mm" | "in";
export type MaterialKey = "Hardwood" | "Softwood" | "MdfPlywood" | "AcrylicHdpe" | "Aluminum6061";
export type ZZeroMode = "top" | "spoilboard";
export type XyOriginMode = "front-left" | "front-right" | "back-left" | "back-right" | "center";

export function getXyOriginOffsetMm(job: Pick<JobConfig, "widthMm" | "depthMm" | "xyOrigin">): [number, number] {
  const ox = job.xyOrigin.includes("left")
    ? job.widthMm / 2
    : job.xyOrigin.includes("right")
    ? -job.widthMm / 2
    : 0;
  const oy = job.xyOrigin.includes("front")
    ? job.depthMm / 2
    : job.xyOrigin.includes("back")
    ? -job.depthMm / 2
    : 0;
  return [ox, oy];
}
export type StrategyKey =
  | "Adaptive2D"
  | "AdaptiveOffset2D"
  | "Pocket2D"
  | "Contour2D"
  | "VCarve"
  | "PhotoVCarve"
  | "ReliefRough3D"
  | "ReliefFinish3D"
  | "SteepShallow3D"
  | "Spiral3D"
  | "Pencil3D"
  | "Drilling";

export interface JobConfig {
  name: string;
  units: Units;
  widthMm: number;
  depthMm: number;
  thicknessMm: number;
  material: MaterialKey;
  zZero: ZZeroMode;
  xyOrigin: XyOriginMode;
  clearanceZMm: number;
}

export type ToolCategory = "Flat" | "O-Flute" | "Ballnose" | "Tapered" | "V-Bit" | "Engraving" | "Surfacing";

export interface ToolPreset {
  number: number;
  name: string;
  sizeLabel: string;
  category: ToolCategory;
  diameterMm: number;
  rpm: number;
  feedMmMin: number;
  plungeMmMin: number;
  stepdownMm: number;
  stepoverPct: number;
}

export const MATERIAL_LABELS: Record<MaterialKey, { title: string; subtitle: string; color: number }> = {
  Hardwood: { title: "Hardwood", subtitle: "Oak, Walnut, Maple, Cherry", color: 0x9c6b3f },
  Softwood: { title: "Softwood", subtitle: "Pine, Cedar, Douglas Fir", color: 0xc99c67 },
  MdfPlywood: { title: "MDF / Plywood", subtitle: "Baltic Birch, MDF, Melamine", color: 0xb8966e },
  AcrylicHdpe: { title: "Acrylic / HDPE", subtitle: "Cast Acrylic, Delrin, HDPE", color: 0x5c8ab8 },
  Aluminum6061: { title: "Aluminum 6061", subtitle: "6061-T6, Brass, Soft Metals", color: 0x8e99a4 },
};

const BASE_TOOLS: Array<{
  number: number;
  name: string;
  sizeLabel: string;
  category: ToolCategory;
  diameterMm: number;
  baseFeed: number;
  baseStepover: number;
  stepdownRatio: number;
}> = [
  { number: 6, name: "3mm 2-Flute Upcut Flat", sizeLabel: "3 mm", category: "Flat", diameterMm: 3.0, baseFeed: 1134, baseStepover: 40, stepdownRatio: 0.5 },
  { number: 4, name: '1/8" (3.175mm) 2-Flute Upcut Flat', sizeLabel: '1/8" (3.18 mm)', category: "Flat", diameterMm: 3.175, baseFeed: 1200, baseStepover: 40, stepdownRatio: 0.5 },
  { number: 5, name: "6mm 2-Flute Upcut Flat", sizeLabel: "6 mm", category: "Flat", diameterMm: 6.0, baseFeed: 2268, baseStepover: 40, stepdownRatio: 0.5 },
  { number: 1, name: '1/4" (6.35mm) 2-Flute Upcut Flat', sizeLabel: '1/4" (6.35 mm)', category: "Flat", diameterMm: 6.35, baseFeed: 2400, baseStepover: 40, stepdownRatio: 0.5 },
  { number: 2, name: '1/4" (6.35mm) 2-Flute Downcut Flat', sizeLabel: '1/4" Downcut', category: "Flat", diameterMm: 6.35, baseFeed: 2400, baseStepover: 40, stepdownRatio: 0.5 },
  { number: 3, name: '1/4" (6.35mm) Compression Spiral', sizeLabel: '1/4" Compress', category: "Flat", diameterMm: 6.35, baseFeed: 2400, baseStepover: 40, stepdownRatio: 0.5 },
  { number: 22, name: "8mm 2-Flute Upcut Flat", sizeLabel: "8 mm", category: "Flat", diameterMm: 8.0, baseFeed: 2900, baseStepover: 40, stepdownRatio: 0.5 },

  { number: 8, name: '1/8" (3.175mm) Single O-Flute', sizeLabel: '1/8" (3.18 mm)', category: "O-Flute", diameterMm: 3.175, baseFeed: 1200, baseStepover: 35, stepdownRatio: 0.45 },
  { number: 7, name: '1/4" (6.35mm) Single O-Flute', sizeLabel: '1/4" (6.35 mm)', category: "O-Flute", diameterMm: 6.35, baseFeed: 2400, baseStepover: 35, stepdownRatio: 0.45 },
  { number: 23, name: "8mm Single O-Flute", sizeLabel: "8 mm", category: "O-Flute", diameterMm: 8.0, baseFeed: 2800, baseStepover: 35, stepdownRatio: 0.45 },

  { number: 10, name: '1/8" (3.175mm) 2-Flute Ballnose', sizeLabel: '1/8" (3.18 mm)', category: "Ballnose", diameterMm: 3.175, baseFeed: 2800, baseStepover: 8, stepdownRatio: 0.3 },
  { number: 24, name: "6mm 2-Flute Ballnose", sizeLabel: "6 mm", category: "Ballnose", diameterMm: 6.0, baseFeed: 2800, baseStepover: 8, stepdownRatio: 0.25 },
  { number: 9, name: '1/4" (6.35mm) 2-Flute Ballnose', sizeLabel: '1/4" (6.35 mm)', category: "Ballnose", diameterMm: 6.35, baseFeed: 2800, baseStepover: 8, stepdownRatio: 0.25 },
  { number: 25, name: "8mm 2-Flute Ballnose", sizeLabel: "8 mm", category: "Ballnose", diameterMm: 8.0, baseFeed: 3100, baseStepover: 8, stepdownRatio: 0.25 },

  { number: 11, name: "Tapered Ballnose R0.25mm (5.4°)", sizeLabel: "R0.25 mm (0.5mm)", category: "Tapered", diameterMm: 0.5, baseFeed: 1800, baseStepover: 8, stepdownRatio: 1.5 },
  { number: 12, name: "Tapered Ballnose R0.5mm (4.8°)", sizeLabel: "R0.5 mm (1.0mm)", category: "Tapered", diameterMm: 1.0, baseFeed: 1800, baseStepover: 8, stepdownRatio: 1.5 },
  { number: 13, name: "Tapered Ballnose R1.0mm (3.6°)", sizeLabel: "R1.0 mm (2.0mm)", category: "Tapered", diameterMm: 2.0, baseFeed: 2800, baseStepover: 8, stepdownRatio: 1.5 },

  { number: 14, name: "30° V-Bit (Fine Detail)", sizeLabel: "30° (6.35 mm)", category: "V-Bit", diameterMm: 6.35, baseFeed: 1200, baseStepover: 15, stepdownRatio: 0.5 },
  { number: 15, name: '60° V-Bit (1/2")', sizeLabel: '60° (12.7 mm)', category: "V-Bit", diameterMm: 12.7, baseFeed: 1800, baseStepover: 15, stepdownRatio: 0.25 },
  { number: 16, name: '90° V-Bit (1/2")', sizeLabel: '90° (12.7 mm)', category: "V-Bit", diameterMm: 12.7, baseFeed: 1800, baseStepover: 15, stepdownRatio: 0.25 },
  { number: 17, name: '120° V-Bit (1")', sizeLabel: '120° (25.4 mm)', category: "V-Bit", diameterMm: 25.4, baseFeed: 1800, baseStepover: 15, stepdownRatio: 0.2 },

  { number: 18, name: "20° Engraving Bit (0.2mm Tip)", sizeLabel: "20° (0.2 mm)", category: "Engraving", diameterMm: 0.2, baseFeed: 1200, baseStepover: 15, stepdownRatio: 1.0 },
  { number: 19, name: '1" (25.4mm) Spoilboard Surfacing', sizeLabel: '1" (25.4 mm)', category: "Surfacing", diameterMm: 25.4, baseFeed: 3600, baseStepover: 45, stepdownRatio: 0.08 },
];

export function getToolsForMaterial(material: MaterialKey): ToolPreset[] {
  const matFactor: Record<MaterialKey, { rpm: number; feedMult: number; depthMult: number }> = {
    Hardwood: { rpm: 18000, feedMult: 1.0, depthMult: 1.0 },
    Softwood: { rpm: 18000, feedMult: 1.3, depthMult: 1.3 },
    MdfPlywood: { rpm: 18000, feedMult: 1.2, depthMult: 1.15 },
    AcrylicHdpe: { rpm: 15000, feedMult: 0.8, depthMult: 0.7 },
    Aluminum6061: { rpm: 14000, feedMult: 0.38, depthMult: 0.3 },
  };
  const f = matFactor[material];
  return BASE_TOOLS.map((t) => ({
    number: t.number,
    name: t.name,
    sizeLabel: t.sizeLabel,
    category: t.category,
    diameterMm: t.diameterMm,
    rpm: f.rpm,
    feedMmMin: Math.round(t.baseFeed * f.feedMult),
    plungeMmMin: Math.round(t.baseFeed * f.feedMult * 0.32),
    stepdownMm: Number(Math.max(0.25, Math.min(6.0, t.diameterMm * t.stepdownRatio * f.depthMult)).toFixed(2)),
    stepoverPct: t.baseStepover,
  }));
}

export interface PreviewPoint {
  x: number;
  y: number;
  z: number;
  rapid: boolean;
}

export function generatePreviewToolpath(
  job: JobConfig,
  strategy: StrategyKey,
  tool: ToolPreset,
  reliefHeights: Float32Array,
  gridW: number,
  gridH: number,
  reliefMaxZ: number
): PreviewPoint[] {
  const pts: PreviewPoint[] = [];
  const safeZ = job.zZero === "top" ? job.clearanceZMm : job.thicknessMm + job.clearanceZMm;
  const topZ = job.zZero === "top" ? 0 : job.thicknessMm;
  const margin = Math.min(12, job.widthMm * 0.08, job.depthMm * 0.08);
  const x0 = -job.widthMm / 2 + margin;
  const x1 = job.widthMm / 2 - margin;
  const y0 = -job.depthMm / 2 + margin;
  const y1 = job.depthMm / 2 - margin;

  const sampleRelief = (wx: number, wy: number) => {
    const u = Math.max(0, Math.min(1, (wx + job.widthMm / 2) / job.widthMm));
    const v = Math.max(0, Math.min(1, (wy + job.depthMm / 2) / job.depthMm));
    const px = Math.min(gridW - 1, Math.round(u * (gridW - 1)));
    const py = Math.min(gridH - 1, Math.round(v * (gridH - 1)));
    return topZ - reliefMaxZ + reliefHeights[py * gridW + px] * reliefMaxZ;
  };

  if (strategy === "Contour2D" || strategy === "Pocket2D" || strategy === "Adaptive2D" || strategy === "AdaptiveOffset2D") {
    const rings = strategy === "Contour2D" ? 1 : 5;
    for (let r = 0; r < rings; r++) {
      const inset = r * Math.max(4, tool.diameterMm * 0.8);
      const ax = x0 + inset;
      const bx = x1 - inset;
      const ay = y0 + inset;
      const by = y1 - inset;
      if (ax >= bx || ay >= by) break;
      const z = topZ - Math.min(job.thicknessMm * 0.6, tool.stepdownMm * 2);
      pts.push({ x: ax, y: ay, z: safeZ, rapid: true });
      pts.push({ x: ax, y: ay, z, rapid: false });
      pts.push({ x: bx, y: ay, z, rapid: false });
      pts.push({ x: bx, y: by, z, rapid: false });
      pts.push({ x: ax, y: by, z, rapid: false });
      pts.push({ x: ax, y: ay, z, rapid: false });
      pts.push({ x: ax, y: ay, z: safeZ, rapid: true });
    }
  } else if (strategy === "VCarve" || strategy === "PhotoVCarve") {
    const lines = strategy === "PhotoVCarve" ? 18 : 10;
    for (let i = 0; i < lines; i++) {
      const y = y0 + ((y1 - y0) * i) / Math.max(1, lines - 1);
      const forward = i % 2 === 0;
      const startX = forward ? x0 : x1;
      pts.push({ x: startX, y, z: safeZ, rapid: true });
      const steps = 28;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = forward ? x0 + (x1 - x0) * t : x1 - (x1 - x0) * t;
        const rz = sampleRelief(x, y);
        const vdepth = strategy === "PhotoVCarve" ? -0.8 - (1 - Math.abs(Math.sin(t * Math.PI))) * 1.4 : -2.2 * Math.sin(t * Math.PI);
        pts.push({ x, y, z: rz + vdepth, rapid: false });
      }
      const endX = forward ? x1 : x0;
      pts.push({ x: endX, y, z: safeZ, rapid: true });
    }
  } else {
    // 3D Relief Roughing / Finishing raster
    const lines = strategy === "ReliefRough3D" ? 14 : 28;
    for (let i = 0; i < lines; i++) {
      const y = y0 + ((y1 - y0) * i) / Math.max(1, lines - 1);
      const forward = i % 2 === 0;
      const startX = forward ? x0 : x1;
      if (i === 0) pts.push({ x: startX, y, z: safeZ, rapid: true });
      const steps = 36;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = forward ? x0 + (x1 - x0) * t : x1 - (x1 - x0) * t;
        const z = sampleRelief(x, y) + (strategy === "ReliefRough3D" ? 0.5 : 0);
        pts.push({ x, y, z, rapid: false });
      }
    }
    const last = pts[pts.length - 1];
    if (last) pts.push({ x: last.x, y: last.y, z: safeZ, rapid: true });
  }

  return pts;
}

export function buildGcode(job: JobConfig, tool: ToolPreset, pts: PreviewPoint[], dialect: string): string {
  const lines: string[] = [
    `( ${job.name} - ${dialect} - Generated by HybridCAM )`,
    `G90 G94 G17`,
    job.units === "mm" ? "G21" : "G20",
    `( Tool T${tool.number}: ${tool.name} | Material: ${job.material} )`,
    `S${tool.rpm} M3`,
    `G0 Z${job.clearanceZMm.toFixed(3)}`,
  ];
  const [ox, oy] = getXyOriginOffsetMm(job);

  for (const p of pts) {
    const x = p.x + ox;
    const y = p.y + oy;
    if (p.rapid) {
      lines.push(`G0 X${x.toFixed(3)} Y${y.toFixed(3)} Z${p.z.toFixed(3)}`);
    } else {
      lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} Z${p.z.toFixed(3)} F${tool.feedMmMin}`);
    }
  }
  lines.push("M5", `G0 Z${job.clearanceZMm.toFixed(3)}`, "M30");
  return lines.join("\n");
}
