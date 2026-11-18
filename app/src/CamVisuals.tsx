import React from "react";
import { StrategyKey, ToolCategory } from "./camEngine";

export const EndmillIcon: React.FC<{ category: ToolCategory; size?: number }> = ({ category, size = 28 }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      {/* Shank */}
      <rect x="11" y="2" width="10" height="8" rx="1" fill="#94a3b8" />
      <line x1="11" y1="10" x2="21" y2="10" stroke="#475569" strokeWidth="1" />
      {category === "Flat" && (
        <>
          <rect x="11" y="10" width="10" height="18" fill="#cbd5e1" />
          <path d="M11 14 L21 19 M11 20 L21 25" stroke="#475569" strokeWidth="1.4" />
        </>
      )}
      {category === "O-Flute" && (
        <>
          <rect x="11" y="10" width="10" height="18" fill="#e2e8f0" />
          <path d="M12 12 C19 16, 13 22, 20 27" stroke="#2563eb" strokeWidth="2.2" fill="none" />
        </>
      )}
      {category === "Ballnose" && (
        <>
          <path d="M11 10 H21 V23 A5 5 0 0 1 11 23 Z" fill="#cbd5e1" />
          <path d="M11 14 L21 19 M11 20 L19 25" stroke="#475569" strokeWidth="1.3" />
        </>
      )}
      {category === "Tapered" && (
        <>
          <path d="M10 10 H22 L17.5 27 A1.5 1.5 0 0 1 14.5 27 Z" fill="#cbd5e1" />
          <path d="M12 14 L20 18 M13 20 L18 23" stroke="#475569" strokeWidth="1.2" />
        </>
      )}
      {category === "V-Bit" && (
        <>
          <polygon points="6,13 26,13 16,29" fill="#cbd5e1" stroke="#475569" strokeWidth="1" />
          <rect x="12" y="10" width="8" height="3" fill="#94a3b8" />
        </>
      )}
      {category === "Engraving" && (
        <>
          <polygon points="12,10 20,10 16,29" fill="#e2e8f0" stroke="#475569" strokeWidth="1" />
          <circle cx="16" cy="28.5" r="1" fill="#38bdf8" />
        </>
      )}
      {category === "Surfacing" && (
        <>
          <rect x="3" y="20" width="26" height="7" rx="1.5" fill="#cbd5e1" stroke="#475569" strokeWidth="1" />
          <rect x="13" y="10" width="6" height="10" fill="#94a3b8" />
        </>
      )}
    </svg>
  );
};

export const ToolpathIcon: React.FC<{ strategy: StrategyKey; size?: number }> = ({ strategy, size = 34 }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" style={{ flexShrink: 0, background: "#0b0e14", borderRadius: 6, border: "1px solid #334155" }}>
      {strategy === "ReliefRough3D" && (
        <g fill="none">
          {/* Stepped terrace roughing levels */}
          <rect x="4" y="24" width="28" height="7" fill="#1e293b" stroke="#475569" strokeWidth="1" />
          <rect x="8" y="17" width="20" height="7" fill="#334155" stroke="#38bdf8" strokeWidth="1.2" />
          <rect x="13" y="10" width="10" height="7" fill="#475569" stroke="#38bdf8" strokeWidth="1.2" />
          <path d="M5 9 H31" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="3 2" />
        </g>
      )}
      {strategy === "ReliefFinish3D" && (
        <g fill="none">
          {/* Smooth curved 3D surface with tight parallel finish passes */}
          <path d="M4 26 Q18 6 32 26" fill="#1e293b" stroke="#64748b" strokeWidth="1" />
          <path d="M5 24 Q18 8 31 24" stroke="#38bdf8" strokeWidth="1.3" />
          <path d="M7 22 Q18 11 29 22" stroke="#38bdf8" strokeWidth="1.3" />
          <path d="M10 20 Q18 14 26 20" stroke="#7dd3fc" strokeWidth="1.3" />
          <circle cx="18" cy="11" r="2.2" fill="#ef4444" />
        </g>
      )}
      {strategy === "Adaptive2D" && (
        <g fill="none">
          <rect x="4" y="4" width="28" height="28" rx="3" stroke="#475569" strokeWidth="1.2" />
          <path d="M8 26 C8 12, 15 12, 15 22 C15 28, 22 28, 22 14 C22 8, 28 8, 28 24" stroke="#4ade80" strokeWidth="1.7" />
          <circle cx="9" cy="26" r="2" fill="#4ade80" />
        </g>
      )}
      {strategy === "Pocket2D" && (
        <g fill="none">
          <rect x="4" y="4" width="28" height="28" rx="2" fill="#1e293b" stroke="#64748b" strokeWidth="1.2" />
          <rect x="7" y="7" width="22" height="22" stroke="#38bdf8" strokeWidth="1.3" />
          <rect x="11" y="11" width="14" height="14" stroke="#38bdf8" strokeWidth="1.3" />
          <rect x="15" y="15" width="6" height="6" stroke="#7dd3fc" strokeWidth="1.3" />
        </g>
      )}
      {strategy === "Contour2D" && (
        <g fill="none">
          <rect x="7" y="7" width="22" height="22" rx="3" fill="#1e293b" />
          <path d="M6 6 H15 M21 6 H30 V15 M30 21 V30 H21 M15 30 H6 V21 M6 15 V6" stroke="#38bdf8" strokeWidth="1.8" />
          {/* Holding Tabs */}
          <rect x="15" y="4.5" width="6" height="3" rx="0.8" fill="#f59e0b" />
          <rect x="15" y="28.5" width="6" height="3" rx="0.8" fill="#f59e0b" />
          <rect x="4.5" y="15" width="3" height="6" rx="0.8" fill="#f59e0b" />
          <rect x="28.5" y="15" width="3" height="6" rx="0.8" fill="#f59e0b" />
        </g>
      )}
      {strategy === "VCarve" && (
        <g fill="none">
          {/* V-groove cross section + sharp serif path */}
          <polygon points="4,8 32,8 18,28" fill="#1e293b" stroke="#64748b" strokeWidth="1.2" />
          <path d="M6 10 L18 26 L30 10" stroke="#f472b6" strokeWidth="1.8" />
          <line x1="18" y1="6" x2="18" y2="26" stroke="#f472b6" strokeWidth="1.2" strokeDasharray="2 2" />
        </g>
      )}
      {strategy === "PhotoVCarve" && (
        <g fill="none">
          <line x1="4" y1="12" x2="12" y2="4" stroke="#94a3b8" strokeWidth="1" />
          <line x1="4" y1="20" x2="20" y2="4" stroke="#e2e8f0" strokeWidth="2.4" />
          <line x1="4" y1="28" x2="28" y2="4" stroke="#38bdf8" strokeWidth="1.6" />
          <line x1="6" y1="32" x2="32" y2="6" stroke="#e2e8f0" strokeWidth="2.8" />
          <line x1="14" y1="32" x2="32" y2="14" stroke="#38bdf8" strokeWidth="1.8" />
          <line x1="22" y1="32" x2="32" y2="22" stroke="#94a3b8" strokeWidth="1" />
        </g>
      )}
      {strategy === "AdaptiveOffset2D" && (
        <g fill="none" strokeWidth="1.5">
          <rect x="6" y="6" width="24" height="24" rx="5" stroke="#22c55e" />
          <rect x="10" y="10" width="16" height="16" rx="4" stroke="#4ade80" />
          <rect x="14" y="14" width="8" height="8" rx="3" stroke="#86efac" />
        </g>
      )}
      {strategy === "SteepShallow3D" && (
        <g fill="none" strokeWidth="1.6">
          <path d="M4 28 L10 10 L26 10 L32 28" stroke="#64748b" />
          <path d="M11 9 H25" stroke="#4ade80" />
          <path d="M7 16 H10 M26 16 H29 M5.5 22 H9 M27 22 H30.5" stroke="#38bdf8" />
        </g>
      )}
      {strategy === "Spiral3D" && (
        <g fill="none" stroke="#4ade80" strokeWidth="1.6">
          <path d="M18 18 C20 18 20 15 18 15 C14 15 14 21 18 21 C24 21 24 12 18 12 C10 12 10 25 18 25 C28 25 28 8 18 8 C7 8 7 29 18 29" />
        </g>
      )}
      {strategy === "Pencil3D" && (
        <g fill="none" strokeWidth="1.6">
          <path d="M5 24 L15 24 L18 28 L21 24 L31 24" stroke="#64748b" />
          <path d="M18 8 L18 26" stroke="#f472b6" strokeDasharray="2 2" />
          <circle cx="18" cy="26" r="2.2" fill="#f472b6" stroke="none" />
        </g>
      )}
      {strategy === "Drilling" && (
        <g fill="none" strokeWidth="1.7">
          <circle cx="10" cy="18" r="3" stroke="#38bdf8" />
          <circle cx="18" cy="18" r="3" stroke="#38bdf8" />
          <circle cx="26" cy="18" r="3" stroke="#38bdf8" />
          <path d="M18 6v9m0 0l-2-2m2 2l2-2" stroke="#f87171" />
        </g>
      )}
    </svg>
  );
};

export const TOOL_DESCRIPTIONS: Record<ToolCategory, string> = {
  Flat: "Best for 2D pockets, contours, and 3D roughing. Leaves flat bottoms and crisp vertical walls.",
  "O-Flute": "Single-flute geometry clears chips fast—ideal for Acrylic, HDPE, and Aluminum without melting.",
  Ballnose: "Rounded tip for smooth 3D curves and shallow relief finishing.",
  Tapered: "Conical strength with a tiny R0.25–R1.0mm tip for ultra-fine 3D carving without breaking.",
  "V-Bit": "Angled tip for sharp V-carved lettering, bevels, and crisp internal corners.",
  Engraving: "Needle-fine 20° tip for PhotoVCarve, lithophanes, and micro-inlays.",
  Surfacing: "Wide flycutter for flattening spoilboards and leveling rough lumber.",
};

export const STRATEGY_DESCRIPTIONS: Record<StrategyKey, string> = {
  ReliefRough3D: "Clears bulk stock above your 3D relief quickly using a sturdy flat endmill, leaving a small allowance.",
  ReliefFinish3D: "Traces fine parallel passes over your 3D relief with a ballnose or tapered bit for a smooth surface.",
  Adaptive2D: "High-speed constant-engagement trochoidal clearing—fast and gentle on bits in hardwood or aluminum.",
  Pocket2D: "Clears flat-bottomed interior pockets using concentric inward loops.",
  Contour2D: "Cuts around the outside/inside perimeter with holding tabs so your part stays attached.",
  VCarve: "Varies Z depth along the centerline to carve crisp lettering and sharp corners with a V-bit.",
  PhotoVCarve: "Carves angled V-grooves of varying depth to turn grayscale photos into wood engravings or lithophanes.",
  AdaptiveOffset2D: "Concentric inward clearing with smooth rounded G2/G3 corner arcs—reduces machine vibration on Marlin/GRBL.",
  SteepShallow3D: "Combines 3D raster passes on shallow tops with constant-Z waterline contours on steep vertical walls.",
  Spiral3D: "Continuous center-outward Archimedes spiral over your 3D relief with minimal retracts and circular grain finish.",
  Pencil3D: "Detects concave valleys and inside creases via curvature and cleans up only those tight corners.",
  Drilling: "Peck-drills vector circles and 3D Hole features with configurable depth and safe retracts.",
};
