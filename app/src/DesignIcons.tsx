import React from "react";

export type DesignIconName =
  | "picture"
  | "vector"
  | "model3d"
  | "text"
  | "svg"
  | "centerX"
  | "centerY"
  | "duplicate"
  | "move"
  | "paintRaise"
  | "paintLower"
  | "paintSmooth"
  | "rotLeft"
  | "rotZero"
  | "rotRight"
  | "flipH"
  | "flipV"
  | "select"
  | "rect"
  | "circle"
  | "polygon"
  | "polyline"
  | "stockBlank"
  | "extrude"
  | "revolve"
  | "hole"
  | "box"
  | "cylinder"
  | "pipe"
  | "sphere"
  | "torus"
  | "wedge"
  | "pull"
  | "push"
  | "mirrorX"
  | "mirrorY"
  | "pattern"
  | "union"
  | "subtract"
  | "intersect"
  | "navDesign"
  | "navRelief"
  | "navToolpaths"
  | "navSimulate"
  | "navExport"
  | "save"
  | "folderOpen"
  | "undo"
  | "redo"
  | "reset"
  | "autoFlat"
  | "solidBlock"
  | "baseRemoval"
  | "sculptMode"
  | "sculptFlatten"
  | "sculptPinch"
  | "sculptInflate"
  | "clear"
  | "surfaceStock"
  | "flipDowels"
  | "play"
  | "pause"
  | "stepBack"
  | "stepForward"
  | "materialView"
  | "heatmap"
  | "sliceOff"
  | "sliceX"
  | "sliceY"
  | "splitTool"
  | "setupSheet"
  | "settings";

export const DesignIcon: React.FC<{ name: DesignIconName; size?: number; color?: string }> = ({
  name,
  size = 20,
  color = "currentColor",
}) => {
  const s = size;
  const stroke = color;
  switch (name) {
    case "picture":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" fill={stroke} stroke="none" />
          <path d="M21 16l-5-5-4 4-2.5-2.5L3 19" />
        </svg>
      );
    case "vector":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <circle cx="10.5" cy="10.5" r="1.5" fill={stroke} stroke="none" />
        </svg>
      );
    case "model3d":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l8.5 4.9v10.2L12 22l-8.5-4.9V6.9L12 2z" />
          <path d="M12 22V11.8M20.5 6.9L12 11.8 3.5 6.9" />
        </svg>
      );
    case "text":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 6h14M12 6v13M9 19h6" />
        </svg>
      );
    case "svg":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 18C4 10 10 6 20 6" />
          <rect x="2.5" y="16.5" width="3" height="3" fill={stroke} />
          <rect x="18.5" y="4.5" width="3" height="3" fill={stroke} />
          <circle cx="10" cy="7" r="1.5" />
          <path d="M4 6h6" strokeDasharray="2 2" />
        </svg>
      );
    case "centerX":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2.5 2.5" />
          <path d="M3 12h5m0 0l-2-2m2 2l-2 2M21 12h-5m0 0l2-2m-2 2l2 2" />
        </svg>
      );
    case "centerY":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2.5 2.5" />
          <path d="M12 3v5m0 0l-2-2m2 2l2-2M12 21v-5m0 0l-2 2m2-2l2 2" />
        </svg>
      );
    case "duplicate":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      );
    case "move":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
        </svg>
      );
    case "paintRaise":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 19c3 0 5-7 9-7s6 7 9 7" />
          <path d="M12 3v6M9 6h6" stroke="#4ade80" />
        </svg>
      );
    case "paintLower":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12c3 0 5 7 9 7s6-7 9-7" />
          <path d="M9 6h6" stroke="#f87171" />
        </svg>
      );
    case "paintSmooth":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 15c3-5 6-5 9 0s6 5 9 0" />
          <path d="M3 9c3-3 6-3 9 0s6 3 9 0" opacity="0.55" />
        </svg>
      );
    case "rotLeft":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    case "rotZero":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      );
    case "rotRight":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      );
    case "flipH":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2" />
          <polygon points="9,7 3,17 9,17" />
          <polygon points="15,7 21,17 15,17" fill={stroke} fillOpacity="0.25" />
        </svg>
      );
    case "flipV":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 2" />
          <polygon points="7,9 17,9 17,3" />
          <polygon points="7,15 17,15 17,21" fill={stroke} fillOpacity="0.25" />
        </svg>
      );
    case "select":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 3l14 9-7 1.5L9 20 5 3z" fill={stroke} fillOpacity="0.2" />
        </svg>
      );
    case "rect":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="6" width="16" height="12" rx="1.5" fill={stroke} fillOpacity="0.12" />
          <circle cx="4" cy="6" r="1.5" fill={stroke} />
          <circle cx="20" cy="18" r="1.5" fill={stroke} />
        </svg>
      );
    case "circle":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" fill={stroke} fillOpacity="0.12" />
          <path d="M12 9v6M9 12h6" strokeWidth="1.3" />
        </svg>
      );
    case "polygon":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" fill={stroke} fillOpacity="0.12" />
        </svg>
      );
    case "polyline":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4,17 9,7 15,15 20,6" />
          <circle cx="4" cy="17" r="1.6" fill={stroke} />
          <circle cx="9" cy="7" r="1.6" fill={stroke} />
          <circle cx="15" cy="15" r="1.6" fill={stroke} />
          <circle cx="20" cy="6" r="1.6" fill={stroke} />
        </svg>
      );
    case "stockBlank":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12,3 21,7.5 12,12 3,7.5" fill="#38bdf8" fillOpacity="0.25" />
          <path d="M3 7.5v8L12 20l9-4.5v-8M12 12v8" />
        </svg>
      );
    case "extrude":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="13" width="14" height="7" rx="1" fill="#38bdf8" fillOpacity="0.22" />
          <path d="M5 13l3-4h8l3 4M12 10V3m0 0l-2.5 2.5M12 3l2.5 2.5" stroke="#38bdf8" />
        </svg>
      );
    case "revolve":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2" />
          <path d="M12 6h5v10h-5" fill="#38bdf8" fillOpacity="0.2" />
          <path d="M5 12c0 2.5 3.1 4.5 7 4.5s7-2 7-4.5" stroke="#38bdf8" />
          <path d="M5 12l2-2M5 12l2 2" stroke="#38bdf8" />
        </svg>
      );
    case "hole":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="7" rx="6.5" ry="2.8" fill="#f87171" fillOpacity="0.28" stroke="#f87171" />
          <path d="M5.5 7v9c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8V7" stroke="#f87171" />
          <path d="M12 3v7m0 0l-2-2m2 2l2-2" stroke="#fca5a5" />
        </svg>
      );
    case "box":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12,3 20,7.5 12,12 4,7.5" fill={stroke} fillOpacity="0.2" />
          <path d="M4 7.5v9L12 21l8-4.5v-9M12 12v9" />
        </svg>
      );
    case "cylinder":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="6.5" rx="7" ry="3" fill={stroke} fillOpacity="0.2" />
          <path d="M5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11" />
        </svg>
      );
    case "pipe":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="6.5" rx="7.5" ry="3.2" fill={stroke} fillOpacity="0.18" />
          <ellipse cx="12" cy="6.5" rx="3.5" ry="1.4" />
          <path d="M4.5 6.5v11c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2v-11" />
        </svg>
      );
    case "sphere":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" fill={stroke} fillOpacity="0.15" />
          <ellipse cx="12" cy="12" rx="8" ry="3" strokeOpacity="0.6" />
          <ellipse cx="12" cy="12" rx="3.5" ry="8" strokeOpacity="0.6" />
        </svg>
      );
    case "torus":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="12" rx="9" ry="5.5" fill={stroke} fillOpacity="0.16" />
          <ellipse cx="12" cy="12" rx="3.8" ry="2" />
        </svg>
      );
    case "wedge":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="4,18 15,18 15,7" fill={stroke} fillOpacity="0.2" />
          <path d="M15 7l5-2v11l-5 2M4 18l5-2 6-9" />
        </svg>
      );
    case "pull":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="13" width="14" height="7" rx="1" fill="#4ade80" fillOpacity="0.2" />
          <path d="M12 11V3m0 0l-3 3m3-3l3 3" stroke="#4ade80" />
        </svg>
      );
    case "push":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="14" width="14" height="6" rx="1" fill="#fbbf24" fillOpacity="0.2" />
          <path d="M12 3v8m0 0l-3-3m3 3l3-3" stroke="#fbbf24" />
        </svg>
      );
    case "mirrorX":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="3" x2="12" y2="21" stroke="#38bdf8" strokeDasharray="2 2" />
          <polygon points="9,6 3,12 9,18" />
          <polygon points="15,6 21,12 15,18" fill={stroke} fillOpacity="0.25" />
        </svg>
      );
    case "mirrorY":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" stroke="#38bdf8" strokeDasharray="2 2" />
          <polygon points="6,9 12,3 18,9" />
          <polygon points="6,15 12,21 18,15" fill={stroke} fillOpacity="0.25" />
        </svg>
      );
    case "pattern":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="8" width="5" height="8" rx="1" fill={stroke} fillOpacity="0.22" />
          <rect x="9.5" y="8" width="5" height="8" rx="1" fill={stroke} fillOpacity="0.22" />
          <rect x="16.5" y="8" width="5" height="8" rx="1" fill={stroke} fillOpacity="0.22" />
        </svg>
      );
    case "union":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9.5" cy="12" r="5.5" fill="#4ade80" fillOpacity="0.25" stroke="#4ade80" />
          <circle cx="14.5" cy="12" r="5.5" fill="#4ade80" fillOpacity="0.25" stroke="#4ade80" />
        </svg>
      );
    case "subtract":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9.5" cy="12" r="5.5" fill="#f87171" fillOpacity="0.25" stroke="#f87171" />
          <circle cx="14.5" cy="12" r="5.5" stroke="#fca5a5" strokeDasharray="2 2" />
        </svg>
      );
    case "intersect":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9.5" cy="12" r="5.5" strokeOpacity="0.55" />
          <circle cx="14.5" cy="12" r="5.5" strokeOpacity="0.55" />
          <path d="M12 7.2a5.5 5.5 0 0 1 0 9.6 5.5 5.5 0 0 1 0-9.6z" fill="#fbbf24" fillOpacity="0.45" stroke="#fbbf24" />
        </svg>
      );
    case "navDesign":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
          <path d="M14.06 6.19l3.75 3.75 2.12-2.12a1.5 1.5 0 0 0 0-2.12l-1.63-1.63a1.5 1.5 0 0 0-2.12 0l-2.12 2.12z" />
        </svg>
      );
    case "navRelief":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 16c3-7 6-9 10-4s7 3 10-4" />
          <path d="M2 20h20" />
        </svg>
      );
    case "navToolpaths":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h16M4 12h12M4 18h16" />
          <circle cx="19" cy="12" r="2" fill={stroke} />
        </svg>
      );
    case "navSimulate":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <polygon points="10,8 16,12 10,16" fill={stroke} stroke="none" />
        </svg>
      );
    case "navExport":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      );
    case "save":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17,21 17,13 7,13 7,21" />
          <polyline points="7,3 7,8 15,8" />
        </svg>
      );
    case "folderOpen":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v2" />
          <path d="M2 10h20l-2 9H4l-2-9z" fill={stroke} fillOpacity="0.14" />
        </svg>
      );
    case "undo":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </svg>
      );
    case "redo":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 14l5-5-5-5" />
          <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
        </svg>
      );
    case "reset":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    case "autoFlat":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="15" x2="21" y2="15" stroke="#38bdf8" />
          <path d="M6 10l6-3 6 3" opacity="0.6" />
          <path d="M12 3v8m0 0l-2-2m2 2l2-2" />
        </svg>
      );
    case "solidBlock":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="1.5" fill={stroke} fillOpacity="0.22" />
          <path d="M7 11c2-3 4-3 5-1s3 2 5-1" />
        </svg>
      );
    case "baseRemoval":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 14c2-6 5-8 7-5s5 1 7 5z" fill="#38bdf8" fillOpacity="0.25" />
          <line x1="3" y1="18" x2="21" y2="18" strokeDasharray="2.5 2.5" opacity="0.6" />
        </svg>
      );
    case "sculptMode":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 3l3 3-9 9-4 1 1-4 9-9z" fill={stroke} fillOpacity="0.18" />
          <path d="M4 20c3-2 6 0 9-2" />
        </svg>
      );
    case "sculptFlatten":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="14" x2="20" y2="14" stroke="#38bdf8" />
          <path d="M8 6h8v4H8z" fill={stroke} fillOpacity="0.2" />
          <path d="M12 10v3" />
        </svg>
      );
    case "sculptPinch":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18c4 0 7-6 9-12 2 6 5 12 9 12" />
          <path d="M3 11h4m10 0h4" stroke="#38bdf8" />
        </svg>
      );
    case "sculptInflate":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="13" r="6" fill={stroke} fillOpacity="0.2" />
          <path d="M12 3v3M5 7l2 2M19 7l-2 2" stroke="#4ade80" />
        </svg>
      );
    case "clear":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3,6 5,6 21,6" />
          <path d="M19 6l-1 14H6L5 6m4 0V4h6v2" />
        </svg>
      );
    case "surfaceStock":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="12" width="18" height="8" rx="1" fill={stroke} fillOpacity="0.18" />
          <path d="M4 8h16M8 5h8" stroke="#38bdf8" />
        </svg>
      );
    case "flipDowels":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8" cy="12" r="2" fill="#38bdf8" />
          <circle cx="16" cy="12" r="2" fill="#38bdf8" />
        </svg>
      );
    case "play":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill={stroke} stroke="none">
          <polygon points="6,4 20,12 6,20" />
        </svg>
      );
    case "pause":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill={stroke} stroke="none">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      );
    case "stepBack":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="19,5 9,12 19,19" fill={stroke} />
          <line x1="6" y1="5" x2="6" y2="19" />
        </svg>
      );
    case "stepForward":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5,5 15,12 5,19" fill={stroke} />
          <line x1="18" y1="5" x2="18" y2="19" />
        </svg>
      );
    case "materialView":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" fill="#d97706" fillOpacity="0.25" stroke="#fbbf24" />
          <path d="M3 10c4-1 7 1 11 0s4-1 7 0M3 15c5 1 8-1 13 0s3 1 5 0" stroke="#fbbf24" strokeOpacity="0.7" />
        </svg>
      );
    case "heatmap":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="12" r="3" fill="#4ade80" stroke="none" />
          <circle cx="15" cy="12" r="3" fill="#f87171" stroke="none" />
        </svg>
      );
    case "sliceOff":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <line x1="4" y1="19" x2="20" y2="5" />
        </svg>
      );
    case "sliceX":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="5" width="16" height="14" rx="2" opacity="0.45" />
          <line x1="12" y1="3" x2="12" y2="21" stroke="#38bdf8" />
        </svg>
      );
    case "sliceY":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="5" width="16" height="14" rx="2" opacity="0.45" />
          <line x1="2" y1="12" x2="22" y2="12" stroke="#38bdf8" />
        </svg>
      );
    case "splitTool":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      );
    case "setupSheet":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="14" y2="17" />
        </svg>
      );
    case "settings":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
};

export const ToolTileButton: React.FC<{
  icon: DesignIconName;
  label: string;
  active?: boolean;
  accent?: "blue" | "red" | "amber" | "green";
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
}> = ({ icon, label, active, accent, title, disabled, onClick }) => {
  const accentBorder =
    accent === "red"
      ? "#7f1d1d"
      : accent === "amber"
      ? "#78350f"
      : accent === "green"
      ? "#14532d"
      : "var(--hc-border-strong, #30363d)";
  const activeBg =
    accent === "red"
      ? "rgba(220,38,38,0.22)"
      : accent === "amber"
      ? "rgba(217,119,6,0.22)"
      : accent === "green"
      ? "rgba(22,163,74,0.22)"
      : "var(--hc-accent, #1e3a5f)";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "7px 4px",
        borderRadius: 7,
        border: active ? "1px solid var(--hc-accent-secondary, #38bdf8)" : `1px solid ${accentBorder}`,
        background: active ? activeBg : "var(--hc-subpanel-bg, #111419)",
        color: disabled ? "var(--hc-muted, #4b5563)" : active ? "#ffffff" : "var(--hc-text, #e2e8f0)",
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: 1.15,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      <DesignIcon name={icon} size={20} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{label}</span>
    </button>
  );
};
