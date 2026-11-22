# Data Model: Autodesk Fusion 360-Style Parametric CAD & Sketching

## 1. `UserParameter` (`app/src/parametricCad.ts`)
- `id: string`
- `name: string` (identifier used in formulas, e.g. `wall`, `hole_d`, `fillet_r`)
- `expression: string` (numeric literal or formula using `stock_w`, `stock_d`, `stock_t`, `+ - * / ^`, `sin`, `cos`, `tan`, `sqrt`, `min`, `max`, `pi`)
- `unit: "mm" | "deg" | ""`
- `comment?: string`

## 2. `SolidModelNode` (`app/src/solidCsg.ts`)
- `id: string`, `name: string`
- `kind: "box" | "cylinder" | "sphere" | "cone" | "torus" | "wedge" | "hole" | "pipe" | "extrude" | "revolve" | "loft" | "sweep" | "shell" | "rib" | "emboss" | "stlMesh"`
- `visible: boolean`, `suppressed?: boolean`
- `boolOp: "union" | "subtract" | "intersect"`
- `xMm`, `yMm`, `zMm`, `widthMm`, `depthMm`, `heightMm`, `rotXDeg`, `rotYDeg`, `rotZDeg`, `bevelMm`: `number`
- `bevelStyle?: "fillet" | "chamfer"`
- `holeType?: "simple" | "counterbore" | "countersink"`, `counterboreDiamMm?: number`, `counterboreDepthMm?: number`
- `extrudeDir?: "oneSide" | "symmetric" | "twoSides"`, `heightMm2?: number`
- `taperDeg?: number`, `revolveDeg?: number`, `wallThicknessMm?: number`
- `embossText?: string`, `customStlPositions?: number[]`
- `scaleX?: number`, `scaleY?: number`, `scaleZ?: number`, `colorHex?: string`
- `sketchId?: string`, `sketchId2?: string`
- `paramExprs?: Record<string, string>`

## 3. `VectorShape` (`app/src/vectorSketch.ts`)
- `id: string`, `name: string`
- `kind: "rect" | "circle" | "polygon" | "polyline" | "text" | "arc" | "spline"`
- `visible: boolean`, `construction?: boolean`
- `xMm`, `yMm`, `widthMm`, `heightMm`, `rotationDeg`, `cornerRadiusMm`, `sides`, `depthMm`: `number`
- `points?: [number, number][]`, `text?: string`
- `role: "carve" | "cutout" | "vcarve" | "model3d"`
- `sketchZMm?: number`
- `paramExprs?: Record<string, string>`

## 4. `ConstructionPlane` & `FusionOpDialogState` (`app/src/cad/fusionTypes.ts`)
- `ConstructionPlane`: `{ id, name, axis: "XY" | "XZ" | "YZ", offsetMm, visible }`
- `FusionOpDialogState`: holds live uncommitted `draftSolid` and dialog parameters for all 18 Fusion operation dialogs (`sketchPlane`, `createSolid`, `editSolid`, `moveCopy`, `fillet`, `chamfer`, `scale`, `align`, `combine`, `splitBody`, `offsetPlane`, `rectPattern`, `circPattern`, `mirror`, `sectionAnalysis`, `appearance`, `sketchPattern`, `sketchOffset`, `measure`).
