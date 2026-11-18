use crate::ops_2d::generate_pocket_2d;
use crate::tools::{MaterialPreset, Tool, ToolGeometry};
use crate::{MotionKind, MotionSegment, Toolpath};
use hybridcam_geom::vector::{bounding_box, offset_polygon_simple, point_in_polygon};
use hybridcam_geom::{Point2, Point3, Polyline2, WorkCoordinateSystem};
use hybridcam_relief::ReliefGrid;
use uuid::Uuid;

/// Minimum distance from point `p` to any segment of a closed polygon.
fn distance_to_polygon_boundary(p: Point2, poly: &[Point2]) -> f64 {
    let n = poly.len();
    let mut min_d2 = f64::INFINITY;
    for i in 0..n {
        let a = poly[i];
        let b = poly[(i + 1) % n];
        let abx = b.x - a.x;
        let aby = b.y - a.y;
        let len2 = abx * abx + aby * aby;
        let t = if len2 < 1e-12 {
            0.0
        } else {
            (((p.x - a.x) * abx + (p.y - a.y) * aby) / len2).clamp(0.0, 1.0)
        };
        let cx = a.x + t * abx;
        let cy = a.y + t * aby;
        let d2 = (p.x - cx).powi(2) + (p.y - cy).powi(2);
        if d2 < min_d2 {
            min_d2 = d2;
        }
    }
    min_d2.sqrt()
}

/// Generate a Vectric Aspire / ArtCAM-style True V-Carving toolpath.
///
/// Computes the inscribed radius (medial distance) inside closed vectors and maps it to V-bit Z depth:
/// `z = -r / tan(angle / 2)`, producing natural Z-lifts into sharp corners.
/// Optionally clamps at `flat_depth_mm`, splits flat-bottom clearance to `flat_tool`, and projects
/// onto a 3D `ReliefGrid`.
pub fn generate_vcarve(
    op_id: Uuid,
    shapes: &[Polyline2],
    flat_depth_mm: Option<f64>,
    relief: Option<&ReliefGrid>,
    vbit: &Tool,
    flat_clearance_tool: Option<&Tool>,
    material: MaterialPreset,
    wcs: &WorkCoordinateSystem,
) -> (Toolpath, Option<Toolpath>) {
    let cd = vbit.recommended_for(material);
    let half_angle_rad = match vbit.geometry {
        ToolGeometry::VBit { included_angle_deg, .. }
        | ToolGeometry::Engraving { included_angle_deg, .. } => {
            (included_angle_deg * 0.5).to_radians()
        }
        _ => 30.0_f64.to_radians(),
    };
    let tan_half = half_angle_rad.tan().max(0.05);
    let max_z_depth = flat_depth_mm.unwrap_or(f64::INFINITY).abs();

    let mut segments = Vec::new();
    let mut flat_clearance_tp: Option<Toolpath> = None;

    for poly in shapes {
        if !poly.closed || poly.points.len() < 3 {
            continue;
        }
        let Some(bbox) = bounding_box(&poly.points) else {
            continue;
        };

        // Optional flat-bottom area clearance
        if let (Some(fd), Some(ft)) = (flat_depth_mm, flat_clearance_tool) {
            let bevel_inset = fd.abs() * tan_half;
            let inner = offset_polygon_simple(poly, -bevel_inset);
            if inner.points.len() >= 3 {
                flat_clearance_tp = Some(generate_pocket_2d(
                    Uuid::new_v4(),
                    &inner,
                    fd.abs(),
                    ft,
                    material,
                    wcs,
                ));
            }
        }

        // Sample medial-axis & bevel ridges across a high-resolution grid
        let step = 0.25_f64;
        let mut y = bbox.min_y + step * 0.5;
        let mut prev_pt: Option<Point3> = None;

        while y <= bbox.max_y - step * 0.5 {
            let mut x = bbox.min_x + step * 0.5;
            while x <= bbox.max_x - step * 0.5 {
                let p = Point2::new(x, y);
                if point_in_polygon(p, &poly.points) {
                    let r = distance_to_polygon_boundary(p, &poly.points);
                    // Medial-ridge check: keep points near local distance maxima or corner bisectors
                    let r_l = distance_to_polygon_boundary(Point2::new(x - step, y), &poly.points);
                    let r_r = distance_to_polygon_boundary(Point2::new(x + step, y), &poly.points);
                    let r_u = distance_to_polygon_boundary(Point2::new(x, y + step), &poly.points);
                    let r_d = distance_to_polygon_boundary(Point2::new(x, y - step), &poly.points);

                    let is_ridge = (r >= r_l && r >= r_r) || (r >= r_u && r >= r_d);
                    if is_ridge {
                        let depth = (r / tan_half).min(max_z_depth);
                        let relief_z = relief.map(|g| g.sample_mm(x, y) as f64).unwrap_or(0.0);
                        let target = Point3::new(x, y, relief_z - depth);

                        if let Some(prev) = prev_pt {
                            if prev.dist(target) < step * 4.0 {
                                segments.push(MotionSegment {
                                    kind: MotionKind::Linear,
                                    start: prev,
                                    end: target,
                                    arc_center_xy: None,
                                    feed_mm_min: cd.feed_rate_mm_min,
                                });
                            } else {
                                segments.push(MotionSegment {
                                    kind: MotionKind::Rapid,
                                    start: prev,
                                    end: Point3::new(prev.x, prev.y, wcs.clearance_z_mm),
                                    arc_center_xy: None,
                                    feed_mm_min: 0.0,
                                });
                                segments.push(MotionSegment {
                                    kind: MotionKind::Rapid,
                                    start: Point3::new(prev.x, prev.y, wcs.clearance_z_mm),
                                    end: Point3::new(target.x, target.y, wcs.retract_z_mm),
                                    arc_center_xy: None,
                                    feed_mm_min: 0.0,
                                });
                                segments.push(MotionSegment {
                                    kind: MotionKind::Linear,
                                    start: Point3::new(target.x, target.y, wcs.retract_z_mm),
                                    end: target,
                                    arc_center_xy: None,
                                    feed_mm_min: cd.plunge_rate_mm_min,
                                });
                            }
                        } else {
                            segments.push(MotionSegment {
                                kind: MotionKind::Rapid,
                                start: Point3::new(target.x, target.y, wcs.clearance_z_mm),
                                end: Point3::new(target.x, target.y, wcs.retract_z_mm),
                                arc_center_xy: None,
                                feed_mm_min: 0.0,
                            });
                            segments.push(MotionSegment {
                                kind: MotionKind::Linear,
                                start: Point3::new(target.x, target.y, wcs.retract_z_mm),
                                end: target,
                                arc_center_xy: None,
                                feed_mm_min: cd.plunge_rate_mm_min,
                            });
                        }
                        prev_pt = Some(target);
                    }
                }
                x += step;
            }
            y += step;
        }

        if let Some(last) = prev_pt {
            segments.push(MotionSegment {
                kind: MotionKind::Rapid,
                start: last,
                end: Point3::new(last.x, last.y, wcs.clearance_z_mm),
                arc_center_xy: None,
                feed_mm_min: 0.0,
            });
        }
    }

    let mut v_tp = Toolpath {
        operation_id: op_id,
        tool_number: vbit.number,
        spindle_rpm: cd.spindle_rpm,
        segments,
        estimated_time_sec: 0.0,
        total_cut_distance_mm: 0.0,
        warnings: Vec::new(),
    };
    v_tp.compute_metrics();
    (v_tp, flat_clearance_tp)
}

/// Generate a mirrored Male V-Carve Inlay Plug vector from a female pocket polygon
/// with configurable glue-gap allowance.
pub fn generate_inlay_plug_vectors(
    female_poly: &Polyline2,
    mirror_x_axis: f64,
    glue_gap_mm: f64,
) -> Polyline2 {
    let mut mirrored = Polyline2 {
        points: female_poly
            .points
            .iter()
            .map(|p| Point2::new(2.0 * mirror_x_axis - p.x, p.y))
            .collect(),
        closed: female_poly.closed,
    };
    mirrored.points.reverse();
    offset_polygon_simple(&mirrored, -glue_gap_mm.abs())
}
