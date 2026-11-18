use crate::{Point2, Point3, Polyline2, TriangleMesh, VectorShape};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ImportError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Image decode error: {0}")]
    Image(#[from] image::ImageError),
    #[error("Mesh parse error: {0}")]
    Mesh(String),
    #[error("Vector parse error: {0}")]
    Vector(String),
}

/// Load a 32-bit float EXR, 16-bit TIFF/PNG, or 8-bit grayscale heightmap image.
/// Returns `(width_px, height_px, normalized_heights_row_major)`.
pub fn import_depth_map(path: &Path) -> Result<(u32, u32, Vec<f32>), ImportError> {
    let img = image::open(path)?;
    let luma32 = img.to_luma32f();
    let (w, h) = luma32.dimensions();
    let mut heights = luma32.into_raw();
    let mut min_v = f32::INFINITY;
    let mut max_v = f32::NEG_INFINITY;
    for &v in &heights {
        if v.is_finite() {
            min_v = min_v.min(v);
            max_v = max_v.max(v);
        }
    }
    if min_v < 0.0 || max_v > 1.0 {
        let span = (max_v - min_v).max(1e-6);
        for v in &mut heights {
            *v = ((*v - min_v) / span).clamp(0.0, 1.0);
        }
    }
    Ok((w, h, heights))
}

/// Import an STL mesh (binary or ASCII) into `TriangleMesh`.
pub fn import_stl(path: &Path) -> Result<TriangleMesh, ImportError> {
    let mut file = BufReader::new(File::open(path)?);
    let stl = stl_io::read_stl(&mut file).map_err(|e| ImportError::Mesh(e.to_string()))?;
    let vertices: Vec<Point3> = stl
        .vertices
        .iter()
        .map(|v| Point3::new(v[0] as f64, v[1] as f64, v[2] as f64))
        .collect();
    let indices: Vec<[u32; 3]> = stl
        .faces
        .iter()
        .map(|f| [f.vertices[0] as u32, f.vertices[1] as u32, f.vertices[2] as u32])
        .collect();
    Ok(TriangleMesh {
        id: Uuid::new_v4(),
        name: path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("STL Mesh")
            .to_string(),
        vertices,
        indices,
    })
}

/// Import a Wavefront OBJ mesh into `TriangleMesh`.
pub fn import_obj(path: &Path) -> Result<TriangleMesh, ImportError> {
    let (models, _) =
        tobj::load_obj(path, &tobj::GPU_LOAD_OPTIONS).map_err(|e| ImportError::Mesh(e.to_string()))?;
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    for m in models {
        let base = vertices.len() as u32;
        for chunk in m.mesh.positions.chunks_exact(3) {
            vertices.push(Point3::new(chunk[0] as f64, chunk[1] as f64, chunk[2] as f64));
        }
        for tri in m.mesh.indices.chunks_exact(3) {
            indices.push([base + tri[0], base + tri[1], base + tri[2]]);
        }
    }
    Ok(TriangleMesh {
        id: Uuid::new_v4(),
        name: path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("OBJ Mesh")
            .to_string(),
        vertices,
        indices,
    })
}

/// Import basic DXF polylines/lines/circles into `VectorShape`.
pub fn import_dxf(path: &Path) -> Result<VectorShape, ImportError> {
    let drawing = dxf::Drawing::load_file(path).map_err(|e| ImportError::Vector(e.to_string()))?;
    let mut contours = Vec::new();

    for entity in drawing.entities() {
        match &entity.specific {
            dxf::entities::EntityType::LwPolyline(lp) => {
                let pts: Vec<Point2> = lp.vertices.iter().map(|v| Point2::new(v.x, v.y)).collect();
                if !pts.is_empty() {
                    contours.push(Polyline2 {
                        points: pts,
                        closed: lp.is_closed(),
                    });
                }
            }
            dxf::entities::EntityType::Line(line) => {
                contours.push(Polyline2 {
                    points: vec![
                        Point2::new(line.p1.x, line.p1.y),
                        Point2::new(line.p2.x, line.p2.y),
                    ],
                    closed: false,
                });
            }
            dxf::entities::EntityType::Circle(circle) => {
                let segments = 64;
                let mut pts = Vec::with_capacity(segments);
                for i in 0..segments {
                    let a = 2.0 * std::f64::consts::PI * (i as f64) / (segments as f64);
                    pts.push(Point2::new(
                        circle.center.x + circle.radius * a.cos(),
                        circle.center.y + circle.radius * a.sin(),
                    ));
                }
                contours.push(Polyline2 {
                    points: pts,
                    closed: true,
                });
            }
            _ => {}
        }
    }

    Ok(VectorShape {
        id: Uuid::new_v4(),
        name: path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("DXF Import")
            .to_string(),
        contours,
    })
}
