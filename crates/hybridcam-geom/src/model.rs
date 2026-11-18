use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Units {
    Millimeters,
    Inches,
}

impl Units {
    /// Convert a value in the given units to canonical millimeters.
    pub fn to_mm(self, value: f64) -> f64 {
        match self {
            Units::Millimeters => value,
            Units::Inches => value * 25.4,
        }
    }

    /// Convert canonical millimeters to the target units.
    pub fn from_mm(self, mm: f64) -> f64 {
        match self {
            Units::Millimeters => mm,
            Units::Inches => mm / 25.4,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point2 {
    pub x: f64,
    pub y: f64,
}

impl Point2 {
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn dist(self, other: Self) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Point3 {
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub fn dist(self, other: Self) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2) + (self.z - other.z).powi(2))
            .sqrt()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect2 {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

impl Rect2 {
    pub fn width(self) -> f64 {
        (self.max_x - self.min_x).max(0.0)
    }

    pub fn height(self) -> f64 {
        (self.max_y - self.min_y).max(0.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StockDefinition {
    Box {
        width_mm: f64,
        depth_mm: f64,
        height_mm: f64,
    },
    Cylinder {
        diameter_mm: f64,
        height_mm: f64,
    },
    OffsetFromModel {
        xy_offset_mm: f64,
        top_offset_mm: f64,
        bottom_offset_mm: f64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WcsOriginPreset {
    TopFrontLeft,
    TopCenter,
    SpoilboardFrontLeft,
    SpoilboardCenter,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkCoordinateSystem {
    pub preset: WcsOriginPreset,
    pub offset_mm: Point3,
    pub clearance_z_mm: f64,
    pub retract_z_mm: f64,
    pub feed_plane_z_mm: f64,
}

impl Default for WorkCoordinateSystem {
    fn default() -> Self {
        Self {
            preset: WcsOriginPreset::TopFrontLeft,
            offset_mm: Point3::new(0.0, 0.0, 0.0),
            clearance_z_mm: 15.0,
            retract_z_mm: 5.0,
            feed_plane_z_mm: 2.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Polyline2 {
    pub points: Vec<Point2>,
    pub closed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorShape {
    pub id: Uuid,
    pub name: String,
    pub contours: Vec<Polyline2>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorLayer {
    pub id: Uuid,
    pub name: String,
    pub visible: bool,
    pub locked: bool,
    pub shapes: Vec<VectorShape>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriangleMesh {
    pub id: Uuid,
    pub name: String,
    pub vertices: Vec<Point3>,
    pub indices: Vec<[u32; 3]>,
}

/// Cooperative cancellation token for long-running CAM computations.
#[derive(Debug, Clone, Default)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }
}
