use hybridcam_geom::{Rect2, TriangleMesh};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

/// High-precision floating-point heightfield grid (mm).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReliefGrid {
    pub width_px: u32,
    pub height_px: u32,
    pub bounds_mm: Rect2,
    /// Row-major heights in millimeters.
    pub heights: Vec<f32>,
}

impl ReliefGrid {
    pub fn new(width_px: u32, height_px: u32, bounds_mm: Rect2, initial_z_mm: f32) -> Self {
        let len = (width_px as usize) * (height_px as usize);
        Self {
            width_px,
            height_px,
            bounds_mm,
            heights: vec![initial_z_mm; len],
        }
    }

    /// Construct a `ReliefGrid` from normalized 0.0..=1.0 depth-map pixels (e.g. 16-bit PNG/TIFF).
    pub fn from_normalized_depth_map(
        width_px: u32,
        height_px: u32,
        normalized: &[f32],
        bounds_mm: Rect2,
        z_scale_mm: f32,
        base_height_mm: f32,
        gamma: f32,
    ) -> Self {
        let g = gamma.max(0.05);
        let heights = normalized
            .par_iter()
            .map(|&v| {
                let clamped = v.clamp(0.0, 1.0);
                base_height_mm + clamped.powf(g) * z_scale_mm
            })
            .collect();
        Self {
            width_px,
            height_px,
            bounds_mm,
            heights,
        }
    }

    /// Rasterize a 3D `TriangleMesh` into a heightfield using orthographic top-down Z-buffer projection.
    pub fn from_mesh_projection(
        mesh: &TriangleMesh,
        width_px: u32,
        height_px: u32,
        bounds_mm: Rect2,
        base_z_mm: f32,
    ) -> Self {
        let mut grid = Self::new(width_px, height_px, bounds_mm, base_z_mm);
        let bw = bounds_mm.width().max(1e-6);
        let bh = bounds_mm.height().max(1e-6);

        for &[i0, i1, i2] in &mesh.indices {
            let v0 = mesh.vertices[i0 as usize];
            let v1 = mesh.vertices[i1 as usize];
            let v2 = mesh.vertices[i2 as usize];

            let min_x = v0.x.min(v1.x).min(v2.x).max(bounds_mm.min_x);
            let max_x = v0.x.max(v1.x).max(v2.x).min(bounds_mm.max_x);
            let min_y = v0.y.min(v1.y).min(v2.y).max(bounds_mm.min_y);
            let max_y = v0.y.max(v1.y).max(v2.y).min(bounds_mm.max_y);

            if min_x > max_x || min_y > max_y {
                continue;
            }

            let px0 = (((min_x - bounds_mm.min_x) / bw) * (width_px - 1) as f64).floor() as u32;
            let px1 = (((max_x - bounds_mm.min_x) / bw) * (width_px - 1) as f64).ceil() as u32;
            let py0 = (((min_y - bounds_mm.min_y) / bh) * (height_px - 1) as f64).floor() as u32;
            let py1 = (((max_y - bounds_mm.min_y) / bh) * (height_px - 1) as f64).ceil() as u32;

            let denom = (v1.y - v2.y) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.y - v2.y);
            if denom.abs() < 1e-12 {
                continue;
            }

            for py in py0..=py1.min(height_px - 1) {
                let y = bounds_mm.min_y + (py as f64 / (height_px - 1).max(1) as f64) * bh;
                for px in px0..=px1.min(width_px - 1) {
                    let x = bounds_mm.min_x + (px as f64 / (width_px - 1).max(1) as f64) * bw;
                    let w0 = ((v1.y - v2.y) * (x - v2.x) + (v2.x - v1.x) * (y - v2.y)) / denom;
                    let w1 = ((v2.y - v0.y) * (x - v2.x) + (v0.x - v2.x) * (y - v2.y)) / denom;
                    let w2 = 1.0 - w0 - w1;
                    if w0 >= -1e-5 && w1 >= -1e-5 && w2 >= -1e-5 {
                        let z = (w0 * v0.z + w1 * v1.z + w2 * v2.z) as f32;
                        let idx = (py as usize) * (width_px as usize) + (px as usize);
                        if z > grid.heights[idx] {
                            grid.heights[idx] = z;
                        }
                    }
                }
            }
        }
        grid
    }

    /// Bilinearly sample height at world XY coordinates (mm).
    pub fn sample_mm(&self, x_mm: f64, y_mm: f64) -> f32 {
        if self.width_px < 2 || self.height_px < 2 {
            return self.heights.first().copied().unwrap_or(0.0);
        }
        let u = ((x_mm - self.bounds_mm.min_x) / self.bounds_mm.width().max(1e-9)).clamp(0.0, 1.0);
        let v = ((y_mm - self.bounds_mm.min_y) / self.bounds_mm.height().max(1e-9)).clamp(0.0, 1.0);

        let fx = u * (self.width_px - 1) as f64;
        let fy = v * (self.height_px - 1) as f64;

        let x0 = (fx.floor() as u32).min(self.width_px - 2);
        let y0 = (fy.floor() as u32).min(self.height_px - 2);
        let tx = (fx - x0 as f64) as f32;
        let ty = (fy - y0 as f64) as f32;

        let w = self.width_px as usize;
        let h00 = self.heights[y0 as usize * w + x0 as usize];
        let h10 = self.heights[y0 as usize * w + (x0 + 1) as usize];
        let h01 = self.heights[(y0 + 1) as usize * w + x0 as usize];
        let h11 = self.heights[(y0 + 1) as usize * w + (x0 + 1) as usize];

        let a = h00 * (1.0 - tx) + h10 * tx;
        let b = h01 * (1.0 - tx) + h11 * tx;
        a * (1.0 - ty) + b * ty
    }

    /// Apply separable box/Gaussian-approximation smoothing to eliminate 8-bit banding.
    pub fn smooth(&mut self, passes: u32) {
        let w = self.width_px as usize;
        let h = self.height_px as usize;
        if w < 3 || h < 3 {
            return;
        }
        let mut scratch = self.heights.clone();
        for _ in 0..passes {
            // Horizontal pass
            for y in 0..h {
                let row = y * w;
                scratch[row] = self.heights[row];
                scratch[row + w - 1] = self.heights[row + w - 1];
                for x in 1..(w - 1) {
                    scratch[row + x] = 0.25 * self.heights[row + x - 1]
                        + 0.50 * self.heights[row + x]
                        + 0.25 * self.heights[row + x + 1];
                }
            }
            // Vertical pass
            for y in 1..(h - 1) {
                for x in 0..w {
                    self.heights[y * w + x] = 0.25 * scratch[(y - 1) * w + x]
                        + 0.50 * scratch[y * w + x]
                        + 0.25 * scratch[(y + 1) * w + x];
                }
            }
        }
    }
}
