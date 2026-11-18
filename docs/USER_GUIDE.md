# HybridCAM User Guide

## Quick Workflow Overview
1. **Job Setup**: Set your stock size (`X × Y × Z`), material (auto-configures safe feeds/speeds), **Z-Zero** (`Material Surface` or `Machine Bed`), and **XY Datum** (5-dot corner/center selector).
2. **1. Design**: Create or import artwork using **Picture**, **Vectors** (`.SVG` / `.DXF`), or **3D Model** (CSG solids).
3. **2. Relief**: Fine-tune depth, smoothing, draft angle, base removal, or sculpt directly in 3D.
4. **3. Toolpaths**: Choose a 1-click template or stack multiple operations (Roughing → Finishing → V-Carve / Drilling → Cutout).
5. **4. Simulate**: Verify material removal, clamp clearance, and gouge checks.
6. **5. Export** or **6. Run CNC**: Save G-code (or stream directly to your GRBL machine over USB).

---

## 1. Design Tab
Use the **Include** toggles (`Picture`, `Vectors`, `3D Solid`) to work in one mode or combine all three onto the same stock.

- **Picture Mode**:
  - Upload any depth map (`PNG`, `JPG`, `TIFF`, `EXR`) — automatically fits your bed size.
  - Use **Trim Bed** to crop the stock dimensions to the exact picture footprint; **Reset** or uploading a new depth map restores your saved **Machine Bed Size**.
- **Vectors Mode (2D CAD)**:
  - Draw rectangles, circles, polygons, polylines, or text.
  - Import `.SVG` or `.DXF`, or export your sketch with **`DXF ↓`**.
  - Use **Offset +2 / -2**, **Duplicate**, and **Array ×3** for fast inlays and hole patterns.
- **3D Model Mode (Fusion-Style CSG)**:
  - Click **+ Stock Blank** to start with a full stock block, then **CREATE** (`Extrude`, `Revolve`, `Hole (Cut)`, `Box`, `Cylinder`, `Pipe`, `Sphere`, `Torus`, `Wedge`).
  - Drag the **3D Transform Gizmo** arrows directly in the viewport or use **MODIFY** (`Pull +2mm`, `Push -2mm`, `Mirror X/Y`, `Pattern ×3`).

## 2. Relief Tab
- **Import Depth Map** or **Import .STL** (Binary or ASCII `.stl` meshes rasterized onto your stock).
- **Mesh Detail**: Choose from `High (640px)` up to `Master 6K (1536px)`. Sliders preview at `384px` while dragging and snap to full resolution automatically.
- **3D Viewport Sculpting**: Enable sculpting to `Raise`, `Carve`, `Smooth`, `Flatten`, `Pinch`, or `Inflate` directly on the 3D mesh with left-click (right-drag to orbit).

## 3. Toolpaths Tab
- **1-Click CAM Templates**: Apply built-in presets (`3D Rough+Fin`, `V-Carve+Cut`, `Pocket+Cut`) or save your own stack with **`+ Save`**.
- **Peck Drilling**: Add `Peck Drilling (Holes)` to automatically drill every visible vector circle and 3D `Hole (Cut)` feature.
- **Cut Profiles**: Expand **▸ Cut Profiles** to save, edit, apply, or delete reusable feed/speed/stepdown presets.

## 4. Simulate Tab
- Scrub the timeline or press **Space** to Play/Pause.
- Switch between **Material View** and **Stock Heatmap** (`Blue = Uncut`, `Green = On Target`, `Red = Gouge`).
- Use **Cross-Section Slice (`X` / `Y`)** to inspect internal cut depths in real time.

## 5. Export Tab
- Select a built-in post-processor or any **Custom Post-Processor** created in Settings.
- Export combined G-code, **Split by Tool**, or an **HTML Setup Sheet** for your workshop.

## 6. Run CNC Tab
1. Click **Scan**, select your controller's `COM` port and baud (`115200` for GRBL), and click **Connect**.
2. Jog to your workpiece origin (`X± / Y± / Z±`), click **Zero All** (or run **Probe Z** with your touch-plate thickness).
3. Click **Start Job** to stream your G-code while watching the live 3D tool cone track `WPos`.

## Settings
- **Themes**: Switch between `Midnight Pro`, `Miami Vice`, `CNC Amber`, and `Studio Light`.
- **Machine**: Save your permanent bed size, travel/RPM/feed limits, auto-clamp, spindle dwell, `M8`/`M9`, and end-of-job park.
- **Posts**: Create custom post-processors with `{PROGRAM}`, `{TOOL}`, `{RPM}`, `{SAFE_Z}`, and `{UNITS}` header/footer tokens.
- **General**: Configure UI scale, snap grid step (`1–10 mm`), startup tab, close-confirmation prompt, and **Export / Import Setup (`.json`)**.
