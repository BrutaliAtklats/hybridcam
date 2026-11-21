import React from "react";
import { ParamInput } from "../ParametricModal";
import { UI } from "../uiTheme";
import { VectorRole, VectorShape } from "../vectorSketch";

interface Props {
  sketchPlaneZMm: number;
  snapToGrid: boolean;
  snapStepMm: number;
  showDimensions: boolean;
  activeShape: VectorShape | null;
  resolvedShape: VectorShape | null;
  paramEnv: Record<string, number>;
  onChangeSnap: (v: boolean) => void;
  onChangeSnapStep: (step: number) => void;
  onChangeShowDimensions: (v: boolean) => void;
  onPatchShape: (id: string, patch: Partial<VectorShape>) => void;
  onApplyConstraint: (kind: "concentric" | "equal" | "alignH" | "alignV") => void;
  onProjectActiveSolid: () => void;
  onOpenSketchPattern: () => void;
  onFinishSketch: () => void;
}

export const FusionSketchPalette: React.FC<Props> = ({
  sketchPlaneZMm,
  snapToGrid,
  snapStepMm,
  showDimensions,
  activeShape,
  resolvedShape,
  paramEnv,
  onChangeSnap,
  onChangeSnapStep,
  onChangeShowDimensions,
  onPatchShape,
  onApplyConstraint,
  onProjectActiveSolid,
  onOpenSketchPattern,
  onFinishSketch,
}) => {
  const patchParam = (field: keyof VectorShape, numVal: number, expr?: string) => {
    if (!activeShape) return;
    const nextExprs = { ...(activeShape.paramExprs ?? {}) };
    if (expr) nextExprs[field] = expr;
    else delete nextExprs[field];
    onPatchShape(activeShape.id, {
      [field]: numVal,
      paramExprs: Object.keys(nextExprs).length ? nextExprs : undefined,
    } as Partial<VectorShape>);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 94,
        right: 14,
        width: 244,
        maxHeight: "calc(100% - 115px)",
        overflowY: "auto",
        zIndex: 32,
        display: "flex",
        flexDirection: "column",
        gap: 9,
        padding: 11,
        borderRadius: 6,
        background: "#2b2d30",
        border: "1px solid #44484e",
        boxShadow: "0 14px 36px rgba(0,0,0,0.6)",
        color: "#e5e7eb",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #3c3f44", paddingBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", color: "#ffffff" }}>SKETCH PALETTE</span>
        <span style={{ fontSize: 10, color: "#9aa0a6" }}>Z = {sketchPlaneZMm.toFixed(1)}mm</span>
      </div>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={snapToGrid} onChange={(e) => onChangeSnap(e.target.checked)} />
            <span>Snap to Grid</span>
          </label>
          <select
            value={snapStepMm}
            onChange={(e) => onChangeSnapStep(Number(e.target.value))}
            style={{ ...UI.input, width: 64, padding: "2px 4px", fontSize: 11 }}
          >
            <option value={1}>1 mm</option>
            <option value={2}>2 mm</option>
            <option value={5}>5 mm</option>
            <option value={10}>10 mm</option>
          </select>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={showDimensions} onChange={(e) => onChangeShowDimensions(e.target.checked)} />
          <span>Show Dimensions</span>
        </label>

        {activeShape && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: activeShape.construction ? "#fbbf24" : "#e2e8f0" }}>
            <input
              type="checkbox"
              checked={Boolean(activeShape.construction)}
              onChange={(e) => onPatchShape(activeShape.id, { construction: e.target.checked })}
            />
            <span>Construction Line (X)</span>
          </label>
        )}
      </div>

      {/* Geometric Constraints & Project */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: "1px solid #334155", paddingTop: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em" }}>CONSTRAINTS & PROJECT</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <button type="button" disabled={!activeShape} onClick={() => onApplyConstraint("concentric")} style={{ ...UI.btnSecondary, fontSize: 10, padding: "4px 6px" }}>
            ◎ Concentric
          </button>
          <button type="button" disabled={!activeShape} onClick={() => onApplyConstraint("equal")} style={{ ...UI.btnSecondary, fontSize: 10, padding: "4px 6px" }}>
            = Equal Size
          </button>
          <button type="button" disabled={!activeShape} onClick={() => onApplyConstraint("alignH")} style={{ ...UI.btnSecondary, fontSize: 10, padding: "4px 6px" }}>
            ― Horizontal
          </button>
          <button type="button" disabled={!activeShape} onClick={() => onApplyConstraint("alignV")} style={{ ...UI.btnSecondary, fontSize: 10, padding: "4px 6px" }}>
            | Vertical
          </button>
          <button type="button" onClick={onProjectActiveSolid} style={{ ...UI.btnSecondary, fontSize: 10, padding: "4px 6px", color: "#c084fc" }}>
            Project 3D (P)
          </button>
          <button type="button" disabled={!activeShape} onClick={onOpenSketchPattern} style={{ ...UI.btnSecondary, fontSize: 10, padding: "4px 6px", color: "#38bdf8" }}>
            ⊞ Pattern
          </button>
        </div>
      </div>

      {/* Selected Profile Parametric Editor */}
      {activeShape && resolvedShape && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, borderTop: "1px solid #334155", paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#93c5fd" }}>{activeShape.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <ParamInput
              label="Width"
              value={resolvedShape.widthMm}
              expr={activeShape.paramExprs?.widthMm}
              env={paramEnv}
              onChange={(v, ex) => patchParam("widthMm", Math.max(0.5, v), ex)}
            />
            <ParamInput
              label="Height"
              value={resolvedShape.heightMm}
              expr={activeShape.paramExprs?.heightMm}
              env={paramEnv}
              onChange={(v, ex) => patchParam("heightMm", Math.max(0.5, v), ex)}
            />
            <ParamInput
              label="Center X"
              value={resolvedShape.xMm}
              expr={activeShape.paramExprs?.xMm}
              env={paramEnv}
              onChange={(v, ex) => patchParam("xMm", v, ex)}
            />
            <ParamInput
              label="Center Y"
              value={resolvedShape.yMm}
              expr={activeShape.paramExprs?.yMm}
              env={paramEnv}
              onChange={(v, ex) => patchParam("yMm", v, ex)}
            />
            <ParamInput
              label="Corner R"
              value={resolvedShape.cornerRadiusMm}
              expr={activeShape.paramExprs?.cornerRadiusMm}
              env={paramEnv}
              onChange={(v, ex) => patchParam("cornerRadiusMm", Math.max(0, v), ex)}
            />
            <ParamInput
              label="Depth"
              value={resolvedShape.depthMm}
              expr={activeShape.paramExprs?.depthMm}
              env={paramEnv}
              onChange={(v, ex) => patchParam("depthMm", Math.max(0.5, v), ex)}
            />
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>CAM Role</span>
            <select
              value={activeShape.role}
              onChange={(e) => onPatchShape(activeShape.id, { role: e.target.value as VectorRole })}
              style={{ ...UI.input, padding: "4px 6px", fontSize: 11 }}
            >
              <option value="cutout">2D Cutout / Profile</option>
              <option value="carve">2D Pocket / Carve</option>
              <option value="vcarve">V-Carve / Engrave</option>
              <option value="model3d">3D Boss / Extrude</option>
            </select>
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={onFinishSketch}
        style={{
          padding: "8px 10px",
          borderRadius: 7,
          border: "none",
          background: "#16a34a",
          color: "#fff",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        ✓ FINISH SKETCH
      </button>
    </div>
  );
};
