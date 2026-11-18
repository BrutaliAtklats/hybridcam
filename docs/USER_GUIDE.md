# HybridCAM — Detailed User & Workshop Manual

Welcome to **HybridCAM**. This guide walks through every tab, tool, setting, and real-world CNC workflow from blank stock to finished part.

---

## Table of Contents
1. [First Launch & Job Setup](#1-first-launch--job-setup)
2. [3D Viewport & Navigation](#2-3d-viewport--navigation)
3. [Tab 1: Design (Picture · Vectors · 3D Model)](#3-tab-1-design)
4. [Tab 2: 3D Relief & Sculpting](#4-tab-2-3d-relief--sculpting)
5. [Tab 3: Multi-Op Toolpaths](#5-tab-3-multi-op-toolpaths)
6. [Tab 4: Dexel Simulation & Verification](#6-tab-4-dexel-simulation--verification)
7. [Tab 5: Post-Processor & G-Code Export](#7-tab-5-post-processor--g-code-export)
8. [Tab 6: Run CNC (Direct USB Machine Control)](#8-tab-6-run-cnc-usb-sender)
9. [Settings, Themes, Machine Profile & Backups](#9-settings)
10. [Example Workflows](#10-example-workflows)
11. [Keyboard Shortcuts & Troubleshooting](#11-keyboard-shortcuts--troubleshooting)

---

## 1. First Launch & Job Setup

When HybridCAM opens, the **Job Setup** modal lets you define your workpiece:

- **Units**: `mm` (Millimeters) or `in` (Inches).
- **Stock Dimensions**: `Width (X)`, `Depth (Y)`, and `Thickness (Z)`.
  - *Tip*: Your **Machine Bed Size** is saved independently in **Settings → Machine**. Temporary trims (like **Trim Bed**) do not overwrite your saved machine bed.
- **Z-Zero Position (Side-View Dot Selector)**:
  - **Material Surface (Top)**: `Z = 0` is at the top face of your material. Cuts go into negative Z (`-Z`). Best for 3D reliefs, engravings, and V-carving.
  - **Machine Bed (Bottom / Spoilboard)**: `Z = 0` is on the spoilboard. Cuts stay in positive Z above `0`. Best for full-depth cutouts so you never cut into your spoilboard.
- **XY Datum Position (5-Dot Selector)**:
  - Click any of the 5 dots (**Top-Left**, **Top-Right**, **Center**, **Bottom-Left**, **Bottom-Right**) to set where `X0, Y0` sits on your stock. Both the 2D canvas crosshair, 3D XYZ axis triad, and exported G-code shift automatically to match your dot.
- **Stock Material**: Choose **Hardwood**, **Softwood**, **MDF / Plywood**, **Acrylic / HDPE**, or **Aluminum 6061**. Choosing a material automatically loads conservative RPM, feedrate, plunge rate, and stepdown defaults for your tools.

Click the **Job pill** (`✎ 200×150×20 mm · Hardwood`) in the top-left header anytime to reopen Job Setup.

---

## 2. 3D Viewport & Navigation

- **Orbit**: Left-click + Drag
- **Pan**: Right-click + Drag
- **Zoom**: Mouse Scroll Wheel *(can be inverted in **Settings → General**)*
- **Quick Camera Presets** (top-right pill): `Iso`, `Top`, `Front`, `Side` (or press `R` for Iso).
- **Shading Bar** (bottom-left dock):
  - **Clay**: Neutral studio clay to inspect surface smoothness and highlights.
  - **Material**: Realistic wood/plastic/metal finish spheres (`Black Walnut`, `Red Oak`, `Hard Maple`, `American Cherry`, `Aluminum`, `Acrylic`).
  - **Heatmap**: Height color gradient (`Blue = Low`, `Green = Mid`, `Red = High`).
  - **Wire**: Crisp CAD wireframe overlay + silhouette edges.
- **3D Mesh Export** (bottom-right dock): Export your relief or 3D solid directly as binary **`.STL`** or **`.3MF`**.

---

## 3. Tab 1: Design

At the top of **1. Design**, use the **Include** checkboxes (`Picture`, `Vectors`, `3D Solid`) to use one mode alone or combine all three onto the same board.

### A. Picture Mode (Depth Maps & 2D Relief Compositing)
- **+ Picture**: Import `PNG`, `JPG`, `TIFF`, or 32-bit `EXR` depth maps. Uploaded depth maps automatically fit your bed size (`scale: 1.0`, centered).
- **+ Shape**: Insert built-in 3D primitives (`Oval Dish`, `Rect Frame`, `Raised Dome`).
- **Add Text / Import .SVG**: Add raised text layers or import `.svg` artwork as relief shapes.
- **Layer Stack & Combine Modes**:
  - `Merge High`: Keeps whichever layer is higher at each pixel (ideal for overlapping objects).
  - `Add (+)`: Stacks heights together (great for putting text on top of a curved dish).
  - `Subtract (-)`: Recesses the layer into the layer below.
  - `Merge Low`: Keeps the lowest surface.
- **Toolbar Actions**:
  - `Center X` / `Center Y` / `Duplicate`
  - **Trim Bed**: Automatically resizes the stock (`widthMm × depthMm`) to the exact footprint used by your picture(s), removing unused bed margins. Clicking **Reset** or importing a new depth map restores your saved **Machine Bed Size**.
- **Canvas Tool**:
  - `Move`: Drag layers on the 2D board.
  - `Raise +` / `Lower -` / `Smooth`: Paint height adjustments directly on the 2D canvas with adjustable **Brush Size** and **Brush Strength**.
- **Layer Adjustments**: `Weight`, `Scale`, `Pos X/Y`, `Rotation (-90° / 0° / +90° / Flip H / Flip V)`, `Edge Fade (Feather)`, `Brightness`, `Shadow Clip`, and `Highlight Clip`.

### B. Vectors Mode (2D CAD)
- **Sketch Tools**: `Select`, `Rectangle`, `Circle`, `Polygon`, `Polyline`, and `Text Box`.
- **Import / Export**:
  - **`.SVG`**: Import SVG paths, rects, circles, and polygons.
  - **`.DXF`**: Import ASCII `.dxf` (`LINE`, `LWPOLYLINE`, `CIRCLE`) — auto-centered and scaled to fit your bed if oversized.
  - **`DXF ↓`**: Export visible vector shapes as an ASCII `.dxf` file.
- **Shape Role** (determines which CAM operations use the shape):
  - `Cutout / Contour`: Used by `2D Contour + Tabs` and `V-Carving`.
  - `Pocket / Recessed Carve`: Used by `2D Pocket`, `2D Adaptive`, and `2D Offset + Arcs`.
  - `True V-Carve`: Used by `V-Carving`.
  - `Raised 3D Boss`: Adds a raised boss onto the 3D relief heightfield.
- **Quick Modify**: `Offset +2` (outward), `Offset -2` (inward), `Duplicate`, and `Array ×3` (linear pattern).

### C. 3D Model Mode (Fusion-Style Solid CSG)
- **+ Stock Blank**: Inserts a full stock block (`widthMm × depthMm × thicknessMm`) as your base body so you can immediately cut holes and pockets into it.
- **CREATE**:
  - `Extrude`: Extrudes a selected 2D Vector Sketch into a 3D solid (supports `Fillet / Chamfer`).
  - `Revolve`: Revolves a profile 360° around Z.
  - `Hole (Cut)`: Creates a subtractive cylindrical drill/bore hole (rendered with a red wireframe ghost so you can see and position it inside your part).
  - Primitives: `Box`, `Cylinder`, `Pipe` (hollow tube), `Sphere`, `Torus`, `Wedge`.
- **3D Viewport Gizmo**: Drag the red/green/blue **X/Y/Z arrows** directly on the selected body in the 3D viewport to reposition it interactively.
- **MODIFY**: `Pull +2mm`, `Push -2mm`, `Duplicate`, `Mirror X`, `Mirror Y`, `Pattern ×3`.
- **BROWSER & TIMELINE**: Toggle visibility, reorder features (`▲` / `▼`), switch operations (`Join` / `Cut` / `Intersect`), or delete.

---

## 4. Tab 2: 3D Relief & Sculpting

- **Import Depth Map / Import .STL**: Load image depth maps or **Binary / ASCII `.STL`** 3D meshes (rasterized automatically onto your stock).
- **Mesh Detail**: Choose `High (640px)`, `Ultra HD (768px)`, `Extreme (1024px)`, `Studio 4K (1280px)`, or `Master 6K (1536px)`. While adjusting sliders above `640px`, HybridCAM previews at `384px` for smooth responsiveness and snaps to full resolution automatically.
- **Key Relief Sliders**:
  - `Carving Depth (Z Height)`: Total vertical range from deepest valley to highest peak.
  - `Base Height Offset`: Shifts the entire relief up or down relative to `Z=0`.
  - `Detail Sharpen` & `Micro-Contrast`: Enhances crisp edges, feathers, hair, and fine textures.
  - `Pillow Rounding`: Smoothly domes flat-topped shapes.
  - `JPG De-Blocking`: Cleans 8-bit JPG compression artifacts without blurring edges.
  - `Smoothing` + `Detail Protection`: Reduces noise while shielding sharp features.
  - `Draft Angle (Wall Taper)`: Slopes vertical cliffs (`0°`–`20°`) so ballnose/tapered bits can machine steep walls cleanly.
  - `Tilt Model` & `Auto Flat`: Compensates for tilted depth maps using least-squares plane fitting.
  - `Base Options`: **Solid Block** keeps the full rectangular stock; **Base Removal** (`Edge Connected` or `All Flat Base`) isolates the 3D subject.
- **3D Viewport Sculpting**: Click **Enable Sculpt**, choose a brush (`Raise`, `Carve`, `Smooth`, `Flatten`, `Pinch`, `Inflate`) and falloff (`Smooth`, `Sharp`, `Flat`), then left-drag directly on the 3D model (right-drag to orbit).
- **Cross-Section Z-Profile**: Live 2D slice graph at the bottom of the panel showing exact Z height across your stock.

---

## 5. Tab 3: Multi-Op Toolpaths

Build a complete machining sequence from roughing to final cutout:

1. **1-Click CAM Templates**:
   - Use built-in presets (**3D Rough+Fin**, **V-Carve+Cut**, **Pocket+Cut**) or type a name and click **`+ Save`** to save your own multi-op stack as a reusable 1-click button.
2. **Operation Stack**:
   - Enable/disable ops, reorder cut order (`↑` / `↓`), or delete. Each calculated card shows its **estimated cut time** and **deepest Z (`Z min`)**.
   - Quick helpers: **Surface Stock** (adds a full-bed flattening pass) and **Flip Dowels** (adds 2-sided alignment dowel holes).
3. **Endmill & Strategy Selection**:
   - Pick an endmill category (`Flat`, `O-Flute`, `Ballnose`, `Tapered`, `V-Bit`, `Engraving`, `Surfacing`) and diameter, or click **+ Add Endmill** to save custom bits.
   - Choose from 12 strategies:
     - *Roughing*: `3D Roughing`, `2D Adaptive`, `2D Offset + Arcs (G2/G3)`
     - *3D Finishing*: `3D Parallel`, `3D Spiral`, `3D Steep & Shallow`
     - *Detail & Carving*: `3D Pencil`, `V-Carving`, `PhotoVCarve`
     - *2D & Holes*: `2D Pocket`, `2D Contour + Tabs`, `Peck Drilling (Holes)`
4. **Cut Profiles (Collapsible)**:
   - Click **▸ Cut Profiles** to apply, save, edit, or delete reusable Feed / Speed / Stepdown / Stepover presets.
5. **Cut Telemetry & Machine Limit Warnings**:
   - Displays live **Chip Load (mm/tooth)**, **MRR (cm³/min)**, and **Scallop Height**, plus a safety badge (`Safe Cut`, `Aggressive`, `Too Heavy`).
   - Warns automatically if your stock size or tool RPM/feed/plunge exceeds your saved **Machine Setup & Limits**.
6. **Ramp Entry & Holding Tabs**:
   - Enable **Ramp Entry** to avoid straight vertical plunges, and **Holding Tabs** (`Tab Count`, `Tab Height`) on cutouts so parts don't break loose.

Click **Calculate & Simulate** to compute all enabled operations and jump to simulation.

---

## 6. Tab 4: Dexel Simulation & Verification

- **Telemetry Card**: Displays the active operation, tool, live G-code line, segment counter, remaining time, and **Collision / Gouge Check** (`0 Collisions / Gouges` or warning list).
- **Playback Controls**: `-2%`, `Play / Pause` (`Space`), `+2%`, `Reset`, speed (`0.5×` – `10×`), and **Jump Op** buttons.
- **Stock Inspection**:
  - **Material View**: Realistic carved stock preview.
  - **Stock Heatmap**: Color-codes accuracy (`Blue = Uncut Stock`, `Green = On Target`, `Red = Gouge`).
  - **Target Design Overlay**: Semi-transparent blue target overlay to compare carved vs desired shape.
  - **Cross-Section Slice (`Off` / `X` / `Y`)**: Instant real-time section cut through the stock.
- **Display & Clamps**: Enable **Hold-Down Clamp Zones** (`4 Corner Clamps` or `Front/Back Edges` + `Clamp Height`) to verify your spindle never hits a clamp.

---

## 7. Tab 5: Post-Processor & G-Code Export

- **Machine Firmware / Post-Processor**: Choose `GRBL`, `Marlin`, `LinuxCNC`, `Mach3 / Mach4`, `Masso G3`, `Generic Fanuc / ISO`, or any **Custom Post-Processor** you created in Settings.
- **Options**: File extension (`.gcode`, `.nc`, `.ngc`, `.tap`, `.cnc`, `.txt`), **Safe Retract Z (mm)**, **Program Name**, and **Emit M6 Tool Change Commands**.
- **Outputs**:
  - **Save Combined G-Code**: Single file with all enabled operations.
  - **Split by Tool**: Saves separate numbered files per tool (`01_Project_T1.nc`, `02_Project_T11.nc`, ...).
  - **Setup Sheet (`.html`)**: Printable workshop sheet with stock size, XY/Z datum, tools, speeds, and estimated times.

---

## 8. Tab 6: Run CNC (USB Sender)

Stream G-code directly to **GRBL / grblHAL / FluidNC** controllers over USB on Windows:

1. **Connect**: Click **Scan**, pick your `COM` port and baud (`115200` or `250000`), and click **Connect**.
2. **Home / Unlock**: Click **Home (`$H`)** if your machine has limit switches, or **Unlock (`$X`)** to clear an alarm.
3. **Jog & Zero**:
   - Select step (`0.1`, `1`, `10`, `50 mm`) and jog speed (`Slow`, `Med`, `Fast`).
   - Use `X± / Y± / Z±` to position your bit over your chosen **XY Datum** and **Z-Zero** point.
   - Click **Zero All** (or **Zero X / Y / Z** individually).
   - *Optional Touch Plate*: Enter your plate thickness (`mm`) and click **Probe Z** to run `G38.2` auto-zeroing.
4. **Run Job**:
   - Click **Start Job** to stream the G-code from Tab 5.
   - The 3D viewport's **red tool cone** tracks your live `WPos` coordinates in real time.
   - Use **Pause (`!`)**, **Resume (`~`)**, **Stop**, and **Feed ±10% / Spindle 100%** overrides as needed.
5. **Serial Console & MDI**: View controller responses or type manual commands (e.g. `$$`, `G0 X50 Y50`).

---

## 9. Settings

Settings is organized into 4 sub-tabs:

- **Themes**: Choose `Midnight Pro`, `Miami Vice`, `CNC Amber`, or `Studio Light`. Every panel, slider, checkbox, icon, and the 3D viewport background updates live.
- **Machine**:
  - Load 1-click machine presets (`3018 Pro`, `Shapeoko 4 XL`, `MPCNC / PrintNC`, `1200×1200 Router`).
  - Set permanent `Bed Width X`, `Bed Depth Y`, `Max Z Travel`, `Default Stock Z`, `Min/Max RPM`, `Max Rapid/Feed/Plunge`, `Spindle Spin-Up Dwell`, default **XY Datum** & **Z-Zero**, `M8/M9` Dust/Coolant, `Auto-Clamp Exported RPM & Feedrate`, and `Park Spindle at End`.
- **Posts (Custom Post-Processors)**:
  - Create custom post-processors with your choice of motion base, file extension, comment style (`(...)` vs `;`), coordinate decimals (`2` / `3` / `4`), `N10/N20` line numbering, and custom Header/Footer G-code using tokens:
    `{PROGRAM}` `{TOOL}` `{RPM}` `{SAFE_Z}` `{UNITS}`
- **General**:
  - **UI Control Scale** (`Compact 92%`, `Standard 100%`, `Large 108%`), **Show XYZ Axes & Floor Grid**, **Invert Mouse Wheel Zoom**, **Startup Page**, **Sim Resolution**, **Snap Grid Step (`1 / 2 / 5 / 10 mm`)**, **Ask to Save Project Before Closing App**, and **Export / Import Setup (`.json`)** backup.

---

## 10. Example Workflows

### Workflow 1: Carving a 3D Relief Plaque from a Photo/Depth Map
1. **Job Setup**: Set stock (e.g. `200×150×20 mm`), `Hardwood`, `Material Surface (Top)`, `Bottom-Left` datum.
2. **1. Design → Picture**: Click **+ Picture** to load your depth map. Click **Trim Bed** if you want the stock cropped to the image proportions.
3. **2. Relief**: Set `Carving Depth` (e.g. `10 mm`), adjust `Detail Sharpen` (`0.3`), and choose `Ultra HD (768px)` or `Extreme (1024px)`.
4. **3. Toolpaths**: Click the **`3D Rough+Fin`** 1-click template, then **Calculate & Simulate**.
5. **4. Simulate**: Verify `0 Collisions / Gouges` and inspect with `Material View`.
6. **5. Export** or **6. Run CNC**: Export `.gcode` or connect via USB and cut!

### Workflow 2: Mechanical Bracket with Holes (3D Model or DXF)
1. **1. Design → Vectors**: Click **`.DXF`** (or draw rectangles/circles) and set `Role = Cutout / Contour`.
2. **3. Toolpaths**: Add **Peck Drilling (Holes)** for the circles, then add **2D Contour + Tabs** (`Holding Tabs = ON`, 4 tabs).
3. **4. Simulate → 5. Export**: Verify tabs hold the part, then save or run G-code.

---

## 11. Keyboard Shortcuts & Troubleshooting

### Keyboard Shortcuts
| Shortcut | Action |
| :--- | :--- |
| `Ctrl + S` | Save Project (`.hcam`) |
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo (Design & 3D Sculpt) |
| `1` – `6` | Switch tabs (`Design` → `Run CNC`) |
| `R` | Reset 3D camera to Isometric |
| `Space` | Play / Pause Simulation (on **Simulate** tab) |
| `Delete` / `Backspace` | Delete selected layer (on **Design** tab) |

### Troubleshooting
- **Wireframe looks too dense**: Use `Clay` or `Material` for visual inspection; `Wire` automatically decimates dense relief grids to `≤ 72×72` for readability.
- **No COM port shown in Run CNC**: Make sure your CNC controller is powered on via USB and no other sender (UGS, Candle, LightBurn) holds the port open, then click **Scan**.
- **App asks to save on close**: Check **Don't ask again** in the close popup (or toggle **Ask to Save Project Before Closing App** in **Settings → General**).
