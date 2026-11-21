import React, { useEffect } from "react";
import { ParamInput } from "../ParametricModal";
import { BooleanOp, resolveSolidNode, SolidModelNode } from "../solidCsg";
import { UI } from "../uiTheme";
import { VectorShape } from "../vectorSketch";
import {
  APPEARANCE_PRESETS,
  BOLT_HOLE_PRESETS,
  ConstructionPlane,
  FusionOpDialogState,
  SectionAnalysisState,
} from "./fusionTypes";

interface Props {
  dialog: FusionOpDialogState | null;
  stock: { widthMm: number; depthMm: number; thicknessMm: number };
  sketches: VectorShape[];
  solidModels: SolidModelNode[];
  constructionPlanes: ConstructionPlane[];
  activeSolid: SolidModelNode | null;
  sectionAnalysis: SectionAnalysisState;
  paramEnv: Record<string, number>;
  snap3dToFloor: boolean;
  onUpdateDialog: (next: FusionOpDialogState) => void;
  onChangeSectionAnalysis: (next: SectionAnalysisState) => void;
  onApplyAppearance: (hex: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onPickSketchPlane: (zMm: number) => void;
}

export const FusionOperationDialog: React.FC<Props> = ({
  dialog,
  stock,
  sketches,
  solidModels,
  constructionPlanes,
  activeSolid,
  sectionAnalysis,
  paramEnv,
  snap3dToFloor,
  onUpdateDialog,
  onChangeSectionAnalysis,
  onApplyAppearance,
  onConfirm,
  onCancel,
  onPickSketchPlane,
}) => {
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && dialog.kind !== "sketchPlane" && dialog.kind !== "measure") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== "INPUT" && tag !== "SELECT") {
          e.preventDefault();
          onConfirm();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, onConfirm, onCancel]);

  if (!dialog) return null;

  const draft = dialog.draftSolid;
  const resolvedDraft = draft ? resolveSolidNode(draft, paramEnv) : null;

  const patchDraft = (patch: Partial<SolidModelNode>) => {
    if (!draft) return;
    onUpdateDialog({ ...dialog, draftSolid: { ...draft, ...patch } });
  };

  const patchDraftParam = (field: keyof SolidModelNode, numVal: number, expr?: string) => {
    if (!draft) return;
    const nextExprs = { ...(draft.paramExprs ?? {}) };
    if (expr) nextExprs[field] = expr;
    else delete nextExprs[field];
    const extra: Partial<SolidModelNode> = {};
    if (field === "heightMm" && snap3dToFloor && draft.boolOp !== "subtract") {
      extra.zMm = Number((-stock.thicknessMm + numVal * 0.5).toFixed(2));
    }
    patchDraft({
      [field]: numVal,
      ...extra,
      paramExprs: Object.keys(nextExprs).length ? nextExprs : undefined,
    } as Partial<SolidModelNode>);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 196,
        right: 14,
        width: 274,
        maxHeight: "calc(100% - 246px)",
        overflowY: "auto",
        zIndex: 34,
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
      {/* Dialog Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #3c3f44", paddingBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "#ffffff" }}>
          {dialog.title}
        </span>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}
        >
          ✕
        </button>
      </div>

      {/* 1. CREATE SKETCH PLANE PICKER */}
      {dialog.kind === "sketchPlane" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Select a plane or face to start sketching:</div>
          <button type="button" onClick={() => onPickSketchPlane(0)} style={{ ...UI.btnAccentSmall, textAlign: "left", padding: "7px 10px" }}>
            XY Top of Stock (Z = 0.0 mm)
          </button>
          <button type="button" onClick={() => onPickSketchPlane(-stock.thicknessMm)} style={{ ...UI.btnSecondary, textAlign: "left", padding: "7px 10px" }}>
            XY Stock Floor (Z = {-stock.thicknessMm.toFixed(1)} mm)
          </button>
          <button type="button" onClick={() => onPickSketchPlane(-stock.thicknessMm * 0.5)} style={{ ...UI.btnSecondary, textAlign: "left", padding: "7px 10px" }}>
            XY Midplane (Z = {(-stock.thicknessMm * 0.5).toFixed(1)} mm)
          </button>
          {activeSolid && (
            <button
              type="button"
              onClick={() => onPickSketchPlane(Number((activeSolid.zMm + activeSolid.heightMm * 0.5).toFixed(2)))}
              style={{ ...UI.btnSecondary, textAlign: "left", padding: "7px 10px", color: "#4ade80" }}
            >
              {activeSolid.name} Top Face (Z = {(activeSolid.zMm + activeSolid.heightMm * 0.5).toFixed(1)} mm)
            </button>
          )}
          {constructionPlanes.map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => onPickSketchPlane(pl.offsetMm)}
              style={{ ...UI.btnSecondary, textAlign: "left", padding: "7px 10px", color: "#fbbf24" }}
            >
              {pl.name} ({pl.axis} · {pl.offsetMm.toFixed(1)} mm)
            </button>
          ))}
        </div>
      )}

      {/* 2. CREATE / EDIT SOLID FEATURE DIALOG */}
      {(dialog.kind === "createSolid" || dialog.kind === "editSolid") && draft && resolvedDraft && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Feature Name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => patchDraft({ name: e.target.value })}
              style={UI.input}
            />
          </label>

          {/* Operation: Join / Cut / Intersect */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Operation</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
              {(
                [
                  ["union", "Join / New", "#16a34a"],
                  ["subtract", "Cut", "#dc2626"],
                  ["intersect", "Intersect", "#d97706"],
                ] as [BooleanOp, string, string][]
              ).map(([op, lbl, col]) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => patchDraft({ boolOp: op })}
                  style={{
                    padding: "5px 4px",
                    borderRadius: 6,
                    border: `1px solid ${draft.boolOp === op ? col : "#334155"}`,
                    background: draft.boolOp === op ? col : "#0f172a",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Profile Sketch Selectors */}
          {(draft.kind === "extrude" || draft.kind === "loft" || draft.kind === "sweep") && sketches.length > 0 && (
            <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
              <span>{draft.kind === "loft" ? "Profile 1 (Bottom)" : draft.kind === "sweep" ? "Path Sketch" : "Profile Sketch"}</span>
              <select
                value={draft.sketchId ?? ""}
                onChange={(e) => {
                  const sk = sketches.find((s) => s.id === e.target.value);
                  patchDraft({
                    sketchId: e.target.value,
                    ...(sk ? { xMm: sk.xMm, yMm: sk.yMm, widthMm: sk.widthMm, depthMm: sk.heightMm, rotZDeg: sk.rotationDeg } : {}),
                  });
                }}
                style={UI.input}
              >
                {sketches.map((sk) => (
                  <option key={sk.id} value={sk.id}>{sk.name}</option>
                ))}
              </select>
            </label>
          )}

          {draft.kind === "loft" && sketches.length > 1 && (
            <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
              <span>Profile 2 (Top)</span>
              <select
                value={draft.sketchId2 ?? ""}
                onChange={(e) => patchDraft({ sketchId2: e.target.value || undefined })}
                style={UI.input}
              >
                <option value="">Auto-Tapered Circle</option>
                {sketches.map((sk) => (
                  <option key={sk.id} value={sk.id}>{sk.name}</option>
                ))}
              </select>
            </label>
          )}

          {/* Parametric Size Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
            <ParamInput label="W (X)" value={resolvedDraft.widthMm} expr={draft.paramExprs?.widthMm} env={paramEnv} onChange={(v, ex) => patchDraftParam("widthMm", Math.max(0.5, v), ex)} />
            <ParamInput label="D (Y)" value={resolvedDraft.depthMm} expr={draft.paramExprs?.depthMm} env={paramEnv} onChange={(v, ex) => patchDraftParam("depthMm", Math.max(0.5, v), ex)} />
            <ParamInput label="H / Dist" value={resolvedDraft.heightMm} expr={draft.paramExprs?.heightMm} env={paramEnv} onChange={(v, ex) => patchDraftParam("heightMm", Math.max(0.5, v), ex)} />
            <ParamInput label="Pos X" value={resolvedDraft.xMm} expr={draft.paramExprs?.xMm} env={paramEnv} onChange={(v, ex) => patchDraftParam("xMm", v, ex)} />
            <ParamInput label="Pos Y" value={resolvedDraft.yMm} expr={draft.paramExprs?.yMm} env={paramEnv} onChange={(v, ex) => patchDraftParam("yMm", v, ex)} />
            <ParamInput label="Pos Z" value={resolvedDraft.zMm} expr={draft.paramExprs?.zMm} env={paramEnv} onChange={(v, ex) => patchDraftParam("zMm", v, ex)} />
          </div>

          {/* Feature-specific Fusion parameters */}
          {draft.kind === "emboss" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
              <span>Emboss / Deboss Text</span>
              <input
                type="text"
                value={draft.embossText ?? "HYBRIDCAM"}
                onChange={(e) => patchDraft({ embossText: e.target.value })}
                style={{ ...UI.input, fontWeight: 700 }}
              />
            </label>
          )}
          {draft.kind === "extrude" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Direction</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                {(
                  [
                    ["oneSide", "One Side"],
                    ["symmetric", "Symmetric"],
                    ["twoSides", "Two Sides"],
                  ] as ["oneSide" | "symmetric" | "twoSides", string][]
                ).map(([dir, lbl]) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => patchDraft({ extrudeDir: dir })}
                    style={{
                      padding: "4px 4px",
                      borderRadius: 5,
                      border: `1px solid ${(draft.extrudeDir ?? "oneSide") === dir ? "#0696d7" : "#3c3f44"}`,
                      background: (draft.extrudeDir ?? "oneSide") === dir ? "#0696d7" : "#202225",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {draft.extrudeDir === "twoSides" && (
                <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                  <span>Side 2 Distance (mm)</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={draft.heightMm2 ?? Number((draft.heightMm * 0.5).toFixed(1))}
                    onChange={(e) => patchDraft({ heightMm2: Math.max(0.5, Number(e.target.value)) })}
                    style={UI.input}
                  />
                </label>
              )}
            </div>
          )}
          {(draft.kind === "extrude" || draft.kind === "loft" || draft.kind === "box" || draft.kind === "cylinder") && (
            <ParamInput label="Draft / Taper Angle" unit="°" value={resolvedDraft.taperDeg ?? 0} expr={draft.paramExprs?.taperDeg} env={paramEnv} onChange={(v, ex) => patchDraftParam("taperDeg", Math.max(-45, Math.min(45, v)), ex)} />
          )}
          {draft.kind === "revolve" && (
            <ParamInput label="Revolve Angle" unit="°" value={resolvedDraft.revolveDeg ?? 360} expr={draft.paramExprs?.revolveDeg} env={paramEnv} onChange={(v, ex) => patchDraftParam("revolveDeg", Math.max(15, Math.min(360, v)), ex)} />
          )}
          {(draft.kind === "shell" || draft.kind === "sweep" || draft.kind === "rib") && (
            <ParamInput
              label={draft.kind === "shell" ? "Wall Thickness" : draft.kind === "rib" ? "Rib Thickness" : "Tube Diameter"}
              value={resolvedDraft.wallThicknessMm ?? 3}
              expr={draft.paramExprs?.wallThicknessMm}
              env={paramEnv}
              onChange={(v, ex) => patchDraftParam("wallThicknessMm", Math.max(0.5, v), ex)}
            />
          )}
          {draft.kind === "hole" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Standard Bolt Presets</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                {BOLT_HOLE_PRESETS.map((bp) => (
                  <button
                    key={bp.id}
                    type="button"
                    onClick={() =>
                      patchDraft({
                        name: `${bp.label} Hole`,
                        widthMm: bp.clearanceMm,
                        depthMm: bp.clearanceMm,
                        counterboreDiamMm: bp.cbDiamMm,
                        counterboreDepthMm: bp.cbDepthMm,
                      })
                    }
                    style={{
                      padding: "3px 4px",
                      borderRadius: 4,
                      border: "1px solid #3c3f44",
                      background: "#202225",
                      color: "#38bdf8",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {bp.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Hole Type</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                {(["simple", "counterbore", "countersink"] as const).map((ht) => (
                  <button
                    key={ht}
                    type="button"
                    onClick={() => patchDraft({ holeType: ht })}
                    style={{
                      padding: "4px 4px",
                      borderRadius: 5,
                      border: `1px solid ${(draft.holeType ?? "simple") === ht ? "#38bdf8" : "#334155"}`,
                      background: (draft.holeType ?? "simple") === ht ? "#2563eb" : "#0f172a",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {ht}
                  </button>
                ))}
              </div>
              {(draft.holeType === "counterbore" || draft.holeType === "countersink") && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                    <span>Head Ø (mm)</span>
                    <input
                      type="number"
                      step="0.5"
                      value={draft.counterboreDiamMm ?? Number((draft.widthMm * 1.6).toFixed(1))}
                      onChange={(e) => patchDraft({ counterboreDiamMm: Math.max(draft.widthMm + 1, Number(e.target.value)) })}
                      style={UI.input}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                    <span>Head Depth (mm)</span>
                    <input
                      type="number"
                      step="0.5"
                      value={draft.counterboreDepthMm ?? 4}
                      onChange={(e) => patchDraft({ counterboreDepthMm: Math.max(0.5, Number(e.target.value)) })}
                      style={UI.input}
                    />
                  </label>
                </div>
              )}
            </div>
          )}
          {(draft.kind === "box" || draft.kind === "extrude" || draft.kind === "pipe") && (
            <ParamInput label="Fillet / Chamfer" value={resolvedDraft.bevelMm} expr={draft.paramExprs?.bevelMm} env={paramEnv} onChange={(v, ex) => patchDraftParam("bevelMm", Math.max(0, v), ex)} />
          )}
        </div>
      )}

      {/* 3. FILLET / CHAMFER DIALOG */}
      {(dialog.kind === "fillet" || dialog.kind === "chamfer") && draft && resolvedDraft && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Target Body: <strong style={{ color: "#f8fafc" }}>{draft.name}</strong></div>
          <ParamInput
            label={dialog.kind === "chamfer" ? "Chamfer Distance (45°)" : "Fillet Radius (mm)"}
            value={resolvedDraft.bevelMm}
            expr={draft.paramExprs?.bevelMm}
            env={paramEnv}
            onChange={(v, ex) => patchDraftParam("bevelMm", Math.max(0, Math.min(12, v)), ex)}
          />
        </div>
      )}

      {/* 3b. FUSION 360 MOVE / COPY (M) DIALOG */}
      {dialog.kind === "moveCopy" && draft && dialog.origSolid && (() => {
        const orig = dialog.origSolid;
        const dx = dialog.moveDx ?? 0;
        const dy = dialog.moveDy ?? 0;
        const dz = dialog.moveDz ?? 0;
        const rx = dialog.moveRx ?? 0;
        const ry = dialog.moveRy ?? 0;
        const rz = dialog.moveRz ?? 0;
        const mode = dialog.moveMode ?? "free";
        const updateDelta = (patch: Partial<FusionOpDialogState>) => {
          const next = { ...dialog, ...patch };
          const ndx = next.moveDx ?? 0;
          const ndy = next.moveDy ?? 0;
          const ndz = next.moveDz ?? 0;
          const nrx = next.moveRx ?? 0;
          const nry = next.moveRy ?? 0;
          const nrz = next.moveRz ?? 0;
          onUpdateDialog({
            ...next,
            draftSolid: {
              ...orig,
              id: next.moveCreateCopy ? `solid-${Date.now()}-copy` : orig.id,
              name: next.moveCreateCopy ? `${orig.name} (Copy)` : orig.name,
              xMm: Number((orig.xMm + ndx).toFixed(2)),
              yMm: Number((orig.yMm + ndy).toFixed(2)),
              zMm: Number((orig.zMm + ndz).toFixed(2)),
              rotXDeg: Number((orig.rotXDeg + nrx).toFixed(1)),
              rotYDeg: Number((orig.rotYDeg + nry).toFixed(1)),
              rotZDeg: Number((orig.rotZDeg + nrz).toFixed(1)),
            },
          });
        };
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Selection: <strong style={{ color: "#f8fafc" }}>{orig.name}</strong></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
              {(
                [
                  ["free", "Free Move"],
                  ["translate", "Translate"],
                  ["rotate", "Rotate"],
                ] as ["free" | "translate" | "rotate", string][]
              ).map(([m, lbl]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateDelta({ moveMode: m })}
                  style={{
                    padding: "4px 4px",
                    borderRadius: 5,
                    border: `1px solid ${mode === m ? "#38bdf8" : "#334155"}`,
                    background: mode === m ? "#2563eb" : "#0f172a",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
            {(mode === "free" || mode === "translate") && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#f87171" }}>
                  <span>X Dist (mm)</span>
                  <input type="number" step="1" value={dx} onChange={(e) => updateDelta({ moveDx: Number(e.target.value) })} style={UI.input} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#4ade80" }}>
                  <span>Y Dist (mm)</span>
                  <input type="number" step="1" value={dy} onChange={(e) => updateDelta({ moveDy: Number(e.target.value) })} style={UI.input} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#60a5fa" }}>
                  <span>Z Dist (mm)</span>
                  <input type="number" step="1" value={dz} onChange={(e) => updateDelta({ moveDz: Number(e.target.value) })} style={UI.input} />
                </label>
              </div>
            )}
            {(mode === "free" || mode === "rotate") && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#f87171" }}>
                  <span>X Angle (°)</span>
                  <input type="number" step="5" value={rx} onChange={(e) => updateDelta({ moveRx: Number(e.target.value) })} style={UI.input} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#4ade80" }}>
                  <span>Y Angle (°)</span>
                  <input type="number" step="5" value={ry} onChange={(e) => updateDelta({ moveRy: Number(e.target.value) })} style={UI.input} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#60a5fa" }}>
                  <span>Z Angle (°)</span>
                  <input type="number" step="5" value={rz} onChange={(e) => updateDelta({ moveRz: Number(e.target.value) })} style={UI.input} />
                </label>
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#e2e8f0", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={Boolean(dialog.moveCreateCopy)}
                onChange={(e) => updateDelta({ moveCreateCopy: e.target.checked })}
              />
              <span>Create Copy</span>
            </label>
          </div>
        );
      })()}

      {/* 3c. SCALE DIALOG */}
      {dialog.kind === "scale" && draft && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={dialog.scaleUniform !== false}
              onChange={(e) => onUpdateDialog({ ...dialog, scaleUniform: e.target.checked })}
            />
            <span>Uniform Scale</span>
          </label>
          {dialog.scaleUniform !== false ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
              <span>Scale Factor</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={draft.scaleX ?? 1}
                onChange={(e) => {
                  const s = Math.max(0.1, Number(e.target.value) || 1);
                  patchDraft({ scaleX: s, scaleY: s, scaleZ: s });
                }}
                style={UI.input}
              />
            </label>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                <span>Scale X</span>
                <input type="number" step="0.1" min="0.1" value={draft.scaleX ?? 1} onChange={(e) => patchDraft({ scaleX: Math.max(0.1, Number(e.target.value) || 1) })} style={UI.input} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                <span>Scale Y</span>
                <input type="number" step="0.1" min="0.1" value={draft.scaleY ?? 1} onChange={(e) => patchDraft({ scaleY: Math.max(0.1, Number(e.target.value) || 1) })} style={UI.input} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                <span>Scale Z</span>
                <input type="number" step="0.1" min="0.1" value={draft.scaleZ ?? 1} onChange={(e) => patchDraft({ scaleZ: Math.max(0.1, Number(e.target.value) || 1) })} style={UI.input} />
              </label>
            </div>
          )}
        </div>
      )}

      {/* 3d. ALIGN DIALOG */}
      {dialog.kind === "align" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Alignment Mode</span>
            <select
              value={dialog.alignMode ?? "floor"}
              onChange={(e) => onUpdateDialog({ ...dialog, alignMode: e.target.value as FusionOpDialogState["alignMode"] })}
              style={UI.input}
            >
              <option value="floor">Bottom to Stock Floor</option>
              <option value="centerXY">Center at Origin (X=0, Y=0)</option>
              <option value="topOfTarget">Stack on Top of Target Body</option>
              <option value="centerOfTarget">Center on Target Body (X, Y)</option>
            </select>
          </label>
          {(dialog.alignMode === "topOfTarget" || dialog.alignMode === "centerOfTarget") && solidModels.length > 1 && (
            <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
              <span>Target Body</span>
              <select
                value={dialog.alignTargetId ?? solidModels[0]?.id ?? ""}
                onChange={(e) => onUpdateDialog({ ...dialog, alignTargetId: e.target.value })}
                style={UI.input}
              >
                {solidModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {/* 3e. COMBINE DIALOG */}
      {dialog.kind === "combine" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Tool Body (Boolean Operation Target)</span>
            <select
              value={dialog.combineToolId ?? activeSolid?.id ?? ""}
              onChange={(e) => onUpdateDialog({ ...dialog, combineToolId: e.target.value })}
              style={UI.input}
            >
              {solidModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
            {(
              [
                ["union", "Join", "#16a34a"],
                ["subtract", "Cut", "#dc2626"],
                ["intersect", "Intersect", "#d97706"],
              ] as [BooleanOp, string, string][]
            ).map(([op, lbl, col]) => (
              <button
                key={op}
                type="button"
                onClick={() => onUpdateDialog({ ...dialog, combineOp: op })}
                style={{
                  padding: "5px 4px",
                  borderRadius: 5,
                  border: `1px solid ${(dialog.combineOp ?? "subtract") === op ? col : "#334155"}`,
                  background: (dialog.combineOp ?? "subtract") === op ? col : "#0f172a",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(dialog.combineKeepTools)}
              onChange={(e) => onUpdateDialog({ ...dialog, combineKeepTools: e.target.checked })}
            />
            <span>Keep Tool Body (Duplicate)</span>
          </label>
        </div>
      )}

      {/* 3f. SPLIT BODY DIALOG */}
      {dialog.kind === "splitBody" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Splits the active body into two independent bodies along a plane:</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
            {(["X", "Y", "Z"] as const).map((ax) => (
              <button
                key={ax}
                type="button"
                onClick={() => onUpdateDialog({ ...dialog, splitAxis: ax })}
                style={{
                  padding: "5px",
                  borderRadius: 5,
                  border: `1px solid ${(dialog.splitAxis ?? "X") === ax ? "#38bdf8" : "#334155"}`,
                  background: (dialog.splitAxis ?? "X") === ax ? "#2563eb" : "#0f172a",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Split {ax}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Split Plane Offset (mm)</span>
            <input type="number" step="1" value={dialog.splitPosMm ?? 0} onChange={(e) => onUpdateDialog({ ...dialog, splitPosMm: Number(e.target.value) })} style={UI.input} />
          </label>
        </div>
      )}

      {/* 3g. SECTION ANALYSIS (LIVE CROSS-SECTION) */}
      {dialog.kind === "sectionAnalysis" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={sectionAnalysis.enabled}
              onChange={(e) => onChangeSectionAnalysis({ ...sectionAnalysis, enabled: e.target.checked })}
            />
            <span>Enable Live Cross-Section</span>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
            {(["x", "y", "z"] as const).map((ax) => (
              <button
                key={ax}
                type="button"
                onClick={() => onChangeSectionAnalysis({ ...sectionAnalysis, enabled: true, axis: ax })}
                style={{
                  padding: "5px",
                  borderRadius: 5,
                  border: `1px solid ${sectionAnalysis.axis === ax ? "#38bdf8" : "#334155"}`,
                  background: sectionAnalysis.axis === ax ? "#2563eb" : "#0f172a",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 11,
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Slice {ax}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#94a3b8" }}>
            <span>Cut Plane Offset: <strong style={{ color: "#f8fafc" }}>{sectionAnalysis.offsetMm.toFixed(1)} mm</strong></span>
            <input
              type="range"
              min={-Math.max(stock.widthMm, stock.depthMm) * 0.5}
              max={Math.max(stock.widthMm, stock.depthMm) * 0.5}
              step={0.5}
              value={sectionAnalysis.offsetMm}
              onChange={(e) => onChangeSectionAnalysis({ ...sectionAnalysis, enabled: true, offsetMm: Number(e.target.value) })}
            />
          </label>
          <button
            type="button"
            onClick={() => onChangeSectionAnalysis({ ...sectionAnalysis, flipped: !sectionAnalysis.flipped })}
            style={UI.btnSecondary}
          >
            Flip Section Direction
          </button>
        </div>
      )}

      {/* 3h. APPEARANCE / MATERIAL LIBRARY */}
      {dialog.kind === "appearance" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {APPEARANCE_PRESETS.map((ap) => (
            <button
              key={ap.id}
              type="button"
              onClick={() => onApplyAppearance(ap.hex)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 7px",
                borderRadius: 6,
                border: activeSolid?.colorHex === ap.hex ? "1px solid #38bdf8" : "1px solid #334155",
                background: "#0f172a",
                color: "#e2e8f0",
                fontSize: 11,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ width: 14, height: 14, borderRadius: 4, background: ap.hex, border: "1px solid rgba(255,255,255,0.25)", flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ap.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* 3i. SKETCH PATTERN DIALOG */}
      {dialog.kind === "sketchPattern" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {(
              [
                ["rect", "Rectangular"],
                ["circ", "Circular (Bolt Circle)"],
              ] as ["rect" | "circ", string][]
            ).map(([t, lbl]) => (
              <button
                key={t}
                type="button"
                onClick={() => onUpdateDialog({ ...dialog, sketchPatternType: t })}
                style={{
                  padding: "5px",
                  borderRadius: 5,
                  border: `1px solid ${(dialog.sketchPatternType ?? "rect") === t ? "#38bdf8" : "#334155"}`,
                  background: (dialog.sketchPatternType ?? "rect") === t ? "#2563eb" : "#0f172a",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
          {(dialog.sketchPatternType ?? "rect") === "rect" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                <span>Count X</span>
                <input type="number" min={1} max={12} value={dialog.countX ?? 3} onChange={(e) => onUpdateDialog({ ...dialog, countX: Number(e.target.value) })} style={UI.input} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                <span>Spacing X</span>
                <input type="number" step="1" value={dialog.spacingX ?? 20} onChange={(e) => onUpdateDialog({ ...dialog, spacingX: Number(e.target.value) })} style={UI.input} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                <span>Count Y</span>
                <input type="number" min={1} max={12} value={dialog.countY ?? 2} onChange={(e) => onUpdateDialog({ ...dialog, countY: Number(e.target.value) })} style={UI.input} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                <span>Spacing Y</span>
                <input type="number" step="1" value={dialog.spacingY ?? 20} onChange={(e) => onUpdateDialog({ ...dialog, spacingY: Number(e.target.value) })} style={UI.input} />
              </label>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                <span>Quantity</span>
                <input type="number" min={2} max={24} value={dialog.circCount ?? 6} onChange={(e) => onUpdateDialog({ ...dialog, circCount: Number(e.target.value) })} style={UI.input} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
                <span>Bolt Circle R (mm)</span>
                <input type="number" min={2} step="1" value={dialog.circRadius ?? 25} onChange={(e) => onUpdateDialog({ ...dialog, circRadius: Number(e.target.value) })} style={UI.input} />
              </label>
            </div>
          )}
        </div>
      )}

      {/* 3j. SKETCH OFFSET DIALOG (+ / - with Flip button) */}
      {dialog.kind === "sketchOffset" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, color: "#9aa0a6" }}>
            Positive (<code>+</code>) offsets outward; negative (<code>-</code>) offsets inward.
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8", flex: 1 }}>
              <span>Offset Position (mm)</span>
              <input
                type="number"
                step="0.5"
                value={dialog.sketchOffsetMm ?? 2}
                onChange={(e) => onUpdateDialog({ ...dialog, sketchOffsetMm: Number(e.target.value) })}
                style={UI.input}
                autoFocus
              />
            </label>
            <button
              type="button"
              title="Flip Offset Direction (+ / -)"
              onClick={() => onUpdateDialog({ ...dialog, sketchOffsetMm: Number((-(dialog.sketchOffsetMm ?? 2)).toFixed(2)) })}
              style={{ ...UI.btnSecondary, padding: "6px 10px", fontWeight: 700, color: "#38bdf8" }}
            >
              ⇄ Flip ({(dialog.sketchOffsetMm ?? 2) >= 0 ? "+" : "-"})
            </button>
          </div>
        </div>
      )}

      {/* 4. OFFSET CONSTRUCTION PLANE DIALOG */}
      {dialog.kind === "offsetPlane" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Plane Name</span>
            <input type="text" value={dialog.planeName ?? "Plane 1"} onChange={(e) => onUpdateDialog({ ...dialog, planeName: e.target.value })} style={UI.input} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Offset Z Distance (mm from Top Z=0)</span>
            <input type="number" step="1" value={dialog.planeOffsetMm ?? 0} onChange={(e) => onUpdateDialog({ ...dialog, planeOffsetMm: Number(e.target.value) })} style={UI.input} />
          </label>
        </div>
      )}

      {/* 5. RECTANGULAR PATTERN DIALOG */}
      {dialog.kind === "rectPattern" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Count X</span>
            <input type="number" min={1} max={10} value={dialog.countX ?? 3} onChange={(e) => onUpdateDialog({ ...dialog, countX: Math.max(1, Math.min(10, Number(e.target.value))) })} style={UI.input} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Spacing X (mm)</span>
            <input type="number" step="1" value={dialog.spacingX ?? 25} onChange={(e) => onUpdateDialog({ ...dialog, spacingX: Number(e.target.value) })} style={UI.input} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Count Y</span>
            <input type="number" min={1} max={10} value={dialog.countY ?? 1} onChange={(e) => onUpdateDialog({ ...dialog, countY: Math.max(1, Math.min(10, Number(e.target.value))) })} style={UI.input} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Spacing Y (mm)</span>
            <input type="number" step="1" value={dialog.spacingY ?? 25} onChange={(e) => onUpdateDialog({ ...dialog, spacingY: Number(e.target.value) })} style={UI.input} />
          </label>
        </div>
      )}

      {/* 6. CIRCULAR PATTERN DIALOG */}
      {dialog.kind === "circPattern" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Quantity</span>
            <input type="number" min={2} max={24} value={dialog.circCount ?? 6} onChange={(e) => onUpdateDialog({ ...dialog, circCount: Math.max(2, Math.min(24, Number(e.target.value))) })} style={UI.input} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#94a3b8" }}>
            <span>Orbit Radius (mm)</span>
            <input type="number" min={5} step="1" value={dialog.circRadius ?? 30} onChange={(e) => onUpdateDialog({ ...dialog, circRadius: Math.max(1, Number(e.target.value)) })} style={UI.input} />
          </label>
        </div>
      )}

      {/* 7. MIRROR DIALOG */}
      {dialog.kind === "mirror" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Mirror Plane:</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {(["X", "Y"] as const).map((ax) => (
              <button
                key={ax}
                type="button"
                onClick={() => onUpdateDialog({ ...dialog, mirrorAxis: ax })}
                style={{
                  padding: "7px 8px",
                  borderRadius: 6,
                  border: `1px solid ${(dialog.mirrorAxis ?? "X") === ax ? "#38bdf8" : "#334155"}`,
                  background: (dialog.mirrorAxis ?? "X") === ax ? "#2563eb" : "#0f172a",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Across {ax} = 0
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 8. MEASURE / INSPECT DIALOG */}
      {dialog.kind === "measure" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
          {activeSolid ? (
            <>
              <div>Selected Body: <strong>{activeSolid.name}</strong></div>
              <div>Bounding Box: <strong>{activeSolid.widthMm.toFixed(2)} × {activeSolid.depthMm.toFixed(2)} × {activeSolid.heightMm.toFixed(2)} mm</strong></div>
              <div>Center (X, Y, Z): <strong>({activeSolid.xMm.toFixed(1)}, {activeSolid.yMm.toFixed(1)}, {activeSolid.zMm.toFixed(1)}) mm</strong></div>
              <div>Approx. Volume: <strong>{((activeSolid.widthMm * activeSolid.depthMm * activeSolid.heightMm) / 1000).toFixed(2)} cm³</strong></div>
            </>
          ) : (
            <div style={{ color: "#94a3b8" }}>Select a body in the Browser to inspect its exact dimensions and volume.</div>
          )}
        </div>
      )}

      {/* OK / Cancel Footer */}
      {dialog.kind !== "sketchPlane" && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, borderTop: "1px solid #334155", paddingTop: 8 }}>
          <button type="button" onClick={onCancel} style={{ ...UI.btnSecondary, padding: "5px 12px" }}>
            {dialog.kind === "measure" || dialog.kind === "sectionAnalysis" || dialog.kind === "appearance" ? "Close" : "Cancel"}
          </button>
          {dialog.kind !== "measure" && dialog.kind !== "sectionAnalysis" && dialog.kind !== "appearance" && (
            <button type="button" onClick={onConfirm} style={{ ...UI.btnAccentSmall, padding: "5px 16px" }}>
              OK
            </button>
          )}
        </div>
      )}
    </div>
  );
};
