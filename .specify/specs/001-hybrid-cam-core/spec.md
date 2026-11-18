# Feature Specification: HybridCAM — Precision Engineering & Artistic Relief CAM

**Feature Branch**: `001-hybrid-cam-core`

**Created**: 2026-11-17

**Status**: Clarified

**Input**: User description: "create a cam soft for cnc jobs, i want it to be as good as autodest fusion and has a vectric aspire type depht map or art cam type of funcion so i can do 3d carving and v carving, i wan my soft to be the best of both wrolds, you can recomend me funcions too, i want it to be the best it can be"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Setup, Stock, WCS & Precision 2.5D/Adaptive Machining (Priority: P1)

A machinist or maker opens a project, defines the stock dimensions (box, cylinder, or offset from model), sets the Work Coordinate System (WCS / origin at top-center, corner, or spoilboard), selects tools from a parametric Tool Library, and generates precision 2D/2.5D toolpaths including **Adaptive Clearing (High-Speed Trochoidal)**, **2D Pocket**, **2D Contour** (with tabs, lead-in/lead-out, ramp/helical entry), **Face Milling**, and **Drilling/Boring**.

**Why this priority**: Every CNC job—whether engineering or artistic—starts with reliable stock setup, WCS definition, tool management, and safe, fast 2.5D/adaptive material removal. Without this foundation, no part can be cut safely.

**Independent Test**: Can be fully tested by importing a 2D vector (DXF/SVG) or 3D part, configuring stock and WCS, generating an Adaptive Clearing + Contour toolpath with tabs, simulating material removal, and exporting valid G-code.

**Acceptance Scenarios**:

1. **Given** a new project with imported geometry and defined stock, **When** the user creates a Setup with WCS at top-left-front and assigns a 6 mm flat endmill to an Adaptive Clearing operation, **Then** the system generates a trochoidal toolpath that maintains the configured optimal load/engagement angle without exceeding stepdown limits.
2. **Given** a 2D Contour operation with holding tabs enabled, **When** the toolpath is simulated and exported, **Then** the tool lifts over tab regions at the configured tab height/length and all rapid moves retract to the safe clearance plane.
3. **Given** a multi-operation setup, **When** a user changes the stock height or tool diameter, **Then** dependent operations are marked out-of-date and recalculate associatively on demand.

---

### User Story 2 - Depth-Map / Heightfield 3D Relief Modeling & Sculpting (Priority: P1)

An artist or woodworker imports a grayscale depth map (PNG/TIFF/BMP) or 3D mesh (STL/OBJ), converts it into a high-resolution 3D relief component, adjusts Z-height, base thickness, smoothing, and contrast curves, composes multiple relief components (Add, Subtract, Merge High, Merge Low, Multiply), and refines details using interactive sculpting brushes (Smooth, Raise, Lower, Flatten, Smudge) before generating 3D roughing and finishing toolpaths.

**Why this priority**: This is the core Vectric Aspire / ArtCAM capability requested by the user—turning 2D depth maps and 3D models into machinable artistic reliefs within the same environment as engineering CAM.

**Independent Test**: Can be fully tested by importing a 16-bit grayscale heightmap, scaling it to physical stock dimensions (e.g., 200x150x18 mm), applying a smooth/blend operation, generating a 3D raster/offset finishing pass with a tapered ballnose bit, and verifying the simulated 3D relief matches the heightmap.

**Acceptance Scenarios**:

1. **Given** a 16-bit grayscale depth map image, **When** the user imports it as a Relief Component with target width 200 mm and max Z depth 15 mm, **Then** the viewport renders an accurate 3D heightfield mesh and preserves full 16-bit depth precision without stair-stepping.
2. **Given** two overlapping relief components (e.g., a frame and a central medallion), **When** the user sets the medallion's combine mode to "Merge High", **Then** the resulting composite relief takes the maximum Z height at every point seamlessly.
3. **Given** a composite 3D relief, **When** the user generates a 3D Roughing (flat endmill) followed by a 3D Finishing (tapered ballnose, 8% stepover) toolpath, **Then** the finishing toolpath respects the roughing boundary and leaves no gouges.

---

### User Story 3 - True V-Carving, Flat-Bottom V-Carving & 3D-Projected V-Carving (Priority: P1)

A signmaker or furniture maker imports or draws vector artwork and text, selects a V-bit (e.g., 60° or 90°), and generates **True V-Carving** toolpaths where the cutter varies Z depth along the medial axis to produce crisp, sharp internal corners—with optional flat-bottom area clearance using a flat endmill, **V-Carve Inlay (Male/Female plug)** generation, and **3D-Projected V-Carving** that wraps cleanly onto a 3D relief surface.

**Why this priority**: V-carving is the signature capability of Vectric Aspire / ArtCAM and is explicitly requested by the user. Combining it with 3D relief projection unlocks high-end signmaking, inlays, and carved plaques.

**Independent Test**: Can be fully tested by creating serif text vectors, running True V-Carving with a 90° V-bit and 3 mm flat clearance endmill, and verifying sharp corner Z-lifts in simulation and G-code.

**Acceptance Scenarios**:

1. **Given** closed vector shapes with sharp acute corners, **When** the user generates a True V-Carving toolpath with a 60° V-bit, **Then** the toolpath follows the medial axis, varies Z depth proportionally to local vector width, and ramps upward into sharp corners to form crisp angled walls.
2. **Given** wide vector regions that exceed the V-bit's maximum cut depth, **When** the user enables Flat-Bottom Clearance with a 6 mm flat endmill, **Then** the system generates two coordinated toolpaths: a flat endmill pocket clearing the interior and a V-bit pass beveling the perimeter.
3. **Given** a 3D relief surface and overlaid vector artwork, **When** the user enables "Project onto 3D Relief", **Then** the V-carving Z-depths are offset accurately by the underlying relief height at every point along the path.

---

### User Story 4 - 3D Engineering Toolpaths & In-Process Stock Rest Machining (Priority: P2)

A CNC machinist imports a 3D CAD solid or mesh and runs Fusion-grade 3D strategies—**3D Adaptive Roughing**, **Parallel**, **Scallop (Constant Stepover)**, **Steep & Shallow**, and **Pencil Corner Cleanup**—using an **In-Process Stock Model** so subsequent smaller tools only machine remaining material (Rest Machining) rather than cutting air.

**Why this priority**: Rest machining and constant-scallop/steep-and-shallow strategies are what separate pro-grade CAM (Fusion) from basic hobby CAM, drastically cutting cycle times and improving surface finish.

**Independent Test**: Can be fully tested by roughing a 3D pocketed/contoured part with a 6 mm endmill, then running a 2 mm ballnose Scallop + Rest Machining pass and verifying air-cutting is eliminated outside unmachined stock regions.

**Acceptance Scenarios**:

1. **Given** a completed roughing operation, **When** the user adds a Rest Machining finishing operation with a smaller tool, **Then** the toolpath only covers regions where remaining stock exceeds the configured stock-to-leave tolerance.
2. **Given** a part with both vertical walls and shallow curved faces, **When** the user selects Steep & Shallow with a 45° threshold angle, **Then** steep regions receive constant-Z passes and shallow regions receive constant-scallop passes.

---

### User Story 5 - Real-Time Material Removal Simulation, Collision Check & Post-Processing (Priority: P2)

Before sending a job to the machine, the user runs an interactive 3D stock-removal simulation showing cut material, surface finish, tool/holder visualization, gouge/collision warnings, and accurate cycle time estimates, then exports machine-ready G-code through configurable post-processors (GRBL, Mach3/Mach4, LinuxCNC, Masso, Fanuc/Haas).

**Why this priority**: Simulation and reliable post-processing prevent broken bits, ruined stock, and machine crashes.

**Independent Test**: Can be fully tested by simulating a multi-tool job, intentionally triggering a holder collision or rapid-in-stock error to verify detection, and exporting G-code verified against dialect rules.

**Acceptance Scenarios**:

1. **Given** a setup with multiple operations, **When** the user runs Simulation, **Then** the viewport animates tool motion and progressive material removal at variable playback speed with an accurate estimated machining time.
2. **Given** a tool with insufficient flute/stickout length for a deep pocket, **When** simulation or collision check runs, **Then** the system flags the exact location and operation where the shaft or holder collides with stock.
3. **Given** a selected post-processor (e.g., GRBL or LinuxCNC), **When** the user exports G-code, **Then** the output contains valid syntax, tool-change behavior (single-tool split or M6), safe Z retracts, and header/footer blocks.

---

### User Story 6 - Recommended "Best of Both Worlds" Power Features (Priority: P3)

To surpass both Fusion and Aspire/ArtCAM, the software includes productivity tools tailored to real CNC shops: **Vector Auto-Trace & Node Editing**, **Automatic Dogbone / T-Bone Joinery Fillets**, **V-Carve Inlay (Male/Female Plug) Generator**, **PhotoVCarve / Lithophane Mode**, **True-Shape Sheet Nesting**, **Double-Sided Alignment & Toolpath Tiling**, and **4th-Axis Rotary Wrapping**.

**Why this priority**: These features turn a strong CAM engine into an all-in-one workshop powerhouse, eliminating external utilities for signmakers, cabinetmakers, and makers.

**Independent Test**: Each power tool can be tested independently (e.g., generating a male inlay plug with configurable glue gap and air gap from a female V-carve pocket; nesting 10 irregular vector parts onto a 1220x2440 mm sheet).

**Acceptance Scenarios**:

1. **Given** a V-carve pocket design, **When** the user invokes "Generate Inlay Plug", **Then** the system automatically mirrors the vectors, applies the configured start depth, flat depth, and glue-gap offset, and creates the matching male plug toolpaths.
2. **Given** a set of 2D parts with inner corners for tab-and-slot joinery, **When** the user applies Automatic Dogbone Fillets for a 6 mm bit, **Then** corner reliefs of the exact tool radius are added cleanly without distorting outer dimensions.

---

### Edge Cases

- What happens when a vector for V-carving is self-intersecting, open, or contains duplicate overlapping nodes? The system MUST detect and report invalid vectors, offer one-click vector repair/closure, and never crash or produce NaN toolpaths.
- What happens when a depth map has 8-bit quantization banding? The system MUST offer optional edge-preserving smoothing / Gaussian blur before toolpath generation.
- What happens when a toolpath is cancelled mid-calculation? Background computation MUST abort cleanly without leaking memory or corrupting existing operations.
- What happens when flute length is shorter than cut depth? The system MUST warn the user before G-code export.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support project setups with configurable Stock (Box, Cylinder, Offset from Model), Work Coordinate System (WCS) origin placement, and Safe/Retract/Clearance Z heights.
- **FR-002**: System MUST provide a parametric Tool Library pre-populated with all popular CNC carving tools and endmills (Flat Endmills 1/8", 1/4", 3mm, 6mm; Ballnose & Tapered Ballnose 0.5mm/1mm/R0.25/R0.5/R1.0; V-Bits 30°, 60°, 90°, 120°; Compression/Downcut/Upcut Spiral, O-Flute for Acrylic/Aluminum, Spoilboard Surfacing Bit, Engraving 15°/20°, Bullnose, Chamfer, and Drills) with material-specific recommended default cutting parameters (RPM, feedrate, plunge rate, stepdown, stepover, optimal load) for Hardwood, Softwood, MDF/Plywood, Acrylic/HDPE, and Aluminum 6061.
- **FR-003**: System MUST generate precision 2D/2.5D toolpaths: Adaptive Clearing (constant engagement trochoidal), 2D Pocket, 2D Contour (with tabs, lead-in/out, ramp/helix entry), Face Milling, and Drilling/Peck Drilling.
- **FR-004**: System MUST import grayscale depth maps (PNG, TIFF, BMP) at up to 16-bit precision and 3D meshes (STL, OBJ) as editable Relief Components with Z-scaling, smoothing, contrast/gamma adjustment, and non-destructive boolean/merge composition (Add, Subtract, Merge High, Merge Low).
- **FR-005**: System MUST provide interactive 3D heightfield sculpting brushes (Raise, Lower, Smooth, Flatten, Smudge) with configurable brush size, strength, and falloff.
- **FR-006**: System MUST generate True V-Carving toolpaths (variable-Z medial axis with sharp corner lifts), Flat-Bottom V-Carving (coordinated flat clearance + V-bit bevel), and 3D-Projected V-Carving onto relief surfaces.
- **FR-007**: System MUST generate 3D model/relief toolpaths including 3D Adaptive Roughing, Parallel Raster, Offset/Spiral, Scallop (Constant Stepover), Steep & Shallow, Pencil Cleanup, and Rest Machining using an in-process stock model.
- **FR-008**: System MUST provide real-time 3D material-removal simulation with gouge detection, shaft/holder collision checking, and cycle time estimation.
- **FR-009**: System MUST export machine-ready G-code via configurable post-processors (minimum built-in: GRBL, Mach3/Mach4, LinuxCNC, Masso, Generic ISO/Fanuc).
- **FR-010**: System MUST include built-in 2D vector tools: SVG/DXF import, bitmap-to-vector auto-tracing, node editing, offset, text-on-curve, automatic dogbone/T-bone fillets, and V-carve inlay plug generation.
- **FR-011**: System MUST be delivered as a cross-platform Native Desktop Application (Windows/macOS/Linux) with a high-performance compiled geometry/CAM core and hardware-accelerated 3D viewport.
- **FR-012**: System MUST deliver the complete v1 suite including Core Setup/Stock, 2.5D/Adaptive, 16-bit Depth-Map Relief & Sculpting, True/3D V-Carving, PhotoVCarve / Lithophane engraving, Material Removal Simulation, Post-Processors, Dogbone Fillets, and V-Carve Inlay Plugs.
- **FR-013**: System MUST support STL/OBJ 3D meshes, SVG/DXF 2D vectors, 16-bit PNG/TIFF/BMP depth maps, and built-in 2D vector sketching in v1, with B-Rep STEP/IGES CAD import planned for a later phase.

### Key Entities

- **Project**: Top-level document containing Units (mm/in), Material, Stock, WCS Setup(s), Geometry/Relief Layers, Tool Library references, Operations, and Post-Processor settings.
- **Tool**: Parametric cutter definition (type, diameter, flute count, flute length, overall length, corner radius, V-angle, taper angle, holder profile, feeds/speeds presets).
- **VectorLayer / VectorShape**: 2D Bézier/polyline geometry with open/closed state, winding direction, and grouping for 2.5D/V-carving operations.
- **ReliefComponent**: 2D floating-point heightfield grid with physical bounds, Z-scale, base height, combine mode, and sculpting/filter stack.
- **Operation**: A configured machining strategy (e.g., Adaptive2D, VCarve, ReliefFinish3D) linked to target geometry, a Tool, cutting parameters, and cached Toolpath + In-Process Stock state.
- **Toolpath**: Ordered sequence of motion segments (Rapid, Linear, Arc, Helical) with feedrates, spindle RPM, and safety metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can go from importing a 2D vector or 16-bit depth map to simulated, G-code-exported toolpaths in under 5 minutes for a standard sign/relief job.
- **SC-002**: Toolpath generation for a 200x200 mm 3D relief at 0.1 mm stepover completes in under 10 seconds on a standard modern desktop CPU without freezing the UI.
- **SC-003**: 100% of simulated toolpaths pass automated gouge-check and safe-Z rapid-clearance verification before G-code export.
- **SC-004**: Generated V-carve corners and 2.5D pocket/contour dimensions match theoretical geometry within <= 0.01 mm tolerance in stock simulation.

## Assumptions

- Target users are CNC hobbyists, prosumers, signmakers, woodworkers, and small machine shops running 3-axis (and optionally 4-axis) CNC routers and mills.
- The software runs locally and offline without requiring cloud servers for toolpath computation.
- Units seamlessly switch between Metric (mm) and Imperial (inches) without rounding drift.
