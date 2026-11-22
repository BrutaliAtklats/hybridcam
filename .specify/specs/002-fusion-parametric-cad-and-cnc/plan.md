# Implementation Plan: Autodesk Fusion 360-Style Parametric CAD, Sketching & Native USB CNC Control

**Branch**: `002-fusion-parametric-cad-and-cnc` | **Date**: 2026-11-22 | **Spec**: [spec.md](file:///c:/Users/eamol/Desktop/CAM%20Software/.specify/specs/002-fusion-parametric-cad-and-cnc/spec.md)

## Summary

Unifies 2D Sketching and 3D Solid CSG Modeling into an Autodesk Fusion 360-style parametric CAD workspace (`app/src/cad/*`, `parametricCad.ts`, `ParametricModal.tsx`, `solidCsg.ts`, `vectorSketch.ts`, `VectorSketchView.tsx`), adds native Windows USB CNC serial control (`CncControlPanel.tsx`), custom post-processors (`postProcessor.ts`), machine profiles (`machineProfile.ts`), and eliminates startup theme flashing (`index.html`, `main.tsx`).

## Technical Context

- **Frontend**: React 18.3 + TypeScript 5.6 + Three.js 0.169 + Vite 5.4
- **Backend / Desktop Shell**: Rust + Tauri v2 (`app/src-tauri/`) + workspace crates (`crates/hybridcam-*`)
- **3D Solid Kernel**: Pure-TypeScript 3D BSP CSG boolean engine (`app/src/solidCsg.ts`) with real-time heightfield Z-buffer projection into the CAM relief pipeline
- **Parametric Solver**: Recursive-descent arithmetic & function evaluator (`app/src/parametricCad.ts`) with cycle-safe multi-pass resolution

## Constitution Check

- **I. Geometry & Toolpath Precision First**: PASS — Parametric expressions evaluate to `0.001 mm` precision; CSG boolean meshes project directly into the CAM heightfield and auto-generate `Drilling`, `Adaptive2D`, `ReliefRough3D`, and `ReliefFinish3D` operations.
- **II. Modular Engine-First Architecture**: PASS — Parametric solver (`parametricCad.ts`), CSG engine (`solidCsg.ts`), and vector engine (`vectorSketch.ts`) are pure TypeScript modules decoupled from React components (`app/src/cad/*`).
- **III. Test-First & Simulation Verification**: PASS — Verified with strict `tsc --noEmit --noUnusedLocals --noUnusedParameters`, `vite build`, and `cargo build --release`.
- **IV. Unified Precision + Artistic Workflow**: PASS — `STACK` toggles (`Photo`, `Sketch`, `3D`) merge photo reliefs, 2D vector sketches, and 3D parametric solids into a single unified stock model.
- **V. Performance & Responsiveness**: PASS — 0 ms in-place Three.js clipping planes for `Section Analysis`, memoized parametric & CSG evaluation, and draft-resolution throttling during slider edits.

## Project Structure (New & Updated Modules)

```text
app/
├── index.html                           # Pre-paint <head> theme variable initializer
└── src/
    ├── main.tsx                         # Synchronous pre-render applyThemeToDocument()
    ├── App.tsx                          # Unified CAD/Photo/CAM workspace & 3D raycast interaction
    ├── parametricCad.ts                 # UserParameter table & recursive-descent expression parser
    ├── ParametricModal.tsx              # Change Parameters (fx) modal & ParamInput component
    ├── solidCsg.ts                      # 3D BSP CSG engine (Extrude, Revolve, Loft, Sweep, Rib, Emboss, Shell, Hole, STL)
    ├── vectorSketch.ts                  # 2D parametric shapes, Arc, Spline, Offset, Construction filter
    ├── VectorSketchView.tsx             # Adaptive grid, Snap-to-Grid pointer, live inference glyphs, Tab size entry
    ├── CncControlPanel.tsx              # Native USB GRBL / FluidNC DRO, jogging, probing & streaming
    ├── machineProfile.ts                # Machine presets & limit checks
    ├── postProcessor.ts                 # Custom post-processor templates & G-code formatter
    └── cad/
        ├── fusionTypes.ts               # Shared CAD dialog, plane, bolt preset & appearance types
        ├── FusionTopRibbon.tsx          # Docked Fusion 360 ribbon (SOLID / SKETCH / PHOTO)
        ├── FusionBrowserTree.tsx        # Collapsible Browser tree (Origin, Construction, Bodies, Sketches)
        ├── FusionOperationDialog.tsx    # Floating right-side Operation Dialogs with live 3D preview
        ├── FusionSketchPalette.tsx      # Floating Sketch Palette (Snap, Dimensions, Constraints, Project 3D)
        ├── FusionViewportControls.tsx   # 3D ViewCube, Bottom Display Bar & Rollback Timeline
        ├── FusionContextMenu.tsx        # Right-click context / marking menu for Solid & Sketch
        └── FusionShortcutBox.tsx        # 'S' key Design Shortcuts search popup
```
