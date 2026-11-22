# Tasks: HybridCAM — Precision Engineering & Artistic Relief CAM

**Input**: Design documents from `.specify/specs/001-hybrid-cam-core/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/cam-kernel-api.md`

**Tests**: Included per Constitution Principle III (Test-First & Simulation Verification).

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Create Rust workspace `Cargo.toml` and crate directories under `crates/` (`hybridcam-geom`, `hybridcam-relief`, `hybridcam-cam`, `hybridcam-sim`, `hybridcam-post`, `hybridcam-cli`)
- [x] T002 [P] Initialize Tauri v2 + React + TypeScript + Three.js frontend under `app/`
- [x] T003 [P] Configure `rustfmt`, `clippy`, and `eslint`/`prettier` formatting & linting

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T004 Define core domain models (`Project`, `Units`, `StockDefinition`, `WorkCoordinateSystem`, `Tool`, `Operation`, `Toolpath`) in `crates/hybridcam-geom/src/model.rs` and `crates/hybridcam-cam/src/model.rs`
- [x] T005 [P] Implement `.hcam` project serialization/deserialization and unit conversion helpers (`mm` <-> `in`)
- [x] T006 [P] Implement cooperative `CancellationToken` and progress reporting channel for async CAM jobs
- [x] T007 Implement 2D Bézier flattening (`kurbo`), polygon booleans & offsetting (`i_overlay`), and vector validation/repair in `crates/hybridcam-geom/src/vector.rs`
- [x] T008 [P] Implement SVG (`usvg`), DXF (`dxf`), STL (`stl_io`), OBJ (`tobj`), and 16-bit PNG/TIFF (`image`/`tiff`) asset importers in `crates/hybridcam-geom/src/import.rs`

**Checkpoint**: Foundation ready — User Story phases can begin.

## Phase 3: User Story 1 — Setup, Stock, WCS & Precision 2.5D/Adaptive Machining (Priority: P1) 🎯 MVP

- [x] T009 [P] [US1] Write unit & tolerance tests for 2D Pocket, 2D Contour (tabs/leads), Face Mill, Drill, and Adaptive Clearing in `crates/hybridcam-cam/tests/test_25d.rs`
- [x] T010 [US1] Implement Parametric Tool Library pre-populated with all popular carving tools & endmills and material-specific recommended feeds/speeds (Hardwood, Softwood, MDF/Plywood, Acrylic/HDPE, Aluminum 6061) in `crates/hybridcam-cam/src/tools.rs`
- [x] T011 [US1] Implement 2D Contour (inside/outside/on-line, holding tabs, lead-in/out, helical/ramp entry) and 2D Pocket in `crates/hybridcam-cam/src/ops_2d.rs`
- [x] T012 [US1] Implement 2D Adaptive Clearing (constant engagement trochoidal path planner) in `crates/hybridcam-cam/src/adaptive_2d.rs`
- [x] T013 [US1] Implement Face Milling and Drilling/Peck Drilling in `crates/hybridcam-cam/src/ops_drill_face.rs`

## Phase 4: User Story 2 — Depth-Map / Heightfield 3D Relief Modeling & Sculpting (Priority: P1) 🎯 MVP

- [x] T014 [P] [US2] Write tests for 16-bit depth-map import, non-destructive `ReliefStack` combine modes, and sculpting brushes in `crates/hybridcam-relief/tests/test_relief.rs`
- [x] T015 [US2] Implement `ReliefGrid` (16-bit heightmap import, Z-scaling, Gaussian/bilateral smoothing, contrast/gamma) in `crates/hybridcam-relief/src/grid.rs`
- [x] T016 [US2] Implement `ReliefStack` composition (`Add`, `Subtract`, `MergeHigh`, `MergeLow`, `Multiply`) and STL/OBJ Z-buffer projection in `crates/hybridcam-relief/src/stack.rs`
- [x] T017 [US2] Implement interactive sculpting brushes (`Raise`, `Lower`, `Smooth`, `Flatten`, `Smudge`) with dirty-rect mesh patch output in `crates/hybridcam-relief/src/sculpt.rs`

## Phase 5: User Story 3 — True V-Carving, Flat-Bottom & 3D-Projected V-Carving (Priority: P1) 🎯 MVP

- [x] T018 [P] [US3] Write tests for Voronoi medial-axis depth mapping, sharp corner lifts, flat-bottom clearance, and 3D relief projection in `crates/hybridcam-cam/tests/test_vcarve.rs`
- [x] T019 [US3] Implement Voronoi medial-axis V-Carve solver (`boostvoronoi`) with variable Z depth and corner Z-lifts in `crates/hybridcam-cam/src/vcarve.rs`
- [x] T020 [US3] Implement Flat-Bottom V-Carve clearance splitting (flat endmill pocket + V-bit perimeter bevel) and 3D-Projected V-Carving onto `ReliefGrid`

## Phase 6: User Story 4 — 3D Engineering Toolpaths & Rest Machining (Priority: P2)

- [x] T021 [P] [US4] Write tests for 3D drop-cutter accuracy, Steep & Shallow partitioning, and Rest Machining stock filtering in `crates/hybridcam-cam/tests/test_3d.rs`
- [x] T022 [US4] Implement 3D Drop-Cutter (Flat, Ballnose, Bullnose, Tapered Ballnose) over `ReliefGrid` and BVH meshes (`parry3d`) in `crates/hybridcam-cam/src/drop_cutter.rs`
- [x] T023 [US4] Implement 3D Adaptive Roughing, Parallel Raster, Offset/Spiral, Constant Scallop, Steep & Shallow, and Pencil Cleanup in `crates/hybridcam-cam/src/ops_3d.rs`
- [x] T024 [US4] Integrate In-Process Dexel Stock querying for Rest Machining in `crates/hybridcam-cam/src/rest.rs`

## Phase 7: User Story 5 — Material Removal Simulation, Collision Check & Post-Processing (Priority: P2)

- [x] T025 [P] [US5] Write dexel gouge-check and G-code dialect golden tests in `crates/hybridcam-sim/tests/` and `crates/hybridcam-post/tests/`
- [x] T026 [US5] Implement 3-axis Dexel Stock Simulator, gouge detector, shaft/holder collision checker, and cycle time estimator in `crates/hybridcam-sim/`
- [x] T027 [US5] Implement configurable Post-Processor engine and built-in dialects (GRBL, Mach3/4, LinuxCNC, Masso, Fanuc/ISO) in `crates/hybridcam-post/`
- [x] T028 [US5] Implement `hybridcam-cli` headless runner for project validation, toolpath generation, simulation, and G-code export

## Phase 8: User Story 6 & Desktop UI Integration (Priority: P2/P3)

- [x] T029 [P] [US6] Implement PhotoVCarve / Lithophane (grayscale-to-angled-line/crosshatch/dot-halftone depth carving), Automatic Dogbone/T-Bone Fillets, Bitmap Auto-Trace (`vtracer`), Text-on-Curve, and V-Carve Inlay Plug Generator in `crates/hybridcam-cam/src/photovcarve.rs` and `crates/hybridcam-geom/src/joinery.rs`
- [x] T030 [US1-US6] Wire Tauri v2 IPC commands (`app/src-tauri/`) to `hybridcam-*` crates with async job progress events
- [x] T031 [US1-US6] Build React + Three.js 3D Viewport (shaded relief, vector overlays, animated toolpath & dexel stock playback, live sculpting) in `app/src/`
- [x] T032 End-to-end verification: run `cargo test --workspace`, CLI smoke tests, and Tauri desktop build check
