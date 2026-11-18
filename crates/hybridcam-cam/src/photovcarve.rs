use crate::tools::{MaterialPreset, Tool};
use crate::{MotionKind, MotionSegment, Toolpath};
use hybridcam_geom::{Point3, Rect2, WorkCoordinateSystem};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PhotoCarvePattern {
    AngledLines,
    CrossHatch,
    LithophaneInverted,
}

/// Generate a PhotoVCarve / Lithophane toolpath from a normalized 0.0..=1.0 grayscale image.
///
/// Darker pixels produce deeper V-grooves (or thinner walls in Lithophane mode), creating
/// crisp photographic contrast when stained or backlit.
pub fn generate_photovcarve(
    op_id: Uuid,
    width_px: u32,
    height_px: u32,
    luma_normalized: &[f32],
    bounds_mm: Rect2,
    max_depth_mm: f64,
    line_spacing_mm: f64,
    angle_deg: f64,
    pattern: PhotoCarvePattern,
    tool: &Tool,
    material: MaterialPreset,
    wcs: &WorkCoordinateSystem,
) -> Toolpath {
    let cd = tool.recommended_for(material);
    let mut segments = Vec::new();
    let spacing = line_spacing_mm.max(0.2);
    let sample_step = 0.25_f64;

    let sample_luma = |x_mm: f64, y_mm: f64| -> f64 {
        let u = ((x_mm - bounds_mm.min_x) / bounds_mm.width().max(1e-9)).clamp(0.0, 1.0);
        let v = ((y_mm - bounds_mm.min_y) / bounds_mm.height().max(1e-9)).clamp(0.0, 1.0);
        let px = ((u * (width_px - 1) as f64).round() as usize).min(width_px as usize - 1);
        let py = ((v * (height_px - 1) as f64).round() as usize).min(height_px as usize - 1);
        luma_normalized[py * width_px as usize + px] as f64
    };

    let angles = match pattern {
        PhotoCarvePattern::CrossHatch => vec![angle_deg, angle_deg + 90.0],
        _ => vec![angle_deg],
    };

    let cx = (bounds_mm.min_x + bounds_mm.max_x) * 0.5;
    let cy = (bounds_mm.min_y + bounds_mm.max_y) * 0.5;
    let diag = (bounds_mm.width().powi(2) + bounds_mm.height().powi(2)).sqrt();

    for ang_d in angles {
        let rad = ang_d.to_radians();
        let dir_x = rad.cos();
        let dir_y = rad.sin();
        let perp_x = -dir_y;
        let perp_y = dir_x;

        let mut offset = -diag * 0.5;
        let mut forward = true;
        while offset <= diag * 0.5 {
            let mut line_pts = Vec::new();
            let mut t = -diag * 0.5;
            while t <= diag * 0.5 {
                let x = cx + offset * perp_x + t * dir_x;
                let y = cy + offset * perp_y + t * dir_y;
                if x >= bounds_mm.min_x
                    && x <= bounds_mm.max_x
                    && y >= bounds_mm.min_y
                    && y <= bounds_mm.max_y
                {
                    let luma = sample_luma(x, y);
                    let depth = match pattern {
                        PhotoCarvePattern::LithophaneInverted => luma * max_depth_mm.abs(),
                        _ => (1.0 - luma) * max_depth_mm.abs(),
                    };
                    line_pts.push(Point3::new(x, y, -depth));
                }
                t += sample_step;
            }
            if !forward {
                line_pts.reverse();
            }
            forward = !forward;

            if line_pts.len() >= 2 {
                let first = line_pts[0];
                segments.push(MotionSegment {
                    kind: MotionKind::Rapid,
                    start: Point3::new(first.x, first.y, wcs.clearance_z_mm),
                    end: Point3::new(first.x, first.y, wcs.retract_z_mm),
                    arc_center_xy: None,
                    feed_mm_min: 0.0,
                });
                segments.push(MotionSegment {
                    kind: MotionKind::Linear,
                    start: Point3::new(first.x, first.y, wcs.retract_z_mm),
                    end: first,
                    arc_center_xy: None,
                    feed_mm_min: cd.plunge_rate_mm_min,
                });
                for win in line_pts.windows(2) {
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: win[0],
                        end: win[1],
                        arc_center_xy: None,
                        feed_mm_min: cd.feed_rate_mm_min,
                    });
                }
                let last = *line_pts.last().unwrap();
                segments.push(MotionSegment {
                    kind: MotionKind::Rapid,
                    start: last,
                    end: Point3::new(last.x, last.y, wcs.clearance_z_mm),
                    arc_center_xy: None,
                    feed_mm_min: 0.0,
                });
            }

            offset += spacing;
        }
    }

    let mut tp = Toolpath {
        operation_id: op_id,
        tool_number: tool.number,
        spindle_rpm: cd.spindle_rpm,
        segments,
        estimated_time_sec: 0.0,
        total_cut_distance_mm: 0.0,
        warnings: Vec::new(),
    };
    tp.compute_metrics();
    tp
}
