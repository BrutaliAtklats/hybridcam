use crate::{Point2, Polyline2, Rect2, GEOM_TOLERANCE_MM};

/// Compute signed area of a closed 2D polygon (positive = CCW, negative = CW).
pub fn signed_area(points: &[Point2]) -> f64 {
    if points.len() < 3 {
        return 0.0;
    }
    let mut area = 0.0;
    for i in 0..points.len() {
        let a = points[i];
        let b = points[(i + 1) % points.len()];
        area += a.x * b.y - b.x * a.y;
    }
    0.5 * area
}

/// Ensure polygon points follow counter-clockwise (CCW) or clockwise (CW) winding.
pub fn ensure_winding(poly: &mut Polyline2, ccw: bool) {
    let area = signed_area(&poly.points);
    if (ccw && area < 0.0) || (!ccw && area > 0.0) {
        poly.points.reverse();
    }
}

/// Clean duplicate consecutive vertices within `GEOM_TOLERANCE_MM` and optionally close near-closed loops.
pub fn clean_polyline(poly: &Polyline2, auto_close_tol_mm: f64) -> Polyline2 {
    let mut cleaned: Vec<Point2> = Vec::with_capacity(poly.points.len());
    for &pt in &poly.points {
        if let Some(&last) = cleaned.last() {
            if last.dist(pt) > GEOM_TOLERANCE_MM {
                cleaned.push(pt);
            }
        } else {
            cleaned.push(pt);
        }
    }
    let mut closed = poly.closed;
    if cleaned.len() >= 3 {
        let first = cleaned[0];
        let last = *cleaned.last().unwrap();
        if first.dist(last) <= auto_close_tol_mm {
            if first.dist(last) <= GEOM_TOLERANCE_MM {
                cleaned.pop();
            }
            closed = true;
        }
    }
    Polyline2 {
        points: cleaned,
        closed,
    }
}

/// Ray-casting point-in-polygon test.
pub fn point_in_polygon(pt: Point2, poly: &[Point2]) -> bool {
    if poly.len() < 3 {
        return false;
    }
    let mut inside = false;
    let mut j = poly.len() - 1;
    for i in 0..poly.len() {
        let pi = poly[i];
        let pj = poly[j];
        let intersects = ((pi.y > pt.y) != (pj.y > pt.y))
            && (pt.x < (pj.x - pi.x) * (pt.y - pi.y) / (pj.y - pi.y + 1e-18) + pi.x);
        if intersects {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Compute axis-aligned bounding box of a polyline.
pub fn bounding_box(points: &[Point2]) -> Option<Rect2> {
    let first = points.first()?;
    let mut rect = Rect2 {
        min_x: first.x,
        min_y: first.y,
        max_x: first.x,
        max_y: first.y,
    };
    for p in points.iter().skip(1) {
        rect.min_x = rect.min_x.min(p.x);
        rect.min_y = rect.min_y.min(p.y);
        rect.max_x = rect.max_x.max(p.x);
        rect.max_y = rect.max_y.max(p.y);
    }
    Some(rect)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilletKind {
    Dogbone,
    TBone,
}

/// Add automatic Dogbone or T-Bone corner reliefs on interior 90-degree-like corners
/// of a closed CCW polygon for a cutter of `tool_diameter_mm`.
pub fn apply_joinery_fillets(
    poly: &Polyline2,
    tool_diameter_mm: f64,
    kind: FilletKind,
) -> Polyline2 {
    if !poly.closed || poly.points.len() < 3 {
        return poly.clone();
    }
    let r = tool_diameter_mm * 0.5;
    let n = poly.points.len();
    let ccw = signed_area(&poly.points) >= 0.0;
    let mut out = Vec::with_capacity(n * 3);

    for i in 0..n {
        let prev = poly.points[(i + n - 1) % n];
        let curr = poly.points[i];
        let next = poly.points[(i + 1) % n];

        let v1x = curr.x - prev.x;
        let v1y = curr.y - prev.y;
        let v2x = next.x - curr.x;
        let v2y = next.y - curr.y;

        let len1 = (v1x * v1x + v1y * v1y).sqrt();
        let len2 = (v2x * v2x + v2y * v2y).sqrt();

        if len1 < 1e-6 || len2 < 1e-6 {
            out.push(curr);
            continue;
        }

        let u1x = v1x / len1;
        let u1y = v1y / len1;
        let u2x = v2x / len2;
        let u2y = v2y / len2;

        // Cross product determines if corner is concave (interior corner in CCW polygon has cross < 0)
        let cross = u1x * u2y - u1y * u2x;
        let is_interior = if ccw { cross < -0.2 } else { cross > 0.2 };

        if is_interior {
            let (dx, dy) = match kind {
                FilletKind::Dogbone => {
                    // Bisector pointing into the material corner
                    let bx = u1x - u2x;
                    let by = u1y - u2y;
                    let blen = (bx * bx + by * by).sqrt().max(1e-6);
                    (bx / blen * r, by / blen * r)
                }
                FilletKind::TBone => {
                    // Extend along the incoming edge direction
                    (u1x * r, u1y * r)
                }
            };
            out.push(curr);
            out.push(Point2::new(curr.x + dx, curr.y + dy));
            out.push(curr);
        } else {
            out.push(curr);
        }
    }

    Polyline2 {
        points: out,
        closed: true,
    }
}

/// Simple inward/outward miter-limited offset for closed polygons (positive = outward for CCW).
pub fn offset_polygon_simple(poly: &Polyline2, distance_mm: f64) -> Polyline2 {
    if !poly.closed || poly.points.len() < 3 || distance_mm.abs() < 1e-9 {
        return poly.clone();
    }
    let n = poly.points.len();
    let ccw = signed_area(&poly.points) >= 0.0;
    let sign = if ccw { 1.0 } else { -1.0 };
    let d = distance_mm * sign;

    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let prev = poly.points[(i + n - 1) % n];
        let curr = poly.points[i];
        let next = poly.points[(i + 1) % n];

        let e1x = curr.x - prev.x;
        let e1y = curr.y - prev.y;
        let e2x = next.x - curr.x;
        let e2y = next.y - curr.y;

        let l1 = (e1x * e1x + e1y * e1y).sqrt().max(1e-9);
        let l2 = (e2x * e2x + e2y * e2y).sqrt().max(1e-9);

        // Outward normals for CCW
        let n1x = e1y / l1;
        let n1y = -e1x / l1;
        let n2x = e2y / l2;
        let n2y = -e2x / l2;

        let bx = n1x + n2x;
        let by = n1y + n2y;
        let blen2 = bx * bx + by * by;
        if blen2 < 1e-6 {
            out.push(Point2::new(curr.x + n1x * d, curr.y + n1y * d));
        } else {
            let denom = (1.0 + n1x * n2x + n1y * n2y).max(0.25);
            let scale = d / denom;
            out.push(Point2::new(curr.x + (bx * 0.5) * scale * 2.0 / 1.0, curr.y + (by * 0.5) * scale * 2.0 / 1.0));
        }
    }

    Polyline2 {
        points: out,
        closed: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signed_area_and_pip() {
        let square = vec![
            Point2::new(0.0, 0.0),
            Point2::new(10.0, 0.0),
            Point2::new(10.0, 10.0),
            Point2::new(0.0, 10.0),
        ];
        assert!((signed_area(&square) - 100.0).abs() < 1e-9);
        assert!(point_in_polygon(Point2::new(5.0, 5.0), &square));
        assert!(!point_in_polygon(Point2::new(15.0, 5.0), &square));
    }

    #[test]
    fn test_dogbone_fillet_adds_relief_on_l_shape() {
        // L-shaped CCW polygon with one interior corner at (5, 5)
        let l_shape = Polyline2 {
            points: vec![
                Point2::new(0.0, 0.0),
                Point2::new(10.0, 0.0),
                Point2::new(10.0, 5.0),
                Point2::new(5.0, 5.0),
                Point2::new(5.0, 10.0),
                Point2::new(0.0, 10.0),
            ],
            closed: true,
        };
        let filleted = apply_joinery_fillets(&l_shape, 6.0, FilletKind::Dogbone);
        assert!(filleted.points.len() > l_shape.points.len());
    }
}
