# Contracts: HybridCAM Kernel API & IPC

**Feature**: `001-hybrid-cam-core` | **Date**: 2026-11-17

## 1. Headless Engine Crate Boundaries

- `hybridcam-geom`: 2D Bézier/polygon math, booleans, offsets, dogbone fillets, Voronoi medial axis, SVG/DXF/mesh/16-bit depth-map importers.
- `hybridcam-relief`: `ReliefGrid`, non-destructive `ReliefStack` compositing, sculpting brush kernels, mesh-to-heightfield projection.
- `hybridcam-cam`: Toolpath generators (2D Adaptive, Pocket, Contour, Face, Drill, True/3D V-Carve, 3D Rough/Finish/Rest), `CancellationToken` & progress callbacks.
- `hybridcam-sim`: 3-axis dexel stock simulator, gouge & holder collision detector, cycle time estimator.
- `hybridcam-post`: Post-processor trait & built-in dialects (GRBL, Mach3/4, LinuxCNC, Masso, ISO/Fanuc).
- `hybridcam-cli`: Headless CLI for batch project validation, toolpath generation, simulation checks, and G-code export.

## 2. UI <-> Engine IPC Commands (Tauri Commands)

| Command | Input | Output | Notes |
|---|---|---|---|
| `project_new` / `project_load` / `project_save` | Path / Project config | `ProjectSummary` | Versioned `.hcam` JSON + binary heightfield bundle |
| `import_asset` | File path + `AssetKind` | `AssetImportResult` | Supports SVG, DXF, STL, OBJ, 16-bit PNG/TIFF/BMP |
| `relief_apply_brush` | `component_id`, `BrushStroke` | `DirtyRectMeshPatch` | Incremental mesh patch for 60fps sculpting |
| `relief_composite` | `ReliefStack` params | `CompositeMeshBuffers` | Returns vertex/normal/index buffers |
| `vector_op` | `VectorOpRequest` | `VectorLayer` | Offset, Boolean, Auto-Trace, Dogbone, Inlay Plug |
| `compute_operation` | `operation_id` | `JobHandle` | Async background compute with progress events & cancel |
| `cancel_job` | `job_id` | `()` | Cooperative cancellation via atomic flag |
| `simulate_setup` | `operation_ids`, `resolution_mm` | `SimulationResult` | Stock mesh, gouge markers, collision list, cycle time |
| `export_gcode` | `operation_ids`, `post_id`, `out_path` | `ExportReport` | Validates safety warnings before writing |
