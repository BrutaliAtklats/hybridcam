//! 16-bit depth-map & 3D relief modeling, non-destructive component composition, and sculpting.

pub mod grid;
pub mod sculpt;
pub mod stack;

pub use grid::ReliefGrid;
pub use sculpt::{apply_brush, BrushKind, BrushStroke, DirtyRect};
pub use stack::{CombineMode, ReliefComponent, ReliefStack};
