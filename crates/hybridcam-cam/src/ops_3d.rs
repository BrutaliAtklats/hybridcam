use crate::tools::{MaterialPreset, Tool, ToolGeometry};
use crate::{MotionKind, MotionSegment, Toolpath};
use hybridcam_geom::{Point3, WorkCoordinateSystem};
use hybridcam_relief::ReliefGrid;
use uuid::Uuid;

/// Evaluate analytic drop-cutter Z height at `(x, y)` over a `ReliefGrid` so the tool
/// never gouges the relief surface.
pub fn drop_cutter_z(grid: &ReliefGrid, x_mm: f64, y_mm: f64, tool: &Tool) -> f64 {
    let r = tool.geometry.cutting_diameter_mm() * 0.5;
    let sample_step = (r * 0.35).max(0.2);
    let mut max_tip_z = f64::NEG_INFINITY;

    let mut dy = -r;
    while dy <= r {
        let mut dx = -r;
        while dx <= r {
            let d = (dx * dx + dy * dy).sqrt();
            if d <= r {
                let surface_z = grid.sample_mm(x_mm + dx, y_mm + dy) as f64;
                let tip_z = match tool.geometry {
                    ToolGeometry::FlatEndmill { .. } | ToolGeometry::Surfacing { .. } => surface_z,
                    ToolGeometry::Ballnose { .. } => {
                        let offset = r - (r * r - d * d).max(0.0).sqrt();
                        surface_z - offset
                    }
                    ToolGeometry::Bullnose { corner_radius_mm, .. } => {
                        let flat_r = (r - corner_radius_mm).max(0.0);
                        if d <= flat_r {
                            surface_z
                        } else {
                            let dr = d - flat_r;
                            let offset =
                                corner_radius_mm - (corner_radius_mm.powi(2) - dr * dr).max(0.0).sqrt();
                            surface_z - offset
                        }
                    }
                    ToolGeometry::TaperedBallnose { tip_radius_mm, .. } => {
                        if d <= tip_radius_mm {
                            let offset =
                                tip_radius_mm - (tip_radius_mm.powi(2) - d * d).max(0.0).sqrt();
                            surface_z - offset
                        } else {
                            surface_z - tip_radius_mm
                        }
                    }
                    _ => surface_z,
                };
                if tip_z > max_tip_z {
                    max_tip_z = tip_z;
                }
            }
            dx += sample_step;
        }
        dy += sample_step;
    }

    if max_tip_z.is_finite() {
        max_tip_z
    } else {
        grid.sample_mm(x_mm, y_mm) as f64
    }
}

/// Generate a 3D Parallel Raster Finishing toolpath over a `ReliefGrid` with optional
/// stock-to-leave and in-process rest-machining filter.
pub fn generate_relief_finish_3d(
    op_id: Uuid,
    grid: &ReliefGrid,
    stock_to_leave_mm: f64,
    in_process_stock: Option<&ReliefGrid>,
    tool: &Tool,
    material: MaterialPreset,
    wcs: &WorkCoordinateSystem,
) -> Toolpath {
    let cd = tool.recommended_for(material);
    let d = tool.geometry.cutting_diameter_mm();
    // Guard against ultra-fine tips (e.g. 0.5mm * 8% = 0.04mm) generating millions of segments on large boards
    let min_stepover = (grid.bounds_mm.height() / 420.0).max(0.18);
    let stepover = (d * cd.stepover_fraction).max(min_stepover);
    let along_step = (stepover * 1.35).max(grid.bounds_mm.width() / 420.0).clamp(0.22, 1.2);
    let stepdown = cd.stepdown_mm.max(0.15);
    let top_z = wcs.offset_mm.z;
    let min_relief_z = grid
        .heights
        .iter()
        .copied()
        .fold(f32::INFINITY, f32::min) as f64
        + stock_to_leave_mm;

    let mut z_floors = Vec::new();
    let mut zf = (top_z - stepdown).max(min_relief_z);
    while zf > min_relief_z + 0.01 {
        z_floors.push(zf);
        zf = (zf - stepdown).max(min_relief_z);
    }
    z_floors.push(min_relief_z);

    let mut segments = Vec::new();
    let mut prev_floor_z = top_z + 10.0;

    for (pass_idx, &floor_z) in z_floors.iter().enumerate() {
        let is_final_pass = pass_idx + 1 == z_floors.len();
        let mut y = grid.bounds_mm.min_y;
        let mut forward = true;
        let mut prev_pt: Option<Point3> = None;

        while y <= grid.bounds_mm.max_y {
            let mut xs = Vec::new();
            let mut x = grid.bounds_mm.min_x;
            while x <= grid.bounds_mm.max_x {
                xs.push(x);
                x += along_step;
            }
            if !forward {
                xs.reverse();
            }
            forward = !forward;

            for x in xs {
                let target_z = drop_cutter_z(grid, x, y, tool) + stock_to_leave_mm;
                // On intermediate stepdown passes, skip areas already finished in shallower passes,
                // retracting to clearance before continuing so we never cut straight through a raised feature.
                if !is_final_pass && pass_idx > 0 && target_z >= prev_floor_z - 0.02 {
                    if let Some(prev) = prev_pt.take() {
                        segments.push(MotionSegment {
                            kind: MotionKind::Rapid,
                            start: prev,
                            end: Point3::new(prev.x, prev.y, wcs.clearance_z_mm),
                            arc_center_xy: None,
                            feed_mm_min: 0.0,
                        });
                    }
                    continue;
                }
                let z = target_z.max(floor_z);
                // Rest machining: skip if remaining stock is already within tolerance
                if let Some(stock) = in_process_stock {
                    if (stock.sample_mm(x, y) as f64) <= z + 0.02 {
                        if let Some(prev) = prev_pt.take() {
                            segments.push(MotionSegment {
                                kind: MotionKind::Rapid,
                                start: prev,
                                end: Point3::new(prev.x, prev.y, wcs.clearance_z_mm),
                                arc_center_xy: None,
                                feed_mm_min: 0.0,
                            });
                        }
                        continue;
                    }
                }
                let pt = Point3::new(x, y, z);
                let link_limit = stepover.max(along_step) * 3.0;
                if let Some(prev) = prev_pt {
                    if prev.dist(pt) <= link_limit {
                        segments.push(MotionSegment {
                            kind: MotionKind::Linear,
                            start: prev,
                            end: pt,
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
                            end: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                            arc_center_xy: None,
                            feed_mm_min: 0.0,
                        });
                        segments.push(MotionSegment {
                            kind: MotionKind::Linear,
                            start: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                            end: pt,
                            arc_center_xy: None,
                            feed_mm_min: cd.plunge_rate_mm_min,
                        });
                    }
                } else {
                    segments.push(MotionSegment {
                        kind: MotionKind::Rapid,
                        start: Point3::new(pt.x, pt.y, wcs.clearance_z_mm),
                        end: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                        arc_center_xy: None,
                        feed_mm_min: 0.0,
                    });
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                        end: pt,
                        arc_center_xy: None,
                        feed_mm_min: cd.plunge_rate_mm_min,
                    });
                }
                prev_pt = Some(pt);
            }
            y += stepover;
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
        prev_floor_z = floor_z;
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

/// Steep-and-Shallow 3D Finishing:
/// - Shallow regions (< 48 deg slope) use 3D raster passes
/// - Steep walls (>= 48 deg slope) use constant-Z waterline contour passes
pub fn generate_relief_steep_shallow_3d(
    op_id: Uuid,
    grid: &ReliefGrid,
    stock_to_leave_mm: f64,
    tool: &Tool,
    material: MaterialPreset,
    wcs: &WorkCoordinateSystem,
) -> Toolpath {
    let cd = tool.recommended_for(material);
    let d = tool.geometry.cutting_diameter_mm();
    let min_stepover = (grid.bounds_mm.height() / 200.0).max(0.3);
    let stepover = (d * cd.stepover_fraction).max(min_stepover);
    let along_step = (stepover * 1.5).max(grid.bounds_mm.width() / 220.0).clamp(0.45, 2.0);
    let slope_tan_threshold = (48.0_f64.to_radians()).tan();
    let eps = 0.5_f64;

    let mut segments = Vec::new();
    let mut prev_pt: Option<Point3> = None;

    // 1) Shallow pass (raster only where local slope < 48 deg)
    let mut y = grid.bounds_mm.min_y;
    let mut forward = true;
    while y <= grid.bounds_mm.max_y {
        let mut xs = Vec::new();
        let mut x = grid.bounds_mm.min_x;
        while x <= grid.bounds_mm.max_x {
            xs.push(x);
            x += along_step;
        }
        if !forward {
            xs.reverse();
        }
        forward = !forward;

        for x in xs {
            let zc = grid.sample_mm(x, y) as f64;
            let gx = ((grid.sample_mm(x + eps, y) as f64) - (grid.sample_mm(x - eps, y) as f64)) / (2.0 * eps);
            let gy = ((grid.sample_mm(x, y + eps) as f64) - (grid.sample_mm(x, y - eps) as f64)) / (2.0 * eps);
            let slope = (gx * gx + gy * gy).sqrt();
            if slope > slope_tan_threshold && zc < wcs.offset_mm.z - 0.5 {
                continue;
            }
            let z = drop_cutter_z(grid, x, y, tool) + stock_to_leave_mm;
            let pt = Point3::new(x, y, z);
            if let Some(prev) = prev_pt {
                if prev.dist(pt) <= along_step * 2.5 {
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: prev,
                        end: pt,
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
                        end: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                        arc_center_xy: None,
                        feed_mm_min: 0.0,
                    });
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                        end: pt,
                        arc_center_xy: None,
                        feed_mm_min: cd.plunge_rate_mm_min,
                    });
                }
            } else {
                segments.push(MotionSegment {
                    kind: MotionKind::Rapid,
                    start: Point3::new(pt.x, pt.y, wcs.clearance_z_mm),
                    end: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                    arc_center_xy: None,
                    feed_mm_min: 0.0,
                });
                segments.push(MotionSegment {
                    kind: MotionKind::Linear,
                    start: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                    end: pt,
                    arc_center_xy: None,
                    feed_mm_min: cd.plunge_rate_mm_min,
                });
            }
            prev_pt = Some(pt);
        }
        y += stepover;
    }

    // 2) Steep waterline contour passes at constant Z levels
    let mut min_z = f64::INFINITY;
    let mut max_z = f64::NEG_INFINITY;
    for &h in &grid.heights {
        let hf = h as f64;
        if hf < min_z { min_z = hf; }
        if hf > max_z { max_z = hf; }
    }
    let z_step = cd.stepdown_mm.max(0.2);
    let mut z_lvl = max_z - z_step;
    while z_lvl > min_z + 0.15 {
        let mut ring_pts = Vec::new();
        let steps = 96_usize;
        let cx = (grid.bounds_mm.min_x + grid.bounds_mm.max_x) * 0.5;
        let cy = (grid.bounds_mm.min_y + grid.bounds_mm.max_y) * 0.5;
        let rx = grid.bounds_mm.width() * 0.48;
        let ry = grid.bounds_mm.height() * 0.48;
        for s in 0..=steps {
            let ang = 2.0 * std::f64::consts::PI * (s as f64) / (steps as f64);
            // Ray march inward to find where relief crosses z_lvl
            let mut best_pt: Option<Point3> = None;
            for k in (1..=20).rev() {
                let frac = k as f64 / 20.0;
                let px = cx + rx * frac * ang.cos();
                let py = cy + ry * frac * ang.sin();
                let pz = drop_cutter_z(grid, px, py, tool) + stock_to_leave_mm;
                if (pz - z_lvl).abs() < z_step * 0.9 {
                    best_pt = Some(Point3::new(px, py, z_lvl.max(pz)));
                    break;
                }
            }
            if let Some(p) = best_pt {
                ring_pts.push(p);
            }
        }
        if ring_pts.len() >= 3 {
            let start = ring_pts[0];
            if let Some(prev) = prev_pt {
                segments.push(MotionSegment {
                    kind: MotionKind::Rapid,
                    start: prev,
                    end: Point3::new(prev.x, prev.y, wcs.clearance_z_mm),
                    arc_center_xy: None,
                    feed_mm_min: 0.0,
                });
            }
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
                end: start,
                arc_center_xy: None,
                feed_mm_min: cd.plunge_rate_mm_min,
            });
            for win in ring_pts.windows(2) {
                segments.push(MotionSegment {
                    kind: MotionKind::Linear,
                    start: win[0],
                    end: win[1],
                    arc_center_xy: None,
                    feed_mm_min: cd.feed_rate_mm_min,
                });
            }
            prev_pt = ring_pts.last().copied();
        }
        z_lvl -= z_step;
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

/// Offset / Archimedes Spiral 3D Relief Finishing:
/// Continuous spiral from center outward with zero unnecessary retracts.
pub fn generate_relief_spiral_3d(
    op_id: Uuid,
    grid: &ReliefGrid,
    stock_to_leave_mm: f64,
    tool: &Tool,
    material: MaterialPreset,
    wcs: &WorkCoordinateSystem,
) -> Toolpath {
    let cd = tool.recommended_for(material);
    let d = tool.geometry.cutting_diameter_mm();
    let min_stepover = (grid.bounds_mm.height().min(grid.bounds_mm.width()) / 180.0).max(0.3);
    let stepover = (d * cd.stepover_fraction).max(min_stepover);

    let cx = (grid.bounds_mm.min_x + grid.bounds_mm.max_x) * 0.5;
    let cy = (grid.bounds_mm.min_y + grid.bounds_mm.max_y) * 0.5;
    let max_r = (grid.bounds_mm.width().hypot(grid.bounds_mm.height())) * 0.5;
    let stepdown = cd.stepdown_mm.max(0.15);
    let top_z = wcs.offset_mm.z;
    let min_relief_z = grid.heights.iter().copied().fold(f32::INFINITY, f32::min) as f64 + stock_to_leave_mm;

    let mut z_floors = Vec::new();
    let mut zf = (top_z - stepdown).max(min_relief_z);
    while zf > min_relief_z + 0.01 {
        z_floors.push(zf);
        zf = (zf - stepdown).max(min_relief_z);
    }
    z_floors.push(min_relief_z);

    let mut segments = Vec::new();
    let b = stepover / (2.0 * std::f64::consts::PI);

    for &floor_z in &z_floors {
        let mut theta = 0.0_f64;
        let mut prev_pt: Option<Point3> = None;

        while b * theta <= max_r {
            let r = b * theta;
            let x = cx + r * theta.cos();
            let y = cy + r * theta.sin();
            if x >= grid.bounds_mm.min_x && x <= grid.bounds_mm.max_x && y >= grid.bounds_mm.min_y && y <= grid.bounds_mm.max_y {
                let z = (drop_cutter_z(grid, x, y, tool) + stock_to_leave_mm).max(floor_z);
                let pt = Point3::new(x, y, z);
                if let Some(prev) = prev_pt {
                    if prev.dist(pt) <= (stepover * 6.0).max(8.0) {
                        segments.push(MotionSegment {
                            kind: MotionKind::Linear,
                            start: prev,
                            end: pt,
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
                            end: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                            arc_center_xy: None,
                            feed_mm_min: 0.0,
                        });
                        segments.push(MotionSegment {
                            kind: MotionKind::Linear,
                            start: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                            end: pt,
                            arc_center_xy: None,
                            feed_mm_min: cd.plunge_rate_mm_min,
                        });
                    }
                } else {
                    segments.push(MotionSegment {
                        kind: MotionKind::Rapid,
                        start: Point3::new(pt.x, pt.y, wcs.clearance_z_mm),
                        end: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                        arc_center_xy: None,
                        feed_mm_min: 0.0,
                    });
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                        end: pt,
                        arc_center_xy: None,
                        feed_mm_min: cd.plunge_rate_mm_min,
                    });
                }
                prev_pt = Some(pt);
            }
            let d_theta = (1.2 / r.max(stepover)).clamp(0.05, 0.35);
            theta += d_theta;
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

/// Pencil / Valley Cleanup Pass:
/// Detects concave valleys & inside corners via discrete Laplacian curvature and traces only those creases.
pub fn generate_relief_pencil_3d(
    op_id: Uuid,
    grid: &ReliefGrid,
    stock_to_leave_mm: f64,
    tool: &Tool,
    material: MaterialPreset,
    wcs: &WorkCoordinateSystem,
) -> Toolpath {
    let cd = tool.recommended_for(material);
    let step = (grid.bounds_mm.width() / 120.0).clamp(0.5, 1.5);
    let mut segments = Vec::new();
    let mut prev_pt: Option<Point3> = None;

    let mut y = grid.bounds_mm.min_y + step;
    while y <= grid.bounds_mm.max_y - step {
        let mut x = grid.bounds_mm.min_x + step;
        while x <= grid.bounds_mm.max_x - step {
            let zc = grid.sample_mm(x, y) as f64;
            let avg_neighbors = 0.25
                * (grid.sample_mm(x - step, y) as f64
                    + grid.sample_mm(x + step, y) as f64
                    + grid.sample_mm(x, y - step) as f64
                    + grid.sample_mm(x, y + step) as f64);
            // Positive (avg_neighbors - zc) indicates a concave valley / inside crease
            let concavity = avg_neighbors - zc;
            if concavity > 0.12 {
                let z = drop_cutter_z(grid, x, y, tool) + stock_to_leave_mm;
                let pt = Point3::new(x, y, z);
                if let Some(prev) = prev_pt {
                    if prev.dist(pt) <= step * 2.2 {
                        segments.push(MotionSegment {
                            kind: MotionKind::Linear,
                            start: prev,
                            end: pt,
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
                            end: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                            arc_center_xy: None,
                            feed_mm_min: 0.0,
                        });
                        segments.push(MotionSegment {
                            kind: MotionKind::Linear,
                            start: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                            end: pt,
                            arc_center_xy: None,
                            feed_mm_min: cd.plunge_rate_mm_min,
                        });
                    }
                } else {
                    segments.push(MotionSegment {
                        kind: MotionKind::Rapid,
                        start: Point3::new(pt.x, pt.y, wcs.clearance_z_mm),
                        end: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                        arc_center_xy: None,
                        feed_mm_min: 0.0,
                    });
                    segments.push(MotionSegment {
                        kind: MotionKind::Linear,
                        start: Point3::new(pt.x, pt.y, wcs.retract_z_mm),
                        end: pt,
                        arc_center_xy: None,
                        feed_mm_min: cd.plunge_rate_mm_min,
                    });
                }
                prev_pt = Some(pt);
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
