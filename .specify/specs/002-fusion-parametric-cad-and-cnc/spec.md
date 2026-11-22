# Feature Specification: Autodesk Fusion 360-Style Parametric CAD, Sketching & Native USB CNC Control

**Feature Branch**: `002-fusion-parametric-cad-and-cnc`
**Created**: 2026-11-22
**Status**: Implemented & Converged
**Builds On**: `001-hybrid-cam-core`

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Unified Autodesk Fusion 360-Style Parametric 3D Solid Modeling (Priority: P1)

A CAD/CAM user accustomed to Autodesk Fusion 360 opens HybridCAM and models parametric 3D mechanical and artistic parts using a familiar docked ribbon (`SOLID` / contextual `SKETCH` / `PHOTO`), right-side floating **Operation Dialogs** with live 3D CSG previews (`OK / Cancel`), a collapsible **Browser Tree**, an interactive **ViewCube**, a bottom **Parametric Timeline** with **Rollback Marker**, and a live **`fx` Change Parameters** equation table.

**Independent Test**: Open `DESIGN -> SOLID`, define `wall = 4` in `fx Parameters`, create a `Box` with `W = stock_w - wall * 2`, add a `Counterbore M6 Hole`, roll back the timeline marker, and click `→ Send to CAM` to auto-populate toolpaths.

**Acceptance Scenarios**:
1. **Given** the user is in `DESIGN -> SOLID`, **When** they click any Create or Modify tool (`Extrude`, `Revolve`, `Loft`, `Sweep`, `Rib`, `Emboss`, `Hole`, `Fillet`, `Chamfer`, `Shell`, `Move / Copy`, `Combine`, `Split Body`, `Scale`, `Align`), **Then** a right-side **Operation Dialog** opens with a live 3D preview and only commits on **OK** / **Enter** (or discards cleanly on **Cancel** / **Esc**).
2. **Given** a parameter formula (e.g. `stock_w - wall * 2`) is entered in any `ParamInput` field or updated in `fx Change Parameters`, **Then** all bound 2D sketches and 3D solids recompute immediately.
3. **Given** multiple bodies exist in the viewport, **When** the user single-clicks a body in 3D, **Then** it becomes selected; **When** they double-click a body in 3D, **Then** its **Edit Feature** dialog opens.

---

### User Story 2 — Fusion 360-Style 3D Plane Picker, Adaptive Grid & Live Sketch Inference (Priority: P1)

A user clicks **Create Sketch (`K`)**, hovers and clicks directly on a glowing 3D plane (`XY Top`, `XY Floor`, `XZ Front`, `YZ Right`, any `Offset Construction Plane`, or any **3D Solid Body's Top Face**), and draws 2D geometry using an adaptive zoom-responsive grid, magnet snap-to-grid pointer, live inference symbols (`⊙ Origin`, `□ Endpoint`, `△ Midpoint`, `◎ Center`, `― Horiz`, `| Vert`, `∟ 90°`), and floating dimension boxes (`Tab` to cycle fields, `Enter` to commit).

**Independent Test**: Press `K`, click the top face of an extruded 3D object, draw a `Center Rectangle` snapped to `⊙ Origin (0, 0)`, type `40` + `Tab` + `20` + `Enter`, finish the sketch, and extrude directly from that object's top face.

**Acceptance Scenarios**:
1. **Given** the user clicks **Create Sketch (`K`)**, **When** they hover over any 3D Origin plane, Construction plane, or Solid top face, **Then** the plane highlights in Autodesk cyan (`#0696d7`) and clicking it enters a fresh 2D sketch at that plane's exact `Z` height with ghost silhouettes of underlying 3D bodies visible on the grid.
2. **Given** any drawing tool (`Line`, `2-Pt Rect`, `Ctr Rect`, `Circle`, `Arc`, `Spline`, `Slot`, `Polygon`) is active, **When** the user moves the cursor or zooms, **Then** the adaptive major/minor grid rescales (`500 mm` down to `0.1 mm` minor) and the snap pointer magnet-snaps to visible grid intersections and geometry inference points.
3. **Given** the user is drawing a `Line` or `Spline` chain, **When** they click the floating green `✓` checkmark at the last point, press `Enter` or `Esc`, or click the start point (`□ Endpoint`), **Then** the polyline/spline finishes cleanly.

---

### User Story 3 — Native USB CNC Sender (`Run CNC`), Machine Profiles & Zero-Flash Themes (Priority: P2)

A user connects their GRBL / grblHAL / FluidNC controller over Windows USB Serial (`COM` ports), jogs axes, probes Z with a touch plate (`G38.2`), streams G-code with real-time 3D toolcone tracking, and customizes themes/post-processors without startup theme flashing.

**Independent Test**: Switch to `Studio Light` or `Miami Vice` theme, relaunch the app (verifying zero flash of default dark slate), configure machine limits, and verify G-code post-processing and serial command formatting.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a unified docked Autodesk Fusion 360-style Command Ribbon with `SOLID`, contextual `SKETCH`, and `PHOTO / RELIEF` tabs and `CREATE ▾`, `MODIFY ▾`, `CONSTRUCT ▾`, `INSPECT ▾`, and `INSERT` menus.
- **FR-002**: System MUST support parametric expressions (`UserParameter` table + `evalParamExpr`) across sketch and solid dimensions (`widthMm`, `depthMm`, `heightMm`, `xMm`, `yMm`, `zMm`, `bevelMm`, `wallThicknessMm`, `taperDeg`, `revolveDeg`).
- **FR-003**: System MUST provide floating right-side **Operation Dialogs** with live 3D CSG preview for `Extrude` (`One Side / Symmetric / Two Sides` + `Draft`), `Revolve`, `Loft`, `Sweep`, `Rib`, `Emboss Text (3D)`, `Shell`, `Hole` (`Simple / Counterbore / Countersink` + `M3–M8 / 1/4"-20` bolt presets), `Fillet`, `Chamfer`, `Move / Copy (M)`, `Combine`, `Split Body`, `Scale`, `Align`, `Rectangular / Circular Pattern`, `Mirror`, `Offset Plane`, `Section Analysis`, `Appearance`, and `Measure`.
- **FR-004**: System MUST provide an interactive 3D Sketch Plane Picker supporting Origin planes (`XY / XZ / YZ`), Construction Offset planes, and every visible 3D solid body's top face.
- **FR-005**: System MUST provide an adaptive zoom-responsive sketch grid, magnet snap-to-grid pointer, live geometric inference glyphs (`⊙`, `□`, `△`, `◎`, `―`, `|`, `∟ 90°`, `=`), floating `Tab`-navigable dimension entry, single `Offset (+ / - Flip)` dialog, `Construction (X)` geometry, `Trim (T)`, `Project 3D (P)`, and `Sketch Pattern`.
- **FR-006**: System MUST provide `S` Key Design Shortcuts search, Right-Click Context Menus in both Solid and Sketch views, multi-step CAD Undo/Redo (`Ctrl+Z` / `Ctrl+Y`), Binary/ASCII `.STL` solid import & per-body `.STL` export, and 1-click `→ Send to CAM`.
- **FR-007**: System MUST pre-apply the user's saved theme in `index.html` `<head>` and `main.tsx` before React paints to eliminate startup theme flashing.

## Success Criteria *(mandatory)*

- **SC-001**: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` and `npm run build` exit with code `0` (zero type errors, zero unused locals or parameters).
- **SC-002**: `cargo build --release --offline` compiles `hybridcam-desktop.exe` with exit code `0`.
- **SC-003**: All 7 Functional Requirements (`FR-001` through `FR-007`) are verified in the live desktop build.
