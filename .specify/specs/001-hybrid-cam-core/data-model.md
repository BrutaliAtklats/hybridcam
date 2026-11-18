# Data Model: HybridCAM Core

**Feature**: `001-hybrid-cam-core` | **Date**: 2026-11-17

## Core Domain Entities

### 1. `Project`
- `id: Uuid`
- `name: String`
- `version: SemVer` (schema version for backward-compatible `.hcam` files)
- `units: Units` (`Millimeters` | `Inches`)
- `stock: StockDefinition` (`Box { width, depth, height, offsets }`, `Cylinder { diameter, height }`)
- `wcs: WorkCoordinateSystem` (`origin_preset`, `custom_offset: Vec3`, `safe_z`, `retract_z`, `clearance_z`)
- `vectors: Vec<VectorLayer>`
- `meshes: Vec<MeshAsset>`
- `relief_stack: ReliefStack`
- `tools: Vec<Tool>`
- `operations: Vec<Operation>`
- `post_config: PostProcessorConfig`

### 2. `Tool`
- `id: Uuid`
- `number: u32` (T1, T2, ...)
- `name: String`
- `geometry: ToolGeometry`
  - `FlatEndmill { diameter, flute_length }`
  - `Ballnose { diameter, flute_length }`
  - `Bullnose { diameter, corner_radius, flute_length }`
  - `VBit { diameter, included_angle_deg, tip_flat_diameter, flute_length }`
  - `TaperedBallnose { tip_radius, half_angle_deg, shank_diameter, flute_length }`
  - `Chamfer { diameter, angle_deg, tip_diameter }`
  - `Drill { diameter, point_angle_deg, flute_length }`
- `overall_length: f64`
- `holder: Option<HolderProfile>` (list of `(z_offset, diameter)` cylindrical/conical segments)
- `cutting_data: CuttingData` (`spindle_rpm`, `feed_rate`, `plunge_rate`, `ramp_rate`, `stepdown`, `stepover`)

### 3. `VectorLayer` & `VectorShape`
- `id: Uuid`, `name: String`, `visible: bool`, `locked: bool`
- `shapes: Vec<VectorShape>`
  - `id: Uuid`, `closed: bool`, `subpaths: Vec<BezPath>` (cubic Bézier / line / arc segments)

### 4. `ReliefStack` & `ReliefComponent`
- `canvas_bounds: Rect2D` (physical mm), `resolution_mm_per_px: f32`
- `components: Vec<ReliefComponent>`
  - `id: Uuid`, `name: String`, `visible: bool`
  - `source: ReliefSource` (`DepthMap16Bit`, `ProjectedMesh`, `SculptLayer`)
  - `grid: ReliefGrid` (`width_px`, `height_px`, `heights: Vec<f32>`)
  - `transform: ReliefTransform2D` (`position`, `scale`, `rotation_deg`, `z_scale_mm`, `base_height_mm`)
  - `combine_mode: CombineMode` (`Add`, `Subtract`, `MergeHigh`, `MergeLow`, `Multiply`)
  - `smooth_radius_px: f32`, `gamma: f32`

### 5. `Operation` & `Toolpath`
- `id: Uuid`, `name: String`, `enabled: bool`, `status: OpStatus` (`Clean`, `Dirty`, `Computing`, `Error(String)`)
- `tool_id: Uuid`
- `strategy: StrategyParams`
  - `Adaptive2D { optimal_load, stepdown, stock_to_leave, climb, ramp_angle }`
  - `Pocket2D { stepover, stepdown, finish_pass, ramp_type }`
  - `Contour2D { side: Inside|Outside|OnLine, tabs: Option<TabConfig>, lead_in_out }`
  - `FaceMill { stepover, stepdown, pass_extension }`
  - `Drill { peck_depth, dwell_ms, retract_mode }`
  - `VCarve { max_depth, flat_clearance_tool_id: Option<Uuid>, project_onto_relief: bool }`
  - `ReliefRough3D { stepdown, stepover, stock_to_leave }`
  - `ReliefFinish3D { pattern: Raster|Offset|Scallop|SteepShallow|Pencil, stepover, angle_deg, rest_machining: bool }`
- `target_refs: TargetSelection` (vector IDs, relief region, or mesh faces)
- `cached_toolpath: Option<Toolpath>`
  - `segments: Vec<MotionSegment>` (`Rapid`, `Linear`, `ArcCW`, `ArcCCW`)
  - `estimated_time_sec: f64`, `total_cut_distance_mm: f64`
  - `warnings: Vec<SafetyWarning>`
