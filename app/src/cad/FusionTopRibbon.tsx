import React, { useEffect, useRef, useState } from "react";
import { DesignIcon, DesignIconName } from "../DesignIcons";
import { LayoutToolMode } from "../PictureLayoutView";
import { BooleanOp, SolidPrimitiveKind } from "../solidCsg";
import { SketchToolMode } from "../VectorSketchView";

interface Props {
  designMode: "picture" | "model3d";
  isSketching: boolean;
  enablePictureMode: boolean;
  enableVectorMode: boolean;
  enable3dModelMode: boolean;
  paramCount: number;
  // Photo tools
  photoTool: LayoutToolMode;
  hasActiveLayer: boolean;
  onSetPhotoTool: (t: LayoutToolMode) => void;
  onCenterPhotoX: () => void;
  onCenterPhotoY: () => void;
  onDeletePhotoLayer: () => void;
  // Sketch tools
  sketchTool: SketchToolMode;
  hasActiveSketch: boolean;
  onSetSketchTool: (t: SketchToolMode) => void;
  onAddSketchText: () => void;
  onOpenSketchOffsetDialog: () => void;
  onMirrorSketchX: () => void;
  onCenterSketch: () => void;
  onFilletSketchCorner: () => void;
  onDeleteSketch: () => void;
  onFinishSketch: () => void;
  onImportSvgFile: (file: File) => void;
  onImportDxfFile: (file: File) => void;
  onImportStlSolidFile: (file: File) => void;
  onSendSolidToCam: () => void;
  // Solid tools
  hasActiveSolid: boolean;
  onSetDesignMode: (m: "picture" | "model3d") => void;
  onToggleInclude: (which: "picture" | "vector" | "model3d", val: boolean) => void;
  onOpenSketchPlanePicker: () => void;
  onOpenCreateSolid: (kind: SolidPrimitiveKind, defaultOp: BooleanOp) => void;
  onInsertStockBlank: () => void;
  onOpenFilletDialog: () => void;
  onOpenChamferDialog: () => void;
  onOpenMoveCopyDialog: () => void;
  onOpenScaleDialog: () => void;
  onOpenAlignDialog: () => void;
  onOpenCombineDialog: () => void;
  onOpenSplitBodyDialog: () => void;
  onOpenAppearanceDialog: () => void;
  onOpenSectionAnalysisDialog: () => void;
  onOpenOffsetPlaneDialog: () => void;
  onOpenRectPatternDialog: () => void;
  onOpenCircPatternDialog: () => void;
  onOpenMirrorDialog: () => void;
  onOpenMeasureDialog: () => void;
  onOpenShortcutBox: () => void;
  onSnapActiveToFloor: () => void;
  onOpenParameters: () => void;
  onDeleteActiveSolid: () => void;
}

/**
 * Autodesk Fusion 360-style Docked Command Ribbon.
 * Vertical icon+label tiles sorted in exact Fusion 360 order:
 * SOLID:  CREATE | MODIFY | CONSTRUCT | INSPECT | INSERT
 * SKETCH: CREATE | MODIFY | CONSTRAINTS | FINISH SKETCH
 */
export const FusionTopRibbon: React.FC<Props> = (props) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const isCad = props.designMode === "model3d";
  const inSketch = isCad && props.isSketching;

  const tileBtn = (active: boolean, disabled?: boolean, accent?: "blue" | "red" | "green"): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minWidth: 44,
    height: 44,
    padding: "3px 6px",
    borderRadius: 4,
    border: active
      ? "1px solid #0696d7"
      : accent === "green"
      ? "1px solid #22c55e"
      : "1px solid transparent",
    background: active
      ? "rgba(6, 150, 215, 0.24)"
      : accent === "green"
      ? "#15803d"
      : "transparent",
    color: disabled
      ? "#525860"
      : accent === "red"
      ? "#f87171"
      : accent === "green"
      ? "#ffffff"
      : active
      ? "#ffffff"
      : "#d4d7dc",
    fontSize: 10,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    lineHeight: 1.05,
  });

  const groupCol: React.CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0 8px",
    borderRight: "1px solid #3c3f44",
  };

  const groupFooterBtn = (key: string, label: string) => (
    <button
      type="button"
      onClick={() => setOpenMenu((m) => (m === key ? null : key))}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        width: "100%",
        marginTop: 2,
        padding: "1px 6px",
        borderRadius: 3,
        border: "none",
        background: openMenu === key ? "rgba(6, 150, 215, 0.22)" : "transparent",
        color: openMenu === key ? "#38bdf8" : "#9aa0a6",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.07em",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: 8 }}>▾</span>
    </button>
  );

  const dropdownBox: React.CSSProperties = {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 4,
    minWidth: 210,
    padding: 4,
    borderRadius: 5,
    background: "#26282b",
    border: "1px solid #44484e",
    boxShadow: "0 12px 32px rgba(0,0,0,0.65)",
    display: "flex",
    flexDirection: "column",
    gap: 1,
    zIndex: 80,
  };

  const menuItem = (label: string, onClick: () => void, icon?: DesignIconName, shortcut?: string, disabled?: boolean) => (
    <button
      key={label}
      type="button"
      disabled={disabled}
      onClick={() => {
        setOpenMenu(null);
        onClick();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 9px",
        borderRadius: 4,
        border: "none",
        background: "transparent",
        color: disabled ? "#5c626a" : "#e5e7eb",
        fontSize: 12,
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon ? <DesignIcon name={icon} size={14} /> : <span style={{ width: 14 }} />}
        <span>{label}</span>
      </span>
      {shortcut && <span style={{ fontSize: 10, color: "#8b929a", fontFamily: "monospace" }}>{shortcut}</span>}
    </button>
  );

  const tabBtn = (active: boolean, isGreen?: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    border: "none",
    borderBottom: active ? `2px solid ${isGreen ? "#22c55e" : "#0696d7"}` : "2px solid transparent",
    background: active ? "#2b2d30" : "transparent",
    color: active ? (isGreen ? "#4ade80" : "#ffffff") : "#9aa0a6",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    cursor: "pointer",
  });

  return (
    <div
      ref={barRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 35,
        display: "flex",
        flexDirection: "column",
        background: "#2b2d30",
        borderBottom: "1px solid #3c3f44",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        userSelect: "none",
      }}
    >
      {/* Row 1: Fusion Workspace Tabs (DESIGN: SOLID / SKETCH | PHOTO) + Include + fx + Search (S) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px",
          height: 28,
          background: "#202225",
          borderBottom: "1px solid #35383d",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#0696d7", letterSpacing: "0.08em", marginRight: 8 }}>
            DESIGN
          </span>
          <button
            type="button"
            onClick={() => {
              props.onSetDesignMode("model3d");
              if (inSketch) props.onFinishSketch();
            }}
            style={tabBtn(isCad && !inSketch)}
          >
            SOLID
          </button>
          {inSketch && (
            <button type="button" style={tabBtn(true, true)}>
              SKETCH
            </button>
          )}
          <button
            type="button"
            onClick={() => props.onSetDesignMode("picture")}
            style={tabBtn(!isCad)}
          >
            PHOTO / RELIEF
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#9aa0a6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#6c727a", letterSpacing: "0.06em" }}>STACK</span>
            <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", color: props.enablePictureMode ? "#e5e7eb" : "#6c727a" }}>
              <input type="checkbox" checked={props.enablePictureMode} onChange={(e) => props.onToggleInclude("picture", e.target.checked)} />
              Photo
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", color: props.enableVectorMode ? "#e5e7eb" : "#6c727a" }}>
              <input type="checkbox" checked={props.enableVectorMode} onChange={(e) => props.onToggleInclude("vector", e.target.checked)} />
              Sketch
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", color: props.enable3dModelMode ? "#e5e7eb" : "#6c727a" }}>
              <input type="checkbox" checked={props.enable3dModelMode} onChange={(e) => props.onToggleInclude("model3d", e.target.checked)} />
              3D
            </label>
          </div>
          {isCad && (
            <>
              <div style={{ width: 1, height: 14, background: "#3c3f44" }} />
              <button
                type="button"
                onClick={props.onOpenParameters}
                title="Change Parameters (fx)"
                style={{
                  background: "transparent",
                  border: "1px solid #44484e",
                  borderRadius: 4,
                  padding: "1px 7px",
                  color: "#38bdf8",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}>fx</span> ({props.paramCount})
              </button>
              <button
                type="button"
                onClick={props.onSendSolidToCam}
                title="Auto-generate 2D/3D CNC Toolpaths from your SOLID model"
                style={{
                  background: "#15803d",
                  border: "1px solid #22c55e",
                  borderRadius: 4,
                  padding: "1px 8px",
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                → Send to CAM
              </button>
              <button
                type="button"
                onClick={props.onOpenShortcutBox}
                title="Design Shortcuts Search (S)"
                style={{
                  background: "#2b2d30",
                  border: "1px solid #44484e",
                  borderRadius: 4,
                  padding: "1px 7px",
                  color: "#d4d7dc",
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🔍 Search (S)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Row 2: Fusion Icon Toolbar (exact Fusion left-to-right group order!) */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", padding: "4px 6px", gap: 2, overflow: "visible" }}>
        {/* PHOTO TAB TOOLS */}
        {!isCad && (
          <>
            <div style={groupCol}>
              <div style={{ display: "flex", gap: 2 }}>
                {(
                  [
                    ["move", "Move", "move"],
                    ["paintRaise", "Raise +", "paintRaise"],
                    ["paintLower", "Lower -", "paintLower"],
                    ["paintSmooth", "Smooth", "paintSmooth"],
                  ] as [LayoutToolMode, string, DesignIconName][]
                ).map(([m, lbl, ic]) => (
                  <button key={m} type="button" onClick={() => props.onSetPhotoTool(m)} style={tileBtn(props.photoTool === m)}>
                    <DesignIcon name={ic} size={18} />
                    <span>{lbl}</span>
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#9aa0a6", letterSpacing: "0.07em", marginTop: 2 }}>TOOLS</span>
            </div>
            <div style={{ ...groupCol, borderRight: "none" }}>
              <div style={{ display: "flex", gap: 2 }}>
                <button type="button" onClick={props.onCenterPhotoX} style={tileBtn(false)}>
                  <DesignIcon name="centerX" size={18} />
                  <span>Center X</span>
                </button>
                <button type="button" onClick={props.onCenterPhotoY} style={tileBtn(false)}>
                  <DesignIcon name="centerY" size={18} />
                  <span>Center Y</span>
                </button>
                {props.hasActiveLayer && (
                  <button type="button" onClick={props.onDeletePhotoLayer} style={tileBtn(false, false, "red")}>
                    <span style={{ fontSize: 15 }}>✕</span>
                    <span>Delete</span>
                  </button>
                )}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#9aa0a6", letterSpacing: "0.07em", marginTop: 2 }}>ALIGN</span>
            </div>
          </>
        )}

        {/* SOLID TAB TOOLS (Exact Autodesk Fusion Order: CREATE | MODIFY | CONSTRUCT | INSPECT | INSERT) */}
        {isCad && !inSketch && (
          <>
            {/* CREATE */}
            <div style={groupCol}>
              <div style={{ display: "flex", gap: 2 }}>
                <button type="button" title="Create Sketch (K)" onClick={props.onOpenSketchPlanePicker} style={tileBtn(false)}>
                  <DesignIcon name="vector" size={18} color="#4ade80" />
                  <span>Sketch</span>
                </button>
                <button type="button" title="Extrude (E)" onClick={() => props.onOpenCreateSolid("extrude", "union")} style={tileBtn(false)}>
                  <DesignIcon name="extrude" size={18} color="#38bdf8" />
                  <span>Extrude</span>
                </button>
                <button type="button" title="Revolve" onClick={() => props.onOpenCreateSolid("revolve", "union")} style={tileBtn(false)}>
                  <DesignIcon name="revolve" size={18} />
                  <span>Revolve</span>
                </button>
                <button type="button" title="Hole (H)" onClick={() => props.onOpenCreateSolid("hole", "subtract")} style={tileBtn(false, false, "red")}>
                  <DesignIcon name="hole" size={18} />
                  <span>Hole</span>
                </button>
                <button type="button" title="Box" onClick={() => props.onOpenCreateSolid("box", "union")} style={tileBtn(false)}>
                  <DesignIcon name="box" size={18} />
                  <span>Box</span>
                </button>
                <button type="button" title="Cylinder" onClick={() => props.onOpenCreateSolid("cylinder", "union")} style={tileBtn(false)}>
                  <DesignIcon name="cylinder" size={18} />
                  <span>Cylinder</span>
                </button>
                <button type="button" title="Rectangular Pattern" disabled={!props.hasActiveSolid} onClick={props.onOpenRectPatternDialog} style={tileBtn(false, !props.hasActiveSolid)}>
                  <DesignIcon name="pattern" size={18} />
                  <span>Pattern</span>
                </button>
                <button type="button" title="Mirror" disabled={!props.hasActiveSolid} onClick={props.onOpenMirrorDialog} style={tileBtn(false, !props.hasActiveSolid)}>
                  <DesignIcon name="mirrorX" size={18} />
                  <span>Mirror</span>
                </button>
              </div>
              {groupFooterBtn("create", "CREATE")}
              {openMenu === "create" && (
                <div style={dropdownBox}>
                  {menuItem("Create Sketch", props.onOpenSketchPlanePicker, "vector", "K")}
                  {menuItem("Extrude", () => props.onOpenCreateSolid("extrude", "union"), "extrude", "E")}
                  {menuItem("Revolve", () => props.onOpenCreateSolid("revolve", "union"), "revolve")}
                  {menuItem("Sweep", () => props.onOpenCreateSolid("sweep", "union"), "pipe")}
                  {menuItem("Loft", () => props.onOpenCreateSolid("loft", "union"), "extrude")}
                  {menuItem("Rib", () => props.onOpenCreateSolid("rib", "union"), "box")}
                  {menuItem("Emboss Text (3D)", () => props.onOpenCreateSolid("emboss", "union"), "text")}
                  {menuItem("Hole (Simple / C'bore / C'sink)", () => props.onOpenCreateSolid("hole", "subtract"), "hole", "H")}
                  <div style={{ height: 1, background: "#3c3f44", margin: "3px 0" }} />
                  {menuItem("Box", () => props.onOpenCreateSolid("box", "union"), "box")}
                  {menuItem("Cylinder", () => props.onOpenCreateSolid("cylinder", "union"), "cylinder")}
                  {menuItem("Sphere", () => props.onOpenCreateSolid("sphere", "union"), "sphere")}
                  {menuItem("Torus", () => props.onOpenCreateSolid("torus", "union"), "torus")}
                  {menuItem("Pipe", () => props.onOpenCreateSolid("pipe", "union"), "pipe")}
                  {menuItem("Wedge", () => props.onOpenCreateSolid("wedge", "union"), "wedge")}
                  <div style={{ height: 1, background: "#3c3f44", margin: "3px 0" }} />
                  {menuItem("Rectangular Pattern", props.onOpenRectPatternDialog, "pattern", undefined, !props.hasActiveSolid)}
                  {menuItem("Circular Pattern", props.onOpenCircPatternDialog, "pattern", undefined, !props.hasActiveSolid)}
                  {menuItem("Mirror", props.onOpenMirrorDialog, "mirrorX", undefined, !props.hasActiveSolid)}
                  {menuItem("Stock Blank", props.onInsertStockBlank, "stockBlank")}
                </div>
              )}
            </div>

            {/* MODIFY */}
            <div style={groupCol}>
              <div style={{ display: "flex", gap: 2 }}>
                <button type="button" title="Fillet (F)" disabled={!props.hasActiveSolid} onClick={props.onOpenFilletDialog} style={tileBtn(false, !props.hasActiveSolid)}>
                  <DesignIcon name="box" size={18} />
                  <span>Fillet</span>
                </button>
                <button type="button" title="Chamfer (45°)" disabled={!props.hasActiveSolid} onClick={props.onOpenChamferDialog} style={tileBtn(false, !props.hasActiveSolid)}>
                  <DesignIcon name="wedge" size={18} />
                  <span>Chamfer</span>
                </button>
                <button type="button" title="Shell" onClick={() => props.onOpenCreateSolid("shell", "union")} style={tileBtn(false)}>
                  <DesignIcon name="stockBlank" size={18} />
                  <span>Shell</span>
                </button>
                <button type="button" title="Combine (Join / Cut / Intersect)" disabled={!props.hasActiveSolid} onClick={props.onOpenCombineDialog} style={tileBtn(false, !props.hasActiveSolid)}>
                  <DesignIcon name="union" size={18} />
                  <span>Combine</span>
                </button>
                <button type="button" title="Move / Copy (M)" disabled={!props.hasActiveSolid} onClick={props.onOpenMoveCopyDialog} style={tileBtn(false, !props.hasActiveSolid)}>
                  <DesignIcon name="move" size={18} color="#38bdf8" />
                  <span>Move</span>
                </button>
                <button type="button" title="Appearance (A)" disabled={!props.hasActiveSolid} onClick={props.onOpenAppearanceDialog} style={tileBtn(false, !props.hasActiveSolid)}>
                  <span style={{ fontSize: 15 }}>🎨</span>
                  <span>Appear</span>
                </button>
              </div>
              {groupFooterBtn("modify", "MODIFY")}
              {openMenu === "modify" && (
                <div style={dropdownBox}>
                  {menuItem("Fillet (Rounded)", props.onOpenFilletDialog, "box", "F", !props.hasActiveSolid)}
                  {menuItem("Chamfer (45°)", props.onOpenChamferDialog, "wedge", undefined, !props.hasActiveSolid)}
                  {menuItem("Shell (Hollow)", () => props.onOpenCreateSolid("shell", "union"), "stockBlank")}
                  {menuItem("Combine", props.onOpenCombineDialog, "union", undefined, !props.hasActiveSolid)}
                  {menuItem("Split Body", props.onOpenSplitBodyDialog, "box", undefined, !props.hasActiveSolid)}
                  {menuItem("Scale", props.onOpenScaleDialog, "box", undefined, !props.hasActiveSolid)}
                  {menuItem("Align", props.onOpenAlignDialog, "centerX", undefined, !props.hasActiveSolid)}
                  {menuItem("Move / Copy", props.onOpenMoveCopyDialog, "move", "M", !props.hasActiveSolid)}
                  {menuItem("Snap Active to Floor", props.onSnapActiveToFloor, "stockBlank", undefined, !props.hasActiveSolid)}
                  <div style={{ height: 1, background: "#3c3f44", margin: "3px 0" }} />
                  {menuItem("Appearance", props.onOpenAppearanceDialog, undefined, "A", !props.hasActiveSolid)}
                  {menuItem("Change Parameters", props.onOpenParameters, undefined, "fx")}
                  {menuItem("Delete Selected", props.onDeleteActiveSolid, undefined, "Del", !props.hasActiveSolid)}
                </div>
              )}
            </div>

            {/* CONSTRUCT */}
            <div style={groupCol}>
              <div style={{ display: "flex", gap: 2 }}>
                <button type="button" title="Offset Construction Plane" onClick={props.onOpenOffsetPlaneDialog} style={tileBtn(false)}>
                  <span style={{ fontSize: 15, color: "#f59e0b" }}>▱</span>
                  <span>Plane</span>
                </button>
              </div>
              {groupFooterBtn("construct", "CONSTRUCT")}
              {openMenu === "construct" && (
                <div style={dropdownBox}>
                  {menuItem("Offset Plane", props.onOpenOffsetPlaneDialog)}
                  {menuItem("Sketch on Plane...", props.onOpenSketchPlanePicker, "vector", "K")}
                </div>
              )}
            </div>

            {/* INSPECT */}
            <div style={groupCol}>
              <div style={{ display: "flex", gap: 2 }}>
                <button type="button" title="Measure (I)" onClick={props.onOpenMeasureDialog} style={tileBtn(false)}>
                  <span style={{ fontSize: 15 }}>📏</span>
                  <span>Measure</span>
                </button>
                <button type="button" title="Section Analysis" onClick={props.onOpenSectionAnalysisDialog} style={tileBtn(false)}>
                  <span style={{ fontSize: 15 }}>◧</span>
                  <span>Section</span>
                </button>
              </div>
              {groupFooterBtn("inspect", "INSPECT")}
              {openMenu === "inspect" && (
                <div style={dropdownBox}>
                  {menuItem("Measure", props.onOpenMeasureDialog, undefined, "I")}
                  {menuItem("Section Analysis", props.onOpenSectionAnalysisDialog)}
                </div>
              )}
            </div>

            {/* INSERT */}
            <div style={{ ...groupCol, borderRight: "none" }}>
              <div style={{ display: "flex", gap: 2 }}>
                <label title="Insert SVG Sketch" style={tileBtn(false)}>
                  <DesignIcon name="svg" size={18} />
                  <span>SVG</span>
                  <input
                    type="file"
                    accept=".svg"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) props.onImportSvgFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label title="Insert DXF Sketch" style={tileBtn(false)}>
                  <DesignIcon name="vector" size={18} />
                  <span>DXF</span>
                  <input
                    type="file"
                    accept=".dxf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) props.onImportDxfFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label title="Insert .STL as 3D Solid Body" style={tileBtn(false)}>
                  <DesignIcon name="model3d" size={18} color="#38bdf8" />
                  <span>STL</span>
                  <input
                    type="file"
                    accept=".stl"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) props.onImportStlSolidFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#9aa0a6", letterSpacing: "0.07em", marginTop: 2 }}>INSERT</span>
            </div>
          </>
        )}

        {/* SKETCH TAB TOOLS (Exact Autodesk Fusion Order: CREATE | MODIFY | FINISH SKETCH) */}
        {isCad && inSketch && (
          <>
            <div style={groupCol}>
              <div style={{ display: "flex", gap: 2 }}>
                {(
                  [
                    ["select", "Select", "select"],
                    ["polyline", "Line", "polyline"],
                    ["rect", "2-Pt Rect", "rect"],
                    ["centerRect", "Ctr Rect", "rect"],
                    ["circle", "Circle", "circle"],
                    ["arc", "Arc", "circle"],
                    ["spline", "Spline", "polyline"],
                    ["slot", "Slot", "rect"],
                    ["polygon", "Polygon", "polygon"],
                  ] as [SketchToolMode, string, DesignIconName][]
                ).map(([k, lbl, ic]) => (
                  <button key={k} type="button" onClick={() => props.onSetSketchTool(k)} style={tileBtn(props.sketchTool === k)}>
                    <DesignIcon name={ic} size={18} />
                    <span>{lbl}</span>
                  </button>
                ))}
                <button type="button" onClick={props.onAddSketchText} style={tileBtn(false)}>
                  <DesignIcon name="text" size={18} />
                  <span>Text</span>
                </button>
                <button type="button" title="Sketch Dimension (D)" onClick={() => props.onSetSketchTool("dimension")} style={tileBtn(props.sketchTool === "dimension")}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>↔</span>
                  <span>Dim (D)</span>
                </button>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#9aa0a6", letterSpacing: "0.07em", marginTop: 2 }}>CREATE</span>
            </div>

            <div style={groupCol}>
              <div style={{ display: "flex", gap: 2 }}>
                <button type="button" title="Fillet Corner" disabled={!props.hasActiveSketch} onClick={props.onFilletSketchCorner} style={tileBtn(false, !props.hasActiveSketch)}>
                  <DesignIcon name="box" size={18} />
                  <span>Fillet</span>
                </button>
                <button type="button" title="Trim (T)" onClick={() => props.onSetSketchTool("trim")} style={tileBtn(props.sketchTool === "trim")}>
                  <span style={{ fontSize: 15 }}>✂</span>
                  <span>Trim</span>
                </button>
                <button type="button" title="Offset (+ / -)" disabled={!props.hasActiveSketch} onClick={props.onOpenSketchOffsetDialog} style={tileBtn(false, !props.hasActiveSketch)}>
                  <span style={{ fontSize: 15 }}>⧉</span>
                  <span>Offset</span>
                </button>
                <button type="button" title="Mirror" disabled={!props.hasActiveSketch} onClick={props.onMirrorSketchX} style={tileBtn(false, !props.hasActiveSketch)}>
                  <DesignIcon name="mirrorX" size={18} />
                  <span>Mirror</span>
                </button>
                <button type="button" title="Center at Origin" disabled={!props.hasActiveSketch} onClick={props.onCenterSketch} style={tileBtn(false, !props.hasActiveSketch)}>
                  <DesignIcon name="centerX" size={18} />
                  <span>Center</span>
                </button>
                {props.hasActiveSketch && (
                  <button type="button" title="Delete (Del)" onClick={props.onDeleteSketch} style={tileBtn(false, false, "red")}>
                    <span style={{ fontSize: 15 }}>✕</span>
                    <span>Delete</span>
                  </button>
                )}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#9aa0a6", letterSpacing: "0.07em", marginTop: 2 }}>MODIFY</span>
            </div>

            <div style={{ ...groupCol, borderRight: "none" }}>
              <button
                type="button"
                title="Finish Sketch (Esc)"
                onClick={props.onFinishSketch}
                style={{ ...tileBtn(false, false, "green"), minWidth: 74, fontWeight: 700 }}
              >
                <span style={{ fontSize: 16 }}>✓</span>
                <span>FINISH SKETCH</span>
              </button>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#4ade80", letterSpacing: "0.07em", marginTop: 2 }}>FINISH</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
