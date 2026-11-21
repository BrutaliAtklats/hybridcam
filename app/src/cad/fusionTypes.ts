import { SolidModelNode, SolidPrimitiveKind } from "../solidCsg";

export interface ConstructionPlane {
  id: string;
  name: string;
  axis: "XY" | "XZ" | "YZ";
  offsetMm: number;
  visible: boolean;
}

export interface OriginVisibility {
  master: boolean;
  xy: boolean;
  xz: boolean;
  yz: boolean;
  axes: boolean;
}

export interface SectionAnalysisState {
  enabled: boolean;
  axis: "x" | "y" | "z";
  offsetMm: number;
  flipped: boolean;
}

export interface AppearancePreset {
  id: string;
  name: string;
  hex: string;
  metalness: number;
  roughness: number;
}

export const APPEARANCE_PRESETS: AppearancePreset[] = [
  { id: "aluminum", name: "Brushed Aluminum", hex: "#cbd5e1", metalness: 0.72, roughness: 0.28 },
  { id: "steel", name: "Machined Steel", hex: "#94a3b8", metalness: 0.85, roughness: 0.22 },
  { id: "brass", name: "Polished Brass", hex: "#eab308", metalness: 0.82, roughness: 0.2 },
  { id: "copper", name: "Raw Copper", hex: "#ea580c", metalness: 0.8, roughness: 0.25 },
  { id: "walnut", name: "Dark Walnut Wood", hex: "#7c4a2d", metalness: 0.04, roughness: 0.62 },
  { id: "oak", name: "Natural Oak", hex: "#c89b6e", metalness: 0.04, roughness: 0.58 },
  { id: "anodizedBlue", name: "Anodized Blue", hex: "#2563eb", metalness: 0.65, roughness: 0.3 },
  { id: "anodizedRed", name: "Anodized Red", hex: "#dc2626", metalness: 0.65, roughness: 0.3 },
  { id: "matteBlack", name: "Matte Delrin / ABS", hex: "#334155", metalness: 0.08, roughness: 0.55 },
  { id: "acrylic", name: "Frosted Acrylic", hex: "#7dd3fc", metalness: 0.1, roughness: 0.15 },
];

export type FusionDialogKind =
  | "sketchPlane"
  | "createSolid"
  | "editSolid"
  | "moveCopy"
  | "fillet"
  | "chamfer"
  | "scale"
  | "align"
  | "combine"
  | "splitBody"
  | "offsetPlane"
  | "rectPattern"
  | "circPattern"
  | "mirror"
  | "sectionAnalysis"
  | "appearance"
  | "sketchPattern"
  | "sketchOffset"
  | "measure";

export interface FusionOpDialogState {
  kind: FusionDialogKind;
  title: string;
  /** Live draft solid for createSolid / editSolid / moveCopy / fillet / chamfer / scale (previewed live in 3D!) */
  draftSolid?: SolidModelNode;
  editingSolidId?: string;
  /** Fusion 360 Move / Copy (M) state */
  moveMode?: "translate" | "rotate" | "free";
  moveDx?: number;
  moveDy?: number;
  moveDz?: number;
  moveRx?: number;
  moveRy?: number;
  moveRz?: number;
  moveCreateCopy?: boolean;
  origSolid?: SolidModelNode;
  /** Scale state */
  scaleUniform?: boolean;
  /** Align state */
  alignTargetId?: string;
  alignMode?: "floor" | "centerXY" | "topOfTarget" | "centerOfTarget";
  /** Combine state */
  combineToolId?: string;
  combineOp?: "union" | "subtract" | "intersect";
  combineKeepTools?: boolean;
  /** Split Body state */
  splitAxis?: "X" | "Y" | "Z";
  splitPosMm?: number;
  /** Pattern / Mirror / Offset Plane state */
  countX?: number;
  countY?: number;
  spacingX?: number;
  spacingY?: number;
  circCount?: number;
  circRadius?: number;
  mirrorAxis?: "X" | "Y";
  planeAxis?: "XY" | "XZ" | "YZ";
  planeOffsetMm?: number;
  planeName?: string;
  /** Sketch Pattern & Offset mode */
  sketchPatternType?: "rect" | "circ";
  sketchOffsetMm?: number;
}

export interface BoltHolePreset {
  id: string;
  label: string;
  clearanceMm: number;
  cbDiamMm: number;
  cbDepthMm: number;
}

export const BOLT_HOLE_PRESETS: BoltHolePreset[] = [
  { id: "m3", label: "M3", clearanceMm: 3.4, cbDiamMm: 6.0, cbDepthMm: 3.2 },
  { id: "m4", label: "M4", clearanceMm: 4.5, cbDiamMm: 7.5, cbDepthMm: 4.2 },
  { id: "m5", label: "M5", clearanceMm: 5.5, cbDiamMm: 9.0, cbDepthMm: 5.2 },
  { id: "m6", label: "M6", clearanceMm: 6.6, cbDiamMm: 10.5, cbDepthMm: 6.2 },
  { id: "m8", label: "M8", clearanceMm: 9.0, cbDiamMm: 14.0, cbDepthMm: 8.2 },
  { id: "q20", label: '1/4"-20', clearanceMm: 6.8, cbDiamMm: 10.5, cbDepthMm: 6.6 },
];

export const SOLID_KIND_LABELS: Record<SolidPrimitiveKind, string> = {
  box: "Box",
  cylinder: "Cylinder",
  sphere: "Sphere",
  cone: "Cone",
  torus: "Torus",
  wedge: "Wedge",
  hole: "Hole",
  pipe: "Pipe",
  extrude: "Extrude",
  revolve: "Revolve",
  loft: "Loft",
  sweep: "Sweep",
  shell: "Shell",
  rib: "Rib",
  emboss: "Emboss Text",
  stlMesh: "STL Body",
};
