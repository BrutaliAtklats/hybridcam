import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  buildGcode,
  generatePreviewToolpath,
  getToolsForMaterial,
  getXyOriginOffsetMm,
  JobConfig,
  MATERIAL_LABELS,
  PreviewPoint,
  StrategyKey,
  ToolCategory,
  ToolPreset,
} from "./camEngine";
import { JobSetupModal } from "./JobSetupModal";
import {
  CombineMode,
  computeAutoLevelTiltDeg,
  computeBaseMask,
  computeCombinedBoundsMm,
  createBuiltInShapeSource,
  createSampleDepthSource,
  DEFAULT_PLACEMENT,
  DEFAULT_RELIEF_SETTINGS,
  PictureLayer,
  PicturePlacement,
  processReliefLayers,
  ReliefSettings,
} from "./reliefProcessor";
import { LayoutToolMode, PictureLayoutView } from "./PictureLayoutView";
import { geometryTo3mf, geometryToBinaryStl } from "./meshExporter";
import { apply3dSculptBrush, SculptBrushKind, SculptFalloff } from "./sculptEngine";
import { buildSolidStockGeometry } from "./solidReliefMesh";
import { ZProfileWidget } from "./ZProfileWidget";
import { EndmillIcon, STRATEGY_DESCRIPTIONS, TOOL_DESCRIPTIONS, ToolpathIcon } from "./CamVisuals";
import { applyThemeToDocument, ThemeId, THEMES, UI } from "./uiTheme";
import { DesignIcon, DesignIconName, ToolTileButton } from "./DesignIcons";
import {
  applyCustomPostProcessor,
  CustomPostProcessor,
  DEFAULT_CUSTOM_POST_TEMPLATE,
} from "./postProcessor";
import { parseStlToDepthSource } from "./stlImporter";
import {
  applyMachineProfileToGcode,
  DEFAULT_MACHINE_PROFILE,
  getMachineLimitWarnings,
  MACHINE_PRESETS,
  MachineProfile,
  shiftGcodeXyOrigin,
} from "./machineProfile";
import { XyDatumSelector, ZZeroSelector } from "./XyDatumSelector";
import { CncControlPanel } from "./CncControlPanel";

interface CamOpTemplate {
  id: string;
  name: string;
  ops: Array<{
    name: string;
    enabled: boolean;
    strategy: StrategyKey;
    toolNumber: number;
    overrides: Partial<ToolPreset>;
    stockToLeaveMm: number;
    maxCutDepthMm: number;
    rampEnabled?: boolean;
    tabsEnabled?: boolean;
    tabCount?: number;
    tabHeightMm?: number;
  }>;
}
import { SketchToolMode, VectorSketchView } from "./VectorSketchView";
import {
  exportVectorShapesToDxf,
  parseDxfToVectorShapes,
  parseSvgToVectorShapes,
  rasterizeVectorShapesToGrid,
  shapeToPolylineMm,
  VectorRole,
  VectorShape,
} from "./vectorSketch";
import {
  BooleanOp,
  buildPrimitiveGeometry,
  evaluateSolidCsgStack,
  sampleSolidToHeightfield,
  SolidModelNode,
  SolidPrimitiveKind,
} from "./solidCsg";

type WorkflowStep = "layout" | "relief" | "toolpaths" | "simulate" | "export" | "run" | "settings";
type DesignMode = "picture" | "vector" | "model3d";
type ShadingMode = "clay" | "material" | "heatmap" | "wireframe";
type ViewportSource = "relief" | "carved";

const PREVIEW_MATERIALS = [
  { id: "walnut", label: "Black Walnut", color: 0x5c3d28, roughness: 0.42, metalness: 0.05 },
  { id: "oak", label: "Red Oak", color: 0xb07d4b, roughness: 0.45, metalness: 0.05 },
  { id: "maple", label: "Hard Maple", color: 0xd9be93, roughness: 0.40, metalness: 0.05 },
  { id: "cherry", label: "American Cherry", color: 0xa65a3a, roughness: 0.40, metalness: 0.06 },
  { id: "mahogany", label: "Mahogany", color: 0x733224, roughness: 0.38, metalness: 0.08 },
  { id: "pine", label: "Pine / Cedar", color: 0xd4a973, roughness: 0.50, metalness: 0.03 },
  { id: "mdf", label: "MDF / Baltic Birch", color: 0xb8966e, roughness: 0.58, metalness: 0.02 },
  { id: "acrylic", label: "Cast Acrylic (Blue)", color: 0x3b82f6, roughness: 0.15, metalness: 0.12 },
  { id: "hdpe", label: "Black HDPE / Richlite", color: 0x26292e, roughness: 0.35, metalness: 0.08 },
  { id: "aluminum", label: "Brushed Aluminum 6061", color: 0x9aa4b0, roughness: 0.28, metalness: 0.65 },
  { id: "brass", label: "Machined Brass", color: 0xc9a24b, roughness: 0.25, metalness: 0.75 },
  { id: "marble", label: "White Marble / Corian", color: 0xe5e7eb, roughness: 0.26, metalness: 0.05 },
] as const;

interface RustToolpathSegment {
  kind: "Rapid" | "Linear" | "ArcCW" | "ArcCCW";
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  feed_mm_min: number;
}

interface RustToolpath {
  operation_id: string;
  tool_number: number;
  spindle_rpm: number;
  segments: RustToolpathSegment[];
  estimated_time_sec: number;
  total_cut_distance_mm: number;
  warnings: Array<{ code: string; message: string }>;
}

interface CamOperationItem {
  id: string;
  name: string;
  enabled: boolean;
  strategy: StrategyKey;
  toolNumber: number;
  overrides: Partial<ToolPreset>;
  stockToLeaveMm: number;
  maxCutDepthMm: number;
  restFromOpId?: string | null;
  tabsEnabled?: boolean;
  tabCount?: number;
  tabWidthMm?: number;
  tabHeightMm?: number;
  rampEnabled?: boolean;
  cutTimeSec?: number;
  rapidTimeSec?: number;
  zMinMm?: number;
  zMaxMm?: number;
  rustToolpath?: RustToolpath;
  previewPts: PreviewPoint[];
}

interface TaggedPreviewPoint extends PreviewPoint {
  opId: string;
  opName: string;
  opIndex: number;
  feedMmMin: number;
  rpm: number;
  toolDiamMm: number;
  isBall: boolean;
}

interface ClampZone {
  id: string;
  label: string;
  xMm: number;
  yMm: number;
  wMm: number;
  dMm: number;
  hMm: number;
}

interface CutProfile {
  id: string;
  label: string;
  feedMmMin: number;
  stepdownMm: number;
  rpm: number;
  stepoverPct: number;
  stockToLeaveMm: number;
}

const DEFAULT_CUT_PROFILES: CutProfile[] = [
  { id: "mpcnc-safe", label: "MPCNC Safe", feedMmMin: 900, stepdownMm: 1.2, rpm: 16000, stepoverPct: 30, stockToLeaveMm: 0.4 },
  { id: "hardwood-detail", label: "Hardwood Detail", feedMmMin: 1800, stepdownMm: 0.8, rpm: 18000, stepoverPct: 8, stockToLeaveMm: 0 },
  { id: "fast-rough", label: "Fast Roughing", feedMmMin: 2600, stepdownMm: 3.0, rpm: 18000, stepoverPct: 45, stockToLeaveMm: 0.6 },
  { id: "acrylic-1flute", label: "Acrylic 1-Flute", feedMmMin: 1100, stepdownMm: 1.0, rpm: 14000, stepoverPct: 25, stockToLeaveMm: 0.2 },
];

const HelpBubble: React.FC<{ text: string }> = ({ text }) => {
  const [hover, setHover] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 5 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        style={{
          width: 15,
          height: 15,
          borderRadius: "50%",
          background: hover ? "var(--hc-accent, #2563eb)" : "var(--hc-border-strong, #2d3542)",
          color: hover ? "#fff" : "var(--hc-muted, #cbd5e1)",
          fontSize: 10,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "help",
          border: "1px solid #475569",
        }}
      >
        ?
      </span>
      {hover && (
        <span
          style={{
            position: "absolute",
            left: 20,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 40,
            width: 210,
            padding: "7px 9px",
            borderRadius: 7,
            background: "#0b0e14",
            border: "1px solid #475569",
            color: "var(--hc-text, #f1f5f9)",
            fontSize: 11,
            lineHeight: 1.4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            pointerEvents: "none",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
};

interface SliderRowProps {
  label: string;
  hint?: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({ label, hint, unit = "", min, max, step, value, onChange }) => {
  const [draft, setDraft] = useState(String(Number(value.toFixed(2))));
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(String(Number(value.toFixed(2))));
    }
  }, [value]);

  const commitDraft = () => {
    const n = parseFloat(draft);
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      onChange(clamped);
      setDraft(String(Number(clamped.toFixed(2))));
    } else {
      setDraft(String(Number(value.toFixed(2))));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
        <span style={{ color: "var(--hc-text, #f8fafc)", fontWeight: 600, display: "inline-flex", alignItems: "center" }}>
          {label}
          {hint && <HelpBubble text={hint} />}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onFocus={() => {
              focusedRef.current = true;
            }}
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(raw);
              const n = parseFloat(raw);
              if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
            }}
            onBlur={() => {
              focusedRef.current = false;
              commitDraft();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            style={{
              width: 62,
              height: 26,
              boxSizing: "border-box",
              padding: "2px 7px",
              textAlign: "right",
              background: "var(--hc-input-bg, #111419)",
              color: "var(--hc-text, #f8fafc)",
              border: "1px solid var(--hc-border-strong, #374151)",
              borderRadius: 5,
              fontSize: 12,
              fontWeight: 600,
            }}
          />
          <span style={{ color: "var(--hc-muted, #9ca3af)", fontSize: 11, width: 42, textAlign: "left" }}>{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--hc-accent, #3b82f6)", cursor: "pointer" }}
      />
    </div>
  );
};

interface NumericInputProps {
  value: number;
  min: number;
  max: number;
  decimals?: number;
  title?: string;
  style?: React.CSSProperties;
  onChange: (v: number) => void;
}

const NumericInput: React.FC<NumericInputProps> = ({ value, min, max, decimals = 2, title, style, onChange }) => {
  const [draft, setDraft] = useState(String(Number(value.toFixed(decimals))));
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(String(Number(value.toFixed(decimals))));
    }
  }, [value, decimals]);

  return (
    <input
      type="text"
      inputMode="decimal"
      title={title}
      value={draft}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = parseFloat(raw);
        if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        focusedRef.current = false;
        const n = parseFloat(draft);
        if (Number.isFinite(n)) {
          const clamped = Math.min(max, Math.max(min, n));
          onChange(clamped);
          setDraft(String(Number(clamped.toFixed(decimals))));
        } else {
          setDraft(String(Number(value.toFixed(decimals))));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      style={style}
    />
  );
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) {
      return (Array.isArray(parsed) ? parsed : fallback) as T;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...fallback, ...parsed };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatHoursMinutes(sec: number): string {
  const totalMin = Math.ceil(Math.max(0, sec) / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneObjectsRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    dynamicGroup: THREE.Group;
    overlayGroup: THREE.Group;
    toolCone: THREE.Mesh;
    reliefMesh?: THREE.Mesh;
    brushRing?: THREE.Mesh;
    reliefGeo?: THREE.BufferGeometry;
    transformControls?: TransformControls;
    gizmoTarget?: THREE.Object3D;
  } | null>(null);
  const needsRenderRef = useRef(true);
  const activeSolidRef = useRef<{ id: string; topZ: number }>({ id: "", topZ: 0 });

  const [themeId, setThemeId] = useState<ThemeId>(() => {
    const saved = localStorage.getItem("hybridcam.theme") as ThemeId | null;
    return saved && THEMES[saved] ? saved : "midnight";
  });
  const activeTheme = THEMES[themeId] ?? THEMES.midnight;

  useEffect(() => {
    applyThemeToDocument(activeTheme);
    localStorage.setItem("hybridcam.theme", themeId);
    if (sceneObjectsRef.current) {
      sceneObjectsRef.current.scene.background = new THREE.Color(activeTheme.viewportBg);
      needsRenderRef.current = true;
    }
  }, [themeId, activeTheme]);

  const [customPosts, setCustomPosts] = useState<CustomPostProcessor[]>(() =>
    loadJson<CustomPostProcessor[]>("hybridcam.customPosts", [])
  );
  const [editingPostId, setEditingPostId] = useState<string>("");
  const [showAxesAndGrid, setShowAxesAndGrid] = useState<boolean>(
    () => localStorage.getItem("hybridcam.showAxesAndGrid") !== "false"
  );
  const [invertZoom, setInvertZoom] = useState<boolean>(
    () => localStorage.getItem("hybridcam.invertZoom") === "true"
  );
  const [uiScale, setUiScale] = useState<"compact" | "standard" | "large">(
    () => (localStorage.getItem("hybridcam.uiScale") as "compact" | "standard" | "large") || "standard"
  );
  const [defaultStartupStep, setDefaultStartupStep] = useState<"layout" | "relief">(
    () => (localStorage.getItem("hybridcam.startupStep") as "layout" | "relief") || "relief"
  );
  const [showSetupOnStartup, setShowSetupOnStartup] = useState<boolean>(
    () => localStorage.getItem("hybridcam.showSetupOnStartup") !== "false"
  );
  const [simResolution, setSimResolution] = useState<180 | 240 | 360>(() => {
    const n = Number(localStorage.getItem("hybridcam.simResolution"));
    return n === 180 || n === 360 ? n : 240;
  });
  const [snapStepMm, setSnapStepMm] = useState<number>(() => {
    const n = Number(localStorage.getItem("hybridcam.snapStepMm"));
    return [1, 2, 5, 10].includes(n) ? n : 5;
  });
  const [settingsTab, setSettingsTab] = useState<"themes" | "machine" | "posts" | "app">("themes");
  const [showCutProfiles, setShowCutProfiles] = useState(false);

  useEffect(() => {
    localStorage.setItem("hybridcam.customPosts", JSON.stringify(customPosts));
  }, [customPosts]);

  useEffect(() => {
    localStorage.setItem("hybridcam.showAxesAndGrid", String(showAxesAndGrid));
    localStorage.setItem("hybridcam.invertZoom", String(invertZoom));
    localStorage.setItem("hybridcam.uiScale", uiScale);
    localStorage.setItem("hybridcam.startupStep", defaultStartupStep);
    localStorage.setItem("hybridcam.showSetupOnStartup", String(showSetupOnStartup));
    localStorage.setItem("hybridcam.simResolution", String(simResolution));
    localStorage.setItem("hybridcam.snapStepMm", String(snapStepMm));
    if (sceneObjectsRef.current) {
      sceneObjectsRef.current.controls.zoomSpeed = invertZoom ? -1.0 : 1.0;
    }
  }, [showAxesAndGrid, invertZoom, uiScale, defaultStartupStep, showSetupOnStartup, simResolution, snapStepMm]);

  const [showSetup, setShowSetup] = useState(() => localStorage.getItem("hybridcam.showSetupOnStartup") !== "false");
  const [step, setStep] = useState<WorkflowStep>(
    () => (localStorage.getItem("hybridcam.startupStep") as "layout" | "relief") || "relief"
  );
  const [designMode, setDesignMode] = useState<DesignMode>("picture");
  const [enablePictureMode, setEnablePictureMode] = useState(true);
  const [enableVectorMode, setEnableVectorMode] = useState(true);
  const [enable3dModelMode, setEnable3dModelMode] = useState(true);
  const [vectorShapes, setVectorShapes] = useState<VectorShape[]>(() =>
    loadJson<VectorShape[]>("hybridcam.vectorShapes", [])
  );
  const [activeVectorId, setActiveVectorId] = useState<string>("");
  const [sketchTool, setSketchTool] = useState<SketchToolMode>("select");
  const [isSketchingIn3d, setIsSketchingIn3d] = useState<boolean>(false);
  const [sketchPlaneZMm, setSketchPlaneZMm] = useState<number>(0);
  const [solidModels, setSolidModels] = useState<SolidModelNode[]>(() =>
    loadJson<SolidModelNode[]>("hybridcam.solidModels", [])
  );
  const [activeSolidId, setActiveSolidId] = useState<string>("");
  const [shading, setShading] = useState<ShadingMode>(() => (localStorage.getItem("hybridcam.shading") as ShadingMode) || "material");
  const [previewMatId, setPreviewMatId] = useState<string>(() => localStorage.getItem("hybridcam.previewMat") || "walnut");
  const [viewportSource, setViewportSource] = useState<ViewportSource>("relief");

  const [machineProfile, setMachineProfile] = useState<MachineProfile>(() => {
    const savedBed = loadJson("hybridcam.machineBed", { widthMm: 200, depthMm: 150, thicknessMm: 20 });
    return loadJson<MachineProfile>("hybridcam.machineProfile", {
      ...DEFAULT_MACHINE_PROFILE,
      bedXMm: savedBed.widthMm,
      bedYMm: savedBed.depthMm,
      defaultThicknessMm: savedBed.thicknessMm,
    });
  });

  useEffect(() => {
    try {
      localStorage.setItem("hybridcam.machineProfile", JSON.stringify(machineProfile));
    } catch {
      // ignore
    }
  }, [machineProfile]);

  const [machineBed, setMachineBed] = useState<{ widthMm: number; depthMm: number; thicknessMm: number }>(() =>
    loadJson("hybridcam.machineBed", { widthMm: 200, depthMm: 150, thicknessMm: 20 })
  );

  useEffect(() => {
    try {
      localStorage.setItem("hybridcam.machineBed", JSON.stringify(machineBed));
    } catch {
      // ignore
    }
  }, [machineBed]);

  const [job, setJob] = useState<JobConfig>(() => {
    const savedJob = loadJson<JobConfig>("hybridcam.job", {
      name: "HybridCAM_Project",
      units: "mm",
      widthMm: 200,
      depthMm: 150,
      thicknessMm: 20,
      material: "Hardwood",
      zZero: "top",
      xyOrigin: "front-left",
      clearanceZMm: 15,
    });
    const savedBed = loadJson("hybridcam.machineBed", {
      widthMm: savedJob.widthMm,
      depthMm: savedJob.depthMm,
      thicknessMm: savedJob.thicknessMm,
    });
    const savedMachine = loadJson<MachineProfile>("hybridcam.machineProfile", DEFAULT_MACHINE_PROFILE);
    return {
      ...savedJob,
      widthMm: savedBed.widthMm,
      depthMm: savedBed.depthMm,
      thicknessMm: savedBed.thicknessMm,
      xyOrigin: savedMachine.defaultXyOrigin ?? savedJob.xyOrigin,
      zZero: savedMachine.defaultZZero ?? savedJob.zZero,
    };
  });

  const [skipClosePrompt, setSkipClosePrompt] = useState<boolean>(
    () => localStorage.getItem("hybridcam.skipClosePrompt") === "true"
  );
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeDontAskDraft, setCloseDontAskDraft] = useState(false);
  const skipClosePromptRef = useRef(skipClosePrompt);
  skipClosePromptRef.current = skipClosePrompt;
  const allowCloseRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("hybridcam.skipClosePrompt", String(skipClosePrompt));
  }, [skipClosePrompt]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("hybridcam://close-requested", () => {
      if (skipClosePromptRef.current) {
        invoke("force_close_window_ipc").catch(() => window.close());
        return;
      }
      setCloseDontAskDraft(false);
      setShowCloseModal(true);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const [layers, setLayers] = useState<PictureLayer[]>(() => [
    {
      id: "layer-1",
      name: "Built-in Rectangular Plaque",
      visible: true,
      combineMode: "mergeHigh",
      weight: 1.0,
      source: createSampleDepthSource(256),
      placement: loadJson<PicturePlacement>("hybridcam.placement", DEFAULT_PLACEMENT),
    },
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>("layer-1");
  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? layers[0];
  const placement = activeLayer?.placement ?? DEFAULT_PLACEMENT;

  const [toolMode, setToolMode] = useState<LayoutToolMode>("move");
  const [brushRadiusMm, setBrushRadiusMm] = useState<number>(10);
  const [brushStrength, setBrushStrength] = useState<number>(0.45);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showMergedPreview, setShowMergedPreview] = useState(false);

  // 3D Viewport Sculpting State
  const [sculpt3dActive, setSculpt3dActive] = useState(false);
  const [sculptBrush, setSculptBrush] = useState<SculptBrushKind>("raise");
  const [sculptFalloff, setSculptFalloff] = useState<SculptFalloff>("smooth");
  const [sculptRadiusMm, setSculptRadiusMm] = useState<number>(12);
  const [sculptStrength, setSculptStrength] = useState<number>(0.5);
  const [sliceYPct, setSliceYPct] = useState<number>(50);

  const [reliefSettings, setReliefSettings] = useState<ReliefSettings>(() =>
    loadJson<ReliefSettings>("hybridcam.reliefSettings", DEFAULT_RELIEF_SETTINGS)
  );

  useEffect(() => {
    try {
      localStorage.setItem("hybridcam.vectorShapes", JSON.stringify(vectorShapes));
      localStorage.setItem("hybridcam.solidModels", JSON.stringify(solidModels));
    } catch {
      // ignore quota errors
    }
  }, [vectorShapes, solidModels]);

  const [customOpTemplates, setCustomOpTemplates] = useState<CamOpTemplate[]>(() =>
    loadJson<CamOpTemplate[]>("hybridcam.opTemplates", [])
  );
  const [templateDraftName, setTemplateDraftName] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem("hybridcam.opTemplates", JSON.stringify(customOpTemplates));
    } catch {
      // ignore
    }
  }, [customOpTemplates]);

  const sidebarRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (sidebarRef.current) {
      sidebarRef.current.scrollTop = 0;
    }
  }, [step, designMode]);

  const gridW = Math.max(640, reliefSettings.resolution);
  const gridH = Math.max(64, Math.round((gridW * job.depthMm) / Math.max(1, job.widthMm)));

  const [isDraftingRelief, setIsDraftingRelief] = useState(false);
  const didMountDraftRef = useRef(false);
  useEffect(() => {
    if (!didMountDraftRef.current) {
      didMountDraftRef.current = true;
      return;
    }
    if (reliefSettings.resolution <= 640 || sculpt3dActive) {
      setIsDraftingRelief(false);
      return;
    }
    setIsDraftingRelief(true);
    const t = setTimeout(() => setIsDraftingRelief(false), 180);
    return () => clearTimeout(t);
  }, [reliefSettings, sculpt3dActive]);

  const viewGridW = isDraftingRelief ? 384 : gridW;
  const viewGridH = Math.max(64, Math.round((viewGridW * job.depthMm) / Math.max(1, job.widthMm)));

  const [sculptDelta, setSculptDelta] = useState<Float32Array>(() => new Float32Array(gridW * gridH));
  useEffect(() => {
    setSculptDelta(new Float32Array(gridW * gridH));
  }, [gridW, gridH]);

  // Undo / Redo Stacks (for Picture Paint + 3D Sculpt)
  const undoStack = useRef<Array<{ layers: PictureLayer[]; sculpt: Float32Array }>>([]);
  const redoStack = useRef<Array<{ layers: PictureLayer[]; sculpt: Float32Array }>>([]);
  const pushUndoSnapshot = () => {
    undoStack.current.push({
      layers: layers.map((l) => ({
        ...l,
        source: { ...l.source, data: new Float32Array(l.source.data) },
        placement: { ...l.placement },
      })),
      sculpt: new Float32Array(sculptDelta),
    });
    if (undoStack.current.length > 25) undoStack.current.shift();
    redoStack.current = [];
  };
  const handleUndo = () => {
    const snap = undoStack.current.pop();
    if (!snap) return;
    redoStack.current.push({
      layers: layers.map((l) => ({
        ...l,
        source: { ...l.source, data: new Float32Array(l.source.data) },
        placement: { ...l.placement },
      })),
      sculpt: new Float32Array(sculptDelta),
    });
    setLayers(snap.layers);
    if (snap.sculpt.length === gridW * gridH) setSculptDelta(snap.sculpt);
  };
  const handleRedo = () => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    undoStack.current.push({
      layers: layers.map((l) => ({
        ...l,
        source: { ...l.source, data: new Float32Array(l.source.data) },
        placement: { ...l.placement },
      })),
      sculpt: new Float32Array(sculptDelta),
    });
    setLayers(snap.layers);
    if (snap.sculpt.length === gridW * gridH) setSculptDelta(snap.sculpt);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inInput = tag === "input" || tag === "textarea" || tag === "select";

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveProject();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (!inInput && !e.ctrlKey && !e.metaKey && ["1", "2", "3", "4", "5"].includes(e.key)) {
        const steps: WorkflowStep[] = ["layout", "relief", "toolpaths", "simulate", "export"];
        setStep(steps[Number(e.key) - 1]);
      } else if (!inInput && e.key.toLowerCase() === "r") {
        setCameraPreset("iso");
      } else if (!inInput && step === "simulate" && e.code === "Space") {
        e.preventDefault();
        setSimPlaying((p) => !p);
      } else if (!inInput && step === "layout" && (e.key === "Delete" || e.key === "Backspace") && activeLayer) {
        e.preventDefault();
        pushUndoSnapshot();
        setLayers((ls) => {
          const next = ls.filter((x) => x.id !== activeLayer.id);
          setActiveLayerId(next[0]?.id ?? "");
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const solidCsgGeo = useMemo(
    () => (enable3dModelMode && solidModels.length > 0 ? evaluateSolidCsgStack(solidModels, vectorShapes) : null),
    [enable3dModelMode, solidModels, vectorShapes]
  );

  const reliefHeights = useMemo(() => {
    const activeSculpt = viewGridW === gridW ? sculptDelta : undefined;
    const base = enablePictureMode
      ? processReliefLayers(layers, viewGridW, viewGridH, reliefSettings, job.widthMm, job.depthMm, activeSculpt)
      : new Float32Array(viewGridW * viewGridH);

    if (enableVectorMode && vectorShapes.length > 0) {
      const vecGrid = rasterizeVectorShapesToGrid(vectorShapes, viewGridW, viewGridH, job.widthMm, job.depthMm, reliefSettings.maxZMm);
      if (vecGrid) {
        const hasCarve = vectorShapes.some((s) => s.visible && s.role === "carve");
        for (let i = 0; i < base.length; i++) {
          if (hasCarve) base[i] = Math.min(base[i], vecGrid[i]);
          else base[i] = Math.max(base[i], vecGrid[i]);
        }
      }
    }

    if (solidCsgGeo) {
      const solidGrid = sampleSolidToHeightfield(solidCsgGeo, viewGridW, viewGridH, job.widthMm, job.depthMm, reliefSettings.maxZMm);
      for (let i = 0; i < base.length; i++) {
        base[i] = Math.max(base[i], solidGrid[i]);
      }
    }
    return base;
  }, [
    enablePictureMode,
    enableVectorMode,
    layers,
    vectorShapes,
    solidCsgGeo,
    gridW,
    viewGridW,
    viewGridH,
    reliefSettings,
    job.widthMm,
    job.depthMm,
    sculptDelta,
  ]);

  const baseMask = useMemo(
    () => computeBaseMask(reliefHeights, viewGridW, viewGridH, reliefSettings),
    [reliefHeights, viewGridW, viewGridH, reliefSettings]
  );

  const pictureBounds = useMemo(
    () => computeCombinedBoundsMm(layers, job.widthMm, job.depthMm, reliefSettings.preserveAspect),
    [layers, job.widthMm, job.depthMm, reliefSettings.preserveAspect]
  );

  const updateActivePlacement = (updater: (prev: PicturePlacement) => PicturePlacement) => {
    if (!activeLayer) return;
    setLayers((ls) =>
      ls.map((l) => (l.id === activeLayer.id ? { ...l, placement: updater(l.placement) } : l))
    );
  };

  const [customTools, setCustomTools] = useState<ToolPreset[]>(() => {
    try {
      const raw = localStorage.getItem("hybridcam.customTools");
      return raw ? (JSON.parse(raw) as ToolPreset[]) : [];
    } catch {
      return [];
    }
  });
  const [showAddTool, setShowAddTool] = useState(false);
  const [newToolCat, setNewToolCat] = useState<ToolCategory>("Flat");
  const [newToolSize, setNewToolSize] = useState("10 mm");
  const [newToolDiam, setNewToolDiam] = useState("10");
  const [newToolRpm, setNewToolRpm] = useState("18000");
  const [newToolFeed, setNewToolFeed] = useState("2500");
  const [newToolStepdown, setNewToolStepdown] = useState("4");
  const [newToolStepover, setNewToolStepover] = useState("40");

  const tools = useMemo(
    () => [...getToolsForMaterial(job.material), ...customTools],
    [job.material, customTools]
  );

  useEffect(() => {
    try {
      localStorage.setItem("hybridcam.customTools", JSON.stringify(customTools));
    } catch {
      // ignore storage errors
    }
  }, [customTools]);

  const [cutProfiles, setCutProfiles] = useState<CutProfile[]>(() => {
    try {
      const raw = localStorage.getItem("hybridcam.cutProfiles");
      if (raw) {
        const parsed = JSON.parse(raw) as CutProfile[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_CUT_PROFILES;
  });
  const [editingProfile, setEditingProfile] = useState<CutProfile | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("hybridcam.cutProfiles", JSON.stringify(cutProfiles));
    } catch {
      // ignore storage errors
    }
  }, [cutProfiles]);

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem("hybridcam.sidebarWidth") || "390", 10);
    return Number.isFinite(saved) ? Math.max(300, Math.min(680, saved)) : 390;
  });

  useEffect(() => {
    try {
      localStorage.setItem("hybridcam.sidebarWidth", String(sidebarWidth));
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event("resize"));
  }, [sidebarWidth]);

  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      setSidebarWidth(Math.max(300, Math.min(680, ev.clientX)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Multi-operation job stack (e.g. Roughing + Finishing)
  const [operations, setOperations] = useState<CamOperationItem[]>([
    {
      id: "op-1",
      name: "Op 1: 3D Relief Finishing",
      enabled: true,
      strategy: "ReliefFinish3D",
      toolNumber: 11,
      overrides: {},
      stockToLeaveMm: 0,
      maxCutDepthMm: 8,
      previewPts: [],
    },
  ]);
  const [activeOpId, setActiveOpId] = useState<string>("op-1");
  const activeOp = operations.find((o) => o.id === activeOpId) ?? operations[0];
  const baseTool = tools.find((t) => t.number === activeOp.toolNumber) ?? tools[0];
  const activeTool: ToolPreset = useMemo(
    () => ({ ...baseTool, ...activeOp.overrides }),
    [baseTool, activeOp.overrides]
  );

  const [computing, setComputing] = useState(false);
  const [calcProgress, setCalcProgress] = useState(0);
  const [calcLabel, setCalcLabel] = useState("");
  const [carvedStock, setCarvedStock] = useState<{ w: number; h: number; heights: Float32Array } | null>(null);
  const [simCollisions, setSimCollisions] = useState<Array<{ kind: string; message: string }>>([]);
  const [totalTimeSec, setTotalTimeSec] = useState<number>(0);

  const [simPlaying, setSimPlaying] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simSpeed, setSimSpeed] = useState(1);
  const [showCutLines, setShowCutLines] = useState(true);
  const [showRapidLines, setShowRapidLines] = useState(true);
  const [showSimTool, setShowSimTool] = useState(true);
  const [simColorMode, setSimColorMode] = useState<"stock" | "heatmap">("stock");
  const [simTargetOverlay, setSimTargetOverlay] = useState(false);
  const [simTargetOpacity, setSimTargetOpacity] = useState(0.38);
  const [simSliceAxis, setSimSliceAxis] = useState<"none" | "x" | "y">("none");
  const [simSlicePct, setSimSlicePct] = useState(50);
  const [clampsEnabled, setClampsEnabled] = useState(false);
  const [clampPreset, setClampPreset] = useState<"corners" | "edges">("corners");
  const [clampHeightMm, setClampHeightMm] = useState(8);
  const [dialect, setDialect] = useState(() => localStorage.getItem("hybridcam.dialect") || "Grbl");
  const [gcodeExt, setGcodeExt] = useState(() => localStorage.getItem("hybridcam.gcodeExt") || "gcode");
  const [exportSafeZ, setExportSafeZ] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem("hybridcam.exportSafeZ") || "15");
    return Number.isFinite(v) ? v : 15;
  });
  const [exportEmitM6, setExportEmitM6] = useState<boolean>(() => localStorage.getItem("hybridcam.exportEmitM6") !== "false");
  const [exportProgramName, setExportProgramName] = useState<string>(() => localStorage.getItem("hybridcam.exportProgramName") || "HybridCAM_Job");
  const [lastSavedMsg, setLastSavedMsg] = useState<string>("");
  const [gcodeText, setGcodeText] = useState("");
  const [showTextBar, setShowTextBar] = useState(false);
  const [textDraft, setTextDraft] = useState("HybridCAM");

  useEffect(() => {
    if (!lastSavedMsg) return;
    const t = setTimeout(() => setLastSavedMsg(""), 6000);
    return () => clearTimeout(t);
  }, [lastSavedMsg]);

  useEffect(() => {
    if (!showAddTool && !showTextBar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAddTool(false);
        setShowTextBar(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAddTool, showTextBar]);

  useEffect(() => {
    try {
      localStorage.setItem("hybridcam.job", JSON.stringify(job));
      localStorage.setItem("hybridcam.reliefSettings", JSON.stringify(reliefSettings));
      localStorage.setItem("hybridcam.placement", JSON.stringify(placement));
      localStorage.setItem("hybridcam.shading", shading);
      localStorage.setItem("hybridcam.previewMat", previewMatId);
      localStorage.setItem("hybridcam.dialect", dialect);
      localStorage.setItem("hybridcam.gcodeExt", gcodeExt);
      localStorage.setItem("hybridcam.exportSafeZ", String(exportSafeZ));
      localStorage.setItem("hybridcam.exportEmitM6", String(exportEmitM6));
      localStorage.setItem("hybridcam.exportProgramName", exportProgramName);
    } catch {
      // ignore storage quota errors
    }
  }, [job, reliefSettings, placement, shading, previewMatId, dialect, gcodeExt, exportSafeZ, exportEmitM6, exportProgramName]);

  const updateActiveOp = (patch: Partial<CamOperationItem>) => {
    setOperations((ops) => ops.map((o) => (o.id === activeOp.id ? { ...o, ...patch } : o)));
  };

  const moveOperation = (id: string, dir: -1 | 1) => {
    setOperations((ops) => {
      const idx = ops.findIndex((o) => o.id === id);
      if (idx < 0) return ops;
      const target = idx + dir;
      if (target < 0 || target >= ops.length) return ops;
      const next = [...ops];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const addOperation = (strategy: StrategyKey) => {
    const defaultTool =
      strategy === "Adaptive2D" || strategy === "AdaptiveOffset2D" || strategy === "Pocket2D" || strategy === "Contour2D" || strategy === "ReliefRough3D" || strategy === "Drilling"
        ? 1
        : strategy === "VCarve"
        ? 15
        : strategy === "PhotoVCarve"
        ? 18
        : 11;
    const id = `op-${Date.now()}`;
    const labelMap: Record<StrategyKey, string> = {
      Adaptive2D: "2D Adaptive Clearing",
      AdaptiveOffset2D: "2D Offset + Arcs (G2/G3)",
      Pocket2D: "2D Pocket",
      Contour2D: "2D Contour + Tabs",
      VCarve: "True / 3D V-Carving",
      PhotoVCarve: "PhotoVCarve / Lithophane",
      ReliefRough3D: "3D Relief Roughing",
      ReliefFinish3D: "3D Parallel Finishing",
      SteepShallow3D: "3D Steep & Shallow",
      Spiral3D: "3D Spiral Finishing",
      Pencil3D: "3D Pencil / Valley Cleanup",
      Drilling: "Peck Drilling (Holes)",
    };
    const nextOp: CamOperationItem = {
      id,
      name: `Op ${operations.length + 1}: ${labelMap[strategy]}`,
      enabled: true,
      strategy,
      toolNumber: defaultTool,
      overrides: {},
      stockToLeaveMm: strategy === "ReliefRough3D" ? 0.6 : 0,
      maxCutDepthMm: reliefSettings.maxZMm,
      restFromOpId: null,
      tabsEnabled: strategy === "Contour2D",
      tabCount: 4,
      tabWidthMm: 8,
      tabHeightMm: 2.5,
      rampEnabled: strategy === "Adaptive2D" || strategy === "Pocket2D" || strategy === "Contour2D",
      previewPts: [],
    };
    setOperations((ops) => [...ops, nextOp]);
    setActiveOpId(id);
  };

  // Add imported PNG/TIFF/JPG/BMP depth map via Rust 16-bit decoder (with canvas fallback)
  const handleDepthMapUpload = async (e: React.ChangeEvent<HTMLInputElement>, replaceCurrent = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    let newSrc: { width: number; height: number; data: Float32Array; label: string } | null = null;
    try {
      const buf = await file.arrayBuffer();
      const res = await invoke<{ width: number; height: number; data: number[] }>("import_depth_map_bytes_ipc", {
        bytes: Array.from(new Uint8Array(buf)),
      });
      newSrc = { width: res.width, height: res.height, data: new Float32Array(res.data), label: file.name };
    } catch {
      // Fallback to 8-bit browser decoder if running outside Tauri
      newSrc = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const maxSrc = 1024;
          const scale = Math.min(1, maxSrc / Math.max(img.width, img.height));
          const w = Math.max(32, Math.round(img.width * scale));
          const h = Math.max(32, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          const out = new Float32Array(w * h);
          for (let i = 0; i < w * h; i++) {
            out[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
          }
          resolve({ width: w, height: h, data: out, label: file.name });
        };
        img.src = URL.createObjectURL(file);
      });
    }

    if (!newSrc) return;
    if (job.widthMm !== machineBed.widthMm || job.depthMm !== machineBed.depthMm) {
      setJob((j) => ({ ...j, widthMm: machineBed.widthMm, depthMm: machineBed.depthMm }));
      setOriginalBedSize(null);
    }
    const isOnlyDefault =
      layers.length === 1 && layers[0].id === "layer-1" && layers[0].name === "Built-in Rectangular Plaque";

    if (replaceCurrent && activeLayer) {
      setLayers((ls) =>
        ls.map((l) =>
          l.id === activeLayer.id
            ? { ...l, name: file.name, source: newSrc!, placement: { ...DEFAULT_PLACEMENT, scale: 1.0 } }
            : l
        )
      );
    } else if (isOnlyDefault) {
      const id = `layer-${Date.now()}`;
      setLayers([
        {
          id,
          name: file.name,
          visible: true,
          combineMode: "mergeHigh",
          weight: 1.0,
          source: newSrc,
          placement: { ...DEFAULT_PLACEMENT, scale: 1.0 },
        },
      ]);
      setActiveLayerId(id);
    } else {
      const id = `layer-${Date.now()}`;
      setLayers((ls) => [
        ...ls,
        {
          id,
          name: file.name,
          visible: true,
          combineMode: "mergeHigh",
          weight: 1.0,
          source: newSrc!,
          placement: { ...DEFAULT_PLACEMENT, scale: 1.0 },
        },
      ]);
      setActiveLayerId(id);
    }
  };

  const [originalBedSize, setOriginalBedSize] = useState<{ widthMm: number; depthMm: number } | null>(null);

  const restoreOriginalBed = () => {
    const targetW = originalBedSize?.widthMm ?? machineBed.widthMm;
    const targetD = originalBedSize?.depthMm ?? machineBed.depthMm;
    const changed = job.widthMm !== targetW || job.depthMm !== targetD;
    if (changed) {
      setJob((j) => ({ ...j, widthMm: targetW, depthMm: targetD }));
    }
    setOriginalBedSize(null);
    return changed;
  };

  // Trim stock/bed dimensions to the exact bounding box used by visible picture(s)
  const handleTrimUnusedBed = () => {
    const visible = layers.filter((l) => l.visible);
    if (visible.length === 0) return;
    pushUndoSnapshot();
    if (!originalBedSize) {
      setOriginalBedSize({ widthMm: job.widthMm, depthMm: job.depthMm });
    }
    const bounds = computeCombinedBoundsMm(layers, job.widthMm, job.depthMm, reliefSettings.preserveAspect);
    const newW = Math.max(10, Math.round(bounds.picW * 10) / 10);
    const newD = Math.max(10, Math.round(bounds.picH * 10) / 10);
    const cx = (bounds.minX + bounds.maxX) * 0.5;
    const cy = (bounds.minY + bounds.maxY) * 0.5;
    setJob((j) => ({ ...j, widthMm: newW, depthMm: newD }));
    setLayers((ls) =>
      ls.map((l) => {
        if (!l.visible) return l;
        if (visible.length === 1) {
          return { ...l, placement: { ...l.placement, offsetXMm: 0, offsetYMm: 0, scale: 1.0 } };
        }
        return {
          ...l,
          placement: {
            ...l.placement,
            offsetXMm: l.placement.offsetXMm - cx,
            offsetYMm: l.placement.offsetYMm - cy,
          },
        };
      })
    );
    setLastSavedMsg(`Bed trimmed to ${newW}×${newD} mm`);
  };

  // Compute all enabled operations via the CAM kernel, then run Dexel simulation
  const handleComputeAndSimulateAll = async () => {
    setComputing(true);
    setCalcProgress(5);
    setCalcLabel("Preparing geometry...");
    const topZ = job.zZero === "top" ? 0 : job.thicknessMm;
    const tiltSlope = Math.tan(((reliefSettings.tiltDeg || 0) * Math.PI) / 180);
    const physicalHeights = new Array<number>(reliefHeights.length);
    for (let y = 0; y < gridH; y++) {
      const rustY = gridH - 1 - y;
      for (let x = 0; x < gridW; x++) {
        const i = y * gridW + x;
        const xMm = ((x / Math.max(1, gridW - 1)) - 0.5) * job.widthMm;
        physicalHeights[rustY * gridW + x] =
          topZ + reliefSettings.baseHeightMm - reliefSettings.maxZMm + reliefHeights[i] * reliefSettings.maxZMm + xMm * tiltSlope;
      }
    }

    const enabledCount = Math.max(1, operations.filter((o) => o.enabled).length);
    let doneCount = 0;
    const updatedOps: CamOperationItem[] = [];
    for (const op of operations) {
      if (!op.enabled) {
        updatedOps.push(op);
        continue;
      }
      setCalcLabel(`Calculating ${op.name} (${doneCount + 1}/${enabledCount})...`);
      setCalcProgress(Math.round(10 + (doneCount / enabledCount) * 60));
      const bTool = tools.find((t) => t.number === op.toolNumber) ?? tools[0];
      const effTool: ToolPreset = { ...bTool, ...op.overrides };

    const activeVectorPolys =
      enableVectorMode && vectorShapes.length > 0
        ? vectorShapes
            .filter((s) => s.visible && (opStrategyForVectors(op.strategy, s.role)))
            .map((s) => shapeToPolylineMm(s))
            .filter((p) => p.length >= 2)
        : [];
    function opStrategyForVectors(strat: StrategyKey, role: VectorRole): boolean {
      if (strat === "Contour2D") return role === "cutout" || role === "carve";
      if (strat === "VCarve") return role === "vcarve" || role === "cutout";
      if (strat === "Pocket2D" || strat === "Adaptive2D" || strat === "AdaptiveOffset2D") return role === "carve" || role === "cutout";
      return false;
    }

      let rawPts: PreviewPoint[] = [];
      let rustTp: RustToolpath | undefined;
      if (op.strategy === "Drilling") {
        const holes: Array<[number, number, number]> = [];
        for (const vs of vectorShapes) {
          if (vs.visible && vs.kind === "circle") {
            holes.push([vs.xMm, vs.yMm, Math.min(op.maxCutDepthMm, vs.depthMm || op.maxCutDepthMm)]);
          }
        }
        for (const sm of solidModels) {
          if (sm.visible && sm.kind === "hole") {
            holes.push([sm.xMm, sm.yMm, Math.min(op.maxCutDepthMm, sm.heightMm)]);
          }
        }
        if (holes.length === 0) holes.push([0, 0, Math.min(op.maxCutDepthMm, job.thicknessMm)]);
        const peck = Math.max(0.5, effTool.stepdownMm);
        const safeZ = topZ + Math.max(2, exportSafeZ);
        const segments: RustToolpathSegment[] = [];
        let curPos = { x: holes[0][0], y: holes[0][1], z: safeZ };
        let cutDist = 0;
        const pushSeg = (kind: "Rapid" | "Linear", nx: number, ny: number, nz: number, feed: number) => {
          const end = { x: nx, y: ny, z: nz };
          segments.push({ kind, start: { ...curPos }, end, feed_mm_min: feed });
          if (kind === "Linear") cutDist += Math.hypot(nx - curPos.x, ny - curPos.y, nz - curPos.z);
          curPos = end;
        };
        for (const [hx, hy, depth] of holes) {
          rawPts.push({ x: hx, y: hy, z: safeZ, rapid: true });
          pushSeg("Rapid", hx, hy, safeZ, machineProfile.maxRapidMmMin);
          const targetZ = topZ - depth;
          let curZ = topZ;
          while (curZ > targetZ + 1e-4) {
            curZ = Math.max(targetZ, curZ - peck);
            rawPts.push({ x: hx, y: hy, z: curZ, rapid: false });
            pushSeg("Linear", hx, hy, curZ, effTool.plungeMmMin);
            rawPts.push({ x: hx, y: hy, z: topZ + 1.5, rapid: true });
            pushSeg("Rapid", hx, hy, topZ + 1.5, machineProfile.maxRapidMmMin);
          }
          rawPts.push({ x: hx, y: hy, z: safeZ, rapid: true });
          pushSeg("Rapid", hx, hy, safeZ, machineProfile.maxRapidMmMin);
        }
        rustTp = {
          operation_id: op.id,
          tool_number: effTool.number,
          spindle_rpm: effTool.rpm,
          segments,
          estimated_time_sec: (cutDist / Math.max(50, effTool.plungeMmMin)) * 60 + holes.length * 1.5,
          total_cut_distance_mm: cutDist,
          warnings: [],
        };
      } else {
      try {
        const res = await invoke<{ toolpath: RustToolpath }>("compute_operation_ipc", {
          req: {
            strategy: op.strategy,
            material: job.material,
            tool_number: op.toolNumber,
            rpm_override: op.overrides.rpm ?? null,
            feed_override: op.overrides.feedMmMin ?? null,
            stepdown_override: op.overrides.stepdownMm ?? null,
            stepover_fraction_override:
              op.overrides.stepoverPct !== undefined ? op.overrides.stepoverPct / 100 : null,
            width_mm: job.widthMm,
            depth_mm: job.depthMm,
            thickness_mm: job.thicknessMm,
            z_zero_top: job.zZero === "top",
            clearance_z_mm: job.clearanceZMm,
            relief_w: gridW,
            relief_h: gridH,
            relief_heights_mm: physicalHeights,
            raw_luma: Array.from(reliefHeights),
            max_cut_depth_mm: op.maxCutDepthMm,
            stock_to_leave_mm: op.stockToLeaveMm,
            carve_bounds_mm: [pictureBounds.minX, pictureBounds.minY, pictureBounds.maxX, pictureBounds.maxY],
            vector_polylines: activeVectorPolys.length > 0 ? activeVectorPolys : null,
          },
        });
        rustTp = res.toolpath;
        rawPts = res.toolpath.segments.map((s) => ({
          x: s.end.x,
          y: s.end.y,
          z: s.end.z,
          rapid: s.kind === "Rapid",
        }));
      } catch {
        // Fallback for non-Tauri browser preview
        rawPts = generatePreviewToolpath(job, op.strategy, effTool, reliefHeights, gridW, gridH, reliefSettings.maxZMm);
      }
      }

      // Apply Ramp Entry & Holding Tabs when enabled
      let finalPts = rawPts;
      if (op.rampEnabled && finalPts.length > 2) {
        const ramped: PreviewPoint[] = [finalPts[0]];
        for (let i = 1; i < finalPts.length; i++) {
          const prev = ramped[ramped.length - 1];
          const cur = finalPts[i];
          const isVerticalPlunge = !cur.rapid && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 0.05 && cur.z < prev.z - 0.3;
          if (isVerticalPlunge && i + 1 < finalPts.length && !finalPts[i + 1].rapid) {
            const next = finalPts[i + 1];
            const dx = next.x - cur.x;
            const dy = next.y - cur.y;
            const len = Math.hypot(dx, dy);
            if (len > 2) {
              const rampDist = Math.min(len * 0.5, 10);
              const rx = cur.x + (dx / len) * rampDist;
              const ry = cur.y + (dy / len) * rampDist;
              ramped.push({ x: rx, y: ry, z: cur.z, rapid: false });
              ramped.push({ x: cur.x, y: cur.y, z: cur.z, rapid: false });
              continue;
            }
          }
          ramped.push(cur);
        }
        finalPts = ramped;
      }

      if (op.tabsEnabled && (op.strategy === "Contour2D" || op.strategy === "Pocket2D" || op.strategy === "Adaptive2D") && finalPts.length > 4) {
        const tabCount = Math.max(1, op.tabCount ?? 4);
        const tabHeight = Math.max(0.5, op.tabHeightMm ?? 2.5);
        let minZ = Infinity;
        for (const p of finalPts) if (!p.rapid && p.z < minZ) minZ = p.z;
        const cutIndices: number[] = [];
        for (let i = 0; i < finalPts.length; i++) {
          if (!finalPts[i].rapid && finalPts[i].z <= minZ + 0.15) cutIndices.push(i);
        }
        if (cutIndices.length > tabCount * 2) {
          const cloned = finalPts.map((p) => ({ ...p }));
          for (let t = 0; t < tabCount; t++) {
            const pick = cutIndices[Math.floor(((t + 0.5) / tabCount) * cutIndices.length)];
            cloned[pick].z = Math.min(topZ, cloned[pick].z + tabHeight);
          }
          finalPts = cloned;
        }
      }

      // Apply Rest Machining envelope filter if linked to a previous operation
      if (op.restFromOpId) {
        const prevOp = updatedOps.find((o) => o.id === op.restFromOpId);
        if (prevOp && prevOp.previewPts.length > 0) {
          const rw = 120;
          const rh = 90;
          const roughGrid = new Float32Array(rw * rh).fill(topZ);
          const prevBaseTool = tools.find((t) => t.number === prevOp.toolNumber) ?? tools[0];
          const prevRadius = Math.max(0.5, prevBaseTool.diameterMm * 0.5);
          const rxCells = Math.ceil((prevRadius / Math.max(1, job.widthMm)) * (rw - 1));
          const ryCells = Math.ceil((prevRadius / Math.max(1, job.depthMm)) * (rh - 1));
          for (const p of prevOp.previewPts) {
            if (p.rapid) continue;
            const gx = Math.max(0, Math.min(rw - 1, Math.round(((p.x + job.widthMm * 0.5) / job.widthMm) * (rw - 1))));
            const gy = Math.max(0, Math.min(rh - 1, Math.round(((p.y + job.depthMm * 0.5) / job.depthMm) * (rh - 1))));
            for (let dy = -ryCells; dy <= ryCells; dy++) {
              const yy = gy + dy;
              if (yy < 0 || yy >= rh) continue;
              for (let dx = -rxCells; dx <= rxCells; dx++) {
                const xx = gx + dx;
                if (xx < 0 || xx >= rw) continue;
                const idx = yy * rw + xx;
                if (p.z < roughGrid[idx]) roughGrid[idx] = p.z;
              }
            }
          }
          const safeZ = topZ + job.clearanceZMm;
          const restFiltered: PreviewPoint[] = [];
          let lastKept: PreviewPoint | null = null;
          for (const p of finalPts) {
            if (p.rapid) continue;
            const gx = Math.max(0, Math.min(rw - 1, Math.round(((p.x + job.widthMm * 0.5) / job.widthMm) * (rw - 1))));
            const gy = Math.max(0, Math.min(rh - 1, Math.round(((p.y + job.depthMm * 0.5) / job.depthMm) * (rh - 1))));
            const rem = roughGrid[gy * rw + gx] - p.z;
            if (rem > 0.15) {
              if (!lastKept || Math.hypot(p.x - lastKept.x, p.y - lastKept.y) > 3.0) {
                if (lastKept) {
                  restFiltered.push({ x: lastKept.x, y: lastKept.y, z: safeZ, rapid: true });
                }
                restFiltered.push({ x: p.x, y: p.y, z: safeZ, rapid: true });
                restFiltered.push({ x: p.x, y: p.y, z: Math.min(safeZ, topZ + 2.0), rapid: true });
              }
              restFiltered.push(p);
              lastKept = p;
            }
          }
          if (lastKept) {
            restFiltered.push({ x: lastKept.x, y: lastKept.y, z: safeZ, rapid: true });
          }
          finalPts = restFiltered;
        }
      }

      // Compute per-op cut/rapid time & Z-bounds
      let cutDist = 0;
      let rapidDist = 0;
      let zMin = Infinity;
      let zMax = -Infinity;
      for (let i = 0; i < finalPts.length; i++) {
        const p = finalPts[i];
        if (p.z < zMin) zMin = p.z;
        if (p.z > zMax) zMax = p.z;
        if (i > 0) {
          const d = Math.hypot(p.x - finalPts[i - 1].x, p.y - finalPts[i - 1].y, p.z - finalPts[i - 1].z);
          if (p.rapid) rapidDist += d;
          else cutDist += d;
        }
      }
      const cutTimeSec = (cutDist / Math.max(100, effTool.feedMmMin)) * 60;
      const rapidTimeSec = (rapidDist / 4500) * 60;

      if (rustTp && finalPts.length > 1 && (op.rampEnabled || op.tabsEnabled || op.restFromOpId)) {
        const segs: RustToolpathSegment[] = [];
        for (let i = 1; i < finalPts.length; i++) {
          const a = finalPts[i - 1];
          const b = finalPts[i];
          segs.push({
            kind: b.rapid ? "Rapid" : "Linear",
            start: { x: a.x, y: a.y, z: a.z },
            end: { x: b.x, y: b.y, z: b.z },
            feed_mm_min: b.rapid ? 4500 : effTool.feedMmMin,
          });
        }
        rustTp = { ...rustTp, segments: segs, estimated_time_sec: cutTimeSec + rapidTimeSec };
      }

      updatedOps.push({
        ...op,
        rustToolpath: rustTp,
        previewPts: finalPts,
        cutTimeSec,
        rapidTimeSec,
        zMinMm: Number.isFinite(zMin) ? zMin : 0,
        zMaxMm: Number.isFinite(zMax) ? zMax : 0,
      });
      doneCount += 1;
      setCalcProgress(Math.round(10 + (doneCount / enabledCount) * 60));
    }

    setOperations(updatedOps);
    setCalcLabel("Simulating carved stock...");
    setCalcProgress(78);

    // Run Rust DexelStock Simulation
    const simItems = updatedOps
      .filter((o) => o.enabled && o.rustToolpath)
      .map((o) => ({ toolpath: o.rustToolpath!, tool_number: o.toolNumber }));

    if (simItems.length > 0) {
      try {
        const simRes = await invoke<{
          width_px: number;
          height_px: number;
          stock_heights_mm: number[];
          collisions: Array<{ kind: string; message: string }>;
          total_time_sec: number;
        }>("simulate_stack_ipc", {
          req: {
            width_mm: job.widthMm,
            depth_mm: job.depthMm,
            top_z_mm: topZ,
            grid_w: Math.min(520, Math.max(360, gridW)),
            grid_h: Math.min(420, Math.max(280, gridH)),
            operations: simItems,
          },
        });
        setCarvedStock({
          w: simRes.width_px,
          h: simRes.height_px,
          heights: new Float32Array(simRes.stock_heights_mm),
        });
        setSimCollisions(simRes.collisions);
        setTotalTimeSec(simRes.total_time_sec);
        setViewportSource("carved");
      } catch {
        setCarvedStock(null);
      }
    }

    setCalcProgress(100);
    setComputing(false);
    setCalcLabel("");
    setSimProgress(0);
    setStep("simulate");
    setSimPlaying(true);
  };

  // Lazy combined G-code generation via async Rust Post-Processor (only when on Export or Run CNC tab)
  useEffect(() => {
    if (step !== "export" && step !== "run") return;
    let cancelled = false;
    const customPost = customPosts.find((p) => p.id === dialect);
    const effectiveDialect = customPost ? customPost.baseDialect : dialect;
    const postCtx = {
      programName: exportProgramName || job.name,
      toolLabel: `T${activeTool.number} ${activeTool.name}`,
      rpm: activeTool.rpm,
      safeZ: exportSafeZ,
      units: job.units,
    };
    const [ox, oy] = getXyOriginOffsetMm(job);
    const finalize = (raw: string, fromRust: boolean) => {
      const shifted = fromRust && raw ? shiftGcodeXyOrigin(raw, ox, oy) : raw;
      const postOut = customPost && shifted ? applyCustomPostProcessor(shifted, customPost, postCtx) : shifted;
      return postOut ? applyMachineProfileToGcode(postOut, machineProfile) : postOut;
    };
    const rustTps = operations.filter((o) => o.enabled && o.rustToolpath).map((o) => o.rustToolpath!);
    if (rustTps.length > 0) {
      invoke<string>("export_gcode_text", {
        toolpaths: rustTps,
        dialect: effectiveDialect,
        programName: exportProgramName || job.name,
        safeZMm: exportSafeZ,
        emitM6: exportEmitM6,
      })
        .then((txt) => {
          if (!cancelled) setGcodeText(finalize(txt, true));
        })
        .catch(() => {
          if (!cancelled) {
            const allPts = operations.flatMap((o) => (o.enabled ? o.previewPts : []));
            setGcodeText(allPts.length ? finalize(buildGcode(job, activeTool, allPts, effectiveDialect), false) : "");
          }
        });
    } else {
      const allPts = operations.flatMap((o) => (o.enabled ? o.previewPts : []));
      setGcodeText(allPts.length ? finalize(buildGcode(job, activeTool, allPts, effectiveDialect), false) : "");
    }
    return () => {
      cancelled = true;
    };
  }, [step, operations, dialect, customPosts, machineProfile, job, activeTool, exportProgramName, exportSafeZ, exportEmitM6]);

  const { gcodePreviewText, gcodeLineCount, gcodeSizeLabel } = useMemo(() => {
    if (!gcodeText) {
      return {
        gcodePreviewText: "Calculate toolpaths first to generate G-code.",
        gcodeLineCount: 0,
        gcodeSizeLabel: "0 KB",
      };
    }
    const lines = gcodeText.split("\n");
    const bytes = gcodeText.length;
    const sizeLabel = bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const maxPreview = 400;
    const preview =
      lines.length > maxPreview
        ? `${lines.slice(0, maxPreview).join("\n")}\n\n... (Showing first ${maxPreview} of ${lines.length.toLocaleString()} lines — Save G-Code exports the complete file)`
        : gcodeText;
    return { gcodePreviewText: preview, gcodeLineCount: lines.length, gcodeSizeLabel: sizeLabel };
  }, [gcodeText]);

  const handleDownloadGcode = async () => {
    const fileName = `${exportProgramName || job.name}.${gcodeExt}`;
    const bytes = Array.from(new TextEncoder().encode(gcodeText));
    try {
      const savedPath = await invoke<string | null>("save_file_dialog_ipc", {
        defaultName: fileName,
        filterName: `G-Code (*.${gcodeExt})`,
        extension: gcodeExt,
        bytes,
      });
      if (savedPath) setLastSavedMsg(`Saved: ${savedPath}`);
    } catch {
      const blob = new Blob([gcodeText], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
    }
  };

  const { allTaggedPts, opStartMarkers } = useMemo(() => {
    const tagged: TaggedPreviewPoint[] = [];
    const markers: Array<{ opId: string; opName: string; startIdx: number; pct: number }> = [];
    let opIdx = 0;
    for (const op of operations) {
      if (!op.enabled || op.previewPts.length === 0) continue;
      const bTool = tools.find((t) => t.number === op.toolNumber) ?? tools[0];
      const effTool: ToolPreset = { ...bTool, ...op.overrides };
      const isBall = effTool.category === "Ballnose" || effTool.category === "Tapered";
      const startIdx = tagged.length;
      markers.push({ opId: op.id, opName: op.name, startIdx, pct: 0 });
      for (const p of op.previewPts) {
        tagged.push({
          ...p,
          opId: op.id,
          opName: op.name,
          opIndex: opIdx,
          feedMmMin: effTool.feedMmMin,
          rpm: effTool.rpm,
          toolDiamMm: effTool.diameterMm,
          isBall,
        });
      }
      opIdx += 1;
    }
    const denom = Math.max(1, tagged.length - 1);
    for (const m of markers) {
      m.pct = (m.startIdx / denom) * 100;
    }
    return { allTaggedPts: tagged, opStartMarkers: markers };
  }, [operations, tools]);

  const allPreviewPts = allTaggedPts;

  const clampZones: ClampZone[] = useMemo(() => {
    if (!clampsEnabled) return [];
    const cw = Math.min(24, job.widthMm * 0.14);
    const cd = Math.min(24, job.depthMm * 0.14);
    const hw = job.widthMm * 0.5;
    const hd = job.depthMm * 0.5;
    if (clampPreset === "corners") {
      return [
        { id: "c1", label: "Front-Left Clamp", xMm: -hw + cw * 0.5, yMm: -hd + cd * 0.5, wMm: cw, dMm: cd, hMm: clampHeightMm },
        { id: "c2", label: "Front-Right Clamp", xMm: hw - cw * 0.5, yMm: -hd + cd * 0.5, wMm: cw, dMm: cd, hMm: clampHeightMm },
        { id: "c3", label: "Back-Left Clamp", xMm: -hw + cw * 0.5, yMm: hd - cd * 0.5, wMm: cw, dMm: cd, hMm: clampHeightMm },
        { id: "c4", label: "Back-Right Clamp", xMm: hw - cw * 0.5, yMm: hd - cd * 0.5, wMm: cw, dMm: cd, hMm: clampHeightMm },
      ];
    }
    return [
      { id: "e1", label: "Front Edge Clamp", xMm: 0, yMm: -hd + cd * 0.45, wMm: cw * 1.4, dMm: cd * 0.9, hMm: clampHeightMm },
      { id: "e2", label: "Back Edge Clamp", xMm: 0, yMm: hd - cd * 0.45, wMm: cw * 1.4, dMm: cd * 0.9, hMm: clampHeightMm },
    ];
  }, [clampsEnabled, clampPreset, clampHeightMm, job.widthMm, job.depthMm]);

  const clampCollisions = useMemo(() => {
    const hits: string[] = [];
    if (allTaggedPts.length === 0) return hits;
    const topZ = job.zZero === "top" ? 0 : job.thicknessMm;
    let lowRapidCount = 0;
    const hitClamps = new Set<string>();
    for (let i = 1; i < allTaggedPts.length; i++) {
      const a = allTaggedPts[i - 1];
      const b = allTaggedPts[i];
      if (b.rapid && Math.hypot(b.x - a.x, b.y - a.y) > 1 && a.z <= topZ + 0.05 && b.z <= topZ + 0.05) {
        lowRapidCount += 1;
      }
      for (const c of clampZones) {
        const tr = b.toolDiamMm * 0.5;
        const inX = b.x >= c.xMm - c.wMm * 0.5 - tr && b.x <= c.xMm + c.wMm * 0.5 + tr;
        const inY = b.y >= c.yMm - c.dMm * 0.5 - tr && b.y <= c.yMm + c.dMm * 0.5 + tr;
        if (inX && inY && b.z < topZ + c.hMm) {
          hitClamps.add(c.label);
        }
      }
    }
    if (lowRapidCount > 0) hits.push(`${lowRapidCount} rapid move(s) near/below stock top`);
    hitClamps.forEach((lbl) => hits.push(`Tool enters ${lbl}`));
    return hits;
  }, [allTaggedPts, clampZones, job.zZero, job.thicknessMm]);

  // Incremental zero-stride simulation cache so live material removal never skips rapid retracts or flickers
  const incSimRef = useRef<{
    key: string;
    w: number;
    h: number;
    heights: Float32Array;
    lastIdx: number;
  } | null>(null);

  // Progressive live material removal up to current simProgress (so user watches the material being carved!)
  const liveCarvedStock = useMemo(() => {
    if (allTaggedPts.length === 0 || (viewportSource !== "carved" && step !== "simulate")) {
      return null;
    }
    // At 100%, use the exact high-res Rust DexelStock result if available
    if (simProgress >= 99.5 && carvedStock) {
      return carvedStock;
    }
    const simW = simResolution;
    const simH = Math.max(100, Math.round((simResolution * job.depthMm) / Math.max(1, job.widthMm)));
    const topZ = job.zZero === "top" ? 0 : job.thicknessMm;
    const key = `${allTaggedPts.length}-${job.widthMm}-${job.depthMm}-${job.thicknessMm}-${job.zZero}`;
    const endIdx = Math.min(allTaggedPts.length - 1, Math.floor((simProgress / 100) * (allTaggedPts.length - 1)));

    let cache = incSimRef.current;
    if (!cache || cache.key !== key || endIdx < cache.lastIdx) {
      const heights = new Float32Array(simW * simH);
      heights.fill(topZ);
      cache = { key, w: simW, h: simH, heights, lastIdx: 0 };
      incSimRef.current = cache;
    }

    const heights = cache.heights;
    const pitchMm = Math.max(job.widthMm / Math.max(1, simW - 1), job.depthMm / Math.max(1, simH - 1));

    for (let s = cache.lastIdx + 1; s <= endIdx; s++) {
      const a = allTaggedPts[s - 1];
      const b = allTaggedPts[s];
      if (b.rapid) continue;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist > 25) continue;
      const r = Math.max(pitchMm * 0.9, b.toolDiamMm * 0.5);
      const isBall = b.isBall;
      const subSteps = Math.max(1, Math.ceil(dist / Math.max(0.45, r * 0.6)));
      for (let k = 0; k <= subSteps; k++) {
        const t = k / subSteps;
        const tx = a.x + (b.x - a.x) * t;
        const ty = a.y + (b.y - a.y) * t;
        const tz = a.z + (b.z - a.z) * t;

        const px0 = Math.max(0, Math.floor(((tx - r + job.widthMm * 0.5) / job.widthMm) * (simW - 1)));
        const px1 = Math.min(simW - 1, Math.ceil(((tx + r + job.widthMm * 0.5) / job.widthMm) * (simW - 1)));
        // Dexel row 0 = -Y (bottom), row simH-1 = +Y (top)
        const py0 = Math.max(0, Math.floor(((ty - r + job.depthMm * 0.5) / job.depthMm) * (simH - 1)));
        const py1 = Math.min(simH - 1, Math.ceil(((ty + r + job.depthMm * 0.5) / job.depthMm) * (simH - 1)));

        for (let py = py0; py <= py1; py++) {
          const wy = (py / (simH - 1) - 0.5) * job.depthMm;
          for (let px = px0; px <= px1; px++) {
            const wx = (px / (simW - 1) - 0.5) * job.widthMm;
            const d = Math.hypot(wx - tx, wy - ty);
            if (d <= r) {
              const dEff = Math.max(0, d - pitchMm * 0.45);
              const dz = isBall ? r - Math.sqrt(Math.max(0, r * r - dEff * dEff)) : 0;
              const cutZ = tz + dz;
              const idx = py * simW + px;
              if (cutZ < heights[idx]) heights[idx] = cutZ;
            }
          }
        }
      }
    }
    cache.lastIdx = endIdx;
    return { w: simW, h: simH, heights: new Float32Array(heights) };
  }, [allTaggedPts, simProgress, viewportSource, step, carvedStock, job]);

  // Toggle OrbitControls left-click when 3D Sculpt Mode is active
  useEffect(() => {
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;
    const isSculpting = sculpt3dActive && step === "relief";
    ctx.controls.mouseButtons = isSculpting
      ? { LEFT: undefined as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    if (!isSculpting && ctx.brushRing) ctx.brushRing.visible = false;
  }, [sculpt3dActive, step]);

  // Attach 3D TransformControls gizmo to the active solid in 3D Model mode
  useEffect(() => {
    const ctx = sceneObjectsRef.current;
    if (!ctx || !ctx.transformControls || !ctx.gizmoTarget) return;
    const activeSolid = solidModels.find((m) => m.id === activeSolidId) ?? solidModels[0];
    if (step === "layout" && designMode === "model3d" && activeSolid) {
      const topZ = job.zZero === "top" ? 0 : job.thicknessMm;
      activeSolidRef.current = { id: activeSolid.id, topZ };
      ctx.gizmoTarget.position.set(activeSolid.xMm, activeSolid.yMm, topZ + activeSolid.zMm);
      ctx.transformControls.attach(ctx.gizmoTarget);
    } else {
      activeSolidRef.current = { id: "", topZ: 0 };
      ctx.transformControls.detach();
    }
    needsRenderRef.current = true;
  }, [step, designMode, activeSolidId, solidModels, job.zZero, job.thicknessMm]);

  const sculptingNow = useRef(false);
  const flattenTargetRef = useRef(0.5);
  const raycasterRef = useRef(new THREE.Raycaster());

  const raycastSculpt = (clientX: number, clientY: number, applyStroke: boolean, isStart: boolean) => {
    const ctx = sceneObjectsRef.current;
    const el = mountRef.current;
    if (!ctx || !el || !ctx.reliefMesh) return;
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(ndc, ctx.camera);
    const hits = raycasterRef.current.intersectObject(ctx.reliefMesh, false);
    if (hits.length === 0) {
      if (ctx.brushRing) ctx.brushRing.visible = false;
      return;
    }
    const pt = hits[0].point;
    if (ctx.brushRing) {
      ctx.brushRing.visible = true;
      ctx.brushRing.position.set(pt.x, pt.y, pt.z + 0.25);
      ctx.brushRing.scale.set(sculptRadiusMm, sculptRadiusMm, 1);
    }
    if (applyStroke) {
      if (isStart) {
        pushUndoSnapshot();
        const px = Math.min(gridW - 1, Math.max(0, Math.round(((pt.x + job.widthMm * 0.5) / job.widthMm) * (gridW - 1))));
        const py = Math.min(gridH - 1, Math.max(0, Math.round((0.5 - pt.y / job.depthMm) * (gridH - 1))));
        flattenTargetRef.current = reliefHeights[py * gridW + px] ?? 0.5;
      }
      setSculptDelta((prev) =>
        apply3dSculptBrush(prev, reliefHeights, gridW, gridH, job.widthMm, job.depthMm, pt.x, pt.y, {
          kind: sculptBrush,
          falloff: sculptFalloff,
          radiusMm: sculptRadiusMm,
          strength: sculptStrength,
          flattenTargetNorm: flattenTargetRef.current,
        })
      );
    }
  };

  // 1. Initialize persistent Three.js scene ONCE
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(activeTheme.viewportBg);

    const initW = el.clientWidth || 800;
    const initH = el.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(42, initW / initH, 0.5, 8000);
    camera.position.set(180, -210, 175);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(initW, initH);
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    el.innerHTML = "";
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomSpeed = invertZoom ? -1.0 : 1.0;
    controls.addEventListener("change", () => {
      needsRenderRef.current = true;
    });

    // Raking 3-point studio lighting so relief micro-details show crisp highlights
    const keyLight = new THREE.DirectionalLight(0xfff6e8, 1.85);
    keyLight.position.set(280, -220, 130);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9ec5ff, 0.4);
    fillLight.position.set(-240, 180, 100);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.45);
    rimLight.position.set(0, 260, 70);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(0x3a4352, 0.35));

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    const overlayGroup = new THREE.Group();
    scene.add(overlayGroup);

    const toolCone = new THREE.Mesh(
      new THREE.ConeGeometry(3, 18, 20),
      new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.45, roughness: 0.3 })
    );
    toolCone.rotation.x = -Math.PI / 2;
    toolCone.visible = false;
    scene.add(toolCone);

    const brushRing = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1.0, 48),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
    );
    brushRing.visible = false;
    scene.add(brushRing);

    const gizmoTarget = new THREE.Object3D();
    scene.add(gizmoTarget);
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setSize(0.75);
    transformControls.addEventListener("change", () => {
      needsRenderRef.current = true;
    });
    transformControls.addEventListener("dragging-changed", (ev) => {
      controls.enabled = !ev.value;
      if (!ev.value) {
        const { id, topZ } = activeSolidRef.current;
        if (id) {
          const nx = Math.round(gizmoTarget.position.x * 2) / 2;
          const ny = Math.round(gizmoTarget.position.y * 2) / 2;
          const nz = Math.round((gizmoTarget.position.z - topZ) * 2) / 2;
          setSolidModels((ms) =>
            ms.map((m) => (m.id === id ? { ...m, xMm: nx, yMm: ny, zMm: nz } : m))
          );
        }
      }
    });
    scene.add(transformControls.getHelper());

    sceneObjectsRef.current = { scene, camera, controls, dynamicGroup, overlayGroup, toolCone, brushRing, transformControls, gizmoTarget };

    const onResize = () => {
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
      needsRenderRef.current = true;
    };
    window.addEventListener("resize", onResize);
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(el);

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const camMoved = controls.update();
      if (camMoved || needsRenderRef.current) {
        needsRenderRef.current = false;
        renderer.render(scene, camera);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObs.disconnect();
      window.removeEventListener("resize", onResize);
      transformControls.dispose();
      controls.dispose();
      renderer.dispose();
      sceneObjectsRef.current = null;
    };
  }, []);

  const isSimulatingView = step === "simulate";
  const isModel3dView = step === "layout" && designMode === "model3d";
  const clipPlanesRef = useRef<THREE.Plane[]>([]);

  // Update simulation cross-section clipping planes in-place (0 ms, no mesh rebuild!)
  useEffect(() => {
    const planes = clipPlanesRef.current;
    planes.length = 0;
    if (isSimulatingView && simSliceAxis === "x") {
      const cutX = ((simSlicePct / 100) - 0.5) * job.widthMm;
      planes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), cutX));
    } else if (isSimulatingView && simSliceAxis === "y") {
      const cutY = ((simSlicePct / 100) - 0.5) * job.depthMm;
      planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY));
    }
    const ctx = sceneObjectsRef.current;
    if (ctx) {
      for (const child of ctx.dynamicGroup.children) {
        const mesh = child as THREE.Mesh;
        if (mesh.material && !Array.isArray(mesh.material)) {
          mesh.material.clippingPlanes = planes.length > 0 ? planes : null;
          mesh.material.needsUpdate = true;
        }
      }
      needsRenderRef.current = true;
    }
  }, [isSimulatingView, simSliceAxis, simSlicePct, job.widthMm, job.depthMm]);

  // 2. Update 3D mesh (Relief Design OR Carved Dexel Stock) + Toolpaths in-place
  useEffect(() => {
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;
    const { dynamicGroup } = ctx;

    while (dynamicGroup.children.length > 0) {
      const child = dynamicGroup.children[0] as THREE.Mesh;
      dynamicGroup.remove(child);
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material?.dispose();
    }

    const topZ = job.zZero === "top" ? 0 : job.thicknessMm;
    const bottomZ = job.zZero === "top" ? -job.thicknessMm : 0;

    // When in 3D Solid Modeling mode on the Design tab, render the true full-solid CSG mesh directly
    if (step === "layout" && designMode === "model3d") {
      if (solidCsgGeo) {
        const previewMat = PREVIEW_MATERIALS.find((m) => m.id === previewMatId) ?? PREVIEW_MATERIALS[0];
        if (shading === "wireframe") {
          const coreMat = new THREE.MeshBasicMaterial({
            color: 0x0b1220,
            transparent: true,
            opacity: 0.35,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
            side: THREE.DoubleSide,
          });
          const solidMesh = new THREE.Mesh(solidCsgGeo.clone(), coreMat);
          solidMesh.position.set(0, 0, topZ);
          ctx.reliefGeo = solidMesh.geometry;
          ctx.reliefMesh = solidMesh;
          dynamicGroup.add(solidMesh);

          const wireMat = new THREE.MeshBasicMaterial({
            color: activeTheme.accentSecondary,
            wireframe: true,
            transparent: true,
            opacity: 0.35,
          });
          const wireMesh = new THREE.Mesh(solidCsgGeo.clone(), wireMat);
          wireMesh.position.set(0, 0, topZ);
          dynamicGroup.add(wireMesh);

          const edgeGeo = new THREE.EdgesGeometry(solidCsgGeo, 18);
          const edgeMat = new THREE.LineBasicMaterial({ color: activeTheme.accentSecondary });
          const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
          edgeLines.position.set(0, 0, topZ);
          dynamicGroup.add(edgeLines);
        } else {
          const mat = new THREE.MeshStandardMaterial({
            color: shading === "clay" ? 0xc2c8d2 : previewMat.color,
            roughness: shading === "material" ? previewMat.roughness : 0.36,
            metalness: shading === "material" ? previewMat.metalness : 0.08,
            side: THREE.DoubleSide,
          });
          const solidMesh = new THREE.Mesh(solidCsgGeo.clone(), mat);
          solidMesh.position.set(0, 0, topZ);
          ctx.reliefGeo = solidMesh.geometry;
          ctx.reliefMesh = solidMesh;
          dynamicGroup.add(solidMesh);
        }
      }
      const activeSolid = solidModels.find((m) => m.id === activeSolidId) ?? solidModels[0];
      if (activeSolid) {
        const ghostGeo = buildPrimitiveGeometry(activeSolid, vectorShapes);
        const ghostColor =
          activeSolid.boolOp === "subtract" ? 0xf87171 : activeSolid.boolOp === "intersect" ? 0xfbbf24 : 0x38bdf8;
        const ghostMat = new THREE.MeshBasicMaterial({
          color: ghostColor,
          transparent: true,
          opacity: activeSolid.boolOp === "subtract" ? 0.24 : 0.14,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
        ghostMesh.position.set(0, 0, topZ);
        dynamicGroup.add(ghostMesh);

        const edgeGeo = new THREE.EdgesGeometry(ghostGeo, 20);
        const edgeMat = new THREE.LineBasicMaterial({ color: ghostColor, transparent: true, opacity: 0.9 });
        const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
        edgeLines.position.set(0, 0, topZ);
        dynamicGroup.add(edgeLines);
      }
      // Render 2D sketches as crisp 3D blue sketch profiles on their sketch plane
      for (const vs of vectorShapes) {
        if (!vs.visible) continue;
        const pts2d = shapeToPolylineMm(vs);
        if (pts2d.length < 2) continue;
        const zPlane = topZ + (vs.sketchZMm ?? 0) + 0.15;
        const pts3d = pts2d.map(([x, y]) => new THREE.Vector3(x, y, zPlane));
        const skGeo = new THREE.BufferGeometry().setFromPoints(pts3d);
        const isSel = vs.id === activeVectorId;
        const skMat = new THREE.LineBasicMaterial({
          color: isSel ? 0x38bdf8 : 0x60a5fa,
          transparent: true,
          opacity: isSel ? 1.0 : 0.72,
        });
        const skObj =
          vs.kind === "polyline"
            ? new THREE.Line(skGeo, skMat)
            : new THREE.LineLoop(skGeo, skMat);
        dynamicGroup.add(skObj);
      }
      needsRenderRef.current = true;
      return;
    }

    const activeCarved = liveCarvedStock ?? carvedStock;
    const useCarved = (viewportSource === "carved" || step === "simulate") && activeCarved !== null;
    const mw = useCarved ? activeCarved.w : viewGridW;
    const mh = useCarved ? activeCarved.h : viewGridH;

    const tiltSlope = Math.tan(((reliefSettings.tiltDeg || 0) * Math.PI) / 180);
    const getZ = (i: number) => {
      if (useCarved) {
        const col = i % mw;
        const row = (i - col) / mw;
        const dexelIdx = (mh - 1 - row) * mw + col;
        return activeCarved.heights[dexelIdx] ?? topZ;
      }
      const normH = reliefHeights[i] ?? 0;
      const col = i % mw;
      const xMm = ((col / Math.max(1, mw - 1)) - 0.5) * job.widthMm;
      return topZ + reliefSettings.baseHeightMm - reliefSettings.maxZMm + normH * reliefSettings.maxZMm + xMm * tiltSlope;
    };
    const getNormH = (i: number) => {
      if (useCarved) {
        const col = i % mw;
        const row = (i - col) / mw;
        const dexelIdx = (mh - 1 - row) * mw + col;
        const z = activeCarved.heights[dexelIdx] ?? topZ;
        return Math.max(0, Math.min(1, (z - (topZ - reliefSettings.maxZMm)) / Math.max(0.1, reliefSettings.maxZMm)));
      }
      return reliefHeights[i] ?? 0;
    };

    const previewMat = PREVIEW_MATERIALS.find((m) => m.id === previewMatId) ?? PREVIEW_MATERIALS[0];

    const heatmapColorFn =
      useCarved && step === "simulate" && simColorMode === "heatmap"
        ? (i: number): [number, number, number] => {
            const carvedZ = getZ(i);
            const col = i % mw;
            const row = (i - col) / mw;
            const rx = Math.min(gridW - 1, Math.round((col / Math.max(1, mw - 1)) * (gridW - 1)));
            const ry = Math.min(gridH - 1, Math.round((row / Math.max(1, mh - 1)) * (gridH - 1)));
            const rIdx = ry * gridW + rx;
            const normH = reliefHeights[rIdx] ?? 0;
            const xMm = ((col / Math.max(1, mw - 1)) - 0.5) * job.widthMm;
            const targetZ =
              topZ + reliefSettings.baseHeightMm - reliefSettings.maxZMm + normH * reliefSettings.maxZMm + xMm * tiltSlope;
            const diff = carvedZ - targetZ;
            if (diff > 0.35) return [0.22, 0.52, 0.96]; // Blue = Uncut stock
            if (diff < -0.15) return [0.95, 0.24, 0.24]; // Red = Gouge / overcut
            return [0.22, 0.82, 0.42]; // Green = On target
          }
        : undefined;

    const clipPlanes = clipPlanesRef.current;

    const solidGeo = buildSolidStockGeometry(
      job.widthMm,
      job.depthMm,
      mw,
      mh,
      bottomZ,
      getZ,
      getNormH,
      shading,
      previewMat.color,
      useCarved ? undefined : baseMask,
      heatmapColorFn
    );

    const reliefMat =
      shading === "wireframe"
        ? new THREE.MeshBasicMaterial({
            color: activeTheme.isLight ? 0xe2e8f0 : 0x0b1220,
            transparent: true,
            opacity: 0.45,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
            side: THREE.DoubleSide,
            clippingPlanes: clipPlanes,
          })
        : new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: shading === "material" ? previewMat.roughness : 0.36,
            metalness: shading === "material" ? previewMat.metalness : 0.08,
            side: THREE.DoubleSide,
            clippingPlanes: clipPlanes,
          });

    const mesh = new THREE.Mesh(solidGeo, reliefMat);
    ctx.reliefGeo = solidGeo;
    ctx.reliefMesh = mesh;
    dynamicGroup.add(mesh);

    if (shading === "wireframe") {
      const wireW = Math.min(mw, 72);
      const wireH = Math.max(16, Math.round((wireW * mh) / Math.max(1, mw)));
      const wireGeo = buildSolidStockGeometry(
        job.widthMm,
        job.depthMm,
        wireW,
        wireH,
        bottomZ,
        (idx) => {
          const wc = idx % wireW;
          const wr = (idx - wc) / wireW;
          const sc = Math.min(mw - 1, Math.round((wc / Math.max(1, wireW - 1)) * (mw - 1)));
          const sr = Math.min(mh - 1, Math.round((wr / Math.max(1, wireH - 1)) * (mh - 1)));
          return getZ(sr * mw + sc);
        },
        (idx) => {
          const wc = idx % wireW;
          const wr = (idx - wc) / wireW;
          const sc = Math.min(mw - 1, Math.round((wc / Math.max(1, wireW - 1)) * (mw - 1)));
          const sr = Math.min(mh - 1, Math.round((wr / Math.max(1, wireH - 1)) * (mh - 1)));
          return getNormH(sr * mw + sc);
        },
        "clay",
        previewMat.color
      );
      const wireMat = new THREE.MeshBasicMaterial({
        color: activeTheme.accentSecondary,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
        clippingPlanes: clipPlanes,
      });
      dynamicGroup.add(new THREE.Mesh(wireGeo, wireMat));
    }

    // Optional Semi-Transparent Target Design Overlay in Simulation
    if (useCarved && step === "simulate" && simTargetOverlay) {
      const targetGeo = buildSolidStockGeometry(
        job.widthMm,
        job.depthMm,
        gridW,
        gridH,
        bottomZ,
        (i) => {
          const normH = reliefHeights[i] ?? 0;
          const col = i % gridW;
          const xMm = ((col / Math.max(1, gridW - 1)) - 0.5) * job.widthMm;
          return topZ + reliefSettings.baseHeightMm - reliefSettings.maxZMm + normH * reliefSettings.maxZMm + xMm * tiltSlope;
        },
        (i) => reliefHeights[i] ?? 0,
        "clay",
        0x38bdf8,
        baseMask
      );
      const targetMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: simTargetOpacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        clippingPlanes: clipPlanes,
      });
      dynamicGroup.add(new THREE.Mesh(targetGeo, targetMat));
    }

    needsRenderRef.current = true;
  }, [
    job.widthMm,
    job.depthMm,
    job.thicknessMm,
    job.zZero,
    reliefHeights,
    viewGridW,
    viewGridH,
    reliefSettings.maxZMm,
    reliefSettings.baseHeightMm,
    reliefSettings.tiltDeg,
    baseMask,
    shading,
    previewMatId,
    viewportSource,
    isSimulatingView,
    isModel3dView,
    carvedStock,
    liveCarvedStock,
    simColorMode,
    simTargetOverlay,
    simTargetOpacity,
    solidCsgGeo,
    isModel3dView ? solidModels : null,
    isModel3dView ? activeSolidId : "",
    isModel3dView ? vectorShapes : null,
    isModel3dView ? activeVectorId : "",
  ]);

  // 2b. Static / Semi-static 3D Overlays (Stock wire, Clamps, Axes, Grid, Toolpath lines)
  // Separated so simulation playback frames never rebuild 100k+ toolpath line segments!
  useEffect(() => {
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;
    const { overlayGroup } = ctx;

    while (overlayGroup.children.length > 0) {
      const child = overlayGroup.children[0] as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      overlayGroup.remove(child);
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material?.dispose();
    }

    const topZ = job.zZero === "top" ? 0 : job.thicknessMm;
    const bottomZ = job.zZero === "top" ? -job.thicknessMm : 0;
    const maxDim = Math.max(job.widthMm, job.depthMm, 120);

    const boxGeo = new THREE.BoxGeometry(job.widthMm, job.depthMm, job.thicknessMm);
    const stockWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeo),
      new THREE.LineBasicMaterial({ color: 0x4b5563 })
    );
    boxGeo.dispose();
    stockWire.position.set(0, 0, (topZ + bottomZ) * 0.5);
    overlayGroup.add(stockWire);

    if (step === "simulate" && clampsEnabled && clampZones.length > 0) {
      for (const c of clampZones) {
        const cGeo = new THREE.BoxGeometry(c.wMm, c.dMm, c.hMm);
        const cMat = new THREE.MeshStandardMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.45,
          roughness: 0.4,
        });
        const cMesh = new THREE.Mesh(cGeo, cMat);
        cMesh.position.set(c.xMm, c.yMm, topZ + c.hMm * 0.5);
        overlayGroup.add(cMesh);
      }
    }

    if (showAxesAndGrid) {
      const [ox, oy] = getXyOriginOffsetMm(job);
      const axes = new THREE.AxesHelper(Math.min(40, maxDim * 0.2));
      axes.position.set(-ox, -oy, topZ);
      overlayGroup.add(axes);

      const gridColor = new THREE.Color(activeTheme.gridColor).getHex();
      const grid = new THREE.GridHelper(maxDim * 2, 24, gridColor, gridColor);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = bottomZ - 0.2;
      overlayGroup.add(grid);
    }

    if (allPreviewPts.length > 1) {
      const cutPos: number[] = [];
      const rapidPos: number[] = [];
      for (let i = 1; i < allPreviewPts.length; i++) {
        const a = allPreviewPts[i - 1];
        const b = allPreviewPts[i];
        const target = b.rapid ? rapidPos : cutPos;
        target.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      if (showCutLines && cutPos.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(cutPos, 3));
        overlayGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x38bdf8 })));
      }
      if (showRapidLines && rapidPos.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(rapidPos, 3));
        overlayGroup.add(
          new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.45 }))
        );
      }
    }
    needsRenderRef.current = true;
  }, [job, allPreviewPts, showCutLines, showRapidLines, isSimulatingView, clampsEnabled, clampZones, showAxesAndGrid, activeTheme]);

  useEffect(() => {
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;
    if (allTaggedPts.length === 0 || !showSimTool) {
      ctx.toolCone.visible = false;
      needsRenderRef.current = true;
      return;
    }
    ctx.toolCone.visible = true;
    const idx = Math.min(allTaggedPts.length - 1, Math.floor((simProgress / 100) * (allTaggedPts.length - 1)));
    const p = allTaggedPts[idx];
    const rScale = Math.max(0.35, p.toolDiamMm / 6.0);
    ctx.toolCone.scale.set(rScale, 1, rScale);
    ctx.toolCone.position.set(p.x, p.y, p.z + 9);
    needsRenderRef.current = true;
  }, [allTaggedPts, simProgress, showSimTool]);

  useEffect(() => {
    if (simPlaying && simProgress >= 100) {
      setSimPlaying(false);
    }
  }, [simPlaying, simProgress]);

  useEffect(() => {
    if (!simPlaying || allPreviewPts.length === 0) return;
    const id = setInterval(() => {
      setSimProgress((p) => (p >= 100 ? 100 : Math.min(100, p + 0.9 * simSpeed)));
    }, 80);
    return () => clearInterval(id);
  }, [simPlaying, allPreviewPts.length, simSpeed]);

  const handleExportMesh = async (format: "stl" | "3mf") => {
    const geom = sceneObjectsRef.current?.reliefGeo;
    if (!geom) return;
    if (format === "stl") {
      const buf = geometryToBinaryStl(geom);
      const bytes = Array.from(new Uint8Array(buf));
      try {
        await invoke<string | null>("save_file_dialog_ipc", {
          defaultName: `${job.name}_3d_model.stl`,
          filterName: "STL 3D Mesh (*.stl)",
          extension: "stl",
          bytes,
        });
      } catch {
        const blob = new Blob([buf], { type: "application/octet-stream" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${job.name}_3d_model.stl`;
        a.click();
      }
    } else {
      const buf = geometryTo3mf(geom);
      const bytes = Array.from(buf);
      try {
        await invoke<string | null>("save_file_dialog_ipc", {
          defaultName: `${job.name}_3d_model.3mf`,
          filterName: "3MF Model (*.3mf)",
          extension: "3mf",
          bytes,
        });
      } catch {
        const blob = new Blob([buf.buffer as ArrayBuffer], { type: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${job.name}_3d_model.3mf`;
        a.click();
      }
    }
  };

  const setCameraPreset = (preset: "iso" | "top" | "front" | "side") => {
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;
    const maxDim = Math.max(job.widthMm, job.depthMm, 100);
    const tz = job.zZero === "top" ? -job.thicknessMm * 0.25 : job.thicknessMm * 0.5;
    ctx.controls.target.set(0, 0, tz);
    if (preset === "iso") ctx.camera.position.set(maxDim * 0.9, -maxDim * 1.05, maxDim * 0.85);
    else if (preset === "top") ctx.camera.position.set(0, -0.01, maxDim * 1.55);
    else if (preset === "front") ctx.camera.position.set(0, -maxDim * 1.55, tz + maxDim * 0.15);
    else ctx.camera.position.set(maxDim * 1.55, 0, tz + maxDim * 0.15);
    ctx.controls.update();
    needsRenderRef.current = true;
  };

  const handleSaveProject = async () => {
    const payload = {
      version: 1,
      job,
      reliefSettings,
      layers: layers.map((l) => ({
        ...l,
        source: { ...l.source, data: Array.from(l.source.data) },
      })),
      operations: operations.map((o) => ({ ...o, rustToolpath: undefined, previewPts: [] })),
      customTools,
      cutProfiles,
      vectorShapes,
      solidModels,
      exportSettings: { dialect, gcodeExt, exportSafeZ, exportEmitM6, exportProgramName },
    };
    const json = JSON.stringify(payload);
    const bytes = Array.from(new TextEncoder().encode(json));
    try {
      const saved = await invoke<string | null>("save_file_dialog_ipc", {
        defaultName: `${exportProgramName || job.name}.hcam`,
        filterName: "HybridCAM Project (*.hcam)",
        extension: "hcam",
        bytes,
      });
      if (saved) setLastSavedMsg(`Project saved: ${saved}`);
    } catch {
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${exportProgramName || job.name}.hcam`;
      a.click();
    }
  };

  const handleLoadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.job) setJob(parsed.job);
      if (parsed.reliefSettings) setReliefSettings(parsed.reliefSettings);
      if (Array.isArray(parsed.layers) && parsed.layers.length > 0) {
        const restored = parsed.layers.map((l: PictureLayer & { source: { data: number[] } }) => ({
          ...l,
          source: { ...l.source, data: new Float32Array(l.source.data) },
        }));
        setLayers(restored);
        setActiveLayerId(restored[0].id);
      }
      if (Array.isArray(parsed.operations) && parsed.operations.length > 0) {
        setOperations(parsed.operations);
        setActiveOpId(parsed.operations[0].id);
      }
      if (Array.isArray(parsed.customTools)) setCustomTools(parsed.customTools);
      if (Array.isArray(parsed.cutProfiles) && parsed.cutProfiles.length > 0) setCutProfiles(parsed.cutProfiles);
      if (Array.isArray(parsed.vectorShapes)) {
        setVectorShapes(parsed.vectorShapes);
        setActiveVectorId(parsed.vectorShapes[0]?.id ?? "");
      }
      if (Array.isArray(parsed.solidModels)) {
        setSolidModels(parsed.solidModels);
        setActiveSolidId(parsed.solidModels[0]?.id ?? "");
      }
      if (parsed.exportSettings) {
        if (parsed.exportSettings.dialect) setDialect(parsed.exportSettings.dialect);
        if (parsed.exportSettings.gcodeExt) setGcodeExt(parsed.exportSettings.gcodeExt);
        if (typeof parsed.exportSettings.exportSafeZ === "number") setExportSafeZ(parsed.exportSettings.exportSafeZ);
        if (typeof parsed.exportSettings.exportEmitM6 === "boolean") setExportEmitM6(parsed.exportSettings.exportEmitM6);
        if (parsed.exportSettings.exportProgramName) setExportProgramName(parsed.exportSettings.exportProgramName);
      }
      setCarvedStock(null);
      setViewportSource("relief");
      setLastSavedMsg(`Loaded: ${file.name}`);
    } catch {
      setLastSavedMsg("Could not read project file.");
    }
  };

  const handleAddTextLayer = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    pushUndoSnapshot();
    const w = 512;
    const h = 256;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fontSize = 110;
    ctx.font = `bold ${fontSize}px Georgia, serif`;
    while (ctx.measureText(clean).width > w * 0.88 && fontSize > 24) {
      fontSize -= 6;
      ctx.font = `bold ${fontSize}px Georgia, serif`;
    }
    ctx.fillText(clean, w * 0.5, h * 0.5);
    const img = ctx.getImageData(0, 0, w, h).data;
    const data = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) data[i] = img[i * 4] / 255;
    const id = `layer-${Date.now()}`;
    setLayers((ls) => [
      ...ls,
      {
        id,
        name: `Text: ${clean.slice(0, 18)}`,
        visible: true,
        combineMode: "mergeHigh",
        weight: 1.0,
        source: { width: w, height: h, data, label: clean },
        placement: { ...DEFAULT_PLACEMENT, scale: 0.75 },
      },
    ]);
    setActiveLayerId(id);
  };

  const handleImportSvg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const svgText = await file.text();
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = 512;
      const h = 512;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);
        const scale = Math.min((w * 0.88) / Math.max(1, img.width), (h * 0.88) / Math.max(1, img.height));
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, (w - dw) * 0.5, (h - dh) * 0.5, dw, dh);
        const px = ctx.getImageData(0, 0, w, h).data;
        const data = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
          data[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
        }
        pushUndoSnapshot();
        const id = `layer-${Date.now()}`;
        setLayers((ls) => [
          ...ls,
          {
            id,
            name: file.name,
            visible: true,
            combineMode: "mergeHigh",
            weight: 1.0,
            source: { width: w, height: h, data, label: file.name },
            placement: { ...DEFAULT_PLACEMENT, scale: 0.85 },
          },
        ]);
        setActiveLayerId(id);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleAddSurfaceStock = () => {
    const id = `op-${Date.now()}`;
    const surfaceOp: CamOperationItem = {
      id,
      name: `Op ${operations.length + 1}: Surface / Flatten Stock`,
      enabled: true,
      strategy: "Pocket2D",
      toolNumber: 19,
      overrides: { stepdownMm: 0.5 },
      stockToLeaveMm: 0,
      maxCutDepthMm: 0.5,
      rampEnabled: false,
      tabsEnabled: false,
      previewPts: [],
    };
    setOperations((ops) => [surfaceOp, ...ops]);
    setActiveOpId(id);
  };

  const handleAddFlipDowels = () => {
    const id = `op-${Date.now()}`;
    const dowelOp: CamOperationItem = {
      id,
      name: `Op ${operations.length + 1}: 2-Sided Alignment Dowels`,
      enabled: true,
      strategy: "Contour2D",
      toolNumber: 5,
      overrides: { stepdownMm: 2.0 },
      stockToLeaveMm: 0,
      maxCutDepthMm: Math.min(job.thicknessMm, 10),
      rampEnabled: true,
      tabsEnabled: false,
      previewPts: [],
    };
    setOperations((ops) => [...ops, dowelOp]);
    setActiveOpId(id);
  };

  const handleSplitExportByTool = async () => {
    const enabled = operations.filter((o) => o.enabled && o.previewPts.length > 0);
    if (enabled.length === 0) return;
    let savedCount = 0;
    for (let i = 0; i < enabled.length; i++) {
      const op = enabled[i];
      const opTool = tools.find((t) => t.number === op.toolNumber) ?? tools[0];
      const customPost = customPosts.find((p) => p.id === dialect);
      const effectiveDialect = customPost ? customPost.baseDialect : dialect;
      const [ox, oy] = getXyOriginOffsetMm(job);
      let text = "";
      let fromRust = false;
      if (op.rustToolpath) {
        try {
          text = await invoke<string>("export_gcode_text", {
            toolpaths: [op.rustToolpath],
            dialect: effectiveDialect,
            programName: `${exportProgramName || job.name}_Op${i + 1}_T${op.toolNumber}`,
            safeZMm: exportSafeZ,
            emitM6: exportEmitM6,
          });
          fromRust = true;
        } catch {
          text = buildGcode(job, { ...opTool, ...op.overrides }, op.previewPts, effectiveDialect);
        }
      } else {
        text = buildGcode(job, { ...opTool, ...op.overrides }, op.previewPts, effectiveDialect);
      }
      if (fromRust && text) {
        text = shiftGcodeXyOrigin(text, ox, oy);
      }
      if (customPost && text) {
        text = applyCustomPostProcessor(text, customPost, {
          programName: `${exportProgramName || job.name}_Op${i + 1}`,
          toolLabel: `T${opTool.number} ${opTool.name}`,
          rpm: op.overrides?.rpm ?? opTool.rpm,
          safeZ: exportSafeZ,
          units: job.units,
        });
      }
      if (text) {
        text = applyMachineProfileToGcode(text, machineProfile);
      }
      const fileName = `${String(i + 1).padStart(2, "0")}_${exportProgramName || job.name}_T${op.toolNumber}.${gcodeExt}`;
      const bytes = Array.from(new TextEncoder().encode(text));
      try {
        const res = await invoke<string | null>("save_file_dialog_ipc", {
          defaultName: fileName,
          filterName: `G-Code (*.${gcodeExt})`,
          extension: gcodeExt,
          bytes,
        });
        if (res) savedCount += 1;
      } catch {
        const blob = new Blob([text], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        savedCount += 1;
      }
    }
    if (savedCount > 0) setLastSavedMsg(`Exported ${savedCount} separate tool file(s).`);
  };

  const handleExportSetupSheet = async () => {
    const rows = operations
      .filter((o) => o.enabled)
      .map((op, i) => {
        const t = tools.find((x) => x.number === op.toolNumber) ?? tools[0];
        const eff = { ...t, ...op.overrides };
        return `<tr><td>#${i + 1}</td><td>${op.name}</td><td>T${eff.number} — ${eff.sizeLabel} ${eff.category}</td><td>${eff.rpm} RPM / ${eff.feedMmMin} mm/min</td><td>${op.zMinMm !== undefined ? `${op.zMinMm.toFixed(2)} mm` : `${op.maxCutDepthMm} mm`}</td><td>${op.cutTimeSec !== undefined ? formatDuration(op.cutTimeSec + (op.rapidTimeSec ?? 0)) : "—"}</td></tr>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Setup Sheet - ${exportProgramName || job.name}</title><style>body{font-family:Segoe UI,Arial,sans-serif;padding:28px;color:#111}h1{margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;font-size:13px}th{background:#f1f5f9}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;background:#f8fafc;padding:12px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px}</style></head><body><h1>HybridCAM Job Setup Sheet</h1><div>Program: <strong>${exportProgramName || job.name}.${gcodeExt}</strong> · Post: <strong>${dialect}</strong></div><div class="grid"><div><strong>Stock Size:</strong> ${job.widthMm} × ${job.depthMm} × ${job.thicknessMm} mm</div><div><strong>Material:</strong> ${MATERIAL_LABELS[job.material].title}</div><div><strong>Z-Zero:</strong> ${job.zZero === "top" ? "Top of Stock" : "Spoilboard"}</div><div><strong>XY Origin:</strong> ${job.xyOrigin}</div><div><strong>Safe Z:</strong> ${exportSafeZ} mm</div><div><strong>Est. Total Time:</strong> ${formatDuration(totalTimeSec)}</div></div><table><thead><tr><th>#</th><th>Operation</th><th>Tool</th><th>Speeds</th><th>Min Z / Depth</th><th>Est. Time</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const bytes = Array.from(new TextEncoder().encode(html));
    try {
      const saved = await invoke<string | null>("save_file_dialog_ipc", {
        defaultName: `${exportProgramName || job.name}_SetupSheet.html`,
        filterName: "Setup Sheet (*.html)",
        extension: "html",
        bytes,
      });
      if (saved) setLastSavedMsg(`Setup Sheet saved: ${saved}`);
    } catch {
      const blob = new Blob([html], { type: "text/html" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${exportProgramName || job.name}_SetupSheet.html`;
      a.click();
    }
  };

  const handleConfirmSetup = (finalJob: JobConfig) => {
    setJob(finalJob);
    setMachineBed({
      widthMm: finalJob.widthMm,
      depthMm: finalJob.depthMm,
      thicknessMm: finalJob.thicknessMm,
    });
    setMachineProfile((mp) => ({
      ...mp,
      bedXMm: finalJob.widthMm,
      bedYMm: finalJob.depthMm,
      defaultThicknessMm: finalJob.thicknessMm,
      defaultXyOrigin: finalJob.xyOrigin,
      defaultZZero: finalJob.zZero,
    }));
    setOriginalBedSize(null);
    setShowSetup(false);
    setCarvedStock(null);
    setViewportSource("relief");
    // Frame 3D camera cleanly to fit the newly sized plate
    const ctx = sceneObjectsRef.current;
    if (ctx) {
      const maxDim = Math.max(finalJob.widthMm, finalJob.depthMm, 100);
      ctx.camera.position.set(maxDim * 0.9, -maxDim * 1.05, maxDim * 0.85);
      ctx.controls.target.set(0, 0, finalJob.zZero === "top" ? -finalJob.thicknessMm * 0.3 : finalJob.thicknessMm * 0.5);
      ctx.controls.update();
      needsRenderRef.current = true;
    }
  };

  const handleAddCustomTool = () => {
    const diam = Math.max(0.1, parseFloat(newToolDiam) || 6);
    const rpm = Math.max(1000, parseInt(newToolRpm, 10) || 18000);
    const feed = Math.max(50, parseFloat(newToolFeed) || 1800);
    const sd = Math.max(0.1, parseFloat(newToolStepdown) || 2);
    const so = Math.max(1, Math.min(90, parseFloat(newToolStepover) || 35));
    const nextNum = tools.reduce((m, t) => Math.max(m, t.number), 25) + 1;
    const label = newToolSize.trim() || `${diam} mm`;
    const created: ToolPreset = {
      number: nextNum,
      name: `${label} Custom ${newToolCat}`,
      sizeLabel: label,
      category: newToolCat,
      diameterMm: diam,
      rpm,
      feedMmMin: feed,
      plungeMmMin: Math.round(feed * 0.35),
      stepdownMm: sd,
      stepoverPct: so,
    };
    setCustomTools((ct) => [...ct, created]);
    updateActiveOp({ toolNumber: nextNum, overrides: {} });
    setShowAddTool(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--hc-bg, #0d1015)", color: "var(--hc-text, #e6edf3)" }}>
      {showSetup && <JobSetupModal job={job} onConfirm={handleConfirmSetup} />}
      {showCloseModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(10,12,16,0.82)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 400,
              background: "var(--hc-panel-bg, #181c23)",
              border: "1px solid var(--hc-border-strong, #334155)",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              color: "var(--hc-text, #f8fafc)",
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16 }}>Save Project Before Closing?</h3>
            <div style={{ fontSize: 13, color: "var(--hc-muted, #cbd5e1)", lineHeight: 1.45 }}>
              Do you want to save your project (<code>.hcam</code>) before closing HybridCAM?
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", color: "var(--hc-muted, #cbd5e1)" }}>
              <input
                type="checkbox"
                checked={closeDontAskDraft}
                onChange={(e) => setCloseDontAskDraft(e.target.checked)}
              />
              Don&apos;t ask again (can be re-enabled in Settings)
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                style={UI.btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (closeDontAskDraft) setSkipClosePrompt(true);
                  setShowCloseModal(false);
                  try {
                    await invoke("force_close_window_ipc");
                  } catch {
                    window.close();
                  }
                }}
                style={{ ...UI.btnSecondary, borderColor: "#7f1d1d", color: "#fca5a5" }}
              >
                Close Without Saving
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (closeDontAskDraft) setSkipClosePrompt(true);
                  await handleSaveProject();
                  setShowCloseModal(false);
                  try {
                    await invoke("force_close_window_ipc");
                  } catch {
                    window.close();
                  }
                }}
                style={UI.btnAccentSmall}
              >
                Save &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddTool && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(10,12,16,0.8)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 380, background: "#181c23", border: "1px solid var(--hc-border-strong, #334155)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Add Custom Endmill</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
              <div>
                <label style={UI.label}>Endmill Type</label>
                <select value={newToolCat} onChange={(e) => setNewToolCat(e.target.value as ToolCategory)} style={{ ...UI.input, marginTop: 4 }}>
                  <option value="Flat">Flat Endmill</option>
                  <option value="O-Flute">O-Flute</option>
                  <option value="Ballnose">Ballnose</option>
                  <option value="Tapered">Tapered Ballnose</option>
                  <option value="V-Bit">V-Bit</option>
                  <option value="Engraving">Engraving</option>
                  <option value="Surfacing">Surfacing</option>
                </select>
              </div>
              <div>
                <label style={UI.label}>Size Label</label>
                <input value={newToolSize} onChange={(e) => setNewToolSize(e.target.value)} style={{ ...UI.input, marginTop: 4 }} />
              </div>
              <div>
                <label style={UI.label}>Diameter / Tip (mm)</label>
                <input value={newToolDiam} onChange={(e) => setNewToolDiam(e.target.value)} style={{ ...UI.input, marginTop: 4 }} />
              </div>
              <div>
                <label style={UI.label}>Spindle (RPM)</label>
                <input value={newToolRpm} onChange={(e) => setNewToolRpm(e.target.value)} style={{ ...UI.input, marginTop: 4 }} />
              </div>
              <div>
                <label style={UI.label}>Feed (mm/min)</label>
                <input value={newToolFeed} onChange={(e) => setNewToolFeed(e.target.value)} style={{ ...UI.input, marginTop: 4 }} />
              </div>
              <div>
                <label style={UI.label}>Stepdown (mm)</label>
                <input value={newToolStepdown} onChange={(e) => setNewToolStepdown(e.target.value)} style={{ ...UI.input, marginTop: 4 }} />
              </div>
              <div>
                <label style={UI.label}>Stepover (%)</label>
                <input value={newToolStepover} onChange={(e) => setNewToolStepover(e.target.value)} style={{ ...UI.input, marginTop: 4 }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button onClick={() => setShowAddTool(false)} style={UI.btnSecondary}>
                Cancel
              </button>
              <button onClick={handleAddCustomTool} style={UI.btnAccentSmall}>
                Save Endmill
              </button>
            </div>
          </div>
        </div>
      )}

      <header
        style={{
          height: 54,
          borderBottom: "1px solid var(--hc-border, #242a34)",
          background: "var(--hc-header-bg, #151921)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong style={{ fontSize: 15, letterSpacing: 0.3, color: "var(--hc-text, #f8fafc)" }}>HybridCAM</strong>
          <button
            onClick={() => setShowSetup(true)}
            style={{
              padding: "6px 12px",
              borderRadius: 7,
              border: "1px solid var(--hc-accent-secondary, #3b82f6)",
              background: "var(--hc-panel-bg, rgba(37, 99, 235, 0.18))",
              color: "var(--hc-text, #f8fafc)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ✎ {job.widthMm}×{job.depthMm}×{job.thicknessMm} mm · {MATERIAL_LABELS[job.material].title}
          </button>
        </div>

        <nav style={{ display: "flex", gap: 4 }}>
          {(
            [
              ["layout", "Design", "navDesign"],
              ["relief", "Relief", "navRelief"],
              ["toolpaths", "Toolpaths", "navToolpaths"],
              ["simulate", "Simulate", "navSimulate"],
              ["export", "Export", "navExport"],
              ["run", "Run CNC", "play"],
            ] as [WorkflowStep, string, DesignIconName][]
          ).map(([k, label, ic]) => (
            <button
              key={k}
              onClick={() => setStep(k)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 10px",
                borderRadius: 7,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 12,
                background: step === k ? "var(--hc-accent, #2563eb)" : "var(--hc-panel-bg, #1f252e)",
                color: step === k ? "#fff" : "var(--hc-muted, #9ca3af)",
              }}
            >
              <DesignIcon name={ic} size={14} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <button onClick={handleSaveProject} title="Save Project (.hcam) · Ctrl+S" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--hc-border-strong, #30363d)", background: "var(--hc-panel-bg, #1f252e)", color: "var(--hc-text, #e2e8f0)", fontSize: 12, cursor: "pointer" }}>
            <DesignIcon name="save" size={14} />
            <span>Save</span>
          </button>
          <label title="Open Project (.hcam)" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--hc-border-strong, #30363d)", background: "var(--hc-panel-bg, #1f252e)", color: "var(--hc-text, #e2e8f0)", fontSize: 12, cursor: "pointer" }}>
            <DesignIcon name="folderOpen" size={14} />
            <span>Open</span>
            <input type="file" accept=".hcam,.json" onChange={handleLoadProject} style={{ display: "none" }} />
          </label>
          <button onClick={handleUndo} title="Undo (Ctrl+Z)" style={{ display: "inline-flex", alignItems: "center", padding: "5px 7px", borderRadius: 6, border: "1px solid var(--hc-border-strong, #30363d)", background: "var(--hc-panel-bg, #1f252e)", color: "var(--hc-text, #e2e8f0)", cursor: "pointer" }}>
            <DesignIcon name="undo" size={14} />
          </button>
          <button onClick={handleRedo} title="Redo (Ctrl+Y)" style={{ display: "inline-flex", alignItems: "center", padding: "5px 7px", borderRadius: 6, border: "1px solid var(--hc-border-strong, #30363d)", background: "var(--hc-panel-bg, #1f252e)", color: "var(--hc-text, #e2e8f0)", cursor: "pointer" }}>
            <DesignIcon name="redo" size={14} />
          </button>
          <button
            onClick={() => setStep("settings")}
            title="App Settings & Themes"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              borderRadius: 6,
              border: step === "settings" ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border-strong, #30363d)",
              background: step === "settings" ? "var(--hc-accent, #2563eb)" : "var(--hc-panel-bg, #1f252e)",
              color: step === "settings" ? "#fff" : "var(--hc-text, #e2e8f0)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <DesignIcon name="settings" size={15} />
            <span>Settings</span>
          </button>
          {carvedStock && (
            <div style={{ display: "flex", background: "var(--hc-bg, #0d1015)", padding: 3, borderRadius: 7, border: "1px solid var(--hc-border-strong, #30363d)" }}>
              {(
                [
                  ["relief", "Design"],
                  ["carved", "Carved Stock"],
                ] as [ViewportSource, string][]
              ).map(([src, lbl]) => (
                <button
                  key={src}
                  onClick={() => setViewportSource(src)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 5,
                    border: "none",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: viewportSource === src ? "#16a34a" : "transparent",
                    color: viewportSource === src ? "#fff" : "var(--hc-muted, #cbd5e1)",
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}
          {lastSavedMsg && (
            <span style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(34,197,94,0.18)", border: "1px solid #22c55e", color: "#4ade80", fontSize: 12, fontWeight: 600, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={lastSavedMsg}>
              {lastSavedMsg}
            </span>
          )}
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: `${sidebarWidth}px 6px 1fr`, flex: 1, minHeight: 0 }}>
        <aside
          ref={sidebarRef}
          style={{
            background: "var(--hc-sidebar-bg, #141820)",
            padding: 16,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            zoom: uiScale === "compact" ? 0.92 : uiScale === "large" ? 1.08 : 1,
          }}
        >
          {step === "layout" && (
            <>
              {/* 3-Mode Design Switcher: Picture | Vector Sketch | 3D Model */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, background: "var(--hc-subpanel-bg, #0d1015)", padding: 4, borderRadius: 8, border: "1px solid var(--hc-border, #262c36)" }}>
                {(
                  [
                    ["picture", "Picture", "picture"],
                    ["vector", "Vectors", "vector"],
                    ["model3d", "3D Model", "model3d"],
                  ] as [DesignMode, string, DesignIconName][]
                ).map(([m, lbl, ic]) => (
                  <button
                    key={m}
                    onClick={() => setDesignMode(m)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      padding: "7px 4px",
                      borderRadius: 6,
                      border: "none",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      background: designMode === m ? "var(--hc-accent, #2563eb)" : "transparent",
                      color: designMode === m ? "#fff" : "var(--hc-muted, #9ca3af)",
                    }}
                  >
                    <DesignIcon name={ic} size={15} />
                    <span>{lbl}</span>
                  </button>
                ))}
              </div>

              {/* Merge Stack Toggles (lets you switch off Picture/Relief mode or combine all 3) */}
              <div style={{ ...UI.subPanel, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "var(--hc-section-title, #93c5fd)", fontWeight: 600 }}>Include:</span>
                <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={enablePictureMode} onChange={(e) => setEnablePictureMode(e.target.checked)} />
                  Picture
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={enableVectorMode} onChange={(e) => setEnableVectorMode(e.target.checked)} />
                  Vectors
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={enable3dModelMode} onChange={(e) => setEnable3dModelMode(e.target.checked)} />
                  3D Solid
                </label>
              </div>

              {designMode === "picture" && (
              <>
              <div style={UI.pageHeader}>
                <h3 style={UI.pageTitle}>Pictures & 3D Merge</h3>
                <div style={{ display: "flex", gap: 4 }}>
                  <select
                    value=""
                    onChange={(e) => {
                      const k = e.target.value as "ovalDish" | "rectFrame" | "raisedDome";
                      if (!k) return;
                      pushUndoSnapshot();
                      const src = createBuiltInShapeSource(k, 256);
                      const id = `layer-${Date.now()}`;
                      setLayers((ls) => [
                        ...ls,
                        { id, name: src.label, visible: true, combineMode: "mergeHigh", weight: 1.0, source: src, placement: { ...DEFAULT_PLACEMENT, scale: 0.9 } },
                      ]);
                      setActiveLayerId(id);
                    }}
                    style={{ ...UI.btnSecondary, padding: "4px 6px" }}
                  >
                    <option value="">+ Shape</option>
                    <option value="ovalDish">Oval Dish</option>
                    <option value="rectFrame">Rect Frame</option>
                    <option value="raisedDome">Raised Dome</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 6 }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 10px", background: "var(--hc-accent, #2563eb)", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 12, color: "#fff" }}>
                  <DesignIcon name="picture" size={15} />
                  <span>Add Depth Map</span>
                  <input type="file" accept="image/*,.tif,.tiff,.exr" onChange={(e) => handleDepthMapUpload(e, false)} style={{ display: "none" }} />
                </label>
                <label style={{ ...UI.btnSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 10px", borderRadius: 8 }}>
                  <DesignIcon name="model3d" size={15} />
                  <span>Import .STL</span>
                  <input
                    type="file"
                    accept=".stl"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      e.target.value = "";
                      const buf = await f.arrayBuffer();
                      const src = parseStlToDepthSource(buf, f.name.replace(/\.stl$/i, ""), 384);
                      pushUndoSnapshot();
                      const id = `layer-${Date.now()}`;
                      setLayers((ls) => [
                        ...ls,
                        { id, name: src.label, visible: true, combineMode: "mergeHigh", weight: 1.0, source: src, placement: { ...DEFAULT_PLACEMENT, scale: 1.0 } },
                      ]);
                      setActiveLayerId(id);
                      setLastSavedMsg(`Imported STL: ${f.name}`);
                    }}
                    style={{ display: "none" }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                <button
                  onClick={() => setShowTextBar((s) => !s)}
                  style={{ ...UI.btnSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <DesignIcon name="text" size={15} />
                  <span>Add Text</span>
                </button>
                <label style={{ ...UI.btnSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <DesignIcon name="svg" size={15} />
                  <span>Import .SVG</span>
                  <input type="file" accept=".svg" onChange={handleImportSvg} style={{ display: "none" }} />
                </label>
              </div>
              {showTextBar && (
                <div style={{ ...UI.subPanel, display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="text"
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && textDraft.trim()) {
                        handleAddTextLayer(textDraft);
                        setShowTextBar(false);
                      }
                    }}
                    placeholder="Enter text..."
                    style={{ ...UI.input, flex: 1 }}
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      if (textDraft.trim()) {
                        handleAddTextLayer(textDraft);
                        setShowTextBar(false);
                      }
                    }}
                    style={UI.btnAccentSmall}
                  >
                    Add
                  </button>
                </div>
              )}

              {/* Alignment, Duplicate, Trim & Preview Toolbar */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                <ToolTileButton
                  icon="centerX"
                  label="Center X"
                  onClick={() => { pushUndoSnapshot(); updateActivePlacement((p) => ({ ...p, offsetXMm: 0 })); }}
                />
                <ToolTileButton
                  icon="centerY"
                  label="Center Y"
                  onClick={() => { pushUndoSnapshot(); updateActivePlacement((p) => ({ ...p, offsetYMm: 0 })); }}
                />
                <ToolTileButton
                  icon="duplicate"
                  label="Duplicate"
                  disabled={!activeLayer}
                  onClick={() => {
                    if (!activeLayer) return;
                    pushUndoSnapshot();
                    const id = `layer-${Date.now()}`;
                    setLayers((ls) => [
                      ...ls,
                      {
                        ...activeLayer,
                        id,
                        name: `${activeLayer.name} (Copy)`,
                        source: { ...activeLayer.source, data: new Float32Array(activeLayer.source.data) },
                        placement: { ...activeLayer.placement, offsetXMm: activeLayer.placement.offsetXMm + 15 },
                      },
                    ]);
                    setActiveLayerId(id);
                  }}
                />
                <ToolTileButton
                  icon="baseRemoval"
                  label="Trim Bed"
                  title="Remove unused bed margins by sizing stock to the picture"
                  disabled={layers.filter((l) => l.visible).length === 0}
                  onClick={handleTrimUnusedBed}
                />
              </div>
              <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--hc-muted, #cbd5e1)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                  <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
                  Snap {snapStepMm}mm
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                  <input type="checkbox" checked={showMergedPreview} onChange={(e) => setShowMergedPreview(e.target.checked)} />
                  Merged 2D Preview
                </label>
              </div>

              {/* Multi-Picture Layer Stack with Merge Modes */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {layers.map((layer) => (
                  <div
                    key={layer.id}
                    onClick={() => setActiveLayerId(layer.id)}
                    style={{
                      padding: "7px 9px",
                      borderRadius: 7,
                      cursor: "pointer",
                      border: layer.id === activeLayer.id ? "1px solid var(--hc-accent, #3b82f6)" : "1px solid var(--hc-border, #262c36)",
                      background: layer.id === activeLayer.id ? "color-mix(in srgb, var(--hc-accent, #2563eb) 20%, transparent)" : "var(--hc-panel-bg, #1b2028)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={layer.visible}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setLayers((ls) => ls.map((x) => (x.id === layer.id ? { ...x, visible: e.target.checked } : x)))
                        }
                      />
                      <span style={{ flex: 1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {layer.name}
                      </span>
                      <select
                        value={layer.combineMode}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setLayers((ls) =>
                            ls.map((x) => (x.id === layer.id ? { ...x, combineMode: e.target.value as CombineMode } : x))
                          )
                        }
                        style={{ padding: "2px 5px", background: "var(--hc-subpanel-bg, #111419)", color: "var(--hc-section-title, #93c5fd)", border: "1px solid var(--hc-border-strong, #374151)", borderRadius: 4, fontSize: 10 }}
                      >
                        <option value="mergeHigh">Merge High</option>
                        <option value="add">Add (+)</option>
                        <option value="subtract">Subtract (-)</option>
                        <option value="mergeLow">Merge Low</option>
                      </select>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          pushUndoSnapshot();
                          setLayers((ls) => {
                            const next = ls.filter((x) => x.id !== layer.id);
                            if (activeLayerId === layer.id) setActiveLayerId(next[0]?.id ?? "");
                            return next;
                          });
                        }}
                        title="Delete Picture (or press Delete)"
                        style={{ background: "transparent", border: "none", color: "var(--hc-muted, #9ca3af)", cursor: "pointer", fontSize: 12 }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Paint Tool & Move Mode */}
              <div style={{ padding: 10, background: "var(--hc-panel-bg, #1a1f28)", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--hc-text, #e6edf3)" }}>Canvas Tool</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5 }}>
                  {(
                    [
                      ["move", "Move", "move"],
                      ["paintRaise", "Raise +", "paintRaise"],
                      ["paintLower", "Lower -", "paintLower"],
                      ["paintSmooth", "Smooth", "paintSmooth"],
                    ] as [LayoutToolMode, string, DesignIconName][]
                  ).map(([m, lbl, ic]) => (
                    <ToolTileButton
                      key={m}
                      icon={ic}
                      label={lbl}
                      active={toolMode === m}
                      onClick={() => setToolMode(m)}
                    />
                  ))}
                </div>
                {toolMode !== "move" && (
                  <>
                    <SliderRow label="Brush Size" hint="Radius of the paint brush on the board." unit="mm" min={1} max={40} step={1} value={brushRadiusMm} onChange={setBrushRadiusMm} />
                    <SliderRow label="Brush Strength" hint="How strongly each stroke raises, lowers, or smooths." unit="%" min={5} max={100} step={5} value={Math.round(brushStrength * 100)} onChange={(v) => setBrushStrength(v / 100)} />
                  </>
                )}
              </div>

              {/* Active Layer Controls */}
              {activeLayer && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, background: "var(--hc-panel-bg, #1a1f28)", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--hc-section-title, #93c5fd)" }}>Selected: {activeLayer.name}</span>
                  <button onClick={() => { restoreOriginalBed(); updateActivePlacement(() => DEFAULT_PLACEMENT); }} style={{ padding: "2px 7px", fontSize: 10, borderRadius: 4, border: "1px solid var(--hc-border-strong, #374151)", background: "var(--hc-subpanel-bg, #111419)", color: "var(--hc-muted, #cbd5e1)", cursor: "pointer" }}>Reset</button>
                </div>
                <SliderRow label="Layer Height Weight" hint="Scales this picture's Z contribution when merging." unit="×" min={0.1} max={1.5} step={0.05} value={activeLayer.weight} onChange={(v) => setLayers((ls) => ls.map((l) => (l.id === activeLayer.id ? { ...l, weight: v } : l)))} />
                <SliderRow label="Picture Scale" hint="Resize the depth map relative to your board (up to 10×)." unit="×" min={0.05} max={10} step={0.05} value={placement.scale} onChange={(v) => updateActivePlacement((p) => ({ ...p, scale: v }))} />
                <SliderRow label="Position X" hint="Horizontal offset from board center." unit="mm" min={-Math.max(job.widthMm, pictureBounds.picW) * 0.75} max={Math.max(job.widthMm, pictureBounds.picW) * 0.75} step={1} value={placement.offsetXMm} onChange={(v) => updateActivePlacement((p) => ({ ...p, offsetXMm: v }))} />
                <SliderRow label="Position Y" hint="Vertical offset from board center." unit="mm" min={-Math.max(job.depthMm, pictureBounds.picH) * 0.75} max={Math.max(job.depthMm, pictureBounds.picH) * 0.75} step={1} value={placement.offsetYMm} onChange={(v) => updateActivePlacement((p) => ({ ...p, offsetYMm: v }))} />
                <SliderRow label="Rotation" hint="Rotate the depth map on the board." unit="°" min={-180} max={180} step={1} value={placement.rotationDeg ?? 0} onChange={(v) => updateActivePlacement((p) => ({ ...p, rotationDeg: v }))} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 4 }}>
                  <ToolTileButton icon="rotLeft" label="-90°" onClick={() => updateActivePlacement((p) => ({ ...p, rotationDeg: ((p.rotationDeg || 0) - 90 + 540) % 360 - 180 }))} />
                  <ToolTileButton icon="rotZero" label="0°" onClick={() => updateActivePlacement((p) => ({ ...p, rotationDeg: 0 }))} />
                  <ToolTileButton icon="rotRight" label="+90°" onClick={() => updateActivePlacement((p) => ({ ...p, rotationDeg: ((p.rotationDeg || 0) + 90 + 540) % 360 - 180 }))} />
                  <ToolTileButton icon="flipH" label="Flip H" active={!!placement.flipX} onClick={() => updateActivePlacement((p) => ({ ...p, flipX: !p.flipX }))} />
                  <ToolTileButton icon="flipV" label="Flip V" active={!!placement.flipY} onClick={() => updateActivePlacement((p) => ({ ...p, flipY: !p.flipY }))} />
                </div>
                <SliderRow label="Edge Fade (Feather)" hint="Smoothly blends the outer border of the picture into the wood." unit="%" min={0} max={30} step={1} value={Math.round((placement.edgeFade ?? 0) * 100)} onChange={(v) => updateActivePlacement((p) => ({ ...p, edgeFade: v / 100 }))} />
                <SliderRow label="Brightness" hint="Shifts overall image height up or down." unit="%" min={-30} max={30} step={1} value={Math.round((placement.brightness ?? 0) * 100)} onChange={(v) => updateActivePlacement((p) => ({ ...p, brightness: v / 100 }))} />
                <SliderRow label="Shadow Clip (Black)" hint="Crushes dark background noise to pure flat." unit="%" min={0} max={45} step={1} value={Math.round((placement.shadowClip ?? 0) * 100)} onChange={(v) => updateActivePlacement((p) => ({ ...p, shadowClip: v / 100 }))} />
                <SliderRow label="Highlight Clip (White)" hint="Clamps bright peaks to flat top height." unit="%" min={55} max={100} step={1} value={Math.round((placement.highlightClip ?? 1) * 100)} onChange={(v) => updateActivePlacement((p) => ({ ...p, highlightClip: v / 100 }))} />
              </div>
              )}
              </>
              )}

              {designMode === "vector" && (
                <>
                  <div style={UI.pageHeader}>
                    <h3 style={UI.pageTitle}>Vector Sketching (2D CAD)</h3>
                    <div style={{ display: "flex", gap: 4 }}>
                      <label style={{ ...UI.btnAccentSmall, display: "flex", alignItems: "center", gap: 4 }}>
                        <DesignIcon name="svg" size={13} />
                        <span>.SVG</span>
                        <input
                          type="file"
                          accept=".svg"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            e.target.value = "";
                            const txt = await f.text();
                            const parsed = parseSvgToVectorShapes(txt, job.widthMm, job.depthMm);
                            if (parsed.length > 0) {
                              setVectorShapes((vs) => [...vs, ...parsed]);
                              setActiveVectorId(parsed[0].id);
                              setLastSavedMsg(`Imported ${parsed.length} SVG vector(s)`);
                            }
                          }}
                          style={{ display: "none" }}
                        />
                      </label>
                      <label style={{ ...UI.btnSecondary, display: "flex", alignItems: "center", gap: 4, padding: "5px 8px" }}>
                        <DesignIcon name="vector" size={13} />
                        <span>.DXF</span>
                        <input
                          type="file"
                          accept=".dxf"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            e.target.value = "";
                            const txt = await f.text();
                            const parsed = parseDxfToVectorShapes(txt, job.widthMm, job.depthMm);
                            if (parsed.length > 0) {
                              setVectorShapes((vs) => [...vs, ...parsed]);
                              setActiveVectorId(parsed[0].id);
                              setLastSavedMsg(`Imported ${parsed.length} DXF vector(s)`);
                            } else {
                              setLastSavedMsg("No supported entities found in DXF");
                            }
                          }}
                          style={{ display: "none" }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={vectorShapes.filter((s) => s.visible).length === 0}
                        title="Export visible vector shapes as .DXF"
                        onClick={async () => {
                          const dxf = exportVectorShapesToDxf(vectorShapes);
                          const bytes = Array.from(new TextEncoder().encode(dxf));
                          try {
                            const res = await invoke<string | null>("save_file_dialog_ipc", {
                              defaultName: `${job.name}_vectors.dxf`,
                              filterName: "DXF (*.dxf)",
                              extension: "dxf",
                              bytes,
                            });
                            if (res) setLastSavedMsg(`Exported DXF: ${res}`);
                          } catch {
                            const blob = new Blob([dxf], { type: "application/dxf" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `${job.name}_vectors.dxf`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }
                        }}
                        style={{ ...UI.btnSecondary, padding: "5px 8px", fontSize: 11 }}
                      >
                        DXF ↓
                      </button>
                    </div>
                  </div>

                  <div style={UI.panel}>
                    <span style={UI.sectionTitle}>SKETCH TOOLS</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                      {(
                        [
                          ["select", "Select", "select"],
                          ["rect", "Rectangle", "rect"],
                          ["circle", "Circle", "circle"],
                          ["slot", "Slot", "rect"],
                          ["polygon", "Polygon", "polygon"],
                          ["polyline", "Polyline", "polyline"],
                        ] as [SketchToolMode, string, DesignIconName][]
                      ).map(([k, lbl, ic]) => (
                        <ToolTileButton
                          key={k}
                          icon={ic}
                          label={lbl}
                          active={sketchTool === k}
                          onClick={() => setSketchTool(k)}
                        />
                      ))}
                      <ToolTileButton
                        icon="text"
                        label="Text Box"
                        onClick={() => {
                          const t = textDraft.trim() || "HybridCAM";
                          const id = `vec-${Date.now()}`;
                          setVectorShapes((vs) => [
                            ...vs,
                            {
                              id,
                              name: `Text: ${t.slice(0, 14)}`,
                              kind: "text",
                              visible: true,
                              xMm: 0,
                              yMm: 0,
                              widthMm: Math.min(job.widthMm * 0.6, Math.max(30, t.length * 10)),
                              heightMm: 24,
                              rotationDeg: 0,
                              cornerRadiusMm: 0,
                              sides: 4,
                              text: t,
                              depthMm: 3,
                              role: "vcarve",
                            },
                          ]);
                          setActiveVectorId(id);
                        }}
                      />
                    </div>
                  </div>

                  {/* Vector Shape Stack */}
                  <div style={UI.panel}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={UI.sectionTitle}>Sketch Shapes ({vectorShapes.length})</span>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                        <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
                        Snap 5mm
                      </label>
                    </div>
                    {vectorShapes.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--hc-muted, #9ca3af)" }}>Pick a shape tool above and drag on the canvas to draw vectors.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {vectorShapes.map((sh) => (
                          <div
                            key={sh.id}
                            onClick={() => setActiveVectorId(sh.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 8px",
                              borderRadius: 6,
                              cursor: "pointer",
                              border: activeVectorId === sh.id ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border, #262c36)",
                              background: activeVectorId === sh.id ? "color-mix(in srgb, var(--hc-accent, #2563eb) 24%, transparent)" : "var(--hc-subpanel-bg, #111419)",
                              fontSize: 13,
                            }}
                          >
                            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={sh.visible}
                                onChange={(e) => setVectorShapes((vs) => vs.map((x) => (x.id === sh.id ? { ...x, visible: e.target.checked } : x)))}
                              />
                              <span style={{ fontWeight: 600 }}>{sh.name}</span>
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 11, color: "var(--hc-section-title, #93c5fd)", textTransform: "uppercase" }}>{sh.role}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVectorShapes((vs) => vs.filter((x) => x.id !== sh.id));
                                }}
                                style={{ background: "transparent", border: "none", color: "var(--hc-muted, #9ca3af)", cursor: "pointer" }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Active Vector Shape Properties */}
                  {(() => {
                    const activeVec = vectorShapes.find((s) => s.id === activeVectorId) ?? vectorShapes[0];
                    if (!activeVec) return null;
                    const patchVec = (patch: Partial<VectorShape>) =>
                      setVectorShapes((vs) => vs.map((x) => (x.id === activeVec.id ? { ...x, ...patch } : x)));
                    return (
                      <div style={UI.panel}>
                        <span style={UI.sectionTitle}>Edit: {activeVec.name}</span>
                        <div>
                          <label style={UI.label}>Toolpath Role</label>
                          <select value={activeVec.role} onChange={(e) => patchVec({ role: e.target.value as VectorRole })} style={{ ...UI.input, marginTop: 3 }}>
                            <option value="cutout">Cutout / Contour</option>
                            <option value="carve">Pocket / Recessed Carve</option>
                            <option value="vcarve">True V-Carve</option>
                            <option value="model3d">Raised 3D Boss</option>
                          </select>
                        </div>
                        <SliderRow label="X Center" unit="mm" min={-job.widthMm * 0.6} max={job.widthMm * 0.6} step={0.5} value={activeVec.xMm} onChange={(v) => patchVec({ xMm: v })} />
                        <SliderRow label="Y Center" unit="mm" min={-job.depthMm * 0.6} max={job.depthMm * 0.6} step={0.5} value={activeVec.yMm} onChange={(v) => patchVec({ yMm: v })} />
                        <SliderRow label="Width" unit="mm" min={2} max={job.widthMm} step={0.5} value={activeVec.widthMm} onChange={(v) => patchVec({ widthMm: v })} />
                        <SliderRow label="Height" unit="mm" min={2} max={job.depthMm} step={0.5} value={activeVec.heightMm} onChange={(v) => patchVec({ heightMm: v })} />
                        <SliderRow label="Rotation" unit="°" min={-180} max={180} step={1} value={activeVec.rotationDeg} onChange={(v) => patchVec({ rotationDeg: v })} />
                        {activeVec.kind === "rect" && (
                          <SliderRow label="Corner Radius" unit="mm" min={0} max={40} step={0.5} value={activeVec.cornerRadiusMm} onChange={(v) => patchVec({ cornerRadiusMm: v })} />
                        )}
                        {activeVec.kind === "polygon" && (
                          <SliderRow label="Polygon Sides" min={3} max={16} step={1} value={activeVec.sides} onChange={(v) => patchVec({ sides: Math.round(v) })} />
                        )}
                        <SliderRow label="Depth / Height" unit="mm" min={0.5} max={job.thicknessMm} step={0.5} value={activeVec.depthMm} onChange={(v) => patchVec({ depthMm: v })} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, paddingTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => {
                              const id = `vec-${Date.now()}`;
                              setVectorShapes((vs) => [...vs, { ...activeVec, id, name: `${activeVec.name} +2mm`, widthMm: activeVec.widthMm + 4, heightMm: activeVec.heightMm + 4 }]);
                              setActiveVectorId(id);
                            }}
                            style={{ ...UI.btnSecondary, fontSize: 10, padding: "5px 4px" }}
                          >
                            Offset +2
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const id = `vec-${Date.now()}`;
                              setVectorShapes((vs) => [...vs, { ...activeVec, id, name: `${activeVec.name} -2mm`, widthMm: Math.max(2, activeVec.widthMm - 4), heightMm: Math.max(2, activeVec.heightMm - 4) }]);
                              setActiveVectorId(id);
                            }}
                            style={{ ...UI.btnSecondary, fontSize: 10, padding: "5px 4px" }}
                          >
                            Offset -2
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const id = `vec-${Date.now()}`;
                              setVectorShapes((vs) => [...vs, { ...activeVec, id, name: `${activeVec.name} Copy`, xMm: activeVec.xMm + 15 }]);
                              setActiveVectorId(id);
                            }}
                            style={{ ...UI.btnSecondary, fontSize: 10, padding: "5px 4px" }}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const stepX = Math.max(6, activeVec.widthMm + 6);
                              const copies: VectorShape[] = [1, 2].map((k) => ({
                                ...activeVec,
                                id: `vec-${Date.now()}-${k}`,
                                name: `${activeVec.name} #${k + 1}`,
                                xMm: activeVec.xMm + stepX * k,
                              }));
                              setVectorShapes((vs) => [...vs, ...copies]);
                            }}
                            style={{ ...UI.btnSecondary, fontSize: 10, padding: "5px 4px" }}
                          >
                            Array ×3
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {designMode === "model3d" && isSketchingIn3d && (
                <>
                  <div style={{ ...UI.pageHeader, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <h3 style={{ ...UI.pageTitle, display: "flex", alignItems: "center", gap: 6 }}>
                      <DesignIcon name="vector" size={16} />
                      <span>SKETCH · Z={sketchPlaneZMm.toFixed(1)}mm</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsSketchingIn3d(false)}
                      style={{ ...UI.btnAccentSmall, background: "#16a34a" }}
                    >
                      ✓ Finish Sketch
                    </button>
                  </div>

                  {/* SKETCH PALETTE */}
                  <div style={UI.panel}>
                    <span style={UI.sectionTitle}>DRAW PROFILE</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                      {(
                        [
                          ["select", "Select", "select"],
                          ["rect", "Rectangle", "rect"],
                          ["circle", "Circle", "circle"],
                          ["slot", "Slot", "rect"],
                          ["polygon", "Polygon", "polygon"],
                          ["polyline", "Polyline", "polyline"],
                        ] as [SketchToolMode, string, DesignIconName][]
                      ).map(([k, lbl, ic]) => (
                        <ToolTileButton
                          key={k}
                          icon={ic}
                          label={lbl}
                          active={sketchTool === k}
                          onClick={() => setSketchTool(k)}
                        />
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 2 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer" }}>
                        <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
                        Snap {snapStepMm}mm
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const id = `vec-${Date.now()}`;
                          setVectorShapes((vs) => [
                            ...vs,
                            {
                              id,
                              name: `Sketch Rect ${vs.length + 1}`,
                              kind: "rect",
                              visible: true,
                              xMm: 0,
                              yMm: 0,
                              widthMm: 40,
                              heightMm: 24,
                              rotationDeg: 0,
                              cornerRadiusMm: 0,
                              sides: 4,
                              depthMm: 5,
                              role: "cutout",
                              sketchZMm: sketchPlaneZMm,
                            },
                          ]);
                          setActiveVectorId(id);
                        }}
                        style={{ ...UI.btnSecondary, fontSize: 11, padding: "4px 8px" }}
                      >
                        + Centered Rect
                      </button>
                    </div>
                  </div>

                  {/* Sketch Profiles List */}
                  <div style={UI.panel}>
                    <span style={UI.sectionTitle}>SKETCH PROFILES ({vectorShapes.length})</span>
                    {vectorShapes.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--hc-muted, #9ca3af)" }}>
                        Pick a draw tool above and drag on the canvas, then click <b>Finish Sketch</b> to Extrude or Cut in 3D.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {vectorShapes.map((sh) => (
                          <div
                            key={sh.id}
                            onClick={() => setActiveVectorId(sh.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 8px",
                              borderRadius: 6,
                              cursor: "pointer",
                              border: activeVectorId === sh.id ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border, #262c36)",
                              background: activeVectorId === sh.id ? "color-mix(in srgb, var(--hc-accent, #2563eb) 24%, transparent)" : "var(--hc-subpanel-bg, #111419)",
                              fontSize: 12,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{sh.name}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setVectorShapes((vs) => vs.filter((x) => x.id !== sh.id));
                              }}
                              style={{ background: "transparent", border: "none", color: "var(--hc-muted, #9ca3af)", cursor: "pointer" }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Active Sketch Dimensions & Quick Finish Actions */}
                  {(() => {
                    const activeVec = vectorShapes.find((s) => s.id === activeVectorId) ?? vectorShapes[0];
                    if (!activeVec) return null;
                    const patchVec = (patch: Partial<VectorShape>) =>
                      setVectorShapes((vs) => vs.map((x) => (x.id === activeVec.id ? { ...x, ...patch } : x)));
                    const finishAndExtrude = (op: BooleanOp) => {
                      const extH = Math.max(1, activeVec.depthMm || 5);
                      const id = `solid-${Date.now()}`;
                      const node: SolidModelNode = {
                        id,
                        name: `${op === "subtract" ? "Cut" : "Extrude"} ${activeVec.name}`,
                        kind: "extrude",
                        visible: true,
                        boolOp: solidModels.length === 0 ? "union" : op,
                        xMm: activeVec.xMm,
                        yMm: activeVec.yMm,
                        zMm: op === "subtract" ? sketchPlaneZMm - extH * 0.5 : sketchPlaneZMm + extH * 0.5,
                        widthMm: activeVec.widthMm,
                        depthMm: activeVec.heightMm,
                        heightMm: extH,
                        rotXDeg: 0,
                        rotYDeg: 0,
                        rotZDeg: activeVec.rotationDeg,
                        bevelMm: 0,
                        sketchId: activeVec.id,
                      };
                      setSolidModels((ms) => [...ms, node]);
                      setActiveSolidId(id);
                      setIsSketchingIn3d(false);
                    };
                    return (
                      <div style={UI.panel}>
                        <span style={UI.sectionTitle}>DIMENSIONS · {activeVec.name}</span>
                        <SliderRow label="X" unit="mm" min={-job.widthMm * 0.6} max={job.widthMm * 0.6} step={0.5} value={activeVec.xMm} onChange={(v) => patchVec({ xMm: v })} />
                        <SliderRow label="Y" unit="mm" min={-job.depthMm * 0.6} max={job.depthMm * 0.6} step={0.5} value={activeVec.yMm} onChange={(v) => patchVec({ yMm: v })} />
                        <SliderRow label="Width" unit="mm" min={2} max={job.widthMm} step={0.5} value={activeVec.widthMm} onChange={(v) => patchVec({ widthMm: v })} />
                        <SliderRow label="Height" unit="mm" min={2} max={job.depthMm} step={0.5} value={activeVec.heightMm} onChange={(v) => patchVec({ heightMm: v })} />
                        <SliderRow label="Extrude Depth" unit="mm" min={0.5} max={job.thicknessMm * 2} step={0.5} value={activeVec.depthMm} onChange={(v) => patchVec({ depthMm: v })} />
                        {activeVec.kind === "rect" && (
                          <SliderRow label="Corner Fillet" unit="mm" min={0} max={40} step={0.5} value={activeVec.cornerRadiusMm} onChange={(v) => patchVec({ cornerRadiusMm: v })} />
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, paddingTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => finishAndExtrude("union")}
                            style={{ ...UI.btnAccentSmall, background: "#16a34a", padding: "8px 6px" }}
                          >
                            Finish &amp; Extrude
                          </button>
                          <button
                            type="button"
                            onClick={() => finishAndExtrude("subtract")}
                            style={{ ...UI.btnSecondary, borderColor: "#7f1d1d", color: "#fca5a5", padding: "8px 6px" }}
                          >
                            Finish &amp; Cut
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {designMode === "model3d" && !isSketchingIn3d && (
                <>
                  <div style={{ ...UI.pageHeader, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <h3 style={UI.pageTitle}>SOLID · 3D Modeler</h3>
                    <button
                      onClick={() => {
                        const id = `solid-${Date.now()}`;
                        const stockNode: SolidModelNode = {
                          id,
                          name: "Stock Blank",
                          kind: "box",
                          visible: true,
                          boolOp: "union",
                          xMm: 0,
                          yMm: 0,
                          zMm: -job.thicknessMm * 0.5,
                          widthMm: job.widthMm,
                          depthMm: job.depthMm,
                          heightMm: job.thicknessMm,
                          rotXDeg: 0,
                          rotYDeg: 0,
                          rotZDeg: 0,
                          bevelMm: 0,
                        };
                        setSolidModels((ms) => [stockNode, ...ms]);
                        setActiveSolidId(id);
                      }}
                      title="Insert full stock block as base body"
                      style={{ ...UI.btnSecondary, display: "flex", alignItems: "center", gap: 5, padding: "5px 9px", fontSize: 11, color: "var(--hc-accent-secondary, #38bdf8)", borderColor: "var(--hc-accent, #1e3a5f)" }}
                    >
                      <DesignIcon name="stockBlank" size={15} />
                      <span>Stock Blank</span>
                    </button>
                  </div>

                  {/* FUSION-STYLE SKETCH LAUNCHER */}
                  <div style={UI.panel}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={UI.sectionTitle}>SKETCH</span>
                      <select
                        value={sketchPlaneZMm}
                        onChange={(e) => setSketchPlaneZMm(Number(e.target.value))}
                        title="Select Sketch Plane Z"
                        style={{ ...UI.input, width: "auto", padding: "3px 6px", fontSize: 11 }}
                      >
                        <option value={0}>Top of Stock (Z=0)</option>
                        <option value={-job.thicknessMm * 0.5}>Mid Stock (Z={(-job.thicknessMm * 0.5).toFixed(1)})</option>
                        {(() => {
                          const act = solidModels.find((m) => m.id === activeSolidId) ?? solidModels[0];
                          if (!act) return null;
                          const faceZ = Number((act.zMm + act.heightMm * 0.5).toFixed(2));
                          return <option value={faceZ}>{act.name} Top (Z={faceZ})</option>;
                        })()}
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: vectorShapes.length > 0 ? "1.3fr 1fr 1fr" : "1fr", gap: 5 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSketchTool("rect");
                          setIsSketchingIn3d(true);
                        }}
                        style={{ ...UI.btnAccentSmall, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 8px" }}
                      >
                        <DesignIcon name="vector" size={14} />
                        <span>+ Create Sketch</span>
                      </button>
                      {vectorShapes.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const sk = vectorShapes.find((s) => s.id === activeVectorId) ?? vectorShapes[0];
                              setActiveVectorId(sk.id);
                              setSketchPlaneZMm(sk.sketchZMm ?? 0);
                              setIsSketchingIn3d(true);
                            }}
                            style={{ ...UI.btnSecondary, fontSize: 11 }}
                          >
                            Edit Sketch
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const sk = vectorShapes.find((s) => s.id === activeVectorId) ?? vectorShapes[0];
                              const extH = Math.max(1, sk.depthMm || 5);
                              const sz = sk.sketchZMm ?? 0;
                              const id = `solid-${Date.now()}`;
                              const node: SolidModelNode = {
                                id,
                                name: `Extrude ${sk.name}`,
                                kind: "extrude",
                                visible: true,
                                boolOp: solidModels.length === 0 ? "union" : "union",
                                xMm: sk.xMm,
                                yMm: sk.yMm,
                                zMm: sz + extH * 0.5,
                                widthMm: sk.widthMm,
                                depthMm: sk.heightMm,
                                heightMm: extH,
                                rotXDeg: 0,
                                rotYDeg: 0,
                                rotZDeg: sk.rotationDeg,
                                bevelMm: 0,
                                sketchId: sk.id,
                              };
                              setSolidModels((ms) => [...ms, node]);
                              setActiveSolidId(id);
                            }}
                            style={{ ...UI.btnSecondary, fontSize: 11, color: "#4ade80" }}
                          >
                            Extrude Sk
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* CREATE Toolbar (Fusion 360 style) */}
                  <div style={UI.panel}>
                    <span style={UI.sectionTitle}>CREATE</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                      {(
                        [
                          ["extrude", "Extrude", "union", "extrude"],
                          ["revolve", "Revolve", "union", "revolve"],
                          ["hole", "Hole (Cut)", "subtract", "hole"],
                          ["box", "Box", "union", "box"],
                          ["cylinder", "Cylinder", "union", "cylinder"],
                          ["pipe", "Pipe", "union", "pipe"],
                          ["sphere", "Sphere", "union", "sphere"],
                          ["torus", "Torus", "union", "torus"],
                          ["wedge", "Wedge", "union", "wedge"],
                        ] as [SolidPrimitiveKind, string, BooleanOp, DesignIconName][]
                      ).map(([kind, lbl, defaultOp, ic]) => (
                        <ToolTileButton
                          key={kind}
                          icon={ic}
                          label={lbl}
                          accent={defaultOp === "subtract" ? "red" : undefined}
                          onClick={() => {
                            const id = `solid-${Date.now()}`;
                            const isHole = kind === "hole";
                            const node: SolidModelNode = {
                              id,
                              name: `${lbl.replace(" (Cut)", "")} ${solidModels.length + 1}`,
                              kind,
                              visible: true,
                              boolOp: solidModels.length === 0 ? "union" : defaultOp,
                              xMm: 0,
                              yMm: 0,
                              zMm: isHole ? -job.thicknessMm * 0.5 : 0,
                              widthMm: isHole ? 12 : 50,
                              depthMm: isHole ? 12 : 50,
                              heightMm: isHole ? job.thicknessMm + 2 : 10,
                              rotXDeg: 0,
                              rotYDeg: 0,
                              rotZDeg: 0,
                              bevelMm: 0,
                              sketchId: vectorShapes[0]?.id,
                            };
                            setSolidModels((ms) => [...ms, node]);
                            setActiveSolidId(id);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* MODIFY Toolbar */}
                  {(() => {
                    const activeSolid = solidModels.find((m) => m.id === activeSolidId) ?? solidModels[0];
                    if (!activeSolid) return null;
                    const patchSolid = (patch: Partial<SolidModelNode>) =>
                      setSolidModels((ms) => ms.map((x) => (x.id === activeSolid.id ? { ...x, ...patch } : x)));
                    const cloneWith = (suffix: string, patch: Partial<SolidModelNode>) => {
                      const id = `solid-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                      const copy: SolidModelNode = { ...activeSolid, id, name: `${activeSolid.name} ${suffix}`, ...patch };
                      setSolidModels((ms) => [...ms, copy]);
                      setActiveSolidId(id);
                    };
                    return (
                      <div style={UI.panel}>
                        <span style={UI.sectionTitle}>MODIFY · {activeSolid.name}</span>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                          <ToolTileButton
                            icon="pull"
                            label="Pull +2mm"
                            title="Press/Pull +2mm Height"
                            onClick={() => patchSolid({ heightMm: Math.min(job.thicknessMm * 3, activeSolid.heightMm + 2) })}
                          />
                          <ToolTileButton
                            icon="push"
                            label="Push -2mm"
                            title="Press/Pull -2mm Height"
                            onClick={() => patchSolid({ heightMm: Math.max(1, activeSolid.heightMm - 2) })}
                          />
                          <ToolTileButton
                            icon="duplicate"
                            label="Duplicate"
                            title="Duplicate selected feature"
                            onClick={() => cloneWith("Copy", { xMm: activeSolid.xMm + 15 })}
                          />
                          <ToolTileButton
                            icon="mirrorX"
                            label="Mirror X"
                            title="Mirror across X=0"
                            onClick={() => cloneWith("MirX", { xMm: -activeSolid.xMm, rotYDeg: -activeSolid.rotYDeg, rotZDeg: -activeSolid.rotZDeg })}
                          />
                          <ToolTileButton
                            icon="mirrorY"
                            label="Mirror Y"
                            title="Mirror across Y=0"
                            onClick={() => cloneWith("MirY", { yMm: -activeSolid.yMm, rotXDeg: -activeSolid.rotXDeg, rotZDeg: -activeSolid.rotZDeg })}
                          />
                          <ToolTileButton
                            icon="pattern"
                            label="Pattern ×3"
                            title="Linear Pattern ×3 along X"
                            onClick={() => {
                              const stepX = Math.max(8, activeSolid.widthMm + 6);
                              const copies: SolidModelNode[] = [1, 2].map((k) => ({
                                ...activeSolid,
                                id: `solid-${Date.now()}-${k}`,
                                name: `${activeSolid.name} #${k + 1}`,
                                xMm: activeSolid.xMm + stepX * k,
                              }));
                              setSolidModels((ms) => [...ms, ...copies]);
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* BROWSER & FEATURE TIMELINE */}
                  <div style={UI.panel}>
                    <span style={UI.sectionTitle}>BROWSER &amp; TIMELINE ({solidModels.length})</span>
                    {solidModels.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--hc-muted, #9ca3af)" }}>
                        Click <b>+ Stock Blank</b> or pick a <b>CREATE</b> tool to start modeling.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {solidModels.map((m, idx) => (
                          <div
                            key={m.id}
                            onClick={() => setActiveSolidId(m.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 8px",
                              borderRadius: 6,
                              cursor: "pointer",
                              border: activeSolidId === m.id ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border, #262c36)",
                              background: activeSolidId === m.id ? "color-mix(in srgb, var(--hc-accent, #2563eb) 24%, transparent)" : "var(--hc-subpanel-bg, #111419)",
                              fontSize: 12,
                              opacity: m.visible ? 1 : 0.55,
                            }}
                          >
                            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={m.visible}
                                onChange={(e) => setSolidModels((ms) => ms.map((x) => (x.id === m.id ? { ...x, visible: e.target.checked } : x)))}
                              />
                              <DesignIcon name={m.kind === "cone" ? "wedge" : m.kind} size={14} color="var(--hc-section-title, #93c5fd)" />
                              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  background: "#0f172a",
                                  color: idx === 0 ? "var(--hc-section-title, #93c5fd)" : m.boolOp === "subtract" ? "#f87171" : m.boolOp === "intersect" ? "#fbbf24" : "#4ade80",
                                  fontWeight: 700,
                                }}
                              >
                                {idx === 0 ? "Base" : m.boolOp === "subtract" ? "Cut" : m.boolOp === "intersect" ? "Intersect" : "Join"}
                              </span>
                              <button
                                disabled={idx === 0}
                                onClick={() =>
                                  setSolidModels((ms) => {
                                    if (idx <= 0) return ms;
                                    const next = [...ms];
                                    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                    return next;
                                  })
                                }
                                title="Move earlier in timeline"
                                style={{ background: "transparent", border: "none", color: idx === 0 ? "var(--hc-border-strong, #374151)" : "var(--hc-muted, #9ca3af)", cursor: idx === 0 ? "default" : "pointer", padding: "0 2px" }}
                              >
                                ▲
                              </button>
                              <button
                                disabled={idx === solidModels.length - 1}
                                onClick={() =>
                                  setSolidModels((ms) => {
                                    if (idx >= ms.length - 1) return ms;
                                    const next = [...ms];
                                    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                    return next;
                                  })
                                }
                                title="Move later in timeline"
                                style={{ background: "transparent", border: "none", color: idx === solidModels.length - 1 ? "var(--hc-border-strong, #374151)" : "var(--hc-muted, #9ca3af)", cursor: idx === solidModels.length - 1 ? "default" : "pointer", padding: "0 2px" }}
                              >
                                ▼
                              </button>
                              <button
                                onClick={() => setSolidModels((ms) => ms.filter((x) => x.id !== m.id))}
                                title="Delete feature"
                                style={{ background: "transparent", border: "none", color: "var(--hc-muted, #9ca3af)", cursor: "pointer", padding: "0 2px" }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* FEATURE INSPECTOR */}
                  {(() => {
                    const activeSolid = solidModels.find((m) => m.id === activeSolidId) ?? solidModels[0];
                    if (!activeSolid) return null;
                    const patchSolid = (patch: Partial<SolidModelNode>) =>
                      setSolidModels((ms) => ms.map((x) => (x.id === activeSolid.id ? { ...x, ...patch } : x)));
                    return (
                      <div style={UI.panel}>
                        <span style={UI.sectionTitle}>EDIT FEATURE · {activeSolid.name}</span>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                          {(
                            [
                              ["union", "Join", "union", "green"],
                              ["subtract", "Cut", "subtract", "red"],
                              ["intersect", "Intersect", "intersect", "amber"],
                            ] as [BooleanOp, string, DesignIconName, "green" | "red" | "amber"][]
                          ).map(([op, lbl, ic, acc]) => (
                            <ToolTileButton
                              key={op}
                              icon={ic}
                              label={lbl}
                              accent={acc}
                              active={activeSolid.boolOp === op}
                              onClick={() => patchSolid({ boolOp: op })}
                            />
                          ))}
                        </div>
                        {activeSolid.kind === "extrude" && vectorShapes.length > 0 && (
                          <div>
                            <label style={UI.label}>Profile Sketch</label>
                            <select value={activeSolid.sketchId ?? ""} onChange={(e) => patchSolid({ sketchId: e.target.value })} style={{ ...UI.input, marginTop: 3 }}>
                              {vectorShapes.map((vs) => (
                                <option key={vs.id} value={vs.id}>{vs.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <SliderRow label="Pos X" unit="mm" min={-job.widthMm * 0.6} max={job.widthMm * 0.6} step={0.5} value={activeSolid.xMm} onChange={(v) => patchSolid({ xMm: v })} />
                        <SliderRow label="Pos Y" unit="mm" min={-job.depthMm * 0.6} max={job.depthMm * 0.6} step={0.5} value={activeSolid.yMm} onChange={(v) => patchSolid({ yMm: v })} />
                        <SliderRow label="Pos Z" unit="mm" min={-job.thicknessMm} max={job.thicknessMm} step={0.5} value={activeSolid.zMm} onChange={(v) => patchSolid({ zMm: v })} />
                        <SliderRow label={activeSolid.kind === "hole" || activeSolid.kind === "cylinder" ? "Diameter X" : "Width (X)"} unit="mm" min={2} max={job.widthMm} step={0.5} value={activeSolid.widthMm} onChange={(v) => patchSolid({ widthMm: v })} />
                        <SliderRow label={activeSolid.kind === "hole" || activeSolid.kind === "cylinder" ? "Diameter Y" : "Depth (Y)"} unit="mm" min={2} max={job.depthMm} step={0.5} value={activeSolid.depthMm} onChange={(v) => patchSolid({ depthMm: v })} />
                        <SliderRow label="Height / Extrude" unit="mm" min={1} max={job.thicknessMm * 2} step={0.5} value={activeSolid.heightMm} onChange={(v) => patchSolid({ heightMm: v })} />
                        <SliderRow label="Rotate X" unit="°" min={-180} max={180} step={5} value={activeSolid.rotXDeg} onChange={(v) => patchSolid({ rotXDeg: v })} />
                        <SliderRow label="Rotate Y" unit="°" min={-180} max={180} step={5} value={activeSolid.rotYDeg} onChange={(v) => patchSolid({ rotYDeg: v })} />
                        <SliderRow label="Rotate Z" unit="°" min={-180} max={180} step={5} value={activeSolid.rotZDeg} onChange={(v) => patchSolid({ rotZDeg: v })} />
                        {(activeSolid.kind === "box" || activeSolid.kind === "extrude" || activeSolid.kind === "pipe") && (
                          <SliderRow label="Fillet / Chamfer" unit="mm" min={0} max={8} step={0.25} value={activeSolid.bevelMm} onChange={(v) => patchSolid({ bevelMm: v })} />
                        )}
                      </div>
                    );
                  })()}
                </>
              )}

              <button onClick={() => setStep("relief")} style={UI.btnPrimary}>
                Next: 3D Relief Settings →
              </button>
            </>
          )}

          {step === "relief" && (
            <>
              <div style={UI.pageHeader}>
                <h3 style={UI.pageTitle}>3D Relief & Depth Map</h3>
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    onClick={handleTrimUnusedBed}
                    title="Resize stock/bed to the exact picture footprint, removing unused bed margins"
                    style={{ ...UI.btnSecondary, display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    <DesignIcon name="baseRemoval" size={14} />
                    <span>Trim Bed</span>
                  </button>
                  <button
                    onClick={() => {
                      const restored = restoreOriginalBed();
                      setReliefSettings(DEFAULT_RELIEF_SETTINGS);
                      setViewportSource("relief");
                      if (restored) setLastSavedMsg("Restored original workarea & relief defaults");
                    }}
                    style={{ ...UI.btnSecondary, display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    <DesignIcon name="reset" size={14} />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 6 }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 10px", background: "var(--hc-accent, #2563eb)", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 12, color: "#fff" }}>
                  <DesignIcon name="picture" size={15} />
                  <span>Depth Map</span>
                  <input type="file" accept="image/*,.tif,.tiff,.exr" onChange={handleDepthMapUpload} style={{ display: "none" }} />
                </label>
                <label style={{ ...UI.btnSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 10px", borderRadius: 8 }}>
                  <DesignIcon name="model3d" size={15} />
                  <span>Import .STL</span>
                  <input
                    type="file"
                    accept=".stl"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      e.target.value = "";
                      const buf = await f.arrayBuffer();
                      const src = parseStlToDepthSource(buf, f.name.replace(/\.stl$/i, ""), 384);
                      pushUndoSnapshot();
                      const id = `layer-${Date.now()}`;
                      setLayers((ls) => [
                        ...ls,
                        { id, name: src.label, visible: true, combineMode: "mergeHigh", weight: 1.0, source: src, placement: { ...DEFAULT_PLACEMENT, scale: 0.9 } },
                      ]);
                      setActiveLayerId(id);
                      setLastSavedMsg(`Imported STL: ${f.name}`);
                    }}
                    style={{ display: "none" }}
                  />
                </label>
              </div>

              <div style={{ fontSize: 11, color: "var(--hc-muted, #8b949e)" }}>
                Merged Layers: <strong style={{ color: "var(--hc-text, #e6edf3)" }}>{layers.filter((l) => l.visible).length}</strong> → 3D Mesh {gridW}×{gridH}
              </div>

              <div style={{ ...UI.panel, gap: 11, padding: 12 }}>
                <SliderRow label="Carving Depth (Z Height)" hint="Total depth from highest peak to deepest valley." unit="mm" min={0.5} max={Math.max(2, job.thicknessMm - 0.5)} step={0.5} value={reliefSettings.maxZMm} onChange={(v) => setReliefSettings((s) => ({ ...s, maxZMm: v }))} />
                <SliderRow label="Base Height Offset" hint="Raises or recesses the entire carving relative to stock top." unit="mm" min={-5} max={5} step={0.25} value={reliefSettings.baseHeightMm} onChange={(v) => setReliefSettings((s) => ({ ...s, baseHeightMm: v }))} />
                <SliderRow label="Detail Sharpen" hint="Boosts crisp edges and fine textures on depth maps." unit="×" min={0} max={1} step={0.05} value={reliefSettings.sharpen} onChange={(v) => setReliefSettings((s) => ({ ...s, sharpen: v }))} />
                <SliderRow label="Micro-Contrast" hint="Pops fine local details (feathers, hair, fabric) without blowing out highlights." unit="%" min={0} max={100} step={5} value={Math.round((reliefSettings.microContrast ?? 0.2) * 100)} onChange={(v) => setReliefSettings((s) => ({ ...s, microContrast: v / 100 }))} />
                <SliderRow label="Pillow Rounding" hint="Rounds flat-topped regions into smooth, sculpted domed forms." unit="%" min={0} max={100} step={5} value={Math.round((reliefSettings.pillowRound ?? 0) * 100)} onChange={(v) => setReliefSettings((s) => ({ ...s, pillowRound: v / 100 }))} />
                <SliderRow label="Contrast" hint="Increases separation between raised and recessed areas." unit="×" min={0.5} max={2.0} step={0.05} value={reliefSettings.contrast} onChange={(v) => setReliefSettings((s) => ({ ...s, contrast: v }))} />
                <SliderRow label="Gamma Curve" hint="Adjusts midtone height (<1 lifts details, >1 deepens)." min={0.4} max={2.5} step={0.05} value={reliefSettings.gamma} onChange={(v) => setReliefSettings((s) => ({ ...s, gamma: v }))} />
                <SliderRow label="JPG De-Blocking" hint="Removes 8-bit banding and JPG compression blocks while keeping sharp edges." unit="pass" min={0} max={3} step={1} value={reliefSettings.debandPasses ?? 0} onChange={(v) => setReliefSettings((s) => ({ ...s, debandPasses: v }))} />
                <SliderRow label="Smoothing (De-noise)" hint="Softens rough steps or grain from low-bit images." unit="pass" min={0} max={6} step={1} value={reliefSettings.smoothPasses} onChange={(v) => setReliefSettings((s) => ({ ...s, smoothPasses: v }))} />
                <SliderRow label="Detail Protection" hint="Shields sharp edges and fine features (eyes, feathers, text) from being blurred when smoothing." unit="%" min={0} max={100} step={5} value={Math.round((reliefSettings.detailProtection ?? 0.45) * 100)} onChange={(v) => setReliefSettings((s) => ({ ...s, detailProtection: v / 100 }))} />
                <SliderRow label="Draft Angle (Wall Taper)" hint="Slopes steep 90° vertical cliffs into smooth, machinable tapered walls (0° = vertical)." unit="°" min={0} max={20} step={1} value={reliefSettings.draftAngleDeg ?? 0} onChange={(v) => setReliefSettings((s) => ({ ...s, draftAngleDeg: v }))} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--hc-text, #e6edf3)", fontWeight: 500, display: "inline-flex", alignItems: "center" }}>
                    Mesh Detail
                    <HelpBubble text="Controls 3D preview triangle density. Higher values show finer carving detail." />
                  </span>
                  <select value={reliefSettings.resolution < 640 ? 640 : reliefSettings.resolution} onChange={(e) => setReliefSettings((s) => ({ ...s, resolution: Number(e.target.value) }))} style={{ padding: "5px 8px", background: "var(--hc-subpanel-bg, #111419)", color: "var(--hc-text, #fff)", border: "1px solid var(--hc-border-strong, #374151)", borderRadius: 6, fontSize: 12 }}>
                    <option value={640}>High (640px)</option>
                    <option value={768}>Ultra HD (768px)</option>
                    <option value={1024}>Extreme (1024px)</option>
                    <option value={1280}>Studio 4K (1280px)</option>
                    <option value={1536}>Master 6K (1536px)</option>
                  </select>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 2 }}>
                  <span style={{ fontSize: 12, color: "var(--hc-text, #e6edf3)", fontWeight: 500, display: "inline-flex", alignItems: "center" }}>
                    Tilt Model ({(reliefSettings.tiltDeg || 0).toFixed(1)}°)
                    <HelpBubble text="Tilts the entire relief plane by 0.1° increments to compensate for uneven beds or fade one side." />
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => setReliefSettings((s) => ({ ...s, tiltDeg: Number(((s.tiltDeg || 0) - 0.1).toFixed(1)) }))}
                      style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid var(--hc-border-strong, #374151)", background: "var(--hc-subpanel-bg, #111419)", color: "var(--hc-text, #e6edf3)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                    >
                      -0.1°
                    </button>
                    <button
                      onClick={() => setReliefSettings((s) => ({ ...s, tiltDeg: 0 }))}
                      style={{ padding: "4px 7px", borderRadius: 5, border: "1px solid var(--hc-border-strong, #374151)", background: "var(--hc-subpanel-bg, #111419)", color: "var(--hc-muted, #9ca3af)", fontSize: 11, cursor: "pointer" }}
                    >
                      0°
                    </button>
                    <button
                      onClick={() => setReliefSettings((s) => ({ ...s, tiltDeg: Number(((s.tiltDeg || 0) + 0.1).toFixed(2)) }))}
                      style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid var(--hc-border-strong, #374151)", background: "var(--hc-subpanel-bg, #111419)", color: "var(--hc-text, #e6edf3)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                    >
                      +0.1°
                    </button>
                    <button
                      onClick={() => {
                        const deg = computeAutoLevelTiltDeg(reliefHeights, gridW, gridH, job.widthMm, reliefSettings.maxZMm);
                        setReliefSettings((s) => ({ ...s, tiltDeg: deg }));
                      }}
                      title="Automatically level tilted depth maps flat using least-squares plane fit"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 5, border: "none", background: "var(--hc-accent, #2563eb)", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                    >
                      <DesignIcon name="autoFlat" size={13} />
                      <span>Auto Flat</span>
                    </button>
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={reliefSettings.preserveAspect} onChange={(e) => setReliefSettings((s) => ({ ...s, preserveAspect: e.target.checked }))} />
                  Preserve Aspect Ratio (keeps image proportions)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={reliefSettings.invert} onChange={(e) => setReliefSettings((s) => ({ ...s, invert: e.target.checked }))} />
                  Invert Depth (swaps raised and carved areas)
                </label>

                {/* Base Removal Options */}
                <div style={{ borderTop: "1px solid var(--hc-border, #2d3542)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--hc-text, #e6edf3)", fontWeight: 500, display: "inline-flex", alignItems: "center" }}>
                    Base Options
                    <HelpBubble text="Keep the full rectangular stock block (Solid) or isolate the 3D subject by removing the flat background (Base Removal)." />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {(
                      [
                        ["solid", "Solid Block", "solidBlock"],
                        ["baseRemoval", "Base Removal", "baseRemoval"],
                      ] as const
                    ).map(([m, lbl, ic]) => (
                      <ToolTileButton
                        key={m}
                        icon={ic}
                        label={lbl}
                        active={reliefSettings.baseMode === m}
                        onClick={() => setReliefSettings((s) => ({ ...s, baseMode: m }))}
                      />
                    ))}
                  </div>
                  {reliefSettings.baseMode === "baseRemoval" && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {(
                          [
                            ["edgeConnected", "Edge Connected"],
                            ["allFlat", "All Flat Base"],
                          ] as const
                        ).map(([t, lbl]) => (
                          <button
                            key={t}
                            onClick={() => setReliefSettings((s) => ({ ...s, baseRemovalType: t }))}
                            style={{
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: reliefSettings.baseRemovalType === t ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border-strong, #30363d)",
                              background: reliefSettings.baseRemovalType === t ? "rgba(56,189,248,0.16)" : "var(--hc-subpanel-bg, #111419)",
                              color: "var(--hc-text, #e2e8f0)",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                      <SliderRow
                        label="Base Threshold"
                        hint="Height cutoff below which background is removed."
                        unit="%"
                        min={1}
                        max={35}
                        step={1}
                        value={Math.round((reliefSettings.baseThreshold ?? 0.08) * 100)}
                        onChange={(v) => setReliefSettings((s) => ({ ...s, baseThreshold: v / 100 }))}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Direct 3D Sculpting Tools */}
              <div style={{ padding: 12, background: "var(--hc-panel-bg, #1a1f28)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 9, border: sculpt3dActive ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--hc-text, #e6edf3)", display: "inline-flex", alignItems: "center" }}>
                    3D Viewport Sculpting
                    <HelpBubble text="Enable to sculpt directly on the 3D model with left-click (right-drag to orbit)." />
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => setSculpt3dActive((a) => !a)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "none",
                        background: sculpt3dActive ? "var(--hc-success, #16a34a)" : "var(--hc-accent, #2563eb)",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <DesignIcon name="sculptMode" size={14} />
                      <span>{sculpt3dActive ? "Sculpting ON" : "Enable Sculpt"}</span>
                    </button>
                    <button
                      onClick={() => {
                        pushUndoSnapshot();
                        setSculptDelta(new Float32Array(gridW * gridH));
                      }}
                      title="Clear all 3D sculpt strokes"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 7px", borderRadius: 6, border: "1px solid var(--hc-border-strong, #374151)", background: "var(--hc-subpanel-bg, #111419)", color: "var(--hc-muted, #9ca3af)", fontSize: 11, cursor: "pointer" }}
                    >
                      <DesignIcon name="clear" size={13} />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>
                {sculpt3dActive && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                      {(
                        [
                          ["raise", "Raise (+)", "paintRaise"],
                          ["lower", "Carve (-)", "paintLower"],
                          ["smooth", "Smooth", "paintSmooth"],
                          ["flatten", "Flatten", "sculptFlatten"],
                          ["pinch", "Pinch", "sculptPinch"],
                          ["inflate", "Inflate", "sculptInflate"],
                        ] as [SculptBrushKind, string, DesignIconName][]
                      ).map(([b, lbl, ic]) => (
                        <ToolTileButton
                          key={b}
                          icon={ic}
                          label={lbl}
                          active={sculptBrush === b}
                          onClick={() => setSculptBrush(b)}
                        />
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                      <span style={{ color: "var(--hc-muted, #9ca3af)" }}>Brush Falloff</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {(["smooth", "sharp", "flat"] as SculptFalloff[]).map((f) => (
                          <button
                            key={f}
                            onClick={() => setSculptFalloff(f)}
                            style={{
                              padding: "3px 8px",
                              borderRadius: 4,
                              border: sculptFalloff === f ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border-strong, #30363d)",
                              background: sculptFalloff === f ? "var(--hc-panel-bg, #1e293b)" : "var(--hc-subpanel-bg, #111419)",
                              color: "var(--hc-text, #e2e8f0)",
                              fontSize: 10,
                              cursor: "pointer",
                              textTransform: "capitalize",
                            }}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                    <SliderRow label="Brush Size" hint="Radius of the 3D sculpting brush." unit="mm" min={2} max={45} step={1} value={sculptRadiusMm} onChange={setSculptRadiusMm} />
                    <SliderRow label="Brush Strength" hint="Intensity of each sculpt stroke." unit="%" min={5} max={100} step={5} value={Math.round(sculptStrength * 100)} onChange={(v) => setSculptStrength(v / 100)} />
                  </>
                )}
              </div>

              {/* Live Cross-Section Z-Profile Slice */}
              <ZProfileWidget
                heights={reliefHeights}
                gridW={gridW}
                gridH={gridH}
                sliceYPct={sliceYPct}
                widthMm={job.widthMm}
                thicknessMm={job.thicknessMm}
                maxZMm={reliefSettings.maxZMm}
                baseHeightMm={reliefSettings.baseHeightMm}
                onChangeSliceY={setSliceYPct}
              />

              <button onClick={() => setStep("toolpaths")} style={UI.btnPrimary}>
                Next: Multi-Op Toolpaths →
              </button>
            </>
          )}

          {step === "toolpaths" && (
            <>
              <div style={UI.pageHeader}>
                <h3 style={UI.pageTitle}>Operation Stack (Cut Order)</h3>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addOperation(e.target.value as StrategyKey);
                  }}
                  style={UI.btnAccentSmall}
                >
                  <option value="">+ Add Op</option>
                  <optgroup label="1. Roughing (Bulk Clear)">
                    <option value="ReliefRough3D">3D Relief Roughing</option>
                    <option value="Adaptive2D">2D Adaptive Clearing</option>
                    <option value="AdaptiveOffset2D">2D Offset + Arcs (G2/G3)</option>
                  </optgroup>
                  <optgroup label="2. 3D Finishing (Surface)">
                    <option value="ReliefFinish3D">3D Parallel Finishing</option>
                    <option value="Spiral3D">3D Spiral Finishing</option>
                    <option value="SteepShallow3D">3D Steep &amp; Shallow</option>
                  </optgroup>
                  <optgroup label="3. Detail &amp; Carving">
                    <option value="Pencil3D">3D Pencil / Valley Cleanup</option>
                    <option value="VCarve">True / 3D V-Carving</option>
                    <option value="PhotoVCarve">PhotoVCarve / Lithophane</option>
                  </optgroup>
                  <optgroup label="4. 2D Pocket, Cutout &amp; Drilling">
                    <option value="Pocket2D">2D Pocket</option>
                    <option value="Contour2D">2D Contour + Tabs</option>
                    <option value="Drilling">Peck Drilling (Holes)</option>
                  </optgroup>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                <ToolTileButton
                  icon="surfaceStock"
                  label="Surface Stock"
                  title="Add 1-inch flattening pass across full stock"
                  onClick={handleAddSurfaceStock}
                />
                <ToolTileButton
                  icon="flipDowels"
                  label="Flip Dowels"
                  title="Add 2-sided alignment dowel holes"
                  onClick={handleAddFlipDowels}
                />
              </div>

              {/* 1-Click CAM Operation Templates (Built-In + Custom) */}
              <div style={UI.panel}>
                <span style={UI.sectionTitle}>1-Click CAM Templates</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                  {(
                    [
                      {
                        label: "3D Rough+Fin",
                        title: "3D Relief Roughing + Parallel Ballnose Finishing",
                        ops: [
                          { name: "3D Roughing", enabled: true, strategy: "ReliefRough3D" as StrategyKey, toolNumber: tools.find((t) => t.category === "Flat")?.number ?? tools[0].number, overrides: {}, stockToLeaveMm: 0.5, maxCutDepthMm: Math.min(12, job.thicknessMm - 1), rampEnabled: true },
                          { name: "3D Parallel Finish", enabled: true, strategy: "ReliefFinish3D" as StrategyKey, toolNumber: tools.find((t) => t.category === "Ballnose")?.number ?? tools[0].number, overrides: {}, stockToLeaveMm: 0, maxCutDepthMm: Math.min(12, job.thicknessMm - 1) },
                        ],
                      },
                      {
                        label: "V-Carve+Cut",
                        title: "V-Carving + 2D Contour Cutout with Holding Tabs",
                        ops: [
                          { name: "V-Carving", enabled: true, strategy: "VCarve" as StrategyKey, toolNumber: tools.find((t) => t.category === "V-Bit")?.number ?? tools[0].number, overrides: {}, stockToLeaveMm: 0, maxCutDepthMm: 5 },
                          { name: "Cutout + Tabs", enabled: true, strategy: "Contour2D" as StrategyKey, toolNumber: tools.find((t) => t.category === "Flat")?.number ?? tools[0].number, overrides: {}, stockToLeaveMm: 0, maxCutDepthMm: job.thicknessMm, tabsEnabled: true, tabCount: 4, tabHeightMm: 2.5, rampEnabled: true },
                        ],
                      },
                      {
                        label: "Pocket+Cut",
                        title: "2D Pocket + 2D Contour Cutout with Tabs",
                        ops: [
                          { name: "2D Pocket", enabled: true, strategy: "Pocket2D" as StrategyKey, toolNumber: tools.find((t) => t.category === "Flat")?.number ?? tools[0].number, overrides: {}, stockToLeaveMm: 0, maxCutDepthMm: Math.min(8, job.thicknessMm * 0.5), rampEnabled: true },
                          { name: "Cutout + Tabs", enabled: true, strategy: "Contour2D" as StrategyKey, toolNumber: tools.find((t) => t.category === "Flat")?.number ?? tools[0].number, overrides: {}, stockToLeaveMm: 0, maxCutDepthMm: job.thicknessMm, tabsEnabled: true, tabCount: 4, tabHeightMm: 2.5, rampEnabled: true },
                        ],
                      },
                    ]
                  ).map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      title={preset.title}
                      onClick={() => {
                        const baseTs = Date.now();
                        const built: CamOperationItem[] = preset.ops.map((o, i) => ({
                          ...o,
                          id: `op-${baseTs}-${i}`,
                          name: `Op ${i + 1}: ${o.name}`,
                          previewPts: [],
                        }));
                        setOperations(built);
                        setActiveOpId(built[0].id);
                        setLastSavedMsg(`Applied template: ${preset.label}`);
                      }}
                      style={{ ...UI.btnSecondary, fontSize: 11, padding: "5px 4px" }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {customOpTemplates.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {customOpTemplates.map((tpl) => (
                      <div
                        key={tpl.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: 6,
                          border: "1px solid var(--hc-accent-secondary, #38bdf8)",
                          background: "var(--hc-subpanel-bg, #111419)",
                          overflow: "hidden",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const baseTs = Date.now();
                            const built: CamOperationItem[] = tpl.ops.map((o, i) => ({
                              ...o,
                              id: `op-${baseTs}-${i}`,
                              previewPts: [],
                            }));
                            if (built.length > 0) {
                              setOperations(built);
                              setActiveOpId(built[0].id);
                              setLastSavedMsg(`Applied custom template: ${tpl.name}`);
                            }
                          }}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--hc-text, #f1f5f9)",
                            padding: "4px 8px",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {tpl.name} ({tpl.ops.length})
                        </button>
                        <button
                          type="button"
                          title="Delete custom template"
                          onClick={() => setCustomOpTemplates((ts) => ts.filter((x) => x.id !== tpl.id))}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--hc-muted, #9ca3af)",
                            padding: "4px 6px 4px 2px",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: 5 }}>
                  <input
                    type="text"
                    value={templateDraftName}
                    onChange={(e) => setTemplateDraftName(e.target.value)}
                    placeholder="My custom 1-click template name..."
                    style={{ ...UI.input, flex: 1, padding: "5px 8px", fontSize: 11 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (operations.length === 0) return;
                      const name = templateDraftName.trim() || `Custom Setup ${customOpTemplates.length + 1}`;
                      const tpl: CamOpTemplate = {
                        id: `tpl-${Date.now()}`,
                        name,
                        ops: operations.map(({ id: _id, previewPts: _pts, rustToolpath: _rtp, ...rest }) => rest),
                      };
                      setCustomOpTemplates((ts) => [...ts, tpl]);
                      setTemplateDraftName("");
                      setLastSavedMsg(`Saved 1-click template: ${name}`);
                    }}
                    style={UI.btnAccentSmall}
                  >
                    + Save
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {operations.map((op, opIdx) => {
                  const opTool = tools.find((t) => t.number === op.toolNumber) ?? tools[0];
                  const stageBadge =
                    op.strategy === "ReliefRough3D" || op.strategy === "Adaptive2D" || op.strategy === "AdaptiveOffset2D"
                      ? { text: "ROUGH", bg: "rgba(245,158,11,0.18)", fg: "#fbbf24" }
                      : op.strategy === "ReliefFinish3D" || op.strategy === "Spiral3D" || op.strategy === "SteepShallow3D"
                      ? { text: "FINISH", bg: "rgba(34,197,94,0.18)", fg: "#4ade80" }
                      : op.strategy === "Contour2D" || op.strategy === "Pocket2D"
                      ? { text: "2D/CUT", bg: "rgba(56,189,248,0.18)", fg: "var(--hc-accent-secondary, #38bdf8)" }
                      : { text: "DETAIL", bg: "rgba(244,114,182,0.18)", fg: "#f472b6" };
                  return (
                    <div
                      key={op.id}
                      onClick={() => setActiveOpId(op.id)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: "10px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        border: activeOp.id === op.id ? "2px solid var(--hc-accent, #3b82f6)" : "1px solid var(--hc-border-strong, #30363d)",
                        background: activeOp.id === op.id ? "color-mix(in srgb, var(--hc-accent, #2563eb) 26%, transparent)" : "var(--hc-panel-bg, #1b2028)",
                        fontSize: 14,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" style={{ width: 16, height: 16 }} checked={op.enabled} onChange={(e) => setOperations((ops) => ops.map((x) => (x.id === op.id ? { ...x, enabled: e.target.checked } : x)))} />
                        </label>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#0f172a", color: "var(--hc-section-title, #93c5fd)" }}>
                          #{opIdx + 1}
                        </span>
                        <ToolpathIcon strategy={op.strategy} size={24} />
                        <div style={{ flex: 1, minWidth: 0, opacity: op.enabled ? 1 : 0.45 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--hc-text, #f8fafc)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {op.name.replace(/^Op \d+:\s*/, "")}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--hc-text, #e2e8f0)", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                            <span style={{ padding: "1px 5px", borderRadius: 4, background: stageBadge.bg, color: stageBadge.fg, fontWeight: 700, fontSize: 11 }}>
                              {stageBadge.text}
                            </span>
                            <span>{opTool.sizeLabel} {opTool.category}</span>
                            {op.previewPts.length > 1 && (() => {
                              let opLen = 0;
                              let minZ = Infinity;
                              for (let pi = 0; pi < op.previewPts.length; pi++) {
                                const pt = op.previewPts[pi];
                                if (pt.z < minZ) minZ = pt.z;
                                if (pi > 0) {
                                  const prev = op.previewPts[pi - 1];
                                  opLen += Math.hypot(pt.x - prev.x, pt.y - prev.y, pt.z - prev.z);
                                }
                              }
                              const feed = Math.max(100, op.overrides.feedMmMin ?? opTool.feedMmMin);
                              const opSec = (opLen / feed) * 60;
                              return (
                                <span style={{ fontSize: 10.5, color: "var(--hc-muted, #9ca3af)" }}>
                                  · {formatDuration(opSec)} · Z {minZ.toFixed(1)}mm
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                          <button
                            disabled={opIdx === 0}
                            onClick={() => moveOperation(op.id, -1)}
                            title="Run Earlier"
                            style={{ background: "transparent", border: "none", color: opIdx === 0 ? "#475569" : "var(--hc-text, #e2e8f0)", cursor: opIdx === 0 ? "default" : "pointer", fontSize: 15, fontWeight: 700, padding: "2px 4px" }}
                          >
                            ↑
                          </button>
                          <button
                            disabled={opIdx === operations.length - 1}
                            onClick={() => moveOperation(op.id, 1)}
                            title="Run Later"
                            style={{ background: "transparent", border: "none", color: opIdx === operations.length - 1 ? "#475569" : "var(--hc-text, #e2e8f0)", cursor: opIdx === operations.length - 1 ? "default" : "pointer", fontSize: 15, fontWeight: 700, padding: "2px 4px" }}
                          >
                            ↓
                          </button>
                          {operations.length > 1 && (
                            <button
                              onClick={() => setOperations((ops) => ops.filter((x) => x.id !== op.id))}
                              title="Delete Operation"
                              style={{ background: "transparent", border: "none", color: "var(--hc-muted, #cbd5e1)", cursor: "pointer", fontSize: 15, fontWeight: 700, padding: "2px 4px" }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                      {(op.cutTimeSec !== undefined || op.restFromOpId) && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--hc-muted, #cbd5e1)", paddingLeft: 28 }}>
                          {op.cutTimeSec !== undefined && (
                            <span>Cut {formatDuration(op.cutTimeSec)} · Rapid {formatDuration(op.rapidTimeSec ?? 0)}</span>
                          )}
                          {op.zMinMm !== undefined && (
                            <span style={{ color: "var(--hc-section-title, #93c5fd)", fontWeight: 600 }}>Z [{op.zMinMm.toFixed(1)}..{op.zMaxMm?.toFixed(1)}]</span>
                          )}
                          {op.restFromOpId && (
                            <span style={{ color: "#4ade80", fontWeight: 700 }}>Rest Machining</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Step 1: Endmill Type */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, background: "var(--hc-panel-bg, #1a1f28)", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--hc-section-title, #93c5fd)" }}>1. Endmill Type</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setShowAddTool(true)} style={UI.btnAccentSmall}>
                      + Add Endmill
                    </button>
                    <button onClick={() => updateActiveOp({ overrides: {} })} style={UI.btnSecondary}>
                      Reset Feeds
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {(
                    [
                      ["Flat", "Flat Endmill"],
                      ["O-Flute", "O-Flute (Alu/Acrylic)"],
                      ["Ballnose", "Ballnose (3D)"],
                      ["Tapered", "Tapered Ballnose"],
                      ["V-Bit", "V-Bit"],
                      ["Engraving", "Engraving"],
                      ["Surfacing", "Surfacing"],
                    ] as [ToolCategory, string][]
                  ).map(([cat, lbl]) => {
                    const active = activeTool.category === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => {
                          const firstInCat = tools.find((t) => t.category === cat);
                          if (firstInCat) updateActiveOp({ toolNumber: firstInCat.number, overrides: {} });
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          padding: "5px 7px",
                          borderRadius: 6,
                          border: active ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border-strong, #30363d)",
                          background: active ? "rgba(37,99,235,0.25)" : "var(--hc-subpanel-bg, #111419)",
                          color: "var(--hc-text, #f8fafc)",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <EndmillIcon category={cat} size={22} />
                        <span>{lbl}</span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "var(--hc-subpanel-bg, #111419)", border: "1px solid var(--hc-border, #262c36)", fontSize: 11, color: "var(--hc-muted, #cbd5e1)", lineHeight: 1.35 }}>
                  <EndmillIcon category={activeTool.category} size={28} />
                  <span>{TOOL_DESCRIPTIONS[activeTool.category]}</span>
                </div>

                {/* Step 2: Size (filtered by selected Endmill Type) */}
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--hc-section-title, #93c5fd)", marginTop: 4 }}>2. Size ({activeTool.category})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {tools
                    .filter((t) => t.category === activeTool.category)
                    .map((t) => {
                      const active = t.number === activeTool.number;
                      const isCustom = customTools.some((ct) => ct.number === t.number);
                      return (
                        <div
                          key={t.number}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: 6,
                            border: active ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border-strong, #30363d)",
                            background: active ? "var(--hc-accent, #2563eb)" : "var(--hc-subpanel-bg, #111419)",
                          }}
                        >
                          <button
                            onClick={() => updateActiveOp({ toolNumber: t.number, overrides: {} })}
                            title={t.name}
                            style={{
                              padding: "5px 9px",
                              border: "none",
                              background: "transparent",
                              color: "var(--hc-text, #fff)",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {t.sizeLabel}
                          </button>
                          {isCustom && (
                            <button
                              type="button"
                              title={`Delete custom endmill ${t.name}`}
                              onClick={() => {
                                setCustomTools((ct) => ct.filter((x) => x.number !== t.number));
                                if (activeOp.toolNumber === t.number) {
                                  updateActiveOp({ toolNumber: tools[0].number, overrides: {} });
                                }
                              }}
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "var(--hc-muted, #9ca3af)",
                                padding: "4px 6px 4px 0",
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>

                {/* Step 3: Operation (Grouped by Machining Order) */}
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--hc-section-title, #93c5fd)", marginTop: 4 }}>3. Operation (Machining Order)</div>
                {(
                  [
                    {
                      stage: "A. Roughing — Remove Bulk Stock First",
                      color: "#fbbf24",
                      items: [
                        ["ReliefRough3D", "3D Roughing", "Bulk 3D clear"],
                        ["Adaptive2D", "2D Adaptive", "Fast trochoidal"],
                        ["AdaptiveOffset2D", "2D Offset+Arcs", "Smooth G2/G3"],
                      ],
                    },
                    {
                      stage: "B. 3D Finishing — Smooth Surface",
                      color: "#4ade80",
                      items: [
                        ["ReliefFinish3D", "3D Parallel", "Raster lines"],
                        ["Spiral3D", "3D Spiral", "Center-out spiral"],
                        ["SteepShallow3D", "3D Steep/Shallow", "Top + steep walls"],
                      ],
                    },
                    {
                      stage: "C. Detail & Corners — Fine Cleanup",
                      color: "#f472b6",
                      items: [
                        ["Pencil3D", "3D Pencil Valley", "Inside creases"],
                        ["VCarve", "True V-Carve", "Sharp V-grooves"],
                        ["PhotoVCarve", "PhotoVCarve", "Photo / litho"],
                      ],
                    },
                    {
                      stage: "D. 2D Pocket & Final Cutout",
                      color: "var(--hc-accent-secondary, #38bdf8)",
                      items: [
                        ["Pocket2D", "2D Pocket", "Flat pocket"],
                        ["Contour2D", "2D Contour+Tabs", "Final cutout"],
                        ["Drilling", "Peck Drilling", "Drill holes"],
                      ],
                    },
                  ] as Array<{ stage: string; color: string; items: [StrategyKey, string, string][] }>
                ).map((grp) => (
                  <div key={grp.stage} style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: grp.color, letterSpacing: 0.2 }}>
                      {grp.stage}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                      {grp.items.map(([strat, lbl, sub]) => {
                        const active = activeOp.strategy === strat;
                        return (
                          <button
                            key={strat}
                            onClick={() =>
                              updateActiveOp({
                                strategy: strat,
                                name: `${activeOp.name.split(":")[0]}: ${lbl}`,
                                stockToLeaveMm: strat === "ReliefRough3D" ? 0.6 : 0,
                              })
                            }
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              padding: "5px 7px",
                              borderRadius: 6,
                              border: active ? `1px solid ${grp.color}` : "1px solid var(--hc-border-strong, #30363d)",
                              background: active ? "rgba(22,163,74,0.2)" : "var(--hc-subpanel-bg, #111419)",
                              color: "var(--hc-text, #f8fafc)",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <ToolpathIcon strategy={strat} size={24} />
                            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                              <span>{lbl}</span>
                              <span style={{ fontSize: 9, color: "var(--hc-muted, #9ca3af)", fontWeight: 400 }}>{sub}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "var(--hc-subpanel-bg, #111419)", border: "1px solid var(--hc-border, #262c36)", fontSize: 11, color: "var(--hc-muted, #cbd5e1)", lineHeight: 1.35 }}>
                  <ToolpathIcon strategy={activeOp.strategy} size={28} />
                  <span>{STRATEGY_DESCRIPTIONS[activeOp.strategy]}</span>
                </div>
              </div>

              {/* Customizable Cut Profiles (Collapsible) */}
              <div style={UI.panel}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => setShowCutProfiles((v) => !v)}
                    style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, ...UI.sectionTitle }}
                  >
                    <span>{showCutProfiles ? "▾" : "▸"} Cut Profiles ({cutProfiles.length})</span>
                  </button>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => {
                        setShowCutProfiles(true);
                        setEditingProfile({
                          id: `prof-${Date.now()}`,
                          label: `My ${job.material} Profile`,
                          feedMmMin: activeTool.feedMmMin,
                          stepdownMm: activeTool.stepdownMm,
                          rpm: activeTool.rpm,
                          stepoverPct: activeTool.stepoverPct,
                          stockToLeaveMm: activeOp.stockToLeaveMm,
                        });
                      }}
                      style={UI.btnAccentSmall}
                    >
                      + Save Current
                    </button>
                    {showCutProfiles && (
                      <button
                        onClick={() => {
                          setCutProfiles(DEFAULT_CUT_PROFILES);
                          setEditingProfile(null);
                        }}
                        title="Restore default profiles"
                        style={{ ...UI.btnSecondary, padding: "4px 6px" }}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {showCutProfiles && (
                  <>

                {editingProfile && (
                  <div style={{ ...UI.subPanel, display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                    <input
                      type="text"
                      value={editingProfile.label}
                      placeholder="Profile name..."
                      onChange={(e) => setEditingProfile({ ...editingProfile, label: e.target.value })}
                      style={UI.input}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                      <label style={UI.label}>
                        Feed (mm/min)
                        <NumericInput min={100} max={10000} decimals={0} value={editingProfile.feedMmMin} onChange={(v) => setEditingProfile({ ...editingProfile, feedMmMin: v })} style={{ ...UI.input, marginTop: 2, padding: "4px 6px" }} />
                      </label>
                      <label style={UI.label}>
                        Stepdown (mm)
                        <NumericInput min={0.1} max={15} decimals={2} value={editingProfile.stepdownMm} onChange={(v) => setEditingProfile({ ...editingProfile, stepdownMm: v })} style={{ ...UI.input, marginTop: 2, padding: "4px 6px" }} />
                      </label>
                      <label style={UI.label}>
                        Spindle (RPM)
                        <NumericInput min={5000} max={30000} decimals={0} value={editingProfile.rpm} onChange={(v) => setEditingProfile({ ...editingProfile, rpm: v })} style={{ ...UI.input, marginTop: 2, padding: "4px 6px" }} />
                      </label>
                      <label style={UI.label}>
                        Stepover (%)
                        <NumericInput min={1} max={90} decimals={0} value={editingProfile.stepoverPct} onChange={(v) => setEditingProfile({ ...editingProfile, stepoverPct: v })} style={{ ...UI.input, marginTop: 2, padding: "4px 6px" }} />
                      </label>
                    </div>
                    <label style={UI.label}>
                      Stock to Leave (mm)
                      <NumericInput min={0} max={5} decimals={2} value={editingProfile.stockToLeaveMm} onChange={(v) => setEditingProfile({ ...editingProfile, stockToLeaveMm: v })} style={{ ...UI.input, marginTop: 2, padding: "4px 6px" }} />
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                      <button
                        onClick={() => {
                          const cleanLabel = editingProfile.label.trim() || "Custom Profile";
                          const saved = { ...editingProfile, label: cleanLabel };
                          setCutProfiles((prev) =>
                            prev.some((x) => x.id === saved.id)
                              ? prev.map((x) => (x.id === saved.id ? saved : x))
                              : [...prev, saved]
                          );
                          updateActiveOp({
                            overrides: {
                              ...activeOp.overrides,
                              feedMmMin: saved.feedMmMin,
                              stepdownMm: saved.stepdownMm,
                              rpm: saved.rpm,
                              stepoverPct: saved.stepoverPct,
                            },
                            stockToLeaveMm: saved.stockToLeaveMm,
                          });
                          setEditingProfile(null);
                        }}
                        style={{ ...UI.btnAccentSmall, background: "#16a34a", padding: "6px" }}
                      >
                        Save &amp; Apply
                      </button>
                      <button onClick={() => setEditingProfile(null)} style={UI.btnSecondary}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {cutProfiles.map((pr) => (
                    <div
                      key={pr.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: "1px solid var(--hc-border-strong, #30363d)",
                        background: "var(--hc-subpanel-bg, #111419)",
                        gap: 3,
                      }}
                    >
                      <button
                        onClick={() =>
                          updateActiveOp({
                            overrides: {
                              ...activeOp.overrides,
                              feedMmMin: pr.feedMmMin,
                              stepdownMm: pr.stepdownMm,
                              rpm: pr.rpm,
                              stepoverPct: pr.stepoverPct,
                            },
                            stockToLeaveMm: pr.stockToLeaveMm,
                          })
                        }
                        title={`${pr.feedMmMin} mm/min · ${pr.stepdownMm}mm Z · ${pr.stepoverPct}% · ${pr.rpm} RPM`}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          color: "var(--hc-text, #e2e8f0)",
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                          padding: "2px 0",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {pr.label}
                      </button>
                      <button
                        onClick={() => setEditingProfile({ ...pr })}
                        title="Edit Profile"
                        style={{ background: "transparent", border: "none", color: "var(--hc-section-title, #93c5fd)", cursor: "pointer", fontSize: 10, padding: "0 2px" }}
                      >
                        ✎
                      </button>
                      {cutProfiles.length > 1 && (
                        <button
                          onClick={() => setCutProfiles((prev) => prev.filter((x) => x.id !== pr.id))}
                          title="Delete Profile"
                          style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: 10, padding: "0 2px" }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                </>
                )}
              </div>

              {/* Live Cut Telemetry & Safety Badge */}
              {(() => {
                const flutes = activeTool.category === "O-Flute" || activeTool.category === "V-Bit" || activeTool.category === "Engraving" ? 1 : 2;
                const chipLoad = activeTool.feedMmMin / Math.max(1, activeTool.rpm * flutes);
                const stepoverMm = activeTool.diameterMm * (activeTool.stepoverPct / 100);
                const mrr = (activeTool.feedMmMin * activeTool.stepdownMm * stepoverMm) / 1000;
                const r = activeTool.diameterMm * 0.5;
                const isBall = activeTool.category === "Ballnose" || activeTool.category === "Tapered";
                const scallop = isBall && stepoverMm < activeTool.diameterMm
                  ? r - Math.sqrt(Math.max(0, r * r - (stepoverMm * 0.5) ** 2))
                  : 0;
                const maxSafeChip = job.material === "Aluminum6061" ? 0.045 : job.material === "AcrylicHdpe" ? 0.07 : 0.12;
                const status =
                  chipLoad > maxSafeChip * 1.4 || activeTool.stepdownMm > activeTool.diameterMm * 1.1
                    ? { label: "Too Heavy", color: "#f87171", bg: "rgba(239,68,68,0.16)" }
                    : chipLoad > maxSafeChip || activeTool.stepdownMm > activeTool.diameterMm * 0.75
                    ? { label: "Aggressive", color: "#fbbf24", bg: "rgba(245,158,11,0.16)" }
                    : { label: "Safe Cut", color: "#4ade80", bg: "rgba(34,197,94,0.16)" };
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, background: "var(--hc-panel-bg, #1a1f28)", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8, fontSize: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, color: "var(--hc-section-title, #93c5fd)" }}>Cut Telemetry & Safety</span>
                      <span style={{ padding: "2px 8px", borderRadius: 999, background: status.bg, color: status.color, fontWeight: 700, fontSize: 10 }}>
                        {status.label}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, color: "var(--hc-muted, #cbd5e1)" }}>
                      <div><span style={{ color: "var(--hc-muted, #8b949e)" }}>Chip Load:</span><br /><strong>{chipLoad.toFixed(3)}</strong> mm/t</div>
                      <div><span style={{ color: "var(--hc-muted, #8b949e)" }}>MRR:</span><br /><strong>{mrr.toFixed(1)}</strong> cm³/m</div>
                      <div><span style={{ color: "var(--hc-muted, #8b949e)" }}>Scallop:</span><br /><strong>{isBall ? `${scallop.toFixed(3)} mm` : "Flat"}</strong></div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--hc-muted, #9ca3af)" }}>
                        <span>Stepover Overlap ({activeTool.stepoverPct}% = {stepoverMm.toFixed(2)} mm)</span>
                        <span>{activeTool.stepoverPct <= 12 ? "Fine Finish" : activeTool.stepoverPct <= 35 ? "Balanced" : "Fast Rough"}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 999, background: "var(--hc-subpanel-bg, #111419)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, (activeTool.stepoverPct / 60) * 100)}%`, height: "100%", background: activeTool.stepoverPct <= 15 ? "#22c55e" : activeTool.stepoverPct <= 35 ? "var(--hc-accent-secondary, #38bdf8)" : "#f59e0b" }} />
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: "flex", flexDirection: "column", gap: 11, padding: 12, background: "var(--hc-panel-bg, #1a1f28)", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8 }}>
                <SliderRow label="Stepover" hint="Sideways step between passes (8% = smooth 3D finish)." unit="%" min={4} max={60} step={1} value={activeTool.stepoverPct} onChange={(v) => updateActiveOp({ overrides: { ...activeOp.overrides, stepoverPct: v } })} />
                <SliderRow label="Stepdown" hint="Maximum depth cut per pass." unit="mm" min={0.2} max={8} step={0.1} value={activeTool.stepdownMm} onChange={(v) => updateActiveOp({ overrides: { ...activeOp.overrides, stepdownMm: v } })} />
                <SliderRow label="Feed Rate" hint="Horizontal cutting speed across the material." unit="mm/min" min={200} max={5000} step={50} value={activeTool.feedMmMin} onChange={(v) => updateActiveOp({ overrides: { ...activeOp.overrides, feedMmMin: v } })} />
                <SliderRow label="Spindle Speed" hint="Router/spindle rotation speed." unit="RPM" min={8000} max={24000} step={500} value={activeTool.rpm} onChange={(v) => updateActiveOp({ overrides: { ...activeOp.overrides, rpm: v } })} />
                <SliderRow label="Stock to Leave" hint="Material left behind for a later finishing pass." unit="mm" min={0} max={2} step={0.05} value={activeOp.stockToLeaveMm} onChange={(v) => updateActiveOp({ stockToLeaveMm: v })} />
              </div>

              {/* Rest Machining & Tabs/Ramp Entry */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: "var(--hc-panel-bg, #1a1f28)", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8, fontSize: 12 }}>
                <div>
                  <label style={{ color: "var(--hc-section-title, #93c5fd)", fontSize: 11, fontWeight: 600 }}>Rest Machining (Skip Air Cuts)</label>
                  <select
                    value={activeOp.restFromOpId ?? ""}
                    onChange={(e) => updateActiveOp({ restFromOpId: e.target.value || null })}
                    style={{ width: "100%", marginTop: 3, padding: 6, background: "var(--hc-subpanel-bg, #111419)", color: "#fff", border: "1px solid var(--hc-border-strong, #30363d)", borderRadius: 6, fontSize: 11 }}
                  >
                    <option value="">Disabled (Carve Full Region)</option>
                    {operations
                      .filter((o) => o.id !== activeOp.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          Rest from: {o.name}
                        </option>
                      ))}
                  </select>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(activeOp.rampEnabled)}
                    onChange={(e) => updateActiveOp({ rampEnabled: e.target.checked })}
                  />
                  Ramp Entry (Avoid straight vertical plunges)
                </label>

                {(activeOp.strategy === "Contour2D" || activeOp.strategy === "Pocket2D" || activeOp.strategy === "Adaptive2D") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--hc-border, #262c36)", paddingTop: 6 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--hc-section-title, #93c5fd)" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(activeOp.tabsEnabled)}
                        onChange={(e) => updateActiveOp({ tabsEnabled: e.target.checked })}
                      />
                      Holding Tabs (Keep cutout attached)
                    </label>
                    {activeOp.tabsEnabled && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
                        <label style={{ color: "var(--hc-muted, #9ca3af)" }}>
                          Tab Count
                          <NumericInput
                            min={1}
                            max={12}
                            decimals={0}
                            value={activeOp.tabCount ?? 4}
                            onChange={(v) => updateActiveOp({ tabCount: Math.round(v) })}
                            style={{ width: "100%", marginTop: 2, padding: 4, background: "var(--hc-subpanel-bg, #111419)", color: "#fff", border: "1px solid var(--hc-border-strong, #30363d)", borderRadius: 4 }}
                          />
                        </label>
                        <label style={{ color: "var(--hc-muted, #9ca3af)" }}>
                          Tab Height (mm)
                          <NumericInput
                            min={0.5}
                            max={10}
                            decimals={1}
                            value={activeOp.tabHeightMm ?? 2.5}
                            onChange={(v) => updateActiveOp({ tabHeightMm: v })}
                            style={{ width: "100%", marginTop: 2, padding: 4, background: "var(--hc-subpanel-bg, #111419)", color: "#fff", border: "1px solid var(--hc-border-strong, #30363d)", borderRadius: 4 }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {computing && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--hc-section-title, #93c5fd)" }}>
                    <span>{calcLabel || "Calculating..."}</span>
                    <span>{calcProgress}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 999, background: "var(--hc-panel-bg, #1e293b)", overflow: "hidden" }}>
                    <div style={{ width: `${calcProgress}%`, height: "100%", background: "#22c55e", transition: "width 150ms ease" }} />
                  </div>
                </div>
              )}

              {(() => {
                const limitWarnings = getMachineLimitWarnings(job, activeTool, machineProfile);
                if (limitWarnings.length === 0) return null;
                return (
                  <div style={{ padding: "8px 10px", borderRadius: 7, background: "rgba(239,68,68,0.14)", border: "1px solid #7f1d1d", fontSize: 11, color: "#fca5a5", display: "flex", flexDirection: "column", gap: 2 }}>
                    <strong style={{ color: "#f87171" }}>Machine Limit Warning ({machineProfile.name}):</strong>
                    {limitWarnings.map((w, i) => (
                      <div key={i}>• {w}</div>
                    ))}
                  </div>
                );
              })()}

              <button
                disabled={computing}
                onClick={handleComputeAndSimulateAll}
                style={{ ...UI.btnSuccess, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: computing ? "var(--hc-border-strong, #374151)" : "#16a34a" }}
              >
                <DesignIcon name="play" size={15} />
                <span>{computing ? "Calculating..." : "Calculate & Simulate"}</span>
              </button>
            </>
          )}

          {step === "simulate" && (
            <>
              <div style={UI.pageHeader}>
                <h3 style={UI.pageTitle}>CNC Simulation & Telemetry</h3>
              </div>
              {allTaggedPts.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--hc-muted, #8b949e)" }}>Click "Calculate & Simulate" in Toolpaths first.</p>
              ) : (
                <>
                  {(() => {
                    const segIdx = Math.min(
                      allTaggedPts.length - 1,
                      Math.floor((simProgress / 100) * (allTaggedPts.length - 1))
                    );
                    const cur = allTaggedPts[segIdx];
                    const gcodeLine = cur.rapid
                      ? `G0 X${cur.x.toFixed(2)} Y${cur.y.toFixed(2)} Z${cur.z.toFixed(2)}`
                      : `G1 X${cur.x.toFixed(2)} Y${cur.y.toFixed(2)} Z${cur.z.toFixed(2)} F${cur.feedMmMin}`;
                    const totalCollisions = simCollisions.length + clampCollisions.length;
                    const remainingSec = Math.max(0, totalTimeSec * (1 - simProgress / 100));
                    return (
                      <div style={{ padding: 11, background: "var(--hc-panel-bg, #1a1f28)", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8, fontSize: 13, lineHeight: 1.65 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <strong style={{ color: "var(--hc-section-title, #93c5fd)", fontSize: 13 }}>{cur.opName}</strong>
                          <span style={{ fontSize: 12, color: "var(--hc-muted, #cbd5e1)" }}>Ø{cur.toolDiamMm}mm · {cur.rpm} RPM</span>
                        </div>
                        <div style={{ padding: "5px 7px", borderRadius: 5, background: "var(--hc-bg, #0d1117)", border: "1px solid var(--hc-border, #262c36)", fontFamily: "monospace", fontSize: 12, color: cur.rapid ? "#fbbf24" : "var(--hc-accent-secondary, #38bdf8)", marginBottom: 5 }}>
                          {gcodeLine}
                        </div>
                        <div>
                          <strong>Segment:</strong> {segIdx + 1} / {allTaggedPts.length.toLocaleString()}
                        </div>
                        <div>
                          <strong>Remaining Time:</strong>{" "}
                          <span style={{ color: "var(--hc-section-title, #93c5fd)", fontWeight: 700 }}>{formatHoursMinutes(remainingSec)}</span>{" "}
                          <span style={{ fontSize: 12, color: "var(--hc-muted, #9ca3af)" }}>(Total {formatHoursMinutes(totalTimeSec)})</span>
                        </div>
                        <div>
                          <strong>Safety Check:</strong>{" "}
                          <span style={{ color: totalCollisions === 0 ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                            {totalCollisions === 0 ? "✓ 0 Collisions / Gouges" : `⚠ ${totalCollisions} Warning(s)`}
                          </span>
                        </div>
                        {clampCollisions.length > 0 && (
                          <div style={{ marginTop: 4, fontSize: 11, color: "#fca5a5" }}>
                            {clampCollisions.map((msg, i) => (
                              <div key={i}>• {msg}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Timeline + Jump to Operation */}
                  <div style={{ padding: 10, background: "var(--hc-panel-bg, #1a1f28)", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--hc-muted, #9ca3af)" }}>
                      <span>Timeline ({simProgress.toFixed(1)}%)</span>
                      <span>Speed: {simSpeed}×</span>
                    </div>
                    <input type="range" min={0} max={100} step={0.1} value={simProgress} onChange={(e) => setSimProgress(Number(e.target.value))} style={{ accentColor: "var(--hc-accent, #3b82f6)" }} />
                    {opStartMarkers.length > 1 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {opStartMarkers.map((m, idx) => (
                          <button
                            key={m.opId}
                            onClick={() => {
                              setSimPlaying(false);
                              setSimProgress(m.pct);
                            }}
                            style={{ padding: "4px 8px", fontSize: 12, borderRadius: 5, border: "1px solid var(--hc-border-strong, #30363d)", background: "var(--hc-subpanel-bg, #111419)", color: "var(--hc-section-title, #93c5fd)", fontWeight: 600, cursor: "pointer" }}
                          >
                            Jump Op {idx + 1}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr 1fr", gap: 4 }}>
                      <button onClick={() => { setSimPlaying(false); setSimProgress((p) => Math.max(0, p - 2)); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: 7, borderRadius: 6, border: "1px solid var(--hc-border-strong, #30363d)", background: "var(--hc-subpanel-bg, #111419)", color: "var(--hc-text, #e6edf3)", fontSize: 11, cursor: "pointer" }}>
                        <DesignIcon name="stepBack" size={13} />
                        <span>-2%</span>
                      </button>
                      <button onClick={() => setSimPlaying((p) => !p)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 7, borderRadius: 6, border: "none", background: "var(--hc-accent, #2563eb)", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                        <DesignIcon name={simPlaying ? "pause" : "play"} size={14} />
                        <span>{simPlaying ? "Pause" : "Play"}</span>
                      </button>
                      <button onClick={() => { setSimPlaying(false); setSimProgress((p) => Math.min(100, p + 2)); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: 7, borderRadius: 6, border: "1px solid var(--hc-border-strong, #30363d)", background: "var(--hc-subpanel-bg, #111419)", color: "var(--hc-text, #e6edf3)", fontSize: 11, cursor: "pointer" }}>
                        <span>+2%</span>
                        <DesignIcon name="stepForward" size={13} />
                      </button>
                      <button onClick={() => { setSimPlaying(false); setSimProgress(0); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: 7, borderRadius: 6, border: "1px solid var(--hc-border-strong, #30363d)", background: "var(--hc-subpanel-bg, #111419)", color: "var(--hc-muted, #9ca3af)", fontSize: 11, cursor: "pointer" }}>
                        <DesignIcon name="reset" size={13} />
                        <span>Reset</span>
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                      {[0.5, 1, 3, 10].map((sp) => (
                        <button
                          key={sp}
                          onClick={() => setSimSpeed(sp)}
                          style={{
                            padding: "4px",
                            borderRadius: 5,
                            border: simSpeed === sp ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border-strong, #30363d)",
                            background: simSpeed === sp ? "var(--hc-panel-bg, #1e293b)" : "var(--hc-subpanel-bg, #111419)",
                            color: "var(--hc-text, #e2e8f0)",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          {sp}×
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stock Inspection: Heatmap, Overlay & Cross-Section */}
                  <div style={{ padding: 10, background: "var(--hc-panel-bg, #1a1f28)", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: "var(--hc-section-title, #93c5fd)" }}>Stock Inspection</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                      <ToolTileButton
                        icon="materialView"
                        label="Material View"
                        active={simColorMode === "stock"}
                        onClick={() => setSimColorMode("stock")}
                      />
                      <ToolTileButton
                        icon="heatmap"
                        label="Stock Heatmap"
                        active={simColorMode === "heatmap"}
                        onClick={() => setSimColorMode("heatmap")}
                      />
                    </div>
                    {simColorMode === "heatmap" && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 8px", borderRadius: 5, background: "var(--hc-subpanel-bg, #111419)", fontWeight: 600 }}>
                        <span style={{ color: "var(--hc-accent-secondary, #60a5fa)" }}>■ Uncut Stock</span>
                        <span style={{ color: "#4ade80" }}>■ On Target</span>
                        <span style={{ color: "#f87171" }}>■ Gouge</span>
                      </div>
                    )}

                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11 }}>
                      <input type="checkbox" checked={simTargetOverlay} onChange={(e) => setSimTargetOverlay(e.target.checked)} />
                      Target Design Overlay (Blue)
                    </label>
                    {simTargetOverlay && (
                      <SliderRow label="Overlay Opacity" unit="%" min={10} max={90} step={5} value={Math.round(simTargetOpacity * 100)} onChange={(v) => setSimTargetOpacity(v / 100)} />
                    )}

                    <div style={{ borderTop: "1px solid var(--hc-border, #262c36)", paddingTop: 6, display: "flex", flexDirection: "column", gap: 5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                        <span style={{ color: "var(--hc-muted, #9ca3af)" }}>Cross-Section Slice</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {(
                            [
                              ["none", "Off", "sliceOff"],
                              ["x", "X", "sliceX"],
                              ["y", "Y", "sliceY"],
                            ] as const
                          ).map(([ax, lbl, ic]) => (
                            <button
                              key={ax}
                              onClick={() => setSimSliceAxis(ax)}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", fontSize: 11, borderRadius: 5, border: simSliceAxis === ax ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border-strong, #30363d)", background: simSliceAxis === ax ? "var(--hc-accent, #2563eb)" : "var(--hc-subpanel-bg, #111419)", color: "var(--hc-text, #fff)", fontWeight: 600, cursor: "pointer" }}
                            >
                              <DesignIcon name={ic} size={13} />
                              <span>{lbl}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      {simSliceAxis !== "none" && (
                        <SliderRow label={`Slice ${simSliceAxis.toUpperCase()} Position`} unit="%" min={5} max={95} step={1} value={simSlicePct} onChange={setSimSlicePct} />
                      )}
                    </div>
                  </div>

                  {/* Clamps & Toolpath Visibility */}
                  <div style={{ padding: 10, background: "var(--hc-panel-bg, #1a1f28)", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: "var(--hc-section-title, #93c5fd)" }}>Display & Clamps</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11 }}>
                      <input type="checkbox" checked={clampsEnabled} onChange={(e) => setClampsEnabled(e.target.checked)} />
                      Show Hold-Down Clamp Zones
                    </label>
                    {clampsEnabled && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
                        <select value={clampPreset} onChange={(e) => setClampPreset(e.target.value as "corners" | "edges")} style={{ padding: 4, background: "var(--hc-subpanel-bg, #111419)", color: "#fff", border: "1px solid var(--hc-border-strong, #30363d)", borderRadius: 4 }}>
                          <option value="corners">4 Corner Clamps</option>
                          <option value="edges">Front/Back Edges</option>
                        </select>
                        <NumericInput min={2} max={30} decimals={1} value={clampHeightMm} onChange={setClampHeightMm} title="Clamp Height (mm)" style={{ padding: 4, background: "var(--hc-subpanel-bg, #111419)", color: "#fff", border: "1px solid var(--hc-border-strong, #30363d)", borderRadius: 4 }} />
                      </div>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11 }}>
                      <input type="checkbox" checked={showCutLines} onChange={(e) => setShowCutLines(e.target.checked)} />
                      Show Cut Toolpaths (Blue)
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11 }}>
                      <input type="checkbox" checked={showRapidLines} onChange={(e) => setShowRapidLines(e.target.checked)} />
                      Show Rapid Moves (Orange)
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11 }}>
                      <input type="checkbox" checked={showSimTool} onChange={(e) => setShowSimTool(e.target.checked)} />
                      Show Animated Spindle Tool
                    </label>
                  </div>
                </>
              )}
              <button onClick={() => setStep("export")} style={UI.btnPrimary}>
                Next: Export G-Code →
              </button>
            </>
          )}

          {step === "export" && (
            <>
              <div style={UI.pageHeader}>
                <h3 style={UI.pageTitle}>Post-Processor & G-Code</h3>
                <span style={{ fontSize: 10, color: "#4ade80", fontWeight: 600 }}>Auto-Saved</span>
              </div>

              <div style={{ ...UI.panel, fontSize: 12 }}>
                <div>
                  <label style={{ color: "var(--hc-muted, #9ca3af)", fontSize: 11 }}>Machine Firmware / Post-Processor</label>
                  <select
                    value={dialect}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDialect(val);
                      const cp = customPosts.find((p) => p.id === val);
                      if (cp) setGcodeExt(cp.fileExt);
                    }}
                    style={{ ...UI.input, marginTop: 3 }}
                  >
                    <optgroup label="Built-In Post-Processors">
                      <option value="Grbl">GRBL (Shapeoko / 3018 / X-Carve)</option>
                      <option value="Marlin">Marlin (MPCNC / LowRider)</option>
                      <option value="LinuxCnc">LinuxCNC</option>
                      <option value="Mach34">Mach3 / Mach4</option>
                      <option value="Masso">Masso G3</option>
                      <option value="FanucIso">Generic Fanuc / ISO</option>
                    </optgroup>
                    {customPosts.length > 0 && (
                      <optgroup label="Custom Post-Processors">
                        {customPosts.map((cp) => (
                          <option key={cp.id} value={cp.id}>{cp.name} (.{cp.fileExt})</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ color: "var(--hc-muted, #9ca3af)", fontSize: 11 }}>File Extension</label>
                    <select value={gcodeExt} onChange={(e) => setGcodeExt(e.target.value)} style={{ width: "100%", marginTop: 3, padding: 7, background: "var(--hc-subpanel-bg, #111419)", color: "#fff", border: "1px solid var(--hc-border-strong, #30363d)", borderRadius: 6 }}>
                      <option value="gcode">.gcode</option>
                      <option value="nc">.nc</option>
                      <option value="ngc">.ngc (LinuxCNC)</option>
                      <option value="tap">.tap (Mach3)</option>
                      <option value="cnc">.cnc</option>
                      <option value="txt">.txt</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: "var(--hc-muted, #9ca3af)", fontSize: 11 }}>Safe Retract Z (mm)</label>
                    <NumericInput
                      min={1}
                      max={100}
                      decimals={1}
                      value={exportSafeZ}
                      onChange={setExportSafeZ}
                      style={{ width: "100%", boxSizing: "border-box", marginTop: 3, padding: 7, background: "var(--hc-subpanel-bg, #111419)", color: "#fff", border: "1px solid var(--hc-border-strong, #30363d)", borderRadius: 6 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ color: "var(--hc-muted, #9ca3af)", fontSize: 11 }}>Program / File Name</label>
                  <input
                    type="text"
                    value={exportProgramName}
                    onChange={(e) => setExportProgramName(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", marginTop: 3, padding: 7, background: "var(--hc-subpanel-bg, #111419)", color: "#fff", border: "1px solid var(--hc-border-strong, #30363d)", borderRadius: 6 }}
                  />
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", paddingTop: 2 }}>
                  <input type="checkbox" checked={exportEmitM6} onChange={(e) => setExportEmitM6(e.target.checked)} />
                  Emit M6 Tool Change Commands
                </label>
              </div>

              <div style={{ ...UI.subPanel, display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--hc-muted, #cbd5e1)" }}>
                <span><strong>{gcodeLineCount.toLocaleString()}</strong> lines · <strong>{gcodeSizeLabel}</strong></span>
                <span><strong>{operations.filter((o) => o.enabled).length}</strong> op(s) · <strong>{formatHoursMinutes(totalTimeSec)}</strong></span>
              </div>

              <textarea
                readOnly
                value={gcodePreviewText}
                style={{ flex: 1, minHeight: 160, background: "var(--hc-bg, #0b0e13)", color: "var(--hc-section-title, #93c5fd)", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8, padding: 10, fontFamily: "monospace", fontSize: 12 }}
              />
              {lastSavedMsg && (
                <div style={{ fontSize: 11, color: "#4ade80", wordBreak: "break-all" }}>{lastSavedMsg}</div>
              )}
              <button disabled={!gcodeText} onClick={handleDownloadGcode} style={{ ...UI.btnSuccess, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 0, background: gcodeText ? "#16a34a" : "var(--hc-border-strong, #374151)" }}>
                <DesignIcon name="navExport" size={16} />
                <span>Save Combined G-Code (.{gcodeExt})...</span>
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <ToolTileButton
                  icon="splitTool"
                  label={`Split by Tool (.${gcodeExt})`}
                  disabled={!gcodeText}
                  onClick={handleSplitExportByTool}
                />
                <ToolTileButton
                  icon="setupSheet"
                  label="Setup Sheet (.html)"
                  onClick={handleExportSetupSheet}
                />
              </div>
            </>
          )}

          {step === "settings" && (
            <>
              <div style={UI.pageHeader}>
                <h3 style={{ ...UI.pageTitle, display: "flex", alignItems: "center", gap: 8 }}>
                  <DesignIcon name="settings" size={18} />
                  <span>Settings</span>
                </h3>
              </div>

              {/* Category Sub-Tabs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, background: "var(--hc-subpanel-bg, #0d1015)", padding: 4, borderRadius: 8, border: "1px solid var(--hc-border, #262c36)" }}>
                {(
                  [
                    ["themes", "Themes"],
                    ["machine", "Machine"],
                    ["posts", "Posts"],
                    ["app", "General"],
                  ] as const
                ).map(([tid, lbl]) => (
                  <button
                    key={tid}
                    type="button"
                    onClick={() => setSettingsTab(tid)}
                    style={{
                      padding: "6px 4px",
                      borderRadius: 6,
                      border: "none",
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      background: settingsTab === tid ? "var(--hc-accent, #2563eb)" : "transparent",
                      color: settingsTab === tid ? "#fff" : "var(--hc-muted, #9ca3af)",
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              {/* Theme Picker */}
              {settingsTab === "themes" && (
              <div style={UI.panel}>
                <span style={UI.sectionTitle}>Color Theme</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(Object.values(THEMES) as typeof THEMES[ThemeId][]).map((t) => {
                    const selected = themeId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setThemeId(t.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "9px 10px",
                          borderRadius: 8,
                          border: selected ? `2px solid ${t.accentSecondary}` : "1px solid var(--hc-border-strong, #30363d)",
                          background: selected ? t.panelBg : "var(--hc-subpanel-bg, #111419)",
                          color: selected ? t.text : "var(--hc-text, #f1f5f9)",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</span>
                          <span style={{ fontSize: 11, color: selected ? t.textMuted : "var(--hc-muted, #9ca3af)" }}>{t.subtitle}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                          {t.swatches.map((hex, i) => (
                            <span
                              key={i}
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 4,
                                background: hex,
                                border: "1px solid rgba(255,255,255,0.22)",
                              }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              )}

              {/* Custom Post-Processors */}
              {settingsTab === "posts" && (
              <div style={UI.panel}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={UI.sectionTitle}>Custom Post-Processors ({customPosts.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      const id = `custom-${Date.now()}`;
                      const next: CustomPostProcessor = {
                        ...DEFAULT_CUSTOM_POST_TEMPLATE,
                        id,
                        name: `Custom Post ${customPosts.length + 1}`,
                      };
                      setCustomPosts((ps) => [...ps, next]);
                      setEditingPostId(id);
                    }}
                    style={UI.btnAccentSmall}
                  >
                    + New Post
                  </button>
                </div>

                {customPosts.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--hc-muted, #9ca3af)" }}>
                    Create custom G-code headers, footers, comment styles, and line numbering for your CNC controller.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {customPosts.map((cp) => (
                      <div
                        key={cp.id}
                        onClick={() => setEditingPostId(cp.id === editingPostId ? "" : cp.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 8px",
                          borderRadius: 6,
                          cursor: "pointer",
                          border: editingPostId === cp.id ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border, #262c36)",
                          background: "var(--hc-subpanel-bg, #111419)",
                          fontSize: 12,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{cp.name} <span style={{ fontSize: 10, color: "var(--hc-muted, #9ca3af)" }}>({cp.baseDialect} · .{cp.fileExt})</span></span>
                        <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              setDialect(cp.id);
                              setGcodeExt(cp.fileExt);
                              setLastSavedMsg(`Active post: ${cp.name}`);
                            }}
                            style={{ ...UI.btnSecondary, padding: "2px 6px", fontSize: 10 }}
                          >
                            {dialect === cp.id ? "Active" : "Use"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomPosts((ps) => ps.filter((x) => x.id !== cp.id));
                              if (editingPostId === cp.id) setEditingPostId("");
                              if (dialect === cp.id) setDialect("Grbl");
                            }}
                            style={{ background: "transparent", border: "none", color: "var(--hc-muted, #9ca3af)", cursor: "pointer" }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(() => {
                  const ep = customPosts.find((p) => p.id === editingPostId);
                  if (!ep) return null;
                  const patchPost = (patch: Partial<CustomPostProcessor>) =>
                    setCustomPosts((ps) => ps.map((x) => (x.id === ep.id ? { ...x, ...patch } : x)));
                  return (
                    <div style={{ ...UI.subPanel, display: "flex", flexDirection: "column", gap: 7, padding: 9 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--hc-section-title, #93c5fd)" }}>
                        Edit Post: {ep.name}
                      </div>
                      <input
                        type="text"
                        value={ep.name}
                        onChange={(e) => patchPost({ name: e.target.value })}
                        placeholder="Post-Processor Name"
                        style={UI.input}
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <div>
                          <label style={UI.label}>Motion Base</label>
                          <select
                            value={ep.baseDialect}
                            onChange={(e) => patchPost({ baseDialect: e.target.value as CustomPostProcessor["baseDialect"] })}
                            style={{ ...UI.input, marginTop: 2 }}
                          >
                            <option value="Grbl">GRBL</option>
                            <option value="Marlin">Marlin</option>
                            <option value="LinuxCnc">LinuxCNC</option>
                            <option value="Mach34">Mach3 / Mach4</option>
                            <option value="Masso">Masso G3</option>
                            <option value="FanucIso">Fanuc / ISO</option>
                          </select>
                        </div>
                        <div>
                          <label style={UI.label}>Extension</label>
                          <input
                            type="text"
                            value={ep.fileExt}
                            onChange={(e) => patchPost({ fileExt: e.target.value.replace(/^\./, "") || "nc" })}
                            style={{ ...UI.input, marginTop: 2 }}
                          />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <div>
                          <label style={UI.label}>Comments</label>
                          <select
                            value={ep.commentStyle}
                            onChange={(e) => patchPost({ commentStyle: e.target.value as "paren" | "semicolon" })}
                            style={{ ...UI.input, marginTop: 2 }}
                          >
                            <option value="paren">( Parentheses )</option>
                            <option value="semicolon">; Semicolon</option>
                          </select>
                        </div>
                        <div>
                          <label style={UI.label}>Decimals</label>
                          <select
                            value={ep.decimals}
                            onChange={(e) => patchPost({ decimals: Number(e.target.value) as 2 | 3 | 4 })}
                            style={{ ...UI.input, marginTop: 2 }}
                          >
                            <option value={2}>2 (0.01)</option>
                            <option value={3}>3 (0.001)</option>
                            <option value={4}>4 (0.0001)</option>
                          </select>
                        </div>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={ep.emitLineNumbers}
                          onChange={(e) => patchPost({ emitLineNumbers: e.target.checked })}
                        />
                        Emit N-Line Numbers (N10, N20...)
                      </label>
                      <div>
                        <label style={UI.label}>Header G-Code (tokens: {`{PROGRAM} {TOOL} {RPM} {SAFE_Z} {UNITS}`})</label>
                        <textarea
                          rows={4}
                          value={ep.headerLines}
                          onChange={(e) => patchPost({ headerLines: e.target.value })}
                          style={{ ...UI.input, marginTop: 2, fontFamily: "monospace", fontSize: 11 }}
                        />
                      </div>
                      <div>
                        <label style={UI.label}>Footer G-Code</label>
                        <textarea
                          rows={3}
                          value={ep.footerLines}
                          onChange={(e) => patchPost({ footerLines: e.target.value })}
                          style={{ ...UI.input, marginTop: 2, fontFamily: "monospace", fontSize: 11 }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
              )}

              {/* Machine Setup & Limits (Independent & Saved) */}
              {settingsTab === "machine" && (
              <div style={UI.panel}>
                <span style={UI.sectionTitle}>Machine Setup &amp; Limits</span>
                <div style={{ fontSize: 11, color: "var(--hc-muted, #9ca3af)" }}>
                  Configure your CNC router once — saved independently from Trim Bed or Relief edits.
                </div>

                {/* Quick Machine Presets */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {MACHINE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        const next = { ...machineProfile, ...preset.profile };
                        setMachineProfile(next);
                        setMachineBed({
                          widthMm: next.bedXMm,
                          depthMm: next.bedYMm,
                          thicknessMm: next.defaultThicknessMm,
                        });
                        setDialect(next.controllerDialect);
                        setLastSavedMsg(`Loaded preset: ${preset.label}`);
                      }}
                      style={{ ...UI.btnSecondary, fontSize: 11, padding: "5px 6px" }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div>
                  <label style={UI.label}>Machine Name</label>
                  <input
                    type="text"
                    value={machineProfile.name}
                    onChange={(e) => setMachineProfile((mp) => ({ ...mp, name: e.target.value }))}
                    style={{ ...UI.input, marginTop: 3 }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <div>
                    <label style={UI.label}>Bed Width X (mm)</label>
                    <NumericInput
                      min={20}
                      max={3000}
                      decimals={1}
                      value={machineProfile.bedXMm}
                      onChange={(v) => {
                        setMachineProfile((mp) => ({ ...mp, bedXMm: v }));
                        setMachineBed((b) => ({ ...b, widthMm: v }));
                      }}
                      style={{ ...UI.input, marginTop: 2 }}
                    />
                  </div>
                  <div>
                    <label style={UI.label}>Bed Depth Y (mm)</label>
                    <NumericInput
                      min={20}
                      max={3000}
                      decimals={1}
                      value={machineProfile.bedYMm}
                      onChange={(v) => {
                        setMachineProfile((mp) => ({ ...mp, bedYMm: v }));
                        setMachineBed((b) => ({ ...b, depthMm: v }));
                      }}
                      style={{ ...UI.input, marginTop: 2 }}
                    />
                  </div>
                  <div>
                    <label style={UI.label}>Max Z Travel (mm)</label>
                    <NumericInput
                      min={10}
                      max={500}
                      decimals={1}
                      value={machineProfile.maxZTravelMm}
                      onChange={(v) => setMachineProfile((mp) => ({ ...mp, maxZTravelMm: v }))}
                      style={{ ...UI.input, marginTop: 2 }}
                    />
                  </div>
                  <div>
                    <label style={UI.label}>Default Stock Z (mm)</label>
                    <NumericInput
                      min={1}
                      max={500}
                      decimals={1}
                      value={machineProfile.defaultThicknessMm}
                      onChange={(v) => {
                        setMachineProfile((mp) => ({ ...mp, defaultThicknessMm: v }));
                        setMachineBed((b) => ({ ...b, thicknessMm: v }));
                      }}
                      style={{ ...UI.input, marginTop: 2 }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <div>
                    <label style={UI.label}>Min RPM</label>
                    <NumericInput
                      min={0}
                      max={20000}
                      decimals={0}
                      value={machineProfile.minRpm}
                      onChange={(v) => setMachineProfile((mp) => ({ ...mp, minRpm: Math.round(v) }))}
                      style={{ ...UI.input, marginTop: 2 }}
                    />
                  </div>
                  <div>
                    <label style={UI.label}>Max RPM</label>
                    <NumericInput
                      min={1000}
                      max={60000}
                      decimals={0}
                      value={machineProfile.maxRpm}
                      onChange={(v) => setMachineProfile((mp) => ({ ...mp, maxRpm: Math.round(v) }))}
                      style={{ ...UI.input, marginTop: 2 }}
                    />
                  </div>
                  <div>
                    <label style={UI.label}>Dwell (sec)</label>
                    <NumericInput
                      min={0}
                      max={15}
                      decimals={1}
                      value={machineProfile.spindleDwellSec}
                      onChange={(v) => setMachineProfile((mp) => ({ ...mp, spindleDwellSec: v }))}
                      style={{ ...UI.input, marginTop: 2 }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <div>
                    <label style={UI.label}>Max Rapid</label>
                    <NumericInput
                      min={200}
                      max={25000}
                      decimals={0}
                      value={machineProfile.maxRapidMmMin}
                      onChange={(v) => setMachineProfile((mp) => ({ ...mp, maxRapidMmMin: Math.round(v) }))}
                      style={{ ...UI.input, marginTop: 2 }}
                    />
                  </div>
                  <div>
                    <label style={UI.label}>Max Feed</label>
                    <NumericInput
                      min={100}
                      max={20000}
                      decimals={0}
                      value={machineProfile.maxFeedMmMin}
                      onChange={(v) => setMachineProfile((mp) => ({ ...mp, maxFeedMmMin: Math.round(v) }))}
                      style={{ ...UI.input, marginTop: 2 }}
                    />
                  </div>
                  <div>
                    <label style={UI.label}>Max Plunge</label>
                    <NumericInput
                      min={50}
                      max={10000}
                      decimals={0}
                      value={machineProfile.maxPlungeMmMin}
                      onChange={(v) => setMachineProfile((mp) => ({ ...mp, maxPlungeMmMin: Math.round(v) }))}
                      style={{ ...UI.input, marginTop: 2 }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "start" }}>
                  <div>
                    <label style={UI.label}>XY Datum Position</label>
                    <div style={{ marginTop: 4, padding: 6, borderRadius: 6, border: "1px solid var(--hc-border, #262c36)", background: "var(--hc-subpanel-bg, #111419)" }}>
                      <XyDatumSelector
                        value={machineProfile.defaultXyOrigin}
                        onChange={(mode) => setMachineProfile((mp) => ({ ...mp, defaultXyOrigin: mode }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={UI.label}>Z-Zero Position</label>
                    <div style={{ marginTop: 4, padding: 6, borderRadius: 6, border: "1px solid var(--hc-border, #262c36)", background: "var(--hc-subpanel-bg, #111419)" }}>
                      <ZZeroSelector
                        value={machineProfile.defaultZZero}
                        onChange={(mode) => setMachineProfile((mp) => ({ ...mp, defaultZZero: mode }))}
                      />
                    </div>
                  </div>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={machineProfile.hasHoming}
                    onChange={(e) => setMachineProfile((mp) => ({ ...mp, hasHoming: e.target.checked }))}
                  />
                  Machine Has Homing Limit Switches
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={machineProfile.emitCoolantM8}
                    onChange={(e) => setMachineProfile((mp) => ({ ...mp, emitCoolantM8: e.target.checked }))}
                  />
                  Auto Dust Collector / Coolant (M8 / M9)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(machineProfile.autoClampLimits)}
                    onChange={(e) => setMachineProfile((mp) => ({ ...mp, autoClampLimits: e.target.checked }))}
                  />
                  Auto-Clamp Exported RPM &amp; Feedrate to Machine Limits
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={machineProfile.parkAtEnd}
                    onChange={(e) => setMachineProfile((mp) => ({ ...mp, parkAtEnd: e.target.checked }))}
                  />
                  Park Spindle at End of Job
                </label>
                {machineProfile.parkAtEnd && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <div>
                      <label style={UI.label}>Park X (mm)</label>
                      <NumericInput
                        min={-3000}
                        max={3000}
                        decimals={1}
                        value={machineProfile.parkXMm}
                        onChange={(v) => setMachineProfile((mp) => ({ ...mp, parkXMm: v }))}
                        style={{ ...UI.input, marginTop: 2 }}
                      />
                    </div>
                    <div>
                      <label style={UI.label}>Park Y (mm)</label>
                      <NumericInput
                        min={-3000}
                        max={3000}
                        decimals={1}
                        value={machineProfile.parkYMm}
                        onChange={(v) => setMachineProfile((mp) => ({ ...mp, parkYMm: v }))}
                        style={{ ...UI.input, marginTop: 2 }}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setJob((j) => ({
                      ...j,
                      widthMm: machineProfile.bedXMm,
                      depthMm: machineProfile.bedYMm,
                      thicknessMm: machineProfile.defaultThicknessMm,
                      xyOrigin: machineProfile.defaultXyOrigin,
                      zZero: machineProfile.defaultZZero,
                    }));
                    setOriginalBedSize(null);
                    setLastSavedMsg(`Applied ${machineProfile.name} (${machineProfile.bedXMm}×${machineProfile.bedYMm}×${machineProfile.defaultThicknessMm} mm)`);
                  }}
                  style={UI.btnAccentSmall}
                >
                  Apply Machine Settings to Current Job
                </button>
              </div>
              )}

              {/* Viewport & Navigation */}
              {settingsTab === "app" && (
              <>
              <div style={UI.panel}>
                <span style={UI.sectionTitle}>3D Viewport &amp; Navigation</span>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={showAxesAndGrid} onChange={(e) => setShowAxesAndGrid(e.target.checked)} />
                  Show XYZ Axes &amp; Floor Grid
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={invertZoom} onChange={(e) => setInvertZoom(e.target.checked)} />
                  Invert Mouse Wheel Zoom Direction
                </label>
                <div>
                  <label style={UI.label}>UI Control Scale</label>
                  <select
                    value={uiScale}
                    onChange={(e) => setUiScale(e.target.value as "compact" | "standard" | "large")}
                    style={{ ...UI.input, marginTop: 4 }}
                  >
                    <option value="compact">Compact (92%)</option>
                    <option value="standard">Standard (100%)</option>
                    <option value="large">Large / Touch (108%)</option>
                  </select>
                </div>
                <div>
                  <label style={UI.label}>Default Shading Mode</label>
                  <select
                    value={shading}
                    onChange={(e) => setShading(e.target.value as ShadingMode)}
                    style={{ ...UI.input, marginTop: 4 }}
                  >
                    <option value="material">Material Preview</option>
                    <option value="clay">Clay</option>
                    <option value="heatmap">Height Heatmap</option>
                    <option value="wireframe">Wireframe</option>
                  </select>
                </div>
                <div>
                  <label style={UI.label}>Default Stock Preview Material</label>
                  <select
                    value={previewMatId}
                    onChange={(e) => setPreviewMatId(e.target.value)}
                    style={{ ...UI.input, marginTop: 4 }}
                  >
                    {PREVIEW_MATERIALS.map((pm) => (
                      <option key={pm.id} value={pm.id}>{pm.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Workflow & Performance */}
              <div style={UI.panel}>
                <span style={UI.sectionTitle}>Workflow &amp; Performance</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <div>
                    <label style={UI.label}>Startup Page</label>
                    <select
                      value={defaultStartupStep}
                      onChange={(e) => setDefaultStartupStep(e.target.value as "layout" | "relief")}
                      style={{ ...UI.input, marginTop: 3 }}
                    >
                      <option value="layout">Design</option>
                      <option value="relief">Relief</option>
                    </select>
                  </div>
                  <div>
                    <label style={UI.label}>Sim Resolution</label>
                    <select
                      value={simResolution}
                      onChange={(e) => setSimResolution(Number(e.target.value) as 180 | 240 | 360)}
                      style={{ ...UI.input, marginTop: 3 }}
                    >
                      <option value={180}>Fast (180px)</option>
                      <option value={240}>Balanced (240px)</option>
                      <option value={360}>Ultra (360px)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={UI.label}>Snap Grid Step (mm)</label>
                  <select
                    value={snapStepMm}
                    onChange={(e) => setSnapStepMm(Number(e.target.value))}
                    style={{ ...UI.input, marginTop: 3 }}
                  >
                    <option value={1}>1 mm</option>
                    <option value={2}>2 mm</option>
                    <option value={5}>5 mm</option>
                    <option value={10}>10 mm</option>
                  </select>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={showSetupOnStartup} onChange={(e) => setShowSetupOnStartup(e.target.checked)} />
                  Show Job Setup Dialog on Startup
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
                  Snap to 5mm Grid in Design Canvas
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={exportEmitM6} onChange={(e) => setExportEmitM6(e.target.checked)} />
                  Auto-Emit M6 Tool Changes
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={!skipClosePrompt} onChange={(e) => setSkipClosePrompt(!e.target.checked)} />
                  Ask to Save Project Before Closing App
                </label>
                <SliderRow
                  label="Default Safe Retract Z"
                  unit="mm"
                  min={1}
                  max={50}
                  step={0.5}
                  value={exportSafeZ}
                  onChange={setExportSafeZ}
                />
              </div>

              <div style={UI.panel}>
                <span style={UI.sectionTitle}>Backup, Restore &amp; Reset</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const bundle = {
                        version: 1,
                        themeId,
                        machineProfile,
                        customPosts,
                        customTools,
                        cutProfiles,
                        customOpTemplates,
                      };
                      const bytes = Array.from(new TextEncoder().encode(JSON.stringify(bundle, null, 2)));
                      try {
                        const saved = await invoke<string | null>("save_file_dialog_ipc", {
                          defaultName: "HybridCAM_Setup_Backup.json",
                          filterName: "JSON Setup (*.json)",
                          extension: "json",
                          bytes,
                        });
                        if (saved) setLastSavedMsg(`Exported setup: ${saved}`);
                      } catch {
                        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "HybridCAM_Setup_Backup.json";
                        a.click();
                        URL.revokeObjectURL(url);
                      }
                    }}
                    style={UI.btnSecondary}
                  >
                    Export Setup (.json)
                  </button>
                  <label style={{ ...UI.btnSecondary, textAlign: "center" }}>
                    Import Setup (.json)
                    <input
                      type="file"
                      accept=".json"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        e.target.value = "";
                        try {
                          const parsed = JSON.parse(await f.text());
                          if (parsed.themeId && THEMES[parsed.themeId as ThemeId]) setThemeId(parsed.themeId);
                          if (parsed.machineProfile) {
                            setMachineProfile(parsed.machineProfile);
                            setMachineBed({
                              widthMm: parsed.machineProfile.bedXMm,
                              depthMm: parsed.machineProfile.bedYMm,
                              thicknessMm: parsed.machineProfile.defaultThicknessMm,
                            });
                          }
                          if (Array.isArray(parsed.customPosts)) setCustomPosts(parsed.customPosts);
                          if (Array.isArray(parsed.customTools)) setCustomTools(parsed.customTools);
                          if (Array.isArray(parsed.cutProfiles)) setCutProfiles(parsed.cutProfiles);
                          if (Array.isArray(parsed.customOpTemplates)) setCustomOpTemplates(parsed.customOpTemplates);
                          setLastSavedMsg(`Imported setup from ${f.name}`);
                        } catch {
                          setLastSavedMsg("Invalid setup .json file");
                        }
                      }}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setThemeId("midnight");
                    setShading("material");
                    setPreviewMatId("walnut");
                    setSnapToGrid(true);
                    setSnapStepMm(5);
                    setExportSafeZ(5);
                    setShowAxesAndGrid(true);
                    setInvertZoom(false);
                    setUiScale("standard");
                    setDefaultStartupStep("relief");
                    setShowSetupOnStartup(true);
                    setSimResolution(240);
                    setSkipClosePrompt(false);
                    setLastSavedMsg("Settings reset to defaults");
                  }}
                  style={{ ...UI.btnSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <DesignIcon name="reset" size={14} />
                  <span>Reset Appearance &amp; Defaults</span>
                </button>
              </div>
              </>
              )}
            </>
          )}

          {step === "run" && (
            <CncControlPanel
              gcodeText={gcodeText}
              defaultRpm={activeTool.rpm}
              onStatusMsg={setLastSavedMsg}
              onLiveWpos={(wpos, connected) => {
                const ctx = sceneObjectsRef.current;
                if (!ctx) return;
                if (connected) {
                  const [ox, oy] = getXyOriginOffsetMm(job);
                  const topZ = job.zZero === "top" ? 0 : job.thicknessMm;
                  ctx.toolCone.visible = true;
                  ctx.toolCone.position.set(wpos[0] - ox, wpos[1] - oy, topZ + wpos[2] + 9);
                  needsRenderRef.current = true;
                } else if (ctx.toolCone.visible) {
                  ctx.toolCone.visible = false;
                  needsRenderRef.current = true;
                }
              }}
            />
          )}
        </aside>

        <div
          className="sidebar-resizer"
          onPointerDown={startSidebarResize}
          onDoubleClick={() => setSidebarWidth(390)}
          title="Drag to resize sidebar (double-click to reset)"
          style={{
            width: 6,
            cursor: "col-resize",
            background: "#1c222d",
            borderLeft: "1px solid var(--hc-border, #242a34)",
            borderRight: "1px solid var(--hc-border, #242a34)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
          }}
        >
          <div style={{ width: 2, height: 36, borderRadius: 999, background: "#475569" }} />
        </div>

        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
          {step === "layout" && designMode === "picture" && (
            <PictureLayoutView
              job={job}
              layers={layers}
              activeLayerId={activeLayer?.id ?? ""}
              preserveAspect={reliefSettings.preserveAspect}
              toolMode={toolMode}
              brushRadiusMm={brushRadiusMm}
              brushStrength={brushStrength}
              snapToGrid={snapToGrid}
              showMergedPreview={showMergedPreview}
              mergedGrid={reliefHeights}
              mergedW={gridW}
              mergedH={gridH}
              onStrokeStart={pushUndoSnapshot}
              onSelectLayer={setActiveLayerId}
              onChangePlacement={(id, next) =>
                setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, placement: next } : l)))
              }
              onPaintLayer={(id, newData) =>
                setLayers((ls) =>
                  ls.map((l) => (l.id === id ? { ...l, source: { ...l.source, data: newData } } : l))
                )
              }
            />
          )}
          {step === "layout" && (designMode === "vector" || (designMode === "model3d" && isSketchingIn3d)) && (
            <VectorSketchView
              job={job}
              shapes={vectorShapes}
              activeShapeId={activeVectorId}
              toolMode={sketchTool}
              snapToGrid={snapToGrid}
              snapStepMm={snapStepMm}
              sketchPlaneLabel={isSketchingIn3d ? `Sketch Plane Z = ${sketchPlaneZMm.toFixed(1)}mm` : undefined}
              onSelectShape={setActiveVectorId}
              onAddShape={(s) => {
                const tagged = isSketchingIn3d ? { ...s, sketchZMm: sketchPlaneZMm } : s;
                setVectorShapes((vs) => [...vs, tagged]);
                setActiveVectorId(tagged.id);
              }}
              onUpdateShape={(id, patch) =>
                setVectorShapes((vs) => vs.map((x) => (x.id === id ? { ...x, ...patch } : x)))
              }
            />
          )}
          <main
            ref={mountRef}
            onPointerDown={(e) => {
              if (sculpt3dActive && step === "relief" && e.button === 0) {
                sculptingNow.current = true;
                raycastSculpt(e.clientX, e.clientY, true, true);
              }
            }}
            onPointerMove={(e) => {
              if (sculpt3dActive && step === "relief") {
                raycastSculpt(e.clientX, e.clientY, sculptingNow.current, false);
              }
            }}
            onPointerUp={() => {
              sculptingNow.current = false;
            }}
            onPointerLeave={() => {
              sculptingNow.current = false;
              if (sceneObjectsRef.current?.brushRing) sceneObjectsRef.current.brushRing.visible = false;
            }}
            style={{
              display: step === "layout" && (designMode !== "model3d" || isSketchingIn3d) ? "none" : "block",
              position: "relative",
              width: "100%",
              height: "100%",
              overflow: "hidden",
              cursor: sculpt3dActive && step === "relief" ? "crosshair" : "default",
            }}
          />

          {/* Floating Top-Right 3D Camera Preset Bar */}
          {(step !== "layout" || (designMode === "model3d" && !isSketchingIn3d)) && (
            <div
              style={{
                position: "absolute",
                top: 14,
                right: 16,
                zIndex: 20,
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 6px",
                borderRadius: 10,
                background: "rgba(18, 22, 30, 0.9)",
                backdropFilter: "blur(8px)",
                border: "1px solid var(--hc-border-strong, #334155)",
              }}
            >
              {(["iso", "top", "front", "side"] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setCameraPreset(preset)}
                  style={{
                    padding: "4px 9px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--hc-panel-bg, #1e293b)",
                    color: "var(--hc-text, #e2e8f0)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}

          {/* Floating Bottom Display & Material Sphere Dock */}
          {(step !== "layout" || (designMode === "model3d" && !isSketchingIn3d)) && (
            <div
              style={{
                position: "absolute",
                bottom: 16,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 7,
                padding: "8px 16px",
                borderRadius: 14,
                background: "var(--hc-header-bg, rgba(18, 22, 30, 0.92))",
                backdropFilter: "blur(10px)",
                border: "1px solid var(--hc-border-strong, #334155)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--hc-muted, #94a3b8)", fontWeight: 600, marginRight: 2 }}>Display</span>
                {(
                  [
                    ["material", "Material"],
                    ["clay", "Clay"],
                    ["heatmap", "Height"],
                    ["wireframe", "Wire"],
                  ] as [ShadingMode, string][]
                ).map(([m, lbl]) => (
                  <button
                    key={m}
                    onClick={() => setShading(m)}
                    style={{
                      width: 68,
                      padding: "4px 0",
                      borderRadius: 999,
                      border: shading === m ? "1px solid var(--hc-accent-secondary, #60a5fa)" : "1px solid transparent",
                      background: shading === m ? "var(--hc-accent, #2563eb)" : "var(--hc-subpanel-bg, #1e293b)",
                      color: shading === m ? "#fff" : "var(--hc-muted, #cbd5e1)",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--hc-muted, #94a3b8)", fontWeight: 600, marginRight: 2 }}>Finish</span>
                {PREVIEW_MATERIALS.map((mat) => {
                  const hex = `#${mat.color.toString(16).padStart(6, "0")}`;
                  const active = shading === "material" && previewMatId === mat.id;
                  return (
                    <button
                      key={mat.id}
                      title={mat.label}
                      onClick={() => {
                        setShading("material");
                        setPreviewMatId(mat.id);
                      }}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        padding: 0,
                        cursor: "pointer",
                        border: active ? "2px solid #60a5fa" : "1px solid rgba(255,255,255,0.22)",
                        boxShadow: active ? "0 0 0 2px rgba(59,130,246,0.45)" : "inset -3px -3px 6px rgba(0,0,0,0.5)",
                        background: `radial-gradient(circle at 32% 30%, #ffffff55 0%, ${hex} 48%, #00000099 100%)`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Lower-Right 3D Mesh Export Pill (.STL / .3MF) */}
          {(step !== "layout" || (designMode === "model3d" && !isSketchingIn3d)) && (
            <div
              style={{
                position: "absolute",
                bottom: 16,
                right: 16,
                zIndex: 20,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                borderRadius: 12,
                background: "var(--hc-header-bg, rgba(18, 22, 30, 0.92))",
                backdropFilter: "blur(10px)",
                border: "1px solid var(--hc-border-strong, #334155)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--hc-muted, #94a3b8)", fontWeight: 600 }}>Export 3D:</span>
              <button
                onClick={() => handleExportMesh("stl")}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: "none",
                  background: "var(--hc-accent, #2563eb)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ↓ .STL
              </button>
              <button
                onClick={() => handleExportMesh("3mf")}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: "none",
                  background: "#0284c7",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ↓ .3MF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
