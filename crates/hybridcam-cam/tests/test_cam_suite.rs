use hybridcam_cam::adaptive_2d::generate_adaptive_2d;
use hybridcam_cam::ops_2d::{generate_contour_2d, generate_drill, generate_pocket_2d, ContourSide, TabConfig};
use hybridcam_cam::ops_3d::generate_relief_finish_3d;
use hybridcam_cam::photovcarve::{generate_photovcarve, PhotoCarvePattern};
use hybridcam_cam::vcarve::{generate_inlay_plug_vectors, generate_vcarve};
use hybridcam_cam::{default_tool_library, MaterialPreset};
use hybridcam_geom::{Point2, Polyline2, Rect2, WorkCoordinateSystem};
use hybridcam_relief::ReliefGrid;
use uuid::Uuid;

fn rect_poly(w: f64, h: f64) -> Polyline2 {
    Polyline2 {
        points: vec![
            Point2::new(0.0, 0.0),
            Point2::new(w, 0.0),
            Point2::new(w, h),
            Point2::new(0.0, h),
        ],
        closed: true,
    }
}

#[test]
fn test_default_tool_library_has_all_popular_tools_and_presets() {
    let lib = default_tool_library();
    assert!(lib.len() >= 21);
    for tool in &lib {
        for mat in [
            MaterialPreset::Hardwood,
            MaterialPreset::Softwood,
            MaterialPreset::MdfPlywood,
            MaterialPreset::AcrylicHdpe,
            MaterialPreset::Aluminum6061,
        ] {
            let cd = tool.recommended_for(mat);
            assert!(cd.spindle_rpm >= 10000);
            assert!(cd.feed_rate_mm_min > 0.0);
            assert!(cd.plunge_rate_mm_min > 0.0);
            assert!(cd.stepdown_mm > 0.0);
            assert!(cd.stepover_fraction > 0.0 && cd.stepover_fraction <= 1.0);
        }
    }
}

#[test]
fn test_25d_contour_pocket_adaptive_and_drill() {
    let lib = default_tool_library();
    let flat_quarter = &lib[0];
    let drill = &lib[20];
    let wcs = WorkCoordinateSystem::default();
    let sq = rect_poly(40.0, 40.0);

    let contour = generate_contour_2d(
        Uuid::new_v4(),
        &[sq.clone()],
        ContourSide::Outside,
        6.0,
        Some(TabConfig {
            count: 4,
            length_mm: 5.0,
            height_mm: 2.0,
        }),
        flat_quarter,
        MaterialPreset::Hardwood,
        &wcs,
    );
    assert!(!contour.segments.is_empty());
    assert!(contour.total_cut_distance_mm > 100.0);

    let pocket = generate_pocket_2d(
        Uuid::new_v4(),
        &sq,
        5.0,
        flat_quarter,
        MaterialPreset::MdfPlywood,
        &wcs,
    );
    assert!(!pocket.segments.is_empty());

    let adaptive = generate_adaptive_2d(
        Uuid::new_v4(),
        &sq,
        6.0,
        0.2,
        flat_quarter,
        MaterialPreset::Aluminum6061,
        &wcs,
    );
    assert!(!adaptive.segments.is_empty());

    let drilled = generate_drill(
        Uuid::new_v4(),
        &[Point2::new(10.0, 10.0), Point2::new(30.0, 30.0)],
        12.0,
        3.0,
        drill,
        MaterialPreset::Hardwood,
        &wcs,
    );
    assert!(!drilled.segments.is_empty());
}

#[test]
fn test_true_vcarve_flat_clearance_and_inlay_plug() {
    let lib = default_tool_library();
    let flat = &lib[0];
    let vbit_60 = &lib[14];
    let wcs = WorkCoordinateSystem::default();
    let sq = rect_poly(30.0, 30.0);

    let (v_tp, flat_tp) = generate_vcarve(
        Uuid::new_v4(),
        &[sq.clone()],
        Some(4.0),
        None,
        vbit_60,
        Some(flat),
        MaterialPreset::Hardwood,
        &wcs,
    );
    assert!(!v_tp.segments.is_empty());
    assert!(flat_tp.is_some());

    let plug = generate_inlay_plug_vectors(&sq, 50.0, 0.15);
    assert_eq!(plug.points.len(), 4);
}

#[test]
fn test_photovcarve_and_3d_relief_finish() {
    let lib = default_tool_library();
    let engraver = &lib[17];
    let tapered_r025 = &lib[10];
    let wcs = WorkCoordinateSystem::default();
    let bounds = Rect2 {
        min_x: 0.0,
        min_y: 0.0,
        max_x: 20.0,
        max_y: 20.0,
    };

    let luma = vec![0.25_f32; 16 * 16];
    let photo_tp = generate_photovcarve(
        Uuid::new_v4(),
        16,
        16,
        &luma,
        bounds,
        2.0,
        1.0,
        45.0,
        PhotoCarvePattern::CrossHatch,
        engraver,
        MaterialPreset::AcrylicHdpe,
        &wcs,
    );
    assert!(!photo_tp.segments.is_empty());

    let grid = ReliefGrid::from_normalized_depth_map(16, 16, &luma, bounds, 8.0, 0.0, 1.0);
    let relief_tp = generate_relief_finish_3d(
        Uuid::new_v4(),
        &grid,
        0.0,
        None,
        tapered_r025,
        MaterialPreset::Hardwood,
        &wcs,
    );
    assert!(!relief_tp.segments.is_empty());
}
