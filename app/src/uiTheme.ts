import React from "react";

export type ThemeId = "midnight" | "miamiVice" | "fusionLight" | "amberWorkshop";

export interface AppTheme {
  id: ThemeId;
  name: string;
  subtitle: string;
  isLight?: boolean;
  swatches: [string, string, string, string];
  bg: string;
  headerBg: string;
  sidebarBg: string;
  panelBg: string;
  subPanelBg: string;
  inputBg: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  sectionTitle: string;
  accent: string;
  accentHover: string;
  accentSecondary: string;
  success: string;
  viewportBg: string;
  gridColor: string;
}

export const THEMES: Record<ThemeId, AppTheme> = {
  midnight: {
    id: "midnight",
    name: "Midnight Pro",
    subtitle: "Crisp CAD dark slate & cobalt",
    swatches: ["#0d1015", "#1a1f28", "#2563eb", "#38bdf8"],
    bg: "#0d1015",
    headerBg: "#141820",
    sidebarBg: "#141820",
    panelBg: "#1a1f28",
    subPanelBg: "#111419",
    inputBg: "#111419",
    border: "#262c36",
    borderStrong: "#30363d",
    text: "#f1f5f9",
    textMuted: "#9ca3af",
    sectionTitle: "#93c5fd",
    accent: "#2563eb",
    accentHover: "#3b82f6",
    accentSecondary: "#38bdf8",
    success: "#16a34a",
    viewportBg: "#0d1117",
    gridColor: "#263040",
  },
  miamiVice: {
    id: "miamiVice",
    name: "Miami Vice",
    subtitle: "Neon magenta, electric cyan & night violet",
    swatches: ["#0b0616", "#1a0f2e", "#ff2a85", "#00f0ff"],
    bg: "#0b0616",
    headerBg: "#120a24",
    sidebarBg: "#120a24",
    panelBg: "#1a0f2e",
    subPanelBg: "#0f081e",
    inputBg: "#0f081e",
    border: "#341e59",
    borderStrong: "#4b2b82",
    text: "#fdf4ff",
    textMuted: "#c4b5fd",
    sectionTitle: "#00f0ff",
    accent: "#ff2a85",
    accentHover: "#ff4da6",
    accentSecondary: "#00f0ff",
    success: "#00d4aa",
    viewportBg: "#080412",
    gridColor: "#381e63",
  },
  amberWorkshop: {
    id: "amberWorkshop",
    name: "CNC Amber",
    subtitle: "Industrial dark charcoal & warm gold",
    swatches: ["#11100e", "#221f1a", "#d97706", "#fbbf24"],
    bg: "#11100e",
    headerBg: "#181613",
    sidebarBg: "#181613",
    panelBg: "#221f1a",
    subPanelBg: "#141210",
    inputBg: "#141210",
    border: "#363128",
    borderStrong: "#4a4336",
    text: "#fafaf9",
    textMuted: "#a8a29e",
    sectionTitle: "#fbbf24",
    accent: "#d97706",
    accentHover: "#f59e0b",
    accentSecondary: "#fbbf24",
    success: "#16a34a",
    viewportBg: "#12100d",
    gridColor: "#3a342a",
  },
  fusionLight: {
    id: "fusionLight",
    name: "Studio Light",
    subtitle: "Clean daylight engineering UI",
    isLight: true,
    swatches: ["#e2e8f0", "#ffffff", "#2563eb", "#0284c7"],
    bg: "#e2e8f0",
    headerBg: "#ffffff",
    sidebarBg: "#f8fafc",
    panelBg: "#ffffff",
    subPanelBg: "#f1f5f9",
    inputBg: "#ffffff",
    border: "#cbd5e1",
    borderStrong: "#94a3b8",
    text: "#0f172a",
    textMuted: "#475569",
    sectionTitle: "#1d4ed8",
    accent: "#2563eb",
    accentHover: "#1d4ed8",
    accentSecondary: "#0284c7",
    success: "#15803d",
    viewportBg: "#cbd5e1",
    gridColor: "#94a3b8",
  },
};

export function applyThemeToDocument(theme: AppTheme): void {
  const root = document.documentElement;
  root.style.setProperty("--hc-bg", theme.bg);
  root.style.setProperty("--hc-header-bg", theme.headerBg);
  root.style.setProperty("--hc-sidebar-bg", theme.sidebarBg);
  root.style.setProperty("--hc-panel-bg", theme.panelBg);
  root.style.setProperty("--hc-subpanel-bg", theme.subPanelBg);
  root.style.setProperty("--hc-input-bg", theme.inputBg);
  root.style.setProperty("--hc-border", theme.border);
  root.style.setProperty("--hc-border-strong", theme.borderStrong);
  root.style.setProperty("--hc-text", theme.text);
  root.style.setProperty("--hc-muted", theme.textMuted);
  root.style.setProperty("--hc-section-title", theme.sectionTitle);
  root.style.setProperty("--hc-accent", theme.accent);
  root.style.setProperty("--hc-accent-hover", theme.accentHover);
  root.style.setProperty("--hc-accent-secondary", theme.accentSecondary);
  root.style.setProperty("--hc-success", theme.success);
}

/**
 * Unified design tokens for HybridCAM backed by live CSS custom properties
 * so switching themes updates every workflow tab, modal, and widget instantly.
 */
export const UI = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 10,
    background: "var(--hc-panel-bg, #1a1f28)",
    border: "1px solid var(--hc-border, #262c36)",
    borderRadius: 8,
  } as React.CSSProperties,

  subPanel: {
    background: "var(--hc-subpanel-bg, #111419)",
    border: "1px solid var(--hc-border, #262c36)",
    borderRadius: 6,
    padding: "6px 8px",
  } as React.CSSProperties,

  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 6,
    borderBottom: "1px solid var(--hc-border, #242a34)",
  } as React.CSSProperties,

  pageTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "var(--hc-text, #f8fafc)",
    letterSpacing: 0.2,
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--hc-section-title, #93c5fd)",
  } as React.CSSProperties,

  label: {
    fontSize: 12,
    color: "var(--hc-muted, #cbd5e1)",
  } as React.CSSProperties,

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 9px",
    background: "var(--hc-input-bg, #111419)",
    color: "var(--hc-text, #f8fafc)",
    border: "1px solid var(--hc-border-strong, #30363d)",
    borderRadius: 6,
    fontSize: 13,
  } as React.CSSProperties,

  btnPrimary: {
    marginTop: "auto",
    padding: "11px 14px",
    borderRadius: 8,
    border: "none",
    background: "var(--hc-accent, #2563eb)",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  } as React.CSSProperties,

  btnSuccess: {
    marginTop: "auto",
    padding: "11px 14px",
    borderRadius: 8,
    border: "none",
    background: "var(--hc-success, #16a34a)",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  } as React.CSSProperties,

  btnSecondary: {
    padding: "6px 9px",
    borderRadius: 6,
    border: "1px solid var(--hc-border-strong, #30363d)",
    background: "var(--hc-subpanel-bg, #111419)",
    color: "var(--hc-text, #f1f5f9)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,

  btnAccentSmall: {
    padding: "5px 10px",
    borderRadius: 6,
    border: "none",
    background: "var(--hc-accent, #2563eb)",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
};
