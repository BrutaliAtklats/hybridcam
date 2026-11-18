use crate::ReliefGrid;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BrushKind {
    Raise,
    Lower,
    Smooth,
    Flatten,
    Smudge,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BrushStroke {
    pub kind: BrushKind,
    pub x_mm: f64,
    pub y_mm: f64,
    pub prev_x_mm: f64,
    pub prev_y_mm: f64,
    pub radius_mm: f64,
    pub strength: f32,
    pub target_z_mm: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DirtyRect {
    pub min_px: u32,
    pub min_py: u32,
    pub max_px: u32,
    pub max_py: u32,
}

/// Apply an interactive sculpting brush stroke to a `ReliefGrid`, returning the modified pixel rect
/// so the 3D viewport can update only the affected vertex buffer region.
pub fn apply_brush(grid: &mut ReliefGrid, stroke: BrushStroke) -> Option<DirtyRect> {
    if grid.width_px < 2 || grid.height_px < 2 || stroke.radius_mm <= 0.0 {
        return None;
    }
    let bw = grid.bounds_mm.width().max(1e-9);
    let bh = grid.bounds_mm.height().max(1e-9);

    let min_x = (stroke.x_mm - stroke.radius_mm).max(grid.bounds_mm.min_x);
    let max_x = (stroke.x_mm + stroke.radius_mm).min(grid.bounds_mm.max_x);
    let min_y = (stroke.y_mm - stroke.radius_mm).max(grid.bounds_mm.min_y);
    let max_y = (stroke.y_mm + stroke.radius_mm).min(grid.bounds_mm.max_y);
    if min_x > max_x || min_y > max_y {
        return None;
    }

    let min_px = (((min_x - grid.bounds_mm.min_x) / bw) * (grid.width_px - 1) as f64).floor() as u32;
    let max_px = (((max_x - grid.bounds_mm.min_x) / bw) * (grid.width_px - 1) as f64).ceil() as u32;
    let min_py = (((min_y - grid.bounds_mm.min_y) / bh) * (grid.height_px - 1) as f64).floor() as u32;
    let max_py = (((max_y - grid.bounds_mm.min_y) / bh) * (grid.height_px - 1) as f64).ceil() as u32;

    let w = grid.width_px as usize;
    let snapshot = if matches!(stroke.kind, BrushKind::Smooth | BrushKind::Smudge) {
        Some(grid.heights.clone())
    } else {
        None
    };

    let dx_move = stroke.x_mm - stroke.prev_x_mm;
    let dy_move = stroke.y_mm - stroke.prev_y_mm;

    for py in min_py..=max_py.min(grid.height_px - 1) {
        let y = grid.bounds_mm.min_y + (py as f64 / (grid.height_px - 1) as f64) * bh;
        for px in min_px..=max_px.min(grid.width_px - 1) {
            let x = grid.bounds_mm.min_x + (px as f64 / (grid.width_px - 1) as f64) * bw;
            let dist = ((x - stroke.x_mm).powi(2) + (y - stroke.y_mm).powi(2)).sqrt();
            if dist >= stroke.radius_mm {
                continue;
            }
            // Smoothstep cosine falloff
            let t = 1.0 - (dist / stroke.radius_mm) as f32;
            let weight = (t * t * (3.0 - 2.0 * t)) * stroke.strength;
            let idx = (py as usize) * w + (px as usize);

            match stroke.kind {
                BrushKind::Raise => grid.heights[idx] += weight,
                BrushKind::Lower => grid.heights[idx] -= weight,
                BrushKind::Flatten => {
                    grid.heights[idx] += (stroke.target_z_mm - grid.heights[idx]) * weight.clamp(0.0, 1.0);
                }
                BrushKind::Smooth => {
                    if let Some(ref src) = snapshot {
                        if px > 0 && px + 1 < grid.width_px && py > 0 && py + 1 < grid.height_px {
                            let avg = 0.25
                                * (src[idx - 1] + src[idx + 1] + src[idx - w] + src[idx + w]);
                            grid.heights[idx] += (avg - src[idx]) * weight.clamp(0.0, 1.0);
                        }
                    }
                }
                BrushKind::Smudge => {
                    if let Some(ref _src) = snapshot {
                        let sample_x = x - dx_move * weight as f64;
                        let sample_y = y - dy_move * weight as f64;
                        let pulled = grid.sample_mm(sample_x, sample_y);
                        grid.heights[idx] += (pulled - grid.heights[idx]) * weight.clamp(0.0, 1.0);
                    }
                }
            }
        }
    }

    Some(DirtyRect {
        min_px,
        min_py,
        max_px: max_px.min(grid.width_px - 1),
        max_py: max_py.min(grid.height_px - 1),
    })
}
