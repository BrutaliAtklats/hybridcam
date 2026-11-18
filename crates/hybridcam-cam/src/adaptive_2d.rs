use crate::tools::{MaterialPreset, Tool};
use crate::{MotionKind, MotionSegment, Toolpath};
use hybridcam_geom::vector::{bounding_box, point_in_polygon};
use hybridcam_geom::{Point2, Point3, Polyline2, WorkCoordinateSystem};
use uuid::Uuid;

/// Generate a Fusion-style 2D Adaptive Clearing (trochoidal / constant-engagement) toolpath
/// inside a closed pocket boundary.
pub fn generate_adaptive_2d(
    op_id: Uuid,
    boundary: &Polyline2,
    target_depth_mm: f64,
    stock_to_leave_mm: f64,
    tool: &Tool,
    material: MaterialPreset,
    wcs: &WorkCoordinateSystem,
) -> Toolpath {
    let cd = tool.recommended_for(material);
    let d = tool.geometry.cutting_diameter_mm();
    let r = d * 0.5 + stock_to_leave_mm;
    let optimal_load = (d * cd.adaptive_optimal_load_fraction).max(0.15);
    let stepdown = cd.stepdown_mm.max(0.15).min(tool.geometry.flute_length_mm());
    let total_depth = target_depth_mm.abs();
    let passes = (total_depth / stepdown).ceil().max(1.0) as usize;

    let mut segments = Vec::new();
    let Some(bbox) = bounding_box(&boundary.points) else {
        return Toolpath {
            operation_id: op_id,
            tool_number: tool.number,
            spindle_rpm: cd.spindle_rpm,
            segments,
            estimated_time_sec: 0.0,
            total_cut_distance_mm: 0.0,
            warnings: Vec::new(),
        };
    };

    // Trochoidal circular-arc progression along scanlines inside the boundary
    let trochoid_r = (optimal_load * 0.85).max(0.2);
    let mut y = bbox.min_y + r;
    let mut scan_lines: Vec<Vec<Point2>> = Vec::new();

    while y <= bbox.max_y - r {
        let mut line_pts = Vec::new();
        let mut x = bbox.min_x + r;
        while x <= bbox.max_x - r {
            let p = Point2::new(x, y);
            if point_in_polygon(p, &boundary.points) {
                // Trochoidal loop points to cap radial engagement
                for k in 0..=8 {
                    let ang = 2.0 * std::f64::consts::PI * (k as f64) / 8.0;
                    let tx = x + trochoid_r * ang.cos();
                    let ty = y + trochoid_r * ang.sin();
                    if point_in_polygon(Point2::new(tx, ty), &boundary.points) {
                        line_pts.push(Point2::new(tx, ty));
                    }
                }
            }
            x += optimal_load;
        }
        if !line_pts.is_empty() {
            scan_lines.push(line_pts);
        }
        y += optimal_load * 1.6;
    }

    for pass in 1..=passes {
        let z = -(total_depth * (pass as f64) / (passes as f64));
        let mut prev_end: Option<Point3> = None;
        for (line_idx, line) in scan_lines.iter().enumerate() {
            let mut pts_ordered = line.clone();
            if line_idx % 2 == 1 {
                pts_ordered.reverse();
            }
            let start = pts_ordered[0];
            let start_3d = Point3::new(start.x, start.y, z);
            if let Some(pe) = prev_end {
                if pe.dist(start_3d) <= optimal_load * 4.5 {
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: pe,
                        end: start_3d,
                        arc_center_xy: None,
                        feed_mm_min: cd.feed_rate_mm_min,
                    });
                } else {
                    segments.push(MotionSegment {
                        kind: MotionKind::Rapid,
                        start: pe,
                        end: Point3::new(pe.x, pe.y, wcs.clearance_z_mm),
                        arc_center_xy: None,
                        feed_mm_min: 0.0,
                    });
                    segments.push(MotionSegment {
                        kind: MotionKind::Rapid,
                        start: Point3::new(pe.x, pe.y, wcs.clearance_z_mm),
                        end: Point3::new(start.x, start.y, wcs.retract_z_mm),
                        arc_center_xy: None,
                        feed_mm_min: 0.0,
                    });
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: Point3::new(start.x, start.y, wcs.retract_z_mm),
                        end: start_3d,
                        arc_center_xy: None,
                        feed_mm_min: cd.ramp_rate_mm_min,
                    });
                }
            } else {
                segments.push(MotionSegment {
                    kind: MotionKind::Rapid,
                    start: Point3::new(start.x, start.y, wcs.clearance_z_mm),
                    end: Point3::new(start.x, start.y, wcs.retract_z_mm),
                    arc_center_xy: None,
                    feed_mm_min: 0.0,
                });
                segments.push(MotionSegment {
                    kind: MotionKind::Linear,
                    start: Point3::new(start.x, start.y, wcs.retract_z_mm),
                    end: start_3d,
                    arc_center_xy: None,
                    feed_mm_min: cd.ramp_rate_mm_min,
                });
            }
            for win in pts_ordered.windows(2) {
                segments.push(MotionSegment {
                    kind: MotionKind::Linear,
                    start: Point3::new(win[0].x, win[0].y, z),
                    end: Point3::new(win[1].x, win[1].y, z),
                    arc_center_xy: None,
                    feed_mm_min: cd.feed_rate_mm_min,
                });
            }
            let end = *pts_ordered.last().unwrap();
            prev_end = Some(Point3::new(end.x, end.y, z));
        }
        if let Some(pe) = prev_end {
            segments.push(MotionSegment {
                kind: MotionKind::Rapid,
                start: pe,
                end: Point3::new(pe.x, pe.y, wcs.clearance_z_mm),
                arc_center_xy: None,
                feed_mm_min: 0.0,
            });
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

/// Medial-Axis / Concentric Offset 2D Clearing with Rounded Corner Arcs (G2/G3).
/// Maintains smooth engagement and emits circular corner arcs instead of sharp 90° stops.
pub fn generate_adaptive_offset_2d(
    op_id: Uuid,
    boundary: &Polyline2,
    target_depth_mm: f64,
    stock_to_leave_mm: f64,
    tool: &Tool,
    material: MaterialPreset,
    wcs: &WorkCoordinateSystem,
) -> Toolpath {
    let cd = tool.recommended_for(material);
    let d = tool.geometry.cutting_diameter_mm();
    let r = d * 0.5 + stock_to_leave_mm;
    let optimal_load = (d * cd.adaptive_optimal_load_fraction).max(0.2);
    let stepdown = cd.stepdown_mm.max(0.15).min(tool.geometry.flute_length_mm());
    let total_depth = target_depth_mm.abs();
    let passes = (total_depth / stepdown).ceil().max(1.0) as usize;

    let mut segments = Vec::new();
    let Some(bbox) = bounding_box(&boundary.points) else {
        return Toolpath {
            operation_id: op_id,
            tool_number: tool.number,
            spindle_rpm: cd.spindle_rpm,
            segments,
            estimated_time_sec: 0.0,
            total_cut_distance_mm: 0.0,
            warnings: Vec::new(),
        };
    };

    let cx = (bbox.min_x + bbox.max_x) * 0.5;
    let cy = (bbox.min_y + bbox.max_y) * 0.5;
    let max_hx = (bbox.width() * 0.5 - r).max(0.0);
    let max_hy = (bbox.height() * 0.5 - r).max(0.0);

    for pass in 1..=passes {
        let z = -(total_depth * (pass as f64) / (passes as f64));
        let mut inset = 0.0_f64;
        let max_inset = max_hx.min(max_hy);
        let mut first_in_pass = true;
        while inset < max_inset - 0.1 {
            let hx = (max_hx - inset).max(0.2);
            let hy = (max_hy - inset).max(0.2);
            let cr = (d * 0.35).min(hx * 0.4).min(hy * 0.4).max(0.1);
            let x0 = cx - hx;
            let x1 = cx + hx;
            let y0 = cy - hy;
            let y1 = cy + hy;

            let p_start = Point3::new(x0 + cr, y0, z);
            if first_in_pass {
                segments.push(MotionSegment {
                    kind: MotionKind::Rapid,
                    start: Point3::new(p_start.x, p_start.y, wcs.clearance_z_mm),
                    end: Point3::new(p_start.x, p_start.y, wcs.retract_z_mm),
                    arc_center_xy: None,
                    feed_mm_min: 0.0,
                });
                segments.push(MotionSegment {
                    kind: MotionKind::Linear,
                    start: Point3::new(p_start.x, p_start.y, wcs.retract_z_mm),
                    end: p_start,
                    arc_center_xy: None,
                    feed_mm_min: cd.ramp_rate_mm_min,
                });
                first_in_pass = false;
            } else if let Some(last) = segments.last() {
                segments.push(MotionSegment {
                    kind: MotionKind::Linear,
                    start: last.end,
                    end: p_start,
                    arc_center_xy: None,
                    feed_mm_min: cd.feed_rate_mm_min,
                });
            }

            // Bottom edge + BR corner arc
            let p1 = Point3::new(x1 - cr, y0, z);
            let p2 = Point3::new(x1, y0 + cr, z);
            segments.push(MotionSegment { kind: MotionKind::Linear, start: p_start, end: p1, arc_center_xy: None, feed_mm_min: cd.feed_rate_mm_min });
            segments.push(MotionSegment { kind: MotionKind::ArcCCW, start: p1, end: p2, arc_center_xy: Some((x1 - cr, y0 + cr)), feed_mm_min: cd.feed_rate_mm_min });

            // Right edge + TR corner arc
            let p3 = Point3::new(x1, y1 - cr, z);
            let p4 = Point3::new(x1 - cr, y1, z);
            segments.push(MotionSegment { kind: MotionKind::Linear, start: p2, end: p3, arc_center_xy: None, feed_mm_min: cd.feed_rate_mm_min });
            segments.push(MotionSegment { kind: MotionKind::ArcCCW, start: p3, end: p4, arc_center_xy: Some((x1 - cr, y1 - cr)), feed_mm_min: cd.feed_rate_mm_min });

            // Top edge + TL corner arc
            let p5 = Point3::new(x0 + cr, y1, z);
            let p6 = Point3::new(x0, y1 - cr, z);
            segments.push(MotionSegment { kind: MotionKind::Linear, start: p4, end: p5, arc_center_xy: None, feed_mm_min: cd.feed_rate_mm_min });
            segments.push(MotionSegment { kind: MotionKind::ArcCCW, start: p5, end: p6, arc_center_xy: Some((x0 + cr, y1 - cr)), feed_mm_min: cd.feed_rate_mm_min });

            // Left edge + BL corner arc
            let p7 = Point3::new(x0, y0 + cr, z);
            segments.push(MotionSegment { kind: MotionKind::Linear, start: p6, end: p7, arc_center_xy: None, feed_mm_min: cd.feed_rate_mm_min });
            segments.push(MotionSegment { kind: MotionKind::ArcCCW, start: p7, end: p_start, arc_center_xy: Some((x0 + cr, y0 + cr)), feed_mm_min: cd.feed_rate_mm_min });

            inset += optimal_load;
        }
        if let Some(last) = segments.last() {
            segments.push(MotionSegment {
                kind: MotionKind::Rapid,
                start: last.end,
                end: Point3::new(last.end.x, last.end.y, wcs.clearance_z_mm),
                arc_center_xy: None,
                feed_mm_min: 0.0,
            });
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
