import React, { useState } from "react";
import { DesignIcon } from "../DesignIcons";
import { SolidModelNode } from "../solidCsg";
import { UI } from "../uiTheme";
import { VectorShape } from "../vectorSketch";
import { ConstructionPlane, OriginVisibility } from "./fusionTypes";

interface Props {
  stock: { widthMm: number; depthMm: number; thicknessMm: number };
  originVis: OriginVisibility;
  constructionPlanes: ConstructionPlane[];
  solidModels: SolidModelNode[];
  activeSolidId: string;
  vectorShapes: VectorShape[];
  activeVectorId: string;
  paramCount: number;
  onToggleOrigin: (patch: Partial<OriginVisibility>) => void;
  onSetCameraPreset: (preset: "iso" | "top" | "front" | "side") => void;
  onOpenParameters: () => void;
  onSelectSolid: (id: string) => void;
  onEditSolid: (node: SolidModelNode) => void;
  onExportSolidStl: (node: SolidModelNode) => void;
  onToggleSolidVis: (id: string) => void;
  onDeleteSolid: (id: string) => void;
  onSelectSketch: (id: string) => void;
  onEditSketch: (sk: VectorShape) => void;
  onExtrudeSketch: (sk: VectorShape) => void;
  onToggleSketchVis: (id: string) => void;
  onDeleteSketch: (id: string) => void;
  onSketchOnPlane: (zMm: number) => void;
  onTogglePlaneVis: (id: string) => void;
  onDeletePlane: (id: string) => void;
  onOpenOffsetPlaneDialog: () => void;
}

export const FusionBrowserTree: React.FC<Props> = (props) => {
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({
    doc: false,
    views: false,
    origin: true,
    construction: true,
    bodies: true,
    sketches: true,
  });

  const toggle = (k: string) => setOpenSec((s) => ({ ...s, [k]: !s[k] }));

  const headerRow = (key: string, label: string, count?: number, rightEl?: React.ReactNode) => (
    <div
      onClick={() => toggle(key)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 6px",
        borderRadius: 4,
        cursor: "pointer",
        background: "#26282b",
        borderBottom: "1px solid #35383d",
        fontSize: 11,
        fontWeight: 600,
        color: "#e5e7eb",
        userSelect: "none",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 9, color: "#64748b", width: 10 }}>{openSec[key] ? "▼" : "▶"}</span>
        <span>{label}</span>
        {count !== undefined && <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>({count})</span>}
      </span>
      <span onClick={(e) => e.stopPropagation()}>{rightEl}</span>
    </div>
  );

  const eyeBtn = (visible: boolean, onClick: () => void) => (
    <button
      type="button"
      title={visible ? "Hide" : "Show"}
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        color: visible ? "#38bdf8" : "#475569",
        cursor: "pointer",
        fontSize: 11,
        padding: "0 3px",
      }}
    >
      {visible ? "👁" : "⊘"}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "var(--hc-section-title, #93c5fd)" }}>
          BROWSER
        </span>
        <button
          type="button"
          onClick={props.onOpenParameters}
          style={{ ...UI.btnSecondary, fontSize: 10, padding: "2px 7px", color: "var(--hc-accent-secondary, #38bdf8)" }}
        >
          fx ({props.paramCount})
        </button>
      </div>

      {/* Document Settings */}
      {headerRow("doc", "Document Settings")}
      {openSec.doc && (
        <div style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--hc-muted, #94a3b8)" }}>
          <div>Units: <strong style={{ color: "var(--hc-text, #f1f5f9)" }}>mm</strong></div>
          <div>
            Stock: <strong style={{ color: "var(--hc-text, #f1f5f9)" }}>{props.stock.widthMm} × {props.stock.depthMm} × {props.stock.thicknessMm} mm</strong>
          </div>
        </div>
      )}

      {/* Named Views */}
      {headerRow("views", "Named Views")}
      {openSec.views && (
        <div style={{ paddingLeft: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {(
            [
              ["top", "TOP"],
              ["front", "FRONT"],
              ["side", "RIGHT"],
              ["iso", "HOME (ISO)"],
            ] as ["top" | "front" | "side" | "iso", string][]
          ).map(([p, lbl]) => (
            <button
              key={p}
              type="button"
              onClick={() => props.onSetCameraPreset(p)}
              style={{ ...UI.btnSecondary, fontSize: 10, padding: "3px 6px", textAlign: "left" }}
            >
              {lbl}
            </button>
          ))}
        </div>
      )}

      {/* Origin */}
      {headerRow(
        "origin",
        "Origin",
        undefined,
        eyeBtn(props.originVis.master, () => props.onToggleOrigin({ master: !props.originVis.master }))
      )}
      {openSec.origin && (
        <div style={{ paddingLeft: 14, display: "flex", flexDirection: "column", gap: 2, fontSize: 11 }}>
          {(
            [
              ["xy", "XY Plane (Top / Z=0)", 0],
              ["xz", "XZ Plane (Front)", 0],
              ["yz", "YZ Plane (Right)", 0],
            ] as [keyof OriginVisibility, string, number][]
          ).map(([k, lbl, z]) => (
            <div
              key={k}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "3px 6px",
                borderRadius: 4,
                color: props.originVis.master && props.originVis[k] ? "var(--hc-text, #e2e8f0)" : "#64748b",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {eyeBtn(props.originVis.master && props.originVis[k], () => props.onToggleOrigin({ [k]: !props.originVis[k] }))}
                <span>{lbl}</span>
              </span>
              {k === "xy" && (
                <button
                  type="button"
                  title="Sketch on XY Plane"
                  onClick={() => props.onSketchOnPlane(z)}
                  style={{ ...UI.btnSecondary, fontSize: 9, padding: "1px 5px" }}
                >
                  Sketch
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Construction Planes */}
      {headerRow(
        "construction",
        "Construction",
        props.constructionPlanes.length,
        <button
          type="button"
          onClick={props.onOpenOffsetPlaneDialog}
          style={{ ...UI.btnSecondary, fontSize: 9, padding: "1px 5px" }}
        >
          + Plane
        </button>
      )}
      {openSec.construction && (
        <div style={{ paddingLeft: 14, display: "flex", flexDirection: "column", gap: 2, fontSize: 11 }}>
          {props.constructionPlanes.length === 0 ? (
            <div style={{ fontSize: 10, color: "#64748b", padding: "2px 6px" }}>No offset planes yet</div>
          ) : (
            props.constructionPlanes.map((pl) => (
              <div
                key={pl.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "3px 6px",
                  borderRadius: 4,
                  background: "var(--hc-subpanel-bg, #111419)",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                  {eyeBtn(pl.visible, () => props.onTogglePlaneVis(pl.id))}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pl.name} ({pl.offsetMm}mm)
                  </span>
                </span>
                <span style={{ display: "flex", gap: 3 }}>
                  <button
                    type="button"
                    onClick={() => props.onSketchOnPlane(pl.offsetMm)}
                    style={{ ...UI.btnSecondary, fontSize: 9, padding: "1px 5px" }}
                  >
                    Sketch
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onDeletePlane(pl.id)}
                    style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 10 }}
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Bodies */}
      {headerRow("bodies", "Bodies", props.solidModels.length)}
      {openSec.bodies && (
        <div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 3 }}>
          {props.solidModels.length === 0 ? (
            <div style={{ fontSize: 10, color: "#64748b", padding: "3px 6px" }}>
              Use CREATE above (Extrude, Box, Cylinder, Shell...) to add bodies.
            </div>
          ) : (
            props.solidModels.map((m, idx) => {
              const isSel = m.id === props.activeSolidId;
              return (
                <div
                  key={m.id}
                  onClick={() => props.onSelectSolid(m.id)}
                  onDoubleClick={() => props.onEditSolid(m)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 4,
                    padding: "4px 6px",
                    borderRadius: 5,
                    cursor: "pointer",
                    fontSize: 11,
                    border: isSel ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid transparent",
                    background: isSel ? "rgba(37, 99, 235, 0.22)" : "var(--hc-subpanel-bg, #111419)",
                    opacity: m.visible && !m.suppressed ? 1 : 0.45,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                    {eyeBtn(m.visible, () => props.onToggleSolidVis(m.id))}
                    <DesignIcon
                      name={
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
                          : m.kind
                      }
                      size={12}
                      color="var(--hc-section-title, #93c5fd)"
                    />
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.name}
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <span
                      style={{
                        fontSize: 9,
                        padding: "1px 4px",
                        borderRadius: 3,
                        background: "#0f172a",
                        color: idx === 0 ? "#93c5fd" : m.boolOp === "subtract" ? "#f87171" : m.boolOp === "intersect" ? "#fbbf24" : "#4ade80",
                        fontWeight: 700,
                      }}
                    >
                      {idx === 0 ? "Base" : m.boolOp === "subtract" ? "Cut" : m.boolOp === "intersect" ? "Int" : "Join"}
                    </span>
                    <button
                      type="button"
                      title="Edit Feature (Operation Dialog)"
                      onClick={() => props.onEditSolid(m)}
                      style={{ ...UI.btnSecondary, fontSize: 9, padding: "1px 5px" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      title="Export Body as .STL"
                      onClick={() => props.onExportSolidStl(m)}
                      style={{ ...UI.btnSecondary, fontSize: 9, padding: "1px 4px", color: "#38bdf8" }}
                    >
                      STL
                    </button>
                    <button
                      type="button"
                      title="Delete Body"
                      onClick={() => props.onDeleteSolid(m.id)}
                      style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 10 }}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Sketches */}
      {headerRow("sketches", "Sketches", props.vectorShapes.length)}
      {openSec.sketches && (
        <div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 3 }}>
          {props.vectorShapes.length === 0 ? (
            <div style={{ fontSize: 10, color: "#64748b", padding: "3px 6px" }}>
              Click Create Sketch (K) to draw 2D profiles.
            </div>
          ) : (
            props.vectorShapes.map((sk) => {
              const isSel = sk.id === props.activeVectorId;
              return (
                <div
                  key={sk.id}
                  onClick={() => props.onSelectSketch(sk.id)}
                  onDoubleClick={() => props.onEditSketch(sk)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 4,
                    padding: "4px 6px",
                    borderRadius: 5,
                    cursor: "pointer",
                    fontSize: 11,
                    border: isSel ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid transparent",
                    background: isSel ? "rgba(37, 99, 235, 0.22)" : "var(--hc-subpanel-bg, #111419)",
                    opacity: sk.visible ? 1 : 0.45,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                    {eyeBtn(sk.visible, () => props.onToggleSketchVis(sk.id))}
                    <DesignIcon name="vector" size={12} color="#38bdf8" />
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sk.name}
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: 3, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      title="Edit Sketch"
                      onClick={() => props.onEditSketch(sk)}
                      style={{ ...UI.btnSecondary, fontSize: 9, padding: "1px 5px" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      title="Extrude Sketch"
                      onClick={() => props.onExtrudeSketch(sk)}
                      style={{ ...UI.btnSecondary, fontSize: 9, padding: "1px 5px", color: "#4ade80" }}
                    >
                      Ext
                    </button>
                    <button
                      type="button"
                      title="Delete Sketch"
                      onClick={() => props.onDeleteSketch(sk.id)}
                      style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 10 }}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
