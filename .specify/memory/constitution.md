<!--
  Sync Impact Report:
  - Version change: N/A → 1.0.0 (Initial ratification)
  - Modified principles: N/A (Initial set)
  - Added sections: Core Principles (I–V), Technical & Safety Constraints, Development Workflow, Governance
  - Removed sections: None
  - Follow-up TODOs: None
-->

# HybridCAM Constitution

## Core Principles

### I. Geometry & Toolpath Precision First (NON-NEGOTIABLE)
All geometric kernels, toolpath generators, and post-processors MUST prioritize mathematical accuracy, gouge-free safety, and deterministic output. Every toolpath algorithm MUST respect tool geometry (flute length, diameter, tip angle, corner radius, holder clearance) and stock boundaries. Floating-point tolerances MUST be explicit and configurable (defaulting to <= 0.001 mm / 0.00004 in for toolpath computation).

### II. Modular Engine-First Architecture
The CAM computation kernel (geometry, heightfield/relief modeling, toolpath generation, stock simulation, post-processing) MUST be cleanly decoupled from the graphical user interface. Core modules MUST be usable as standalone, headless libraries/CLIs so they can be batch-tested, benchmarked, and automated without UI dependencies.

### III. Test-First & Simulation Verification (NON-NEGOTIABLE)
Every toolpath strategy, vector operation, and post-processor MUST have automated unit and integration tests before being considered complete. Toolpath correctness MUST be verified against synthetic stock-removal (dexel/voxel) checks for gouging, rapid-in-stock collisions, and dimensional accuracy. Post-processor output MUST be validated against expected G-code dialects.

### IV. Unified Precision + Artistic Workflow
The user experience MUST bridge engineering CAM (Fusion-style setup, stock, WCS, adaptive clearing, rest machining, tool libraries) and artistic relief CAM (Aspire/ArtCAM-style depth maps, heightfield sculpting, V-carving, 3D projection) in a single cohesive project model. Users MUST NOT have to export/re-import between separate tools to combine CAD pockets/contours with 3D reliefs and V-carving.

### V. Performance & Responsiveness on Real-World Jobs
Heavy computations (Voronoi/medial-axis V-carving, 3D adaptive clearing, high-resolution heightfield sculpting, and real-time material-removal simulation) MUST execute asynchronously off the UI thread with progress reporting, cancellation support, and bounded memory usage. The viewport MUST remain interactive while toolpaths compute.

## Technical & Safety Constraints

- **Machine Safety**: Rapid moves (G0) MUST always retract to a configured safe Z / clearance plane before XY traversal unless explicitly performing a verified stay-down link. All G-code generation MUST include explicit units (G20/G21), positioning mode (G90), spindle/coolant/stop safety blocks, and header metadata.
- **Data Integrity**: Project files MUST use an open, versioned format with non-destructive operation history (parametric/associative recalculation when geometry, stock, or tool parameters change).
- **Cross-Platform & Offline Capable**: Core CAM workflows MUST run locally without requiring cloud connectivity or internet access.

## Development Workflow

- Follow Spec-Driven Development (SDD): Constitution -> Specify -> Clarify -> Plan -> Tasks -> Implement -> Converge.
- No feature implementation begins until its specification and technical plan are reviewed and approved.
- Every phase ends with passing automated tests and a clean build before advancing.

## Governance

This Constitution supersedes all ad-hoc implementation choices. Any amendment requires documenting the rationale, updating the semantic version (`MAJOR.MINOR.PATCH`), and verifying existing specifications remain compliant. Complexity in architecture or dependencies MUST be justified by concrete functional or performance requirements in `plan.md`.

**Version**: 1.0.0 | **Ratified**: 2026-11-17 | **Last Amended**: 2026-11-17
