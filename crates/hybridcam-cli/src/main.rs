use clap::{Parser, Subcommand};
use hybridcam_cam::{default_tool_library, MaterialPreset};

#[derive(Parser)]
#[command(name = "hybridcam-cli", about = "Headless HybridCAM kernel CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// List all built-in carving tools, endmills, and recommended feeds & speeds.
    ListTools {
        #[arg(long, default_value = "hardwood")]
        material: String,
    },
}

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Commands::ListTools { material } => {
            let mat = match material.to_lowercase().as_str() {
                "softwood" => MaterialPreset::Softwood,
                "mdf" | "plywood" => MaterialPreset::MdfPlywood,
                "acrylic" | "hdpe" => MaterialPreset::AcrylicHdpe,
                "aluminum" | "alu" => MaterialPreset::Aluminum6061,
                _ => MaterialPreset::Hardwood,
            };
            for tool in default_tool_library() {
                let cd = tool.recommended_for(mat);
                println!(
                    "T{:02} | {:48} | {} RPM | Feed {:.0} mm/min | Plunge {:.0} | Stepdown {:.2}mm | Stepover {:.0}%",
                    tool.number,
                    tool.name,
                    cd.spindle_rpm,
                    cd.feed_rate_mm_min,
                    cd.plunge_rate_mm_min,
                    cd.stepdown_mm,
                    cd.stepover_fraction * 100.0
                );
            }
        }
    }
}
