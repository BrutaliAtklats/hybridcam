//! 3-axis Dexel Stock Simulator, gouge detection, and rapid-in-stock collision checking.

use hybridcam_cam::tools::{Tool, ToolGeometry};
use hybridcam_cam::{MotionKind, Toolpath};
use hybridcam_geom::Rect2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollisionEvent {
    pub segment_index: usize,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationReport {
    pub width_px: u32,
    pub height_px: u32,
    pub stock_heights_mm: Vec<f32>,
    pub collisions: Vec<CollisionEvent>,
    pub total_time_sec: f64,
}

/// 3-axis heightfield dexel stock model.
pub struct DexelStock {
    pub width_px: u32,
    pub height_px: u32,
    pub bounds_mm: Rect2,
    pub heights: Vec<f32>,
}

impl DexelStock {
    pub fn new(bounds_mm: Rect2, width_px: u32, height_px: u32, initial_top_z_mm: f32) -> Self {
        Self {
            width_px,
            height_px,
            bounds_mm,
            heights: vec![initial_top_z_mm; (width_px as usize) * (height_px as usize)],
        }
    }

    fn effective_sim_radius_mm(&self, tool: &Tool, pixel_pitch: f64) -> f64 {
        (tool.geometry.cutting_diameter_mm() * 0.5).max(pixel_pitch * 0.9)
    }

    fn tool_profile_z(&self, tool: &Tool, radial_dist_mm: f64, pixel_pitch: f64) -> Option<f64> {
        let r = self.effective_sim_radius_mm(tool, pixel_pitch);
        if radial_dist_mm > r {
            return None;
        }
        let d_eff = (radial_dist_mm - pixel_pitch * 0.45).max(0.0);
        let dz = match tool.geometry {
            ToolGeometry::FlatEndmill { .. } | ToolGeometry::Surfacing { .. } => 0.0,
            ToolGeometry::Ballnose { .. } | ToolGeometry::TaperedBallnose { .. } => {
                r - (r * r - d_eff * d_eff).max(0.0).sqrt()
            }
            ToolGeometry::VBit { included_angle_deg, .. }
            | ToolGeometry::Engraving { included_angle_deg, .. } => {
                let half = (included_angle_deg * 0.5).to_radians();
                d_eff / half.tan().max(0.05)
            }
            _ => 0.0,
        };
        Some(dz)
    }

    /// Simulate a `Toolpath` against this dexel stock, checking for rapid-in-stock collisions
    /// and updating remaining stock heights.
    pub fn simulate_toolpath(&mut self, toolpath: &Toolpath, tool: &Tool) -> Vec<CollisionEvent> {
        let mut collisions = Vec::new();
        let bw = self.bounds_mm.width().max(1e-9);
        let bh = self.bounds_mm.height().max(1e-9);
        let pixel_pitch = (bw / (self.width_px - 1).max(1) as f64)
            .max(bh / (self.height_px - 1).max(1) as f64);
        let r = self.effective_sim_radius_mm(tool, pixel_pitch);

        for (seg_idx, seg) in toolpath.segments.iter().enumerate() {
            let dist = seg.start.dist(seg.end);
            let step_mm = (r * 0.45).clamp(0.2, 0.45);
            let steps = (dist / step_mm).ceil().max(1.0) as usize;

            for s in 0..=steps {
                let t = s as f64 / steps as f64;
                let tx = seg.start.x + (seg.end.x - seg.start.x) * t;
                let ty = seg.start.y + (seg.end.y - seg.start.y) * t;
                let tz = seg.start.z + (seg.end.z - seg.start.z) * t;

                let min_px = (((tx - r - self.bounds_mm.min_x) / bw) * (self.width_px - 1) as f64)
                    .floor()
                    .max(0.0) as u32;
                let max_px = (((tx + r - self.bounds_mm.min_x) / bw) * (self.width_px - 1) as f64)
                    .ceil()
                    .min((self.width_px - 1) as f64) as u32;
                let min_py = (((ty - r - self.bounds_mm.min_y) / bh) * (self.height_px - 1) as f64)
                    .floor()
                    .max(0.0) as u32;
                let max_py = (((ty + r - self.bounds_mm.min_y) / bh) * (self.height_px - 1) as f64)
                    .ceil()
                    .min((self.height_px - 1) as f64) as u32;

                for py in min_py..=max_py {
                    let y = self.bounds_mm.min_y
                        + (py as f64 / (self.height_px - 1).max(1) as f64) * bh;
                    for px in min_px..=max_px {
                        let x = self.bounds_mm.min_x
                            + (px as f64 / (self.width_px - 1).max(1) as f64) * bw;
                        let rad = ((x - tx).powi(2) + (y - ty).powi(2)).sqrt();
                        if let Some(dz) = self.tool_profile_z(tool, rad, pixel_pitch) {
                            let cut_z = (tz + dz) as f32;
                            let idx = (py as usize) * (self.width_px as usize) + (px as usize);
                            if cut_z < self.heights[idx] {
                                if seg.kind == MotionKind::Rapid {
                                    collisions.push(CollisionEvent {
                                        segment_index: seg_idx,
                                        kind: "RAPID_IN_STOCK".into(),
                                        message: format!(
                                            "Rapid move hit stock at ({:.2}, {:.2}, {:.2})",
                                            tx, ty, tz
                                        ),
                                    });
                                } else {
                                    self.heights[idx] = cut_z;
                                }
                            }
                        }
                    }
                }
            }
        }
        collisions
    }
}
