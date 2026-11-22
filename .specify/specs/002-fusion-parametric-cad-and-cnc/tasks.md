# Tasks: Autodesk Fusion 360-Style Parametric CAD, Sketching & Native USB CNC Control

**Input**: Design documents from `.specify/specs/002-fusion-parametric-cad-and-cnc/`
**Status**: All tasks implemented and verified (`Converged`).

## Phase 1: Parametric Expression Engine & Data Models

- [x] T001 [P] Implement `UserParameter` model and cycle-safe recursive-descent formula evaluator (`evalParamExpr`, `resolveParameterEnv`) in `app/src/parametricCad.ts`
- [x] T002 [P] Implement `ParametricModal` (`fx Change Parameters` table) and `ParamInput` formula-enabled input widget in `app/src/ParametricModal.tsx`
- [x] T003 Define shared Fusion CAD types (`ConstructionPlane`, `OriginVisibility`, `SectionAnalysisState`, `AppearancePreset`, `BoltHolePreset`, `FusionOpDialogState`) in `app/src/cad/fusionTypes.ts`

## Phase 2: User Story 1 — Autodesk Fusion 360-Style 3D Solid Modeling (Priority: P1)

- [x] T004 [US1] Extend `solidCsg.ts` with `Loft`, `Sweep`, `Shell`, `Rib`, `Emboss Text (3D)`, `STL Mesh Body` (`parseStlToPositions`), `Counterbore / Countersink` holes, `Chamfer vs Fillet`, `Extrude Direction (One Side / Symmetric / Two Sides)`, `Draft / Taper Angle`, and `resolveSolidNode`
- [x] T005 [US1] Implement docked Autodesk Fusion 360 Command Ribbon (`SOLID`, `SKETCH`, `PHOTO` tabs + `CREATE ▾`, `MODIFY ▾`, `CONSTRUCT ▾`, `INSPECT ▾`, `INSERT` dropdowns) in `app/src/cad/FusionTopRibbon.tsx`
- [x] T006 [US1] Implement floating right-side `FusionOperationDialog` with live 3D CSG preview (`OK / Cancel`), `Move / Copy (M)`, `Hole` bolt presets (`M3–M8`, `1/4"-20`), `Combine`, `Split Body`, `Scale`, `Align`, `Section Analysis`, and `Appearance` in `app/src/cad/FusionOperationDialog.tsx`
- [x] T007 [US1] Implement collapsible `FusionBrowserTree` (`Document Settings`, `Named Views`, `Origin XY/XZ/YZ`, `Construction`, `Bodies` with per-body `.STL` export, `Sketches`) in `app/src/cad/FusionBrowserTree.tsx`
- [x] T008 [US1] Implement `FusionViewportControls` (3D ViewCube, Bottom Navigation & Display Bar with `⬚ Stock` envelope toggle, and Bottom Parametric Timeline with Rollback Marker & feature suppression) in `app/src/cad/FusionViewportControls.tsx`
- [x] T009 [US1] Implement direct 3D viewport raycast Click-to-Select (bodies & sketches), Double-Click-to-Edit bodies, 3D Extrude pull arrow, per-body multi-material Appearance rendering, and 1-click `→ Send to CAM` in `app/src/App.tsx`

## Phase 3: User Story 2 — 3D Plane Picker, Adaptive Grid & Live Sketch Inference (Priority: P1)

- [x] T010 [US2] Implement interactive 3D Sketch Plane Picker (`XY Top`, `XY Floor`, `XZ`, `YZ`, `Construction Offset Planes`, and every visible 3D solid body's top face with cyan hover highlight) in `app/src/App.tsx`
- [x] T011 [US2] Implement zoom-responsive Adaptive Major/Minor Grid (`500 mm` down to `0.1 mm`) and ghost 3D body reference silhouettes in `app/src/VectorSketchView.tsx`
- [x] T012 [US2] Implement Fusion 360 Snap-to-Grid target pointer and live inference symbols (`⊙ Origin`, `□ Endpoint`, `△ Midpoint`, `◎ Center`, `― Horiz`, `| Vert`, `∟ 90°` perpendicular square, `=` equal square) with live `(X, Y)` coordinate readout in `app/src/VectorSketchView.tsx`
- [x] T013 [US2] Implement floating drag-to-size dimension entry (`Tab` / `Shift+Tab` field cycling, `Enter` commit, `Esc` cancel) and `Center Rectangle` center-locked sizing in `app/src/VectorSketchView.tsx`
- [x] T014 [US2] Implement `Arc`, `Fit-Point Spline`, `Trim (T)`, `Dimension (D)`, and 5-way `Line`/`Spline` finishing (floating green `✓` endpoint checkmark, `Enter`, `Esc`, start-point loop close, bottom bar button) in `app/src/VectorSketchView.tsx` and `app/src/vectorSketch.ts`
- [x] T015 [US2] Implement floating `FusionSketchPalette` (`Snap to Grid`, `Show Dimensions`, `Construction Line (X)`, Geometric Constraints, `Project 3D (P)`, `Sketch Pattern`) in `app/src/cad/FusionSketchPalette.tsx` and single `Offset (+ / - Flip)` dialog in `app/src/cad/FusionOperationDialog.tsx`

## Phase 4: User Story 3 — Fusion UX Productivity, Picture Resize Overlay & Zero-Flash Theme Init (Priority: P2)

- [x] T016 [P] [US3] Implement `S` Key Design Shortcuts search popup in `app/src/cad/FusionShortcutBox.tsx` and Right-Click Context / Marking Menu in `app/src/cad/FusionContextMenu.tsx`
- [x] T017 [P] [US3] Implement top-layer high-contrast Machine Bed Outline & dimension badge during double-click picture resize mode in `app/src/PictureLayoutView.tsx`
- [x] T018 [P] [US3] Eliminate startup theme flash via inline `<head>` CSS variable script in `app/index.html`, synchronous pre-render `applyThemeToDocument` in `app/src/main.tsx`, and `useLayoutEffect` in `app/src/App.tsx`
- [x] T019 [US1-US3] Audit and remove unused imports, refs, legacy `"vector"` mode branches, and conflicting keyboard listeners; verify `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`, `npm run build`, and `cargo build --release --offline` exit `0`
