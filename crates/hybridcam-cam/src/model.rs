use hybridcam_geom::Point3;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MotionKind {
    Rapid,
    Linear,
    ArcCW,
    ArcCCW,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MotionSegment {
    pub kind: MotionKind,
    pub start: Point3,
    pub end: Point3,
    /// Center offset (I, J) for arc moves in XY plane.
    pub arc_center_xy: Option<(f64, f64)>,
    pub feed_mm_min: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyWarning {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Toolpath {
    pub operation_id: Uuid,
    pub tool_number: u32,
    pub spindle_rpm: u32,
    pub segments: Vec<MotionSegment>,
    pub estimated_time_sec: f64,
    pub total_cut_distance_mm: f64,
    pub warnings: Vec<SafetyWarning>,
}

impl Toolpath {
    pub fn compute_metrics(&mut self) {
        let mut cut_dist = 0.0;
        let mut time_sec = 0.0;
        for seg in &self.segments {
            let d = seg.start.dist(seg.end);
            match seg.kind {
                MotionKind::Rapid => {
                    // Assume 6000 mm/min rapid rate for estimation
                    time_sec += (d / 6000.0) * 60.0;
                }
                _ => {
                    cut_dist += d;
                    let feed = seg.feed_mm_min.max(1.0);
                    time_sec += (d / feed) * 60.0;
                }
            }
        }
        self.total_cut_distance_mm = cut_dist;
        self.estimated_time_sec = time_sec;
    }
}
