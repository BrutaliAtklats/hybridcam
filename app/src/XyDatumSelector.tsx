import React from "react";
import { XyOriginMode, ZZeroMode } from "./camEngine";

const DATUM_POINTS: Array<{
  mode: XyOriginMode;
  label: string;
  left: string;
  top: string;
}> = [
  { mode: "back-left", label: "Top-Left", left: "0%", top: "0%" },
  { mode: "back-right", label: "Top-Right", left: "100%", top: "0%" },
  { mode: "center", label: "Center", left: "50%", top: "50%" },
  { mode: "front-left", label: "Bottom-Left", left: "0%", top: "100%" },
  { mode: "front-right", label: "Bottom-Right", left: "100%", top: "100%" },
];

export const XY_ORIGIN_LABELS: Record<XyOriginMode, string> = {
  "front-left": "Bottom-Left (Front-Left)",
  "front-right": "Bottom-Right (Front-Right)",
  "back-left": "Top-Left (Back-Left)",
  "back-right": "Top-Right (Back-Right)",
  center: "Center of Stock",
};

/**
 * Vectric-style 5-dot XY Datum Position selector (4 corners + center).
 */
export const XyDatumSelector: React.FC<{
  value: XyOriginMode;
  onChange: (mode: XyOriginMode) => void;
}> = ({ value, onChange }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div
        style={{
          position: "relative",
          width: 112,
          height: 74,
          margin: "8px 10px",
          border: "2px solid var(--hc-border-strong, #475569)",
          borderRadius: 4,
          background: "var(--hc-subpanel-bg, #111419)",
        }}
      >
        {/* Dashed Center Crosshairs */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            borderLeft: "1px dashed var(--hc-border, #334155)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            borderTop: "1px dashed var(--hc-border, #334155)",
            pointerEvents: "none",
          }}
        />

        {/* 5 Clickable Datum Dots */}
        {DATUM_POINTS.map((pt) => {
          const active = value === pt.mode;
          return (
            <button
              key={pt.mode}
              type="button"
              title={pt.label}
              onClick={() => onChange(pt.mode)}
              style={{
                position: "absolute",
                left: pt.left,
                top: pt.top,
                transform: "translate(-50%, -50%)",
                width: active ? 18 : 13,
                height: active ? 18 : 13,
                borderRadius: "50%",
                padding: 0,
                cursor: "pointer",
                border: active
                  ? "2px solid #ffffff"
                  : "2px solid var(--hc-border-strong, #64748b)",
                background: active
                  ? "var(--hc-accent, #ef4444)"
                  : "var(--hc-panel-bg, #1e293b)",
                boxShadow: active
                  ? "0 0 0 3px color-mix(in srgb, var(--hc-accent, #ef4444) 40%, transparent)"
                  : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {active && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "#ffffff",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--hc-section-title, #93c5fd)" }}>
        {XY_ORIGIN_LABELS[value] ?? value}
      </div>
    </div>
  );
};

/**
 * Vectric-style side-view Z-Zero Position selector (Material Surface vs Machine Bed).
 */
export const ZZeroSelector: React.FC<{
  value: ZZeroMode;
  onChange: (mode: ZZeroMode) => void;
}> = ({ value, onChange }) => {
  const isTop = value === "top";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div
        style={{
          position: "relative",
          width: 112,
          height: 74,
          margin: "8px 10px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        {/* Stock Block */}
        <div
          onClick={() => onChange("top")}
          style={{
            position: "relative",
            width: "100%",
            height: 44,
            borderRadius: "4px 4px 0 0",
            border: "2px solid var(--hc-border-strong, #475569)",
            borderBottom: "none",
            background: "color-mix(in srgb, var(--hc-accent-secondary, #38bdf8) 12%, var(--hc-subpanel-bg, #111419))",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--hc-muted, #94a3b8)",
          }}
        >
          Material
        </div>

        {/* Spoilboard / Machine Bed Base */}
        <div
          onClick={() => onChange("spoilboard")}
          style={{
            width: "100%",
            height: 12,
            borderRadius: "0 0 4px 4px",
            border: "2px solid var(--hc-border-strong, #475569)",
            background: "repeating-linear-gradient(45deg, var(--hc-panel-bg, #1a1f28), var(--hc-panel-bg, #1a1f28) 4px, var(--hc-border, #262c36) 4px, var(--hc-border, #262c36) 8px)",
            cursor: "pointer",
          }}
        />

        {/* Active Z=0 Datum Line */}
        <div
          style={{
            position: "absolute",
            left: -6,
            right: -6,
            top: isTop ? 18 : 62,
            borderTop: "2px dashed var(--hc-accent, #ef4444)",
            pointerEvents: "none",
            transition: "top 120ms ease",
          }}
        />

        {/* Top Dot (Material Surface) */}
        <button
          type="button"
          title="Material Surface (Top)"
          onClick={() => onChange("top")}
          style={{
            position: "absolute",
            left: "50%",
            top: 18,
            transform: "translate(-50%, -50%)",
            width: isTop ? 18 : 13,
            height: isTop ? 18 : 13,
            borderRadius: "50%",
            padding: 0,
            cursor: "pointer",
            border: isTop ? "2px solid #ffffff" : "2px solid var(--hc-border-strong, #64748b)",
            background: isTop ? "var(--hc-accent, #ef4444)" : "var(--hc-panel-bg, #1e293b)",
            boxShadow: isTop
              ? "0 0 0 3px color-mix(in srgb, var(--hc-accent, #ef4444) 40%, transparent)"
              : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isTop && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ffffff" }} />}
        </button>

        {/* Bottom Dot (Machine Bed / Spoilboard) */}
        <button
          type="button"
          title="Machine Bed (Spoilboard)"
          onClick={() => onChange("spoilboard")}
          style={{
            position: "absolute",
            left: "50%",
            top: 62,
            transform: "translate(-50%, -50%)",
            width: !isTop ? 18 : 13,
            height: !isTop ? 18 : 13,
            borderRadius: "50%",
            padding: 0,
            cursor: "pointer",
            border: !isTop ? "2px solid #ffffff" : "2px solid var(--hc-border-strong, #64748b)",
            background: !isTop ? "var(--hc-accent, #ef4444)" : "var(--hc-panel-bg, #1e293b)",
            boxShadow: !isTop
              ? "0 0 0 3px color-mix(in srgb, var(--hc-accent, #ef4444) 40%, transparent)"
              : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {!isTop && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ffffff" }} />}
        </button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--hc-section-title, #93c5fd)" }}>
        {isTop ? "Material Surface (Top)" : "Machine Bed (Bottom)"}
      </div>
    </div>
  );
};
