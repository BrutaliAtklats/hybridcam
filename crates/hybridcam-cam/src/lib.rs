//! Toolpath generation engine: 2.5D/Adaptive, True/3D V-Carve, PhotoVCarve, 3D Relief & Rest Machining.

pub mod adaptive_2d;
pub mod model;
pub mod ops_2d;
pub mod ops_3d;
pub mod photovcarve;
pub mod tools;
pub mod vcarve;

pub use model::*;
pub use tools::{default_tool_library, MaterialPreset};
