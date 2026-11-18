# Technical Research: HybridCAM Core

**Feature**: `001-hybrid-cam-core` | **Date**: 2026-11-17

## 1. Architecture & Stack Decision

- **Decision**: **Rust** (`hybridcam-core` workspace crates) + **Tauri v2** + **TypeScript / React / Three.js** (`hybridcam-app`).
- **Rationale**:
  - Rust provides C++-class numerical performance, fearless multi-threading (`rayon`) for heavy toolpath & heightfield computations, zero-cost abstractions, and deterministic memory safety—essential for CNC safety.
  - Tauri v2 packages a native cross-platform desktop binary (Windows, macOS, Linux) with direct in-process Rust IPC (no HTTP server overhead) and a GPU-accelerated WebView for Three.js 3D rendering.
  - `hybridcam-core` remains 100% decoupled from Tauri/UI, fulfilling Constitution Principle II (headless library + CLI testable via `cargo test`).
- **Alternatives Considered**:
  - *C++20 + Qt6*: Mature, but slower UI iteration and heavier cross-platform build/packaging setup.
  - *Python + PySide6*: Too slow for real-time heightfield sculpting, Voronoi V-carving, and dexel simulation without writing C++/Cython extensions anyway.

## 2. Core Algorithmic Building Blocks

### 2.1 2D Vector & Boolean/Offset Kernel
- **Flattening & Curves**: `kurbo` for cubic/quadratic Bézier evaluation, arc fitting, and adaptive flattening to tolerance ($\le 0.001\text{ mm}$).
- **Boolean & Offsetting**: `i_overlay` (or `clipper2` FFI) for robust polygon booleans (Union, Difference, Intersection, XOR) and inward/outward offsetting with miter/round/bevel joins.
- **Importers & Tracing**: `usvg` (SVG), `dxf` (DXF), `vtracer` (bitmap-to-vector auto-tracing), `ttf-parser` / `rustybuzz` (text-to-outlines & text-on-curve).

### 2.2 True V-Carving & Flat-Bottom V-Carving (Aspire / ArtCAM Parity)
- **Medial Axis**: `boostvoronoi` (Rust port of Boost.Polygon Voronoi) computes the exact Voronoi diagram of closed vector segments.
- **Depth Mapping**: For each Voronoi edge point $p$ with inscribed circle radius $r(p)$ and V-bit included angle $\theta$:
  $$z(p) = -\frac{r(p)}{\tan(\theta / 2)}$$
  Sharp corners naturally converge to $r \to 0 \implies z \to 0$, producing crisp corner lifts.
- **Flat-Bottom Clearance**: When $z(p) < -d_{\max}$, clamp $z$ to $-d_{\max}$ and offset the boundary inward by $d_{\max} \cdot \tan(\theta / 2)$ to generate the flat-endmill pocket region.
- **3D-Projected V-Carving**: Sample the underlying `ReliefGrid` height $h(x,y)$ at each dense V-carve point and offset $z_{\text{final}} = h(x,y) + z_{\text{vcarve}}(x,y)$.

### 2.3 16-Bit Depth-Map & 3D Relief Engine
- **Data Structure**: Contiguous `Vec<f32>` grid (`ReliefGrid`) with physical `(width_mm, height_mm)`, `resolution_mm_per_px`, and `base_z_mm`.
- **Import**: 16-bit PNG/TIFF (`image` + `tiff` crates) mapped linearly to `[0, z_scale]`; STL/OBJ (`stl_io`, `tobj`) rasterized into the heightfield via orthographic Z-buffer projection.
- **Composition**: Non-destructive component stack supporting `Add`, `Subtract`, `MergeHigh (max)`, `MergeLow (min)`, `Multiply`, plus Gaussian/bilateral smoothing and contrast/gamma curves.
- **Sculpting**: Real-time brush kernels (Raise, Lower, Smooth, Flatten, Smudge) operating on dirty bounding boxes and streaming incremental vertex/normal updates to the GPU.

### 2.4 Fusion-Grade 2.5D & 3D Toolpaths
- **2D Adaptive Clearing**: Distance-field / engagement-angle-bounded trochoidal clearing that avoids full-slot cuts by maintaining radial engagement $\le \text{optimal\_load}$.
- **3D Drop-Cutter & Waterline**: Analytic drop-cutter against both `ReliefGrid` (O(1) per sample) and BVH-accelerated triangle meshes (`parry3d` / `bvh`) for Parallel, Scallop, Steep & Shallow, and Pencil Cleanup.
- **In-Process Stock & Rest Machining**: **3-Axis Dexel Grid** (`Vec<Vec<(f32, f32)>>` or single-height `Vec<f32>` for 3-axis) tracks remaining stock after each operation. Rest-machining operations query where `stock_z(x,y) > target_z(x,y) + stock_to_leave + tolerance` and restrict toolpaths to those regions.

### 2.5 Simulation & Post-Processing
- **Simulation**: Progressive dexel subtraction along swept tool envelopes (flat, ball, bullnose, V-bit, tapered ballnose), generating a triangle mesh via greedy/marching-squares surface extraction for real-time 3D playback, gouge detection, and shaft/holder collision checks.
- **Post-Processors**: Trait-based `PostProcessor` with built-in dialects (`GRBL`, `Mach3/4`, `LinuxCNC`, `Masso`, `Fanuc/ISO`) enforcing safe-Z clearance retracts, modal G-code formatting, and unit headers.
