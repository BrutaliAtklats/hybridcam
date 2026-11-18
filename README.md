# HybridCAM

**Precision 2.5D, 3D Relief, Solid CSG & Direct CNC Control — All in One Desktop App.**

HybridCAM is a fast, offline-first CAD/CAM desktop application built with **React + TypeScript + Three.js** and a **Rust / Tauri** CAM, simulation, and native USB serial backend.

---

## Key Features

### 1. Design (Picture · 2D Vectors · 3D Solid CSG)
- **Picture Mode**: Multi-layer depth-map compositing (`Merge High`, `Add`, `Subtract`, `Merge Low`), built-in shapes, text layers, `.SVG` import, 2D brush sculpting (`Raise +`, `Lower -`, `Smooth`), alignment, **Trim Bed** to picture footprint, and edge feathering.
- **2D Vector CAD**: Interactive drawing (`Select`, `Rectangle`, `Circle`, `Polygon`, `Polyline`, `Text`), **`.SVG` & `.DXF` import**, **`.DXF` export**, `Offset ±2mm`, `Duplicate`, and `Array ×3`.
- **3D Solid Modeler (Fusion-Style)**: Pure-TypeScript 3D CSG boolean engine (`Join`, `Cut`, `Intersect`), `+ Stock Blank`, `Extrude` from 2D sketches, `Revolve`, `Hole (Cut)`, `Box`, `Cylinder`, `Pipe`, `Sphere`, `Torus`, `Wedge`, `Pull/Push`, `Mirror X/Y`, `Pattern ×3`, timeline reordering, and **3D viewport `TransformControls` drag gizmo**.

### 2. 3D Relief & Mesh Sculpting
- Import **PNG / JPG / TIFF / EXR** depth maps (auto-fit to bed) and **Binary/ASCII `.STL`** meshes.
- Controls for **Carving Depth**, **Base Height**, **Detail Sharpen**, **Micro-Contrast**, **Pillow Rounding**, **Gamma**, **JPG De-Blocking**, **Detail-Protected Smoothing**, **Draft Angle**, **Auto-Flat Plane Tilt**, and **Base Removal**.
- Direct **3D Viewport Sculpting** (`Raise`, `Carve`, `Smooth`, `Flatten`, `Pinch`, `Inflate`) and live **Cross-Section Z-Profile**.
- **Mesh Detail** up to **Master 6K (`1536px`)** with auto-draft during slider drags.

### 3. Multi-Op Toolpaths
- **1-Click CAM Templates** (built-in + save your own custom multi-op templates).
- **12 Machining Strategies**: `3D Roughing`, `2D Adaptive`, `2D Offset + Arcs (G2/G3)`, `3D Parallel Finishing`, `3D Spiral`, `3D Steep & Shallow`, `3D Pencil`, `True V-Carving`, `PhotoVCarve`, `2D Pocket`, `2D Contour + Tabs`, and `Peck Drilling (Holes)`.
- **Endmill Library + Cut Profiles**: Built-in and persistent custom endmills, saveable/deletable Cut Profiles, live chip-load / MRR / scallop telemetry, and **Machine Limit Warnings**.

### 4. Dexel Simulation
- Real-time material removal with **Material View** & **Stock Heatmap** (`Uncut`, `On Target`, `Gouge`), **Target Design Overlay**, **0 ms Cross-Section Slice (X/Y)**, **Hold-Down Clamp Collision Check**, and animated toolpath playback.

### 5. Post-Processor & G-Code Export
- Built-in dialects (**GRBL**, **Marlin**, **LinuxCNC**, **Mach3/4**, **Masso G3**, **Fanuc/ISO**) plus **Custom Post-Processors** (custom headers/footers, `;` or `(...)` comments, coordinate decimals, `N`-line numbering).
- **Vectric-style 5-Dot XY Datum** (`Top-Left`, `Top-Right`, `Center`, `Bottom-Left`, `Bottom-Right`) and **Side-View Z-Zero** (`Material Surface` vs `Machine Bed`).
- Export combined G-code, **Split by Tool**, **HTML Setup Sheet**, and **3D `.STL` / `.3MF`**.

### 6. Run CNC (Native Windows USB Sender)
- Connect directly to **GRBL / grblHAL / FluidNC** controllers over Windows `COM` ports.
- Live **Work / Machine DRO**, `X± / Y± / Z±` jogging, **Zero X/Y/Z/All**, **Z Touch-Plate Probe (`G38.2`)**, spindle test, G-code job streaming (`Start`, `Pause !`, `Resume ~`, `Stop`), live feed/spindle overrides, and **real-time 3D tool tracking**.

### 7. Settings & Themes
- **4 Built-in Themes**: `Midnight Pro`, `Miami Vice`, `CNC Amber`, and `Studio Light`.
- **Machine Setup & Limits**: Presets (`3018 Pro`, `Shapeoko 4 XL`, `MPCNC / PrintNC`, `1200×1200 Router`), independent saved bed size, travel/RPM/feed limits, optional auto-clamp, spindle dwell, `M8`/`M9` coolant, and end-of-job park.
- **Backup & Restore Setup (`.json`)** and **Save-Before-Closing Prompt** with *Don't ask again*.

---

## Keyboard Shortcuts
- `Ctrl+S`: Save Project (`.hcam`)
- `Ctrl+Z` / `Ctrl+Y`: Undo / Redo
- `1` – `6`: Switch workflow tabs (`Design` → `Run CNC`)
- `R`: Reset 3D camera to Isometric view
- `Space`: Play / Pause Simulation (on **Simulate** tab)

---

## Building from Source

### Prerequisites
- **Node.js** 18+
- **Rust** (`stable-x86_64-pc-windows-gnu` on Windows with MinGW-w64)

### Commands
```bash
# 1. Install frontend dependencies & build
cd app
npm install
npm run build

# 2. Run Rust workspace tests
cd ..
cargo test --workspace

# 3. Build desktop app
cd app/src-tauri
cargo build --release
```

---

## Documentation
- See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for the complete step-by-step manual.

## License
HybridCAM is dual-licensed: **Free for Personal, Hobbyist, and Educational Use**; **Paid Commercial License required for Business/Commercial Use**. See [LICENSE](LICENSE) for full terms.
