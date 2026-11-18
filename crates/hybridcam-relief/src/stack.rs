use crate::ReliefGrid;
use hybridcam_geom::Rect2;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CombineMode {
    Add,
    Subtract,
    MergeHigh,
    MergeLow,
    Multiply,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReliefComponent {
    pub id: Uuid,
    pub name: String,
    pub visible: bool,
    pub combine_mode: CombineMode,
    pub z_multiplier: f32,
    pub base_offset_mm: f32,
    pub grid: ReliefGrid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReliefStack {
    pub bounds_mm: Rect2,
    pub width_px: u32,
    pub height_px: u32,
    pub components: Vec<ReliefComponent>,
}

impl ReliefStack {
    pub fn new(bounds_mm: Rect2, width_px: u32, height_px: u32) -> Self {
        Self {
            bounds_mm,
            width_px,
            height_px,
            components: Vec::new(),
        }
    }

    /// Composite all visible relief components non-destructively into a single `ReliefGrid`.
    pub fn composite(&self) -> ReliefGrid {
        let mut out = ReliefGrid::new(self.width_px, self.height_px, self.bounds_mm, 0.0);
        let bw = self.bounds_mm.width();
        let bh = self.bounds_mm.height();

        for comp in self.components.iter().filter(|c| c.visible) {
            for py in 0..self.height_px {
                let y = self.bounds_mm.min_y
                    + (py as f64 / (self.height_px - 1).max(1) as f64) * bh;
                for px in 0..self.width_px {
                    let x = self.bounds_mm.min_x
                        + (px as f64 / (self.width_px - 1).max(1) as f64) * bw;
                    let idx = (py as usize) * (self.width_px as usize) + (px as usize);
                    let src = comp.grid.sample_mm(x, y) * comp.z_multiplier + comp.base_offset_mm;
                    out.heights[idx] = match comp.combine_mode {
                        CombineMode::Add => out.heights[idx] + src,
                        CombineMode::Subtract => out.heights[idx] - src,
                        CombineMode::MergeHigh => out.heights[idx].max(src),
                        CombineMode::MergeLow => out.heights[idx].min(src),
                        CombineMode::Multiply => out.heights[idx] * src,
                    };
                }
            }
        }
        out
    }
}
