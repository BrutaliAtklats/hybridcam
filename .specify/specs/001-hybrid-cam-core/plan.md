11# Implementation Plan: HybridCAM — Precision Engineering & Artistic Relief CAM

**Branch**: `001-hybrid-cam-core` | **Date**: 2026-11-17 | **Spec**: [spec.md](file:///c:/Users/eamol/Desktop/CAM%20Software/.specify/specs/001-hybrid-cam-core/spec.md)

**Input**: Feature specification from `.specify/specs/001-hybrid-cam-core/spec.md`

## Summary

Build **HybridCAM**, a cross-platform native desktop CAM application combining **Autodesk Fusion-grade** precision machining (Setup/Stock/WCS, 2D Adaptive Clearing, 3D Roughing/Finishing, In-Process Stock Rest Machining, Simulation, Post-Processing) with **Vectric Aspire / ArtCAM-grade** artistic carving (16-bit Depth-Map to 3D Relief, Non-Destructive Relief Composition, Interactive Sculpting Brushes, True Medial-Axis V-Carving, Flat-Bottom Clearance, 3D-Projected V-Carving, Dogbone Fillets, and V-Carve Inlay Plugs).

The architecture uses a **headless Rust CAM kernel** (`hybridcam-*` crates) decoupled from a **Tauri v2 + React + TypeScript + Three.js** desktop UI, enabling fast parallel toolpath computation, automated simulation-backed testing, and 60fps 3D viewport interaction.

## Technical Context

**Language/Version**: Rust (stable 1.80+) for CAM kernel; TypeScript 5.x + React 18 + Three.js for desktop UI
**Primary Dependencies**: `kurbo`, `i_overlay` / `clipper2`, `boostvoronoi`, `parry3d`, `image`, `tiff`, `usvg`, `dxf`, `vtracer`, `rayon`, `serde`, `tauri` v2
**Storage**: Local `.hcam` project files (JSON metadata + compressed binary heightfield/toolpath blobs)
**Testing**: `cargo test --workspace` (unit, geometry tolerance, dexel gouge-check integration tests) + Vitest for UI state
**Target Platform**: Cross-platform Native Desktop (Windows 10/11, macOS, Linux)
**Project Type**: Desktop application with modular headless Rust workspace + Tauri/React frontend
**Performance Goals**: 200x200 mm 3D relief at 0.1 mm stepover in < 10s; 60fps interactive 3D viewport & sculpting
**Constraints**: Fully offline-capable; <= 0.001 mm geometric tolerance; safe-Z rapid enforcement; cooperative cancellation
**Scale/Scope**: Complete v1 suite covering Core Setup, 2.5D/Adaptive, 16-bit Depth-Map Relief & Sculpting, True/3D V-Carving, PhotoVCarve / Lithophane, 3D Rough/Finish/Rest Machining, Dexel Simulation, Pre-populated Tool & Feeds/Speeds Library, and 5 built-in Post-Processors

## Constitution Check

*GATE: Passed both pre-research and post-design.*

- **I. Geometry & Toolpath Precision First**: Explicit `0.001 mm` tolerance constants, exact Voronoi medial-axis V-carving, and tool/holder geometry validation.
- **II. Modular Engine-First Architecture**: `hybridcam-geom`, `hybridcam-relief`, `hybridcam-cam`, `hybridcam-sim`, `hybridcam-post`, and `hybridcam-cli` have zero UI/Tauri dependencies.
- **III. Test-First & Simulation Verification**: `hybridcam-sim` dexel verification integrated directly into `cargo test` for gouge & rapid-in-stock checks.
- **IV. Unified Precision + Artistic Workflow**: Single `Project` model holds vectors, meshes, relief stack, and both 2.5D/3D and V-carve operations.
- **V. Performance & Responsiveness**: `rayon` parallelization + async Tauri jobs with `CancellationToken` and incremental GPU mesh patches.

## Project Structure

### Documentation (this feature)

```text
.specify/specs/001-hybrid-cam-core/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
└── contracts/
    └── cam-kernel-api.md
```

### Source Code (repository root)

```text
crates/
├── hybridcam-geom/      # 2D vectors, booleans, offsets, Voronoi, dogbones, importers
├── hybridcam-relief/    # 16-bit depth maps, ReliefStack, sculpting brushes, mesh projection
├── hybridcam-cam/       # 2.5D Adaptive/Pocket/Contour, V-Carve, 3D Rough/Finish/Rest
├── hybridcam-sim/       # 3-axis dexel stock simulation, gouge & holder collision checks
├── hybridcam-post/      # Post-processor engine (GRBL, Mach3/4, LinuxCNC, Masso, Fanuc)
└── hybridcam-cli/       # Headless CLI for batch generation & verification

app/                     # Tauri v2 + React + TypeScript + Three.js desktop frontend
├── src-tauri/           # Thin Tauri IPC bridge calling hybridcam-* crates
└── src/                 # 3D Viewport, Toolpath Tree, Relief Sculptor, Tool Library UI
```

**Structure Decision**: Multi-crate Rust workspace under `crates/` for strict separation of concerns and fast incremental compilation, paired with `app/` for the Tauri v2 + Three.js desktop shell.

## Complexity Tracking

No constitution violations. All crates map directly to distinct domain responsibilities in the specification.
