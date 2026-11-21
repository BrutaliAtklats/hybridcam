import React from "react";
import { DesignIcon } from "../DesignIcons";
import { SolidModelNode } from "../solidCsg";
import { VectorShape } from "../vectorSketch";

interface Props {
  shading: "material" | "clay" | "wireframe" | "heatmap";
  showAxesAndGrid: boolean;
  showStockOverlay: boolean;
  snap3dToFloor: boolean;
  vectorShapes: VectorShape[];
  activeVectorId: string;
  solidModels: SolidModelNode[];
  activeSolidId: string;
  rollbackIndex: number | null;
  onSetCameraPreset: (preset: "iso" | "top" | "front" | "side") => void;
  onSetShading: (s: "material" | "clay" | "wireframe") => void;
  onToggleAxesAndGrid: () => void;
  onToggleStockOverlay: () => void;
  onToggleFloorSnap: (on: boolean) => void;
  onEditSketch: (sk: VectorShape) => void;
  onSelectSolid: (id: string) => void;
  onEditSolid: (node: SolidModelNode) => void;
  onToggleSuppress: (id: string) => void;
  onSetRollbackIndex: (idx: number | null) => void;
}

/**
 * Autodesk Fusion 360-style Viewport Chrome:
 * - Top-Right 3D-styled ViewCube with Compass Ring & Home icon
 * - Bottom-Center Navigation & Display Settings Bar
 * - Bottom Full-Width Compact Square-Icon Parametric Timeline with Rollback Marker
 */
export const FusionViewportControls: React.FC<Props> = ({
  shading,
  showAxesAndGrid,
  showStockOverlay,
  snap3dToFloor,
  vectorShapes,
  activeVectorId,
  solidModels,
  activeSolidId,
  rollbackIndex,
  onSetCameraPreset,
  onSetShading,
  onToggleAxesAndGrid,
  onToggleStockOverlay,
  onToggleFloorSnap,
  onEditSketch,
  onSelectSolid,
  onEditSolid,
  onToggleSuppress,
  onSetRollbackIndex,
}) => {
  const effectiveRollback = rollbackIndex === null ? solidModels.length : Math.max(0, Math.min(solidModels.length, rollbackIndex));

  const faceStyle: React.CSSProperties = {
    border: "1px solid #52575e",
    background: "linear-gradient(145deg, #3c4046 0%, #2b2e33 100%)",
    color: "#e5e7eb",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <>
      {/* Top-Right Autodesk Fusion ViewCube (positioned cleanly below the docked ribbon) */}
      <div
        style={{
          position: "absolute",
          top: 94,
          right: 14,
          zIndex: 30,
          width: 96,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          userSelect: "none",
        }}
      >
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            title="Home View (Isometric)"
            onClick={() => onSetCameraPreset("iso")}
            style={{
              width: 22,
              height: 20,
              borderRadius: 4,
              border: "1px solid #4a4e54",
              background: "rgba(38, 40, 43, 0.92)",
              color: "#0696d7",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ⌂
          </button>
          <span style={{ fontSize: 8, fontWeight: 700, color: "#8b929a", letterSpacing: "0.08em" }}>N</span>
        </div>

        {/* 3D Isometric Cube Faces */}
        <div
          style={{
            width: 84,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 2,
            padding: 4,
            borderRadius: 8,
            background: "rgba(32, 34, 37, 0.85)",
            border: "1px solid #44484e",
            boxShadow: "0 8px 22px rgba(0,0,0,0.5)",
          }}
        >
          <button type="button" onClick={() => onSetCameraPreset("top")} style={{ ...faceStyle, gridColumn: "1 / span 2", height: 22, borderRadius: "4px 4px 2px 2px" }}>
            TOP
          </button>
          <button type="button" onClick={() => onSetCameraPreset("front")} style={{ ...faceStyle, height: 26, borderRadius: "2px 2px 2px 4px" }}>
            FRONT
          </button>
          <button type="button" onClick={() => onSetCameraPreset("side")} style={{ ...faceStyle, height: 26, borderRadius: "2px 2px 4px 2px" }}>
            RIGHT
          </button>
        </div>
      </div>

      {/* Bottom-Center Autodesk Fusion Navigation & Display Bar */}
      <div
        style={{
          position: "absolute",
          bottom: 42,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 26,
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "3px 6px",
          borderRadius: 6,
          background: "rgba(38, 40, 43, 0.92)",
          backdropFilter: "blur(8px)",
          border: "1px solid #44484e",
          boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
        }}
      >
        <button
          type="button"
          title="Fit to Window"
          onClick={() => onSetCameraPreset("iso")}
          style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "transparent", color: "#d4d7dc", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
        >
          ⛶ Fit
        </button>
        <div style={{ width: 1, height: 14, background: "#44484e" }} />
        {(["material", "clay", "wireframe"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSetShading(s)}
            style={{
              padding: "3px 8px",
              borderRadius: 4,
              border: "none",
              background: shading === s ? "#0696d7" : "transparent",
              color: shading === s ? "#fff" : "#9aa0a6",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {s === "wireframe" ? "Wire" : s === "material" ? "Shaded" : "Clay"}
          </button>
        ))}
        <div style={{ width: 1, height: 14, background: "#44484e" }} />
        <button
          type="button"
          onClick={onToggleAxesAndGrid}
          style={{
            padding: "3px 7px",
            borderRadius: 4,
            border: "none",
            background: showAxesAndGrid ? "rgba(6, 150, 215, 0.22)" : "transparent",
            color: showAxesAndGrid ? "#38bdf8" : "#8b929a",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ⊞ Grid
        </button>
        <button
          type="button"
          title="Toggle Translucent CNC Stock & Clearance Box"
          onClick={onToggleStockOverlay}
          style={{
            padding: "3px 7px",
            borderRadius: 4,
            border: "none",
            background: showStockOverlay ? "rgba(245, 158, 11, 0.22)" : "transparent",
            color: showStockOverlay ? "#fbbf24" : "#8b929a",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ⬚ Stock
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 4, color: snap3dToFloor ? "#4ade80" : "#9aa0a6", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "0 5px" }}>
          <input type="checkbox" checked={snap3dToFloor} onChange={(e) => onToggleFloorSnap(e.target.checked)} />
          Floor Snap
        </label>
      </div>

      {/* Bottom Full-Width Autodesk Fusion Parametric Timeline Bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 34,
          zIndex: 25,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 8px",
          background: "#202225",
          borderTop: "1px solid #3c3f44",
          overflowX: "auto",
          userSelect: "none",
        }}
      >
        {/* Transport / Rollback Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0, paddingRight: 6, borderRight: "1px solid #3c3f44" }}>
          <button type="button" title="Move to beginning" onClick={() => onSetRollbackIndex(0)} style={{ background: "transparent", border: "none", color: "#9aa0a6", cursor: "pointer", fontSize: 11, padding: "2px 4px" }}>|◀</button>
          <button type="button" title="Step backward" onClick={() => onSetRollbackIndex(Math.max(0, effectiveRollback - 1))} style={{ background: "transparent", border: "none", color: "#9aa0a6", cursor: "pointer", fontSize: 11, padding: "2px 4px" }}>◀</button>
          <button type="button" title="Step forward" onClick={() => onSetRollbackIndex(effectiveRollback + 1 >= solidModels.length ? null : effectiveRollback + 1)} style={{ background: "transparent", border: "none", color: "#9aa0a6", cursor: "pointer", fontSize: 11, padding: "2px 4px" }}>▶</button>
          <button type="button" title="Move to end" onClick={() => onSetRollbackIndex(null)} style={{ background: "transparent", border: "none", color: "#0696d7", cursor: "pointer", fontSize: 11, padding: "2px 4px" }}>▶|</button>
        </div>

        {vectorShapes.length === 0 && solidModels.length === 0 && (
          <span style={{ fontSize: 11, color: "#6c727a" }}>Design History Timeline</span>
        )}

        {/* Fusion-style Square Sketch Icons */}
        {vectorShapes.map((sk) => (
          <button
            key={sk.id}
            type="button"
            title={`${sk.name} (Click to Edit Sketch)`}
            onClick={() => onEditSketch(sk)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              height: 24,
              padding: "0 7px",
              borderRadius: 4,
              border: activeVectorId === sk.id ? "1px solid #0696d7" : "1px solid #3c3f44",
              background: "#2b2d30",
              color: "#38bdf8",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <DesignIcon name="vector" size={12} color="#38bdf8" />
            <span>{sk.name}</span>
          </button>
        ))}

        {/* Fusion-style Solid Feature Icons + Rollback Marker */}
        {solidModels.map((m, idx) => {
          const isRolledBack = idx >= effectiveRollback;
          const iconName =
            m.kind === "cone"
              ? "wedge"
              : m.kind === "loft"
              ? "extrude"
              : m.kind === "sweep"
              ? "pipe"
              : m.kind === "emboss"
              ? "text"
              : m.kind === "shell" || m.kind === "rib" || m.kind === "stlMesh"
              ? "box"
              : m.kind;
          return (
            <React.Fragment key={m.id}>
              {idx === effectiveRollback && (
                <div
                  title="Rollback History Marker"
                  style={{ width: 3, height: 24, borderRadius: 2, background: "#0696d7", flexShrink: 0 }}
                />
              )}
              <div
                title={`${m.name} (Double-click to Edit Feature)`}
                onClick={() => onSelectSolid(m.id)}
                onDoubleClick={() => onEditSolid(m)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  height: 24,
                  padding: "0 7px",
                  borderRadius: 4,
                  cursor: "pointer",
                  border: activeSolidId === m.id ? "1px solid #0696d7" : "1px solid #3c3f44",
                  background: isRolledBack ? "#1a1c1f" : m.boolOp === "subtract" ? "rgba(185, 28, 28, 0.25)" : "#2b2d30",
                  color: isRolledBack || m.suppressed ? "#6c727a" : "#e5e7eb",
                  fontSize: 10,
                  fontWeight: 600,
                  opacity: isRolledBack ? 0.4 : m.suppressed ? 0.55 : 1,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <DesignIcon name={iconName} size={12} color={m.boolOp === "subtract" ? "#f87171" : "#d4d7dc"} />
                <span>{m.name}</span>
                <button
                  type="button"
                  title={m.suppressed ? "Unsuppress Feature" : "Suppress Feature"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSuppress(m.id);
                  }}
                  style={{ background: "transparent", border: "none", color: m.suppressed ? "#4ade80" : "#8b929a", cursor: "pointer", fontSize: 9, padding: "0 1px" }}
                >
                  {m.suppressed ? "▶" : "⏸"}
                </button>
              </div>
            </React.Fragment>
          );
        })}
        {effectiveRollback === solidModels.length && solidModels.length > 0 && (
          <div
            title="End of History Marker"
            style={{ width: 3, height: 24, borderRadius: 2, background: "#0696d7", flexShrink: 0 }}
          />
        )}
      </div>
    </>
  );
};
