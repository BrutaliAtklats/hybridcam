use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MaterialPreset {
    Hardwood,
    Softwood,
    MdfPlywood,
    AcrylicHdpe,
    Aluminum6061,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FluteStyle {
    Upcut,
    Downcut,
    Compression,
    OFlute,
    Straight,
    Spiral,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ToolGeometry {
    FlatEndmill {
        diameter_mm: f64,
        flute_length_mm: f64,
        flute_count: u8,
        flute_style: FluteStyle,
    },
    Ballnose {
        diameter_mm: f64,
        flute_length_mm: f64,
        flute_count: u8,
    },
    Bullnose {
        diameter_mm: f64,
        corner_radius_mm: f64,
        flute_length_mm: f64,
        flute_count: u8,
    },
    TaperedBallnose {
        tip_radius_mm: f64,
        half_angle_deg: f64,
        shank_diameter_mm: f64,
        flute_length_mm: f64,
        flute_count: u8,
    },
    VBit {
        diameter_mm: f64,
        included_angle_deg: f64,
        tip_flat_mm: f64,
        flute_length_mm: f64,
        flute_count: u8,
    },
    Engraving {
        shank_diameter_mm: f64,
        included_angle_deg: f64,
        tip_flat_mm: f64,
        flute_length_mm: f64,
    },
    Surfacing {
        diameter_mm: f64,
        flute_length_mm: f64,
        flute_count: u8,
    },
    Chamfer {
        diameter_mm: f64,
        included_angle_deg: f64,
        tip_diameter_mm: f64,
        flute_length_mm: f64,
    },
    Drill {
        diameter_mm: f64,
        point_angle_deg: f64,
        flute_length_mm: f64,
    },
}

impl ToolGeometry {
    pub fn cutting_diameter_mm(&self) -> f64 {
        match *self {
            ToolGeometry::FlatEndmill { diameter_mm, .. }
            | ToolGeometry::Ballnose { diameter_mm, .. }
            | ToolGeometry::Bullnose { diameter_mm, .. }
            | ToolGeometry::VBit { diameter_mm, .. }
            | ToolGeometry::Surfacing { diameter_mm, .. }
            | ToolGeometry::Chamfer { diameter_mm, .. }
            | ToolGeometry::Drill { diameter_mm, .. } => diameter_mm,
            ToolGeometry::TaperedBallnose { tip_radius_mm, .. } => tip_radius_mm * 2.0,
            ToolGeometry::Engraving { tip_flat_mm, .. } => tip_flat_mm.max(0.1),
        }
    }

    pub fn flute_length_mm(&self) -> f64 {
        match *self {
            ToolGeometry::FlatEndmill { flute_length_mm, .. }
            | ToolGeometry::Ballnose { flute_length_mm, .. }
            | ToolGeometry::Bullnose { flute_length_mm, .. }
            | ToolGeometry::TaperedBallnose { flute_length_mm, .. }
            | ToolGeometry::VBit { flute_length_mm, .. }
            | ToolGeometry::Engraving { flute_length_mm, .. }
            | ToolGeometry::Surfacing { flute_length_mm, .. }
            | ToolGeometry::Chamfer { flute_length_mm, .. }
            | ToolGeometry::Drill { flute_length_mm, .. } => flute_length_mm,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuttingData {
    pub material: MaterialPreset,
    pub spindle_rpm: u32,
    pub feed_rate_mm_min: f64,
    pub plunge_rate_mm_min: f64,
    pub ramp_rate_mm_min: f64,
    pub stepdown_mm: f64,
    /// Radial stepover as fraction of tool diameter (e.g. 0.40 = 40%, 0.08 = 8% for 3D finishing).
    pub stepover_fraction: f64,
    /// Optimal radial engagement for Adaptive Clearing (e.g. 0.25 = 25% of diameter).
    pub adaptive_optimal_load_fraction: f64,
    pub climb_milling: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HolderSegment {
    pub height_mm: f64,
    pub diameter_mm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    pub id: Uuid,
    pub number: u32,
    pub name: String,
    pub geometry: ToolGeometry,
    pub overall_length_mm: f64,
    pub holder: Vec<HolderSegment>,
    pub presets: Vec<CuttingData>,
}

impl Tool {
    /// Retrieve recommended cutting parameters for a given material, falling back to first preset.
    pub fn recommended_for(&self, material: MaterialPreset) -> &CuttingData {
        self.presets
            .iter()
            .find(|p| p.material == material)
            .unwrap_or(&self.presets[0])
    }
}

fn standard_presets_for_flat(d_mm: f64, is_o_flute: bool) -> Vec<CuttingData> {
    let scale = (d_mm / 6.35).clamp(0.35, 1.5);
    vec![
        CuttingData {
            material: MaterialPreset::Hardwood,
            spindle_rpm: 18000,
            feed_rate_mm_min: (2400.0 * scale).round(),
            plunge_rate_mm_min: (750.0 * scale).round(),
            ramp_rate_mm_min: (1200.0 * scale).round(),
            stepdown_mm: (d_mm * 0.5).min(4.0),
            stepover_fraction: 0.40,
            adaptive_optimal_load_fraction: 0.25,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::Softwood,
            spindle_rpm: 18000,
            feed_rate_mm_min: (3200.0 * scale).round(),
            plunge_rate_mm_min: (1000.0 * scale).round(),
            ramp_rate_mm_min: (1600.0 * scale).round(),
            stepdown_mm: (d_mm * 0.75).min(6.0),
            stepover_fraction: 0.45,
            adaptive_optimal_load_fraction: 0.30,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::MdfPlywood,
            spindle_rpm: 18000,
            feed_rate_mm_min: (3000.0 * scale).round(),
            plunge_rate_mm_min: (900.0 * scale).round(),
            ramp_rate_mm_min: (1500.0 * scale).round(),
            stepdown_mm: (d_mm * 0.65).min(5.0),
            stepover_fraction: 0.45,
            adaptive_optimal_load_fraction: 0.28,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::AcrylicHdpe,
            spindle_rpm: if is_o_flute { 16000 } else { 14000 },
            feed_rate_mm_min: (2000.0 * scale).round(),
            plunge_rate_mm_min: (600.0 * scale).round(),
            ramp_rate_mm_min: (1000.0 * scale).round(),
            stepdown_mm: (d_mm * 0.4).min(2.5),
            stepover_fraction: 0.35,
            adaptive_optimal_load_fraction: 0.20,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::Aluminum6061,
            spindle_rpm: if is_o_flute { 16000 } else { 12000 },
            feed_rate_mm_min: (900.0 * scale).round(),
            plunge_rate_mm_min: (220.0 * scale).round(),
            ramp_rate_mm_min: (450.0 * scale).round(),
            stepdown_mm: (d_mm * 0.15).clamp(0.3, 1.2),
            stepover_fraction: 0.25,
            adaptive_optimal_load_fraction: 0.12,
            climb_milling: true,
        },
    ]
}

fn standard_presets_for_3d_finish(tip_d_mm: f64) -> Vec<CuttingData> {
    let feed_base = if tip_d_mm <= 1.0 { 1800.0 } else { 2800.0 };
    vec![
        CuttingData {
            material: MaterialPreset::Hardwood,
            spindle_rpm: 18000,
            feed_rate_mm_min: feed_base,
            plunge_rate_mm_min: 700.0,
            ramp_rate_mm_min: 1100.0,
            stepdown_mm: 1.5,
            stepover_fraction: 0.08, // 8% for smooth 3D relief finish
            adaptive_optimal_load_fraction: 0.15,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::Softwood,
            spindle_rpm: 18000,
            feed_rate_mm_min: feed_base * 1.2,
            plunge_rate_mm_min: 900.0,
            ramp_rate_mm_min: 1400.0,
            stepdown_mm: 2.0,
            stepover_fraction: 0.10,
            adaptive_optimal_load_fraction: 0.18,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::MdfPlywood,
            spindle_rpm: 18000,
            feed_rate_mm_min: feed_base * 1.1,
            plunge_rate_mm_min: 800.0,
            ramp_rate_mm_min: 1200.0,
            stepdown_mm: 1.8,
            stepover_fraction: 0.09,
            adaptive_optimal_load_fraction: 0.16,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::AcrylicHdpe,
            spindle_rpm: 15000,
            feed_rate_mm_min: feed_base * 0.8,
            plunge_rate_mm_min: 500.0,
            ramp_rate_mm_min: 800.0,
            stepdown_mm: 1.0,
            stepover_fraction: 0.08,
            adaptive_optimal_load_fraction: 0.12,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::Aluminum6061,
            spindle_rpm: 14000,
            feed_rate_mm_min: feed_base * 0.4,
            plunge_rate_mm_min: 200.0,
            ramp_rate_mm_min: 350.0,
            stepdown_mm: 0.4,
            stepover_fraction: 0.07,
            adaptive_optimal_load_fraction: 0.10,
            climb_milling: true,
        },
    ]
}

fn standard_presets_for_vbit(angle_deg: f64) -> Vec<CuttingData> {
    let feed = if angle_deg <= 35.0 { 1200.0 } else { 1800.0 };
    vec![
        CuttingData {
            material: MaterialPreset::Hardwood,
            spindle_rpm: 18000,
            feed_rate_mm_min: feed,
            plunge_rate_mm_min: 500.0,
            ramp_rate_mm_min: 800.0,
            stepdown_mm: 3.0,
            stepover_fraction: 0.15,
            adaptive_optimal_load_fraction: 0.20,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::Softwood,
            spindle_rpm: 18000,
            feed_rate_mm_min: feed * 1.25,
            plunge_rate_mm_min: 650.0,
            ramp_rate_mm_min: 1000.0,
            stepdown_mm: 4.5,
            stepover_fraction: 0.15,
            adaptive_optimal_load_fraction: 0.25,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::MdfPlywood,
            spindle_rpm: 18000,
            feed_rate_mm_min: feed * 1.15,
            plunge_rate_mm_min: 600.0,
            ramp_rate_mm_min: 900.0,
            stepdown_mm: 4.0,
            stepover_fraction: 0.15,
            adaptive_optimal_load_fraction: 0.22,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::AcrylicHdpe,
            spindle_rpm: 15000,
            feed_rate_mm_min: feed * 0.75,
            plunge_rate_mm_min: 400.0,
            ramp_rate_mm_min: 600.0,
            stepdown_mm: 1.5,
            stepover_fraction: 0.12,
            adaptive_optimal_load_fraction: 0.15,
            climb_milling: true,
        },
        CuttingData {
            material: MaterialPreset::Aluminum6061,
            spindle_rpm: 14000,
            feed_rate_mm_min: feed * 0.35,
            plunge_rate_mm_min: 150.0,
            ramp_rate_mm_min: 250.0,
            stepdown_mm: 0.5,
            stepover_fraction: 0.10,
            adaptive_optimal_load_fraction: 0.10,
            climb_milling: true,
        },
    ]
}

/// Pre-populated library of all popular CNC carving tools & endmills with recommended feeds & speeds.
pub fn default_tool_library() -> Vec<Tool> {
    let default_holder = vec![
        HolderSegment { height_mm: 20.0, diameter_mm: 22.0 },
        HolderSegment { height_mm: 25.0, diameter_mm: 34.0 },
    ];

    vec![
        // --- Flat Endmills ---
        Tool {
            id: Uuid::new_v4(),
            number: 1,
            name: "1/4\" (6.35mm) 2-Flute Upcut Flat Endmill".into(),
            geometry: ToolGeometry::FlatEndmill {
                diameter_mm: 6.35,
                flute_length_mm: 22.0,
                flute_count: 2,
                flute_style: FluteStyle::Upcut,
            },
            overall_length_mm: 63.5,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(6.35, false),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 2,
            name: "1/4\" (6.35mm) 2-Flute Downcut Flat Endmill".into(),
            geometry: ToolGeometry::FlatEndmill {
                diameter_mm: 6.35,
                flute_length_mm: 22.0,
                flute_count: 2,
                flute_style: FluteStyle::Downcut,
            },
            overall_length_mm: 63.5,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(6.35, false),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 3,
            name: "1/4\" (6.35mm) Compression Spiral Endmill".into(),
            geometry: ToolGeometry::FlatEndmill {
                diameter_mm: 6.35,
                flute_length_mm: 25.4,
                flute_count: 2,
                flute_style: FluteStyle::Compression,
            },
            overall_length_mm: 63.5,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(6.35, false),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 4,
            name: "1/8\" (3.175mm) 2-Flute Upcut Flat Endmill".into(),
            geometry: ToolGeometry::FlatEndmill {
                diameter_mm: 3.175,
                flute_length_mm: 12.7,
                flute_count: 2,
                flute_style: FluteStyle::Upcut,
            },
            overall_length_mm: 38.1,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(3.175, false),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 5,
            name: "6mm 2-Flute Upcut Flat Endmill".into(),
            geometry: ToolGeometry::FlatEndmill {
                diameter_mm: 6.0,
                flute_length_mm: 22.0,
                flute_count: 2,
                flute_style: FluteStyle::Upcut,
            },
            overall_length_mm: 50.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(6.0, false),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 6,
            name: "3mm 2-Flute Upcut Flat Endmill".into(),
            geometry: ToolGeometry::FlatEndmill {
                diameter_mm: 3.0,
                flute_length_mm: 12.0,
                flute_count: 2,
                flute_style: FluteStyle::Upcut,
            },
            overall_length_mm: 38.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(3.0, false),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 7,
            name: "1/4\" (6.35mm) Single O-Flute (Acrylic/Aluminum)".into(),
            geometry: ToolGeometry::FlatEndmill {
                diameter_mm: 6.35,
                flute_length_mm: 19.0,
                flute_count: 1,
                flute_style: FluteStyle::OFlute,
            },
            overall_length_mm: 50.8,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(6.35, true),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 8,
            name: "1/8\" (3.175mm) Single O-Flute (Acrylic/Aluminum)".into(),
            geometry: ToolGeometry::FlatEndmill {
                diameter_mm: 3.175,
                flute_length_mm: 12.7,
                flute_count: 1,
                flute_style: FluteStyle::OFlute,
            },
            overall_length_mm: 38.1,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(3.175, true),
        },
        // --- 3D Carving Ballnose & Tapered Ballnose ---
        Tool {
            id: Uuid::new_v4(),
            number: 9,
            name: "1/4\" (6.35mm) 2-Flute Ballnose".into(),
            geometry: ToolGeometry::Ballnose {
                diameter_mm: 6.35,
                flute_length_mm: 22.0,
                flute_count: 2,
            },
            overall_length_mm: 63.5,
            holder: default_holder.clone(),
            presets: standard_presets_for_3d_finish(6.35),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 10,
            name: "1/8\" (3.175mm) 2-Flute Ballnose".into(),
            geometry: ToolGeometry::Ballnose {
                diameter_mm: 3.175,
                flute_length_mm: 12.7,
                flute_count: 2,
            },
            overall_length_mm: 38.1,
            holder: default_holder.clone(),
            presets: standard_presets_for_3d_finish(3.175),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 11,
            name: "Tapered Ballnose R0.25mm (0.5mm Tip, 5.4° Taper)".into(),
            geometry: ToolGeometry::TaperedBallnose {
                tip_radius_mm: 0.25,
                half_angle_deg: 5.4,
                shank_diameter_mm: 6.35,
                flute_length_mm: 30.0,
                flute_count: 2,
            },
            overall_length_mm: 75.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_3d_finish(0.5),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 12,
            name: "Tapered Ballnose R0.5mm (1.0mm Tip, 4.8° Taper)".into(),
            geometry: ToolGeometry::TaperedBallnose {
                tip_radius_mm: 0.5,
                half_angle_deg: 4.8,
                shank_diameter_mm: 6.35,
                flute_length_mm: 30.0,
                flute_count: 2,
            },
            overall_length_mm: 75.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_3d_finish(1.0),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 13,
            name: "Tapered Ballnose R1.0mm (2.0mm Tip, 3.6° Taper)".into(),
            geometry: ToolGeometry::TaperedBallnose {
                tip_radius_mm: 1.0,
                half_angle_deg: 3.6,
                shank_diameter_mm: 6.35,
                flute_length_mm: 30.0,
                flute_count: 2,
            },
            overall_length_mm: 75.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_3d_finish(2.0),
        },
        // --- V-Bits & Engraving ---
        Tool {
            id: Uuid::new_v4(),
            number: 14,
            name: "30° V-Bit (6.35mm Shank, Fine Detail)".into(),
            geometry: ToolGeometry::VBit {
                diameter_mm: 6.35,
                included_angle_deg: 30.0,
                tip_flat_mm: 0.1,
                flute_length_mm: 12.0,
                flute_count: 2,
            },
            overall_length_mm: 50.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_vbit(30.0),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 15,
            name: "60° V-Bit (12.7mm / 1/2\" Diameter)".into(),
            geometry: ToolGeometry::VBit {
                diameter_mm: 12.7,
                included_angle_deg: 60.0,
                tip_flat_mm: 0.0,
                flute_length_mm: 11.0,
                flute_count: 2,
            },
            overall_length_mm: 50.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_vbit(60.0),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 16,
            name: "90° V-Bit (12.7mm / 1/2\" Diameter)".into(),
            geometry: ToolGeometry::VBit {
                diameter_mm: 12.7,
                included_angle_deg: 90.0,
                tip_flat_mm: 0.0,
                flute_length_mm: 6.35,
                flute_count: 2,
            },
            overall_length_mm: 45.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_vbit(90.0),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 17,
            name: "120° V-Bit (25.4mm / 1\" Diameter)".into(),
            geometry: ToolGeometry::VBit {
                diameter_mm: 25.4,
                included_angle_deg: 120.0,
                tip_flat_mm: 0.0,
                flute_length_mm: 7.3,
                flute_count: 2,
            },
            overall_length_mm: 50.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_vbit(120.0),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 18,
            name: "20° Engraving Bit (0.2mm Tip, PhotoVCarve/Inlay)".into(),
            geometry: ToolGeometry::Engraving {
                shank_diameter_mm: 3.175,
                included_angle_deg: 20.0,
                tip_flat_mm: 0.2,
                flute_length_mm: 8.0,
            },
            overall_length_mm: 38.1,
            holder: default_holder.clone(),
            presets: standard_presets_for_vbit(20.0),
        },
        // --- Surfacing, Chamfer & Drill ---
        Tool {
            id: Uuid::new_v4(),
            number: 19,
            name: "1\" (25.4mm) Spoilboard Surfacing Bit".into(),
            geometry: ToolGeometry::Surfacing {
                diameter_mm: 25.4,
                flute_length_mm: 6.35,
                flute_count: 3,
            },
            overall_length_mm: 45.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(25.4, false),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 20,
            name: "90° Chamfer Mill (6.35mm)".into(),
            geometry: ToolGeometry::Chamfer {
                diameter_mm: 6.35,
                included_angle_deg: 90.0,
                tip_diameter_mm: 0.5,
                flute_length_mm: 6.0,
            },
            overall_length_mm: 50.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_vbit(90.0),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 21,
            name: "5mm Dowel / Twist Drill".into(),
            geometry: ToolGeometry::Drill {
                diameter_mm: 5.0,
                point_angle_deg: 118.0,
                flute_length_mm: 30.0,
            },
            overall_length_mm: 60.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(5.0, false),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 22,
            name: "8mm 2-Flute Upcut Flat Endmill".into(),
            geometry: ToolGeometry::FlatEndmill {
                diameter_mm: 8.0,
                flute_length_mm: 25.0,
                flute_count: 2,
                flute_style: FluteStyle::Upcut,
            },
            overall_length_mm: 65.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(8.0, false),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 23,
            name: "8mm Single O-Flute (Acrylic/Aluminum)".into(),
            geometry: ToolGeometry::FlatEndmill {
                diameter_mm: 8.0,
                flute_length_mm: 22.0,
                flute_count: 1,
                flute_style: FluteStyle::OFlute,
            },
            overall_length_mm: 60.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_flat(8.0, true),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 24,
            name: "6mm 2-Flute Ballnose".into(),
            geometry: ToolGeometry::Ballnose {
                diameter_mm: 6.0,
                flute_length_mm: 22.0,
                flute_count: 2,
            },
            overall_length_mm: 55.0,
            holder: default_holder.clone(),
            presets: standard_presets_for_3d_finish(6.0),
        },
        Tool {
            id: Uuid::new_v4(),
            number: 25,
            name: "8mm 2-Flute Ballnose".into(),
            geometry: ToolGeometry::Ballnose {
                diameter_mm: 8.0,
                flute_length_mm: 25.0,
                flute_count: 2,
            },
            overall_length_mm: 65.0,
            holder: default_holder,
            presets: standard_presets_for_3d_finish(8.0),
        },
    ]
}
