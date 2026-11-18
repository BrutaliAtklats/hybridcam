# Quickstart: HybridCAM Development Environment

**Feature**: `001-hybrid-cam-core` | **Date**: 2026-11-17

## Prerequisites

1. **Rust Toolchain** (1.80+):
   ```powershell
   winget install Rustlang.Rustup
   rustup default stable
   ```
2. **Node.js** (20+ LTS, already installed on this system) & **npm**.
3. **Tauri v2 Prerequisites** (Windows):
   - Microsoft C++ Build Tools (Desktop development with C++)
   - WebView2 Runtime (included on Windows 10/11)

## Workspace Verification Commands

```powershell
# Run all headless geometry, relief, toolpath, simulation, and post-processor tests
cargo test --workspace

# Run headless CLI smoke check
cargo run -p hybridcam-cli -- --help

# Launch the Tauri desktop application in dev mode
npm --prefix app install
npm --prefix app run tauri dev
```
