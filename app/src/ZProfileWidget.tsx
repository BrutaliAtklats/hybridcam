import React from "react";
import { UI } from "./uiTheme";

interface Props {
  heights: Float32Array;
  gridW: number;
  gridH: number;
  sliceYPct: number;
  widthMm: number;
  thicknessMm: number;
  maxZMm: number;
  baseHeightMm: number;
  onChangeSliceY: (pct: number) => void;
}

export const ZProfileWidget: React.FC<Props> = ({
  heights,
  gridW,
  gridH,
  sliceYPct,
  widthMm,
  thicknessMm,
  maxZMm,
  baseHeightMm,
  onChangeSliceY,
}) => {
  const row = Math.min(gridH - 1, Math.max(0, Math.round((sliceYPct / 100) * (gridH - 1))));
  const svgW = 290;
  const svgH = 74;

  let minRemMm = thicknessMm;
  const pts: string[] = [];
  const step = Math.max(1, Math.floor(gridW / 96));

  for (let x = 0; x < gridW; x += step) {
    const hNorm = heights[row * gridW + x] ?? 0;
    const zFromBottom = thicknessMm + baseHeightMm - maxZMm + hNorm * maxZMm;
    if (zFromBottom < minRemMm) minRemMm = zFromBottom;
    const sx = (x / Math.max(1, gridW - 1)) * svgW;
    const sy = svgH - (Math.max(0, Math.min(thicknessMm + 4, zFromBottom)) / (thicknessMm + 4)) * (svgH - 8) - 4;
    pts.push(`${sx.toFixed(1)},${sy.toFixed(1)}`);
  }

  const linePath = pts.length > 1 ? `M ${pts.join(" L ")}` : "";
  const fillPath = pts.length > 1 ? `${linePath} L ${svgW},${svgH} L 0,${svgH} Z` : "";

  return (
    <div style={{ ...UI.panel, gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span style={UI.sectionTitle}>Z-Profile Cross Section (Y: {sliceYPct}%)</span>
        <span style={{ color: minRemMm < 1.5 ? "#f87171" : "#4ade80", fontWeight: 700 }}>
          Min Thick: {minRemMm.toFixed(1)} mm
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ background: "var(--hc-bg, #0d1015)", borderRadius: 6, border: "1px solid var(--hc-border, #2d3542)" }}>
        {fillPath && <path d={fillPath} fill="rgba(56, 189, 248, 0.18)" />}
        {linePath && <path d={linePath} fill="none" stroke="var(--hc-accent-secondary, #38bdf8)" strokeWidth="1.6" />}
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--hc-muted, #cbd5e1)" }}>
        <span>Slice Y</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={sliceYPct}
          onChange={(e) => onChangeSliceY(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--hc-accent-secondary, #38bdf8)", cursor: "pointer" }}
        />
        <span>{widthMm}mm</span>
      </div>
    </div>
  );
};
