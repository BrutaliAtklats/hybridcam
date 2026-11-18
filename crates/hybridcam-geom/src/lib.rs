//! Core geometry, units, vector operations, mesh/depth-map importers, and cancellation primitives.

pub mod import;
pub mod model;
pub mod vector;

/// Default geometric computation tolerance in millimeters (Constitution Principle I).
pub const GEOM_TOLERANCE_MM: f64 = 0.001;

pub use model::*;
