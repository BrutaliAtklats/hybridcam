#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cnc_serial;

use hybridcam_cam::adaptive_2d::{generate_adaptive_2d, generate_adaptive_offset_2d};
use hybridcam_cam::ops_2d::{generate_contour_2d, generate_pocket_2d, ContourSide, TabConfig};
use hybridcam_cam::ops_3d::{
    generate_relief_finish_3d, generate_relief_pencil_3d, generate_relief_spiral_3d,
    generate_relief_steep_shallow_3d,
};
use hybridcam_cam::photovcarve::{generate_photovcarve, PhotoCarvePattern};
use hybridcam_cam::tools::{default_tool_library, Tool};
use hybridcam_cam::vcarve::generate_vcarve;
use hybridcam_cam::{MaterialPreset, Toolpath};
use hybridcam_geom::{Point2, Point3, Polyline2, Rect2, WorkCoordinateSystem, WcsOriginPreset};
use hybridcam_post::{post_process, PostConfig, PostDialect};
use hybridcam_relief::ReliefGrid;
use hybridcam_sim::{CollisionEvent, DexelStock, SimulationReport};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;
use uuid::Uuid;

static ALLOW_WINDOW_CLOSE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn force_close_window_ipc(window: tauri::Window) {
    ALLOW_WINDOW_CLOSE.store(true, Ordering::SeqCst);
    let _ = window.destroy();
}

#[derive(Debug, Deserialize)]
struct ComputeOpRequest {
    strategy: String,
    material: MaterialPreset,
    tool_number: u32,
    rpm_override: Option<u32>,
    feed_override: Option<f64>,
    stepdown_override: Option<f64>,
    stepover_fraction_override: Option<f64>,
    width_mm: f64,
    depth_mm: f64,
    thickness_mm: f64,
    z_zero_top: bool,
    clearance_z_mm: f64,
    relief_w: u32,
    relief_h: u32,
    /// Physical Z heights in mm (row-major) matching the relief preview.
    relief_heights_mm: Vec<f32>,
    /// Normalized 0..1 grayscale values for PhotoVCarve.
    raw_luma: Vec<f32>,
    max_cut_depth_mm: f64,
    stock_to_leave_mm: f64,
    carve_bounds_mm: Option<[f64; 4]>,
    vector_polylines: Option<Vec<Vec<[f64; 2]>>>,
}

#[derive(Debug, Serialize)]
struct ComputeOpResponse {
    toolpath: Toolpath,
}

#[derive(Debug, Deserialize)]
struct SimOpItem {
    toolpath: Toolpath,
    tool_number: u32,
}

#[derive(Debug, Deserialize)]
struct SimulateStackRequest {
    width_mm: f64,
    depth_mm: f64,
    top_z_mm: f32,
    grid_w: u32,
    grid_h: u32,
    operations: Vec<SimOpItem>,
}

fn find_tool_with_overrides(req: &ComputeOpRequest) -> Tool {
    let mut tool = default_tool_library()
        .into_iter()
        .find(|t| t.number == req.tool_number)
        .unwrap_or_else(|| default_tool_library().remove(0));

    for preset in &mut tool.presets {
        if preset.material == req.material {
            if let Some(rpm) = req.rpm_override {
                preset.spindle_rpm = rpm;
            }
            if let Some(feed) = req.feed_override {
                preset.feed_rate_mm_min = feed;
            }
            if let Some(sd) = req.stepdown_override {
                preset.stepdown_mm = sd;
            }
            if let Some(so) = req.stepover_fraction_override {
                preset.stepover_fraction = so;
            }
        }
    }
    tool
}

#[tauri::command]
fn get_default_tools() -> Vec<Tool> {
    default_tool_library()
}

#[tauri::command]
async fn compute_operation_ipc(req: ComputeOpRequest) -> Result<ComputeOpResponse, String> {
    tauri::async_runtime::spawn_blocking(move || compute_operation_sync(req))
        .await
        .map_err(|e| e.to_string())?
}

fn compute_operation_sync(req: ComputeOpRequest) -> Result<ComputeOpResponse, String> {
    let tool = find_tool_with_overrides(&req);
    let top_z = if req.z_zero_top { 0.0 } else { req.thickness_mm };
    let wcs = WorkCoordinateSystem {
        preset: WcsOriginPreset::TopCenter,
        offset_mm: Point3::new(0.0, 0.0, top_z),
        clearance_z_mm: top_z + req.clearance_z_mm,
        retract_z_mm: top_z + 5.0,
        feed_plane_z_mm: top_z + 2.0,
    };

    let stock_bounds = Rect2 {
        min_x: -req.width_mm * 0.5,
        min_y: -req.depth_mm * 0.5,
        max_x: req.width_mm * 0.5,
        max_y: req.depth_mm * 0.5,
    };

    // Vectric-style boundary: only machine inside the placed depth-map picture bounds (clamped to stock)
    let active_bounds = if let Some([bmin_x, bmin_y, bmax_x, bmax_y]) = req.carve_bounds_mm {
        let min_x = bmin_x.max(stock_bounds.min_x);
        let min_y = bmin_y.max(stock_bounds.min_y);
        let max_x = bmax_x.min(stock_bounds.max_x);
        let max_y = bmax_y.min(stock_bounds.max_y);
        if max_x > min_x + 1.0 && max_y > min_y + 1.0 {
            Rect2 { min_x, min_y, max_x, max_y }
        } else {
            stock_bounds
        }
    } else {
        stock_bounds
    };

    let inner_poly = Polyline2 {
        points: vec![
            Point2::new(active_bounds.min_x, active_bounds.min_y),
            Point2::new(active_bounds.max_x, active_bounds.min_y),
            Point2::new(active_bounds.max_x, active_bounds.max_y),
            Point2::new(active_bounds.min_x, active_bounds.max_y),
        ],
        closed: true,
    };

    let full_relief_grid = ReliefGrid {
        width_px: req.relief_w.max(2),
        height_px: req.relief_h.max(2),
        bounds_mm: stock_bounds,
        heights: req.relief_heights_mm,
    };

    // Resample relief grid strictly over `active_bounds` so 3D rough/finish only machines inside the picture
    let sub_w = 320_u32;
    let sub_h = 320_u32;
    let mut sub_heights = Vec::with_capacity((sub_w * sub_h) as usize);
    for py in 0..sub_h {
        let y = active_bounds.min_y + (py as f64 / (sub_h - 1) as f64) * active_bounds.height();
        for px in 0..sub_w {
            let x = active_bounds.min_x + (px as f64 / (sub_w - 1) as f64) * active_bounds.width();
            sub_heights.push(full_relief_grid.sample_mm(x, y));
        }
    }
    let relief_grid = ReliefGrid {
        width_px: sub_w,
        height_px: sub_h,
        bounds_mm: active_bounds,
        heights: sub_heights,
    };

    let vector_polys: Vec<Polyline2> = req
        .vector_polylines
        .as_ref()
        .map(|list| {
            list.iter()
                .filter(|pts| pts.len() >= 2)
                .map(|pts| Polyline2 {
                    points: pts.iter().map(|p| Point2::new(p[0], p[1])).collect(),
                    closed: true,
                })
                .collect()
        })
        .unwrap_or_default();

    let target_polys = if vector_polys.is_empty() {
        vec![inner_poly.clone()]
    } else {
        vector_polys
    };

    let op_id = Uuid::new_v4();
    let toolpath = match req.strategy.as_str() {
        "Adaptive2D" => {
            let mut combined = generate_adaptive_2d(
                op_id,
                &target_polys[0],
                req.max_cut_depth_mm,
                req.stock_to_leave_mm,
                &tool,
                req.material,
                &wcs,
            );
            for poly in target_polys.iter().skip(1) {
                let mut extra = generate_adaptive_2d(
                    op_id,
                    poly,
                    req.max_cut_depth_mm,
                    req.stock_to_leave_mm,
                    &tool,
                    req.material,
                    &wcs,
                );
                combined.segments.append(&mut extra.segments);
            }
            combined.compute_metrics();
            combined
        }
        "AdaptiveOffset2D" => {
            let mut combined = generate_adaptive_offset_2d(
                op_id,
                &target_polys[0],
                req.max_cut_depth_mm,
                req.stock_to_leave_mm,
                &tool,
                req.material,
                &wcs,
            );
            for poly in target_polys.iter().skip(1) {
                let mut extra = generate_adaptive_offset_2d(
                    op_id,
                    poly,
                    req.max_cut_depth_mm,
                    req.stock_to_leave_mm,
                    &tool,
                    req.material,
                    &wcs,
                );
                combined.segments.append(&mut extra.segments);
            }
            combined.compute_metrics();
            combined
        }
        "SteepShallow3D" => generate_relief_steep_shallow_3d(
            op_id,
            &relief_grid,
            req.stock_to_leave_mm,
            &tool,
            req.material,
            &wcs,
        ),
        "Spiral3D" => generate_relief_spiral_3d(
            op_id,
            &relief_grid,
            req.stock_to_leave_mm,
            &tool,
            req.material,
            &wcs,
        ),
        "Pencil3D" => generate_relief_pencil_3d(
            op_id,
            &relief_grid,
            req.stock_to_leave_mm,
            &tool,
            req.material,
            &wcs,
        ),
        "Pocket2D" => {
            let mut combined = generate_pocket_2d(op_id, &target_polys[0], req.max_cut_depth_mm, &tool, req.material, &wcs);
            for poly in target_polys.iter().skip(1) {
                let mut extra = generate_pocket_2d(op_id, poly, req.max_cut_depth_mm, &tool, req.material, &wcs);
                combined.segments.append(&mut extra.segments);
            }
            combined.compute_metrics();
            combined
        }
        "Contour2D" => generate_contour_2d(
            op_id,
            &target_polys,
            ContourSide::Outside,
            req.max_cut_depth_mm,
            Some(TabConfig {
                count: 4,
                length_mm: 6.0,
                height_mm: 2.5,
            }),
            &tool,
            req.material,
            &wcs,
        ),
        "VCarve" => {
            let (v_tp, _) = generate_vcarve(
                op_id,
                &target_polys,
                Some(req.max_cut_depth_mm),
                Some(&relief_grid),
                &tool,
                None,
                req.material,
                &wcs,
            );
            v_tp
        }
        "PhotoVCarve" => {
            let luma = if req.raw_luma.len() == (req.relief_w * req.relief_h) as usize {
                req.raw_luma
            } else {
                vec![0.5; (req.relief_w * req.relief_h) as usize]
            };
            generate_photovcarve(
                op_id,
                req.relief_w,
                req.relief_h,
                &luma,
                active_bounds,
                req.max_cut_depth_mm.min(4.0),
                1.2,
                45.0,
                PhotoCarvePattern::AngledLines,
                &tool,
                req.material,
                &wcs,
            )
        }
        "ReliefRough3D" => generate_relief_finish_3d(
            op_id,
            &relief_grid,
            req.stock_to_leave_mm.max(0.5),
            None,
            &tool,
            req.material,
            &wcs,
        ),
        _ => generate_relief_finish_3d(
            op_id,
            &relief_grid,
            0.0,
            None,
            &tool,
            req.material,
            &wcs,
        ),
    };

    Ok(ComputeOpResponse { toolpath })
}

#[tauri::command]
async fn simulate_stack_ipc(req: SimulateStackRequest) -> Result<SimulationReport, String> {
    tauri::async_runtime::spawn_blocking(move || simulate_stack_sync(req))
        .await
        .map_err(|e| e.to_string())?
}

fn simulate_stack_sync(req: SimulateStackRequest) -> Result<SimulationReport, String> {
    let bounds = Rect2 {
        min_x: -req.width_mm * 0.5,
        min_y: -req.depth_mm * 0.5,
        max_x: req.width_mm * 0.5,
        max_y: req.depth_mm * 0.5,
    };
    let mut stock = DexelStock::new(bounds, req.grid_w.max(16), req.grid_h.max(16), req.top_z_mm);
    let lib = default_tool_library();
    let mut all_collisions: Vec<CollisionEvent> = Vec::new();
    let mut total_time_sec = 0.0;

    for item in &req.operations {
        let tool = lib
            .iter()
            .find(|t| t.number == item.tool_number)
            .unwrap_or(&lib[0]);
        let mut cols = stock.simulate_toolpath(&item.toolpath, tool);
        all_collisions.append(&mut cols);
        total_time_sec += item.toolpath.estimated_time_sec;
    }

    Ok(SimulationReport {
        width_px: stock.width_px,
        height_px: stock.height_px,
        stock_heights_mm: stock.heights,
        collisions: all_collisions,
        total_time_sec,
    })
}

#[tauri::command]
async fn export_gcode_text(
    toolpaths: Vec<Toolpath>,
    dialect: PostDialect,
    program_name: String,
    safe_z_mm: Option<f64>,
    emit_m6: Option<bool>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut config = PostConfig {
            dialect,
            program_name,
            ..PostConfig::default()
        };
        if let Some(sz) = safe_z_mm {
            config.safe_z_mm = sz;
        }
        if let Some(m6) = emit_m6 {
            config.emit_tool_change_m6 = m6;
        }
        post_process(&toolpaths, &config)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_file_dialog_ipc(
    default_name: String,
    filter_name: String,
    extension: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = rfd::FileDialog::new()
            .set_file_name(&default_name)
            .add_filter(&filter_name, &[extension.as_str()]);
        if let Some(path) = dialog.save_file() {
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().to_string()))
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Serialize)]
struct DepthMap16Result {
    width: u32,
    height: u32,
    data: Vec<f32>,
}

#[tauri::command]
fn import_depth_map_bytes_ipc(bytes: Vec<u8>) -> Result<DepthMap16Result, String> {
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let luma32 = img.to_luma32f();
    let (w, h) = luma32.dimensions();
    let mut data: Vec<f32> = luma32.into_raw();

    // Normalize EXR / 32-bit float TIFFs that have values outside 0..1
    let mut min_v = f32::INFINITY;
    let mut max_v = f32::NEG_INFINITY;
    for &v in &data {
        if v.is_finite() {
            if v < min_v {
                min_v = v;
            }
            if v > max_v {
                max_v = v;
            }
        }
    }
    if min_v < 0.0 || max_v > 1.0 {
        let span = (max_v - min_v).max(1e-6);
        for v in &mut data {
            *v = ((*v - min_v) / span).clamp(0.0, 1.0);
        }
    }

    Ok(DepthMap16Result {
        width: w,
        height: h,
        data,
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_default_tools,
            compute_operation_ipc,
            simulate_stack_ipc,
            export_gcode_text,
            import_depth_map_bytes_ipc,
            save_file_dialog_ipc,
            cnc_serial::list_serial_ports_ipc,
            cnc_serial::connect_serial_ipc,
            cnc_serial::disconnect_serial_ipc,
            cnc_serial::send_serial_line_ipc,
            cnc_serial::send_realtime_byte_ipc,
            cnc_serial::start_gcode_stream_ipc,
            cnc_serial::stop_gcode_stream_ipc,
            cnc_serial::get_cnc_status_ipc,
            force_close_window_ipc
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !ALLOW_WINDOW_CLOSE.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.emit("hybridcam://close-requested", ());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running HybridCAM Tauri application");
}
