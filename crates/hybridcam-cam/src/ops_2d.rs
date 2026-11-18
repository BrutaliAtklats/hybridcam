use crate::tools::{MaterialPreset, Tool};
use crate::{MotionKind, MotionSegment, SafetyWarning, Toolpath};
use hybridcam_geom::vector::{offset_polygon_simple, signed_area};
use hybridcam_geom::{Point2, Point3, Polyline2, WorkCoordinateSystem};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContourSide {
    Inside,
    Outside,
    OnLine,
}

#[derive(Debug, Clone, Copy)]
pub struct TabConfig {
    pub count: usize,
    pub length_mm: f64,
    pub height_mm: f64,
}

/// Generate a 2D Contour toolpath with multi-pass stepdowns, holding tabs, and safe-Z retracts.
pub fn generate_contour_2d(
    op_id: Uuid,
    contours: &[Polyline2],
    side: ContourSide,
    target_depth_mm: f64,
    tabs: Option<TabConfig>,
    tool: &Tool,
    material: MaterialPreset,
    wcs: &WorkCoordinateSystem,
) -> Toolpath {
    let cd = tool.recommended_for(material);
    let r = tool.geometry.cutting_diameter_mm() * 0.5;
    let mut segments = Vec::new();
    let mut warnings = Vec::new();

    if target_depth_mm.abs() > tool.geometry.flute_length_mm() {
        warnings.push(SafetyWarning {
            code: "FLUTE_DEPTH".into(),
            message: format!(
                "Cut depth ({:.2} mm) exceeds flute length ({:.2} mm)",
                target_depth_mm.abs(),
                tool.geometry.flute_length_mm()
            ),
        });
    }

    let stepdown = cd.stepdown_mm.max(0.2);
    let total_depth = target_depth_mm.abs();
    let passes = (total_depth / stepdown).ceil().max(1.0) as usize;

    for poly in contours {
        if poly.points.len() < 2 {
            continue;
        }
        let offset_dist = match side {
            ContourSide::OnLine => 0.0,
            ContourSide::Outside => r,
            ContourSide::Inside => -r,
        };
        let path_poly = if poly.closed && offset_dist.abs() > 1e-6 {
            offset_polygon_simple(poly, offset_dist)
        } else {
            poly.clone()
        };
        if path_poly.points.is_empty() {
            continue;
        }

        let start_xy = path_poly.points[0];
        // Safe rapid to start XY
        segments.push(MotionSegment {
            kind: MotionKind::Rapid,
            start: Point3::new(start_xy.x, start_xy.y, wcs.clearance_z_mm),
            end: Point3::new(start_xy.x, start_xy.y, wcs.retract_z_mm),
            arc_center_xy: None,
            feed_mm_min: 0.0,
        });

        for pass in 1..=passes {
            let z = -(total_depth * (pass as f64) / (passes as f64));
            let prev_z = if pass == 1 {
                wcs.retract_z_mm
            } else {
                -(total_depth * ((pass - 1) as f64) / (passes as f64))
            };

            // Plunge
            segments.push(MotionSegment {
                kind: MotionKind::Linear,
                start: Point3::new(start_xy.x, start_xy.y, prev_z),
                end: Point3::new(start_xy.x, start_xy.y, z),
                arc_center_xy: None,
                feed_mm_min: cd.plunge_rate_mm_min,
            });

            let n = path_poly.points.len();
            let seg_count = if path_poly.closed { n } else { n - 1 };
            for i in 0..seg_count {
                let a = path_poly.points[i];
                let b = path_poly.points[(i + 1) % n];

                // Apply holding tab lift on final pass if tabs configured
                let tab_z = if pass == passes {
                    tabs.and_then(|t| {
                        if t.count > 0 && i % (seg_count / t.count).max(1) == 0 {
                            Some((-total_depth + t.height_mm).min(0.0))
                        } else {
                            None
                        }
                    })
                } else {
                    None
                };

                if let Some(tz) = tab_z {
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: Point3::new(a.x, a.y, z),
                        end: Point3::new(a.x, a.y, tz),
                        arc_center_xy: None,
                        feed_mm_min: cd.plunge_rate_mm_min,
                    });
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: Point3::new(a.x, a.y, tz),
                        end: Point3::new(b.x, b.y, tz),
                        arc_center_xy: None,
                        feed_mm_min: cd.feed_rate_mm_min,
                    });
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: Point3::new(b.x, b.y, tz),
                        end: Point3::new(b.x, b.y, z),
                        arc_center_xy: None,
                        feed_mm_min: cd.plunge_rate_mm_min,
                    });
                } else {
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: Point3::new(a.x, a.y, z),
                        end: Point3::new(b.x, b.y, z),
                        arc_center_xy: None,
                        feed_mm_min: cd.feed_rate_mm_min,
                    });
                }
            }
        }

        // Retract to clearance Z
        let last_xy = if path_poly.closed {
            path_poly.points[0]
        } else {
            *path_poly.points.last().unwrap()
        };
        segments.push(MotionSegment {
            kind: MotionKind::Rapid,
            start: Point3::new(last_xy.x, last_xy.y, -total_depth),
            end: Point3::new(last_xy.x, last_xy.y, wcs.clearance_z_mm),
            arc_center_xy: None,
            feed_mm_min: 0.0,
        });
    }

    let mut tp = Toolpath {
        operation_id: op_id,
        tool_number: tool.number,
        spindle_rpm: cd.spindle_rpm,
        segments,
        estimated_time_sec: 0.0,
        total_cut_distance_mm: 0.0,
        warnings,
    };
    tp.compute_metrics();
    tp
}

/// Generate a 2D Pocket toolpath using concentric inward offsets.
pub fn generate_pocket_2d(
    op_id: Uuid,
    boundary: &Polyline2,
    target_depth_mm: f64,
    tool: &Tool,
    material: MaterialPreset,
    wcs: &WorkCoordinateSystem,
) -> Toolpath {
    let cd = tool.recommended_for(material);
    let d = tool.geometry.cutting_diameter_mm();
    let stepover = (d * cd.stepover_fraction).max(0.2);
    let mut rings = Vec::new();
    let mut current = offset_polygon_simple(boundary, -d * 0.5);

    for _ in 0..100 {
        if current.points.len() < 3 || signed_area(&current.points).abs() < 0.1 {
            break;
        }
        rings.push(current.clone());
        current = offset_polygon_simple(&current, -stepover);
    }

    // Machine inside-out for climb-friendly clearing
    rings.reverse();
    generate_contour_2d(
        op_id,
        &rings,
        ContourSide::OnLine,
        target_depth_mm,
        None,
        tool,
        material,
        wcs,
    )
}

/// Generate a Peck Drilling toolpath for a list of hole centers.
pub fn generate_drill(
    op_id: Uuid,
    centers: &[Point2],
    target_depth_mm: f64,
    peck_depth_mm: f64,
    tool: &Tool,
    material: MaterialPreset,
    wcs: &WorkCoordinateSystem,
) -> Toolpath {
    let cd = tool.recommended_for(material);
    let mut segments = Vec::new();
    let total = target_depth_mm.abs();
    let peck = peck_depth_mm.max(0.5);

    for &c in centers {
        segments.push(MotionSegment {
            kind: MotionKind::Rapid,
            start: Point3::new(c.x, c.y, wcs.clearance_z_mm),
            end: Point3::new(c.x, c.y, wcs.retract_z_mm),
            arc_center_xy: None,
            feed_mm_min: 0.0,
        });

        let mut z_curr = 0.0;
        while z_curr < total {
            let next_z = (z_curr + peck).min(total);
            segments.push(MotionSegment {
                kind: MotionKind::Linear,
                start: Point3::new(c.x, c.y, wcs.retract_z_mm),
                end: Point3::new(c.x, c.y, -next_z),
                arc_center_xy: None,
                feed_mm_min: cd.plunge_rate_mm_min,
            });
            segments.push(MotionSegment {
                kind: MotionKind::Rapid,
                start: Point3::new(c.x, c.y, -next_z),
                end: Point3::new(c.x, c.y, wcs.retract_z_mm),
                arc_center_xy: None,
                feed_mm_min: 0.0,
            });
            z_curr = next_z;
        }

        segments.push(MotionSegment {
            kind: MotionKind::Rapid,
            start: Point3::new(c.x, c.y, wcs.retract_z_mm),
            end: Point3::new(c.x, c.y, wcs.clearance_z_mm),
            arc_center_xy: None,
            feed_mm_min: 0.0,
        });
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
