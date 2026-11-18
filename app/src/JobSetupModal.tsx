import React, { useEffect, useState } from "react";
import { JobConfig, MATERIAL_LABELS, MaterialKey, Units } from "./camEngine";
import { XyDatumSelector, ZZeroSelector } from "./XyDatumSelector";

interface Props {
  job: JobConfig;
  onConfirm: (finalJob: JobConfig) => void;
}

export const JobSetupModal: React.FC<Props> = ({ job, onConfirm }) => {
  const [draft, setDraft] = useState<JobConfig>(job);

  const factor = draft.units === "in" ? 1 / 25.4 : 1;
  const toDisplay = (mm: number) => String(Number((mm * factor).toFixed(draft.units === "in" ? 3 : 1)));
  const fromDisplay = (val: number) => (draft.units === "in" ? val * 25.4 : val);

  const [widthStr, setWidthStr] = useState(() => toDisplay(draft.widthMm));
  const [depthStr, setDepthStr] = useState(() => toDisplay(draft.depthMm));
  const [thicknessStr, setThicknessStr] = useState(() => toDisplay(draft.thicknessMm));

  useEffect(() => {
    setWidthStr(toDisplay(draft.widthMm));
    setDepthStr(toDisplay(draft.depthMm));
    setThicknessStr(toDisplay(draft.thicknessMm));
  }, [draft.units]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onConfirm(job);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [job, onConfirm]);

  const handleOk = () => {
    const pw = parseFloat(widthStr);
    const pd = parseFloat(depthStr);
    const pt = parseFloat(thicknessStr);
    const finalJob: JobConfig = {
      ...draft,
      widthMm: Number.isFinite(pw) && pw > 0 ? Math.max(5, fromDisplay(pw)) : draft.widthMm,
      depthMm: Number.isFinite(pd) && pd > 0 ? Math.max(5, fromDisplay(pd)) : draft.depthMm,
      thicknessMm: Number.isFinite(pt) && pt > 0 ? Math.max(1, fromDisplay(pt)) : draft.thicknessMm,
    };
    onConfirm(finalJob);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(10, 12, 16, 0.82)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "min(760px, 100%)",
          background: "#181c23",
          border: "1px solid #2d3440",
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--hc-border, #262c36)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>New CNC Job Setup</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--hc-muted, #8b949e)" }}>
              Set your work area, material, and Z-height — HybridCAM will resize the stock plate and configure recommended feeds & speeds when you click OK.
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, background: "var(--hc-subpanel-bg, #111419)", padding: 4, borderRadius: 8 }}>
            {(["mm", "in"] as Units[]).map((u) => (
              <button
                key={u}
                onClick={() => setDraft({ ...draft, units: u })}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 12,
                  background: draft.units === u ? "var(--hc-accent, #2563eb)" : "transparent",
                  color: draft.units === u ? "#fff" : "var(--hc-muted, #8b949e)",
                }}
              >
                {u === "mm" ? "Metric (mm)" : "Inches (in)"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--hc-muted, #9ca3af)" }}>Width (X) [{draft.units}]</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={widthStr}
                  onChange={(e) => setWidthStr(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "8px 10px", background: "var(--hc-subpanel-bg, #111419)", color: "#fff", border: "1px solid var(--hc-border-strong, #30363d)", borderRadius: 8 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--hc-muted, #9ca3af)" }}>Depth (Y) [{draft.units}]</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={depthStr}
                  onChange={(e) => setDepthStr(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "8px 10px", background: "var(--hc-subpanel-bg, #111419)", color: "#fff", border: "1px solid var(--hc-border-strong, #30363d)", borderRadius: 8 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--hc-muted, #9ca3af)" }}>Z Height [{draft.units}]</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={thicknessStr}
                  onChange={(e) => setThicknessStr(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "8px 10px", background: "var(--hc-subpanel-bg, #111419)", color: "#fff", border: "1px solid var(--hc-border-strong, #30363d)", borderRadius: 8 }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--hc-muted, #9ca3af)", display: "block", marginBottom: 6 }}>Z-Zero Position</label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hc-border-strong, #2d3440)", background: "var(--hc-panel-bg, #1a1f28)" }}>
                  <ZZeroSelector
                    value={draft.zZero}
                    onChange={(zZero) => setDraft({ ...draft, zZero })}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--hc-muted, #9ca3af)", display: "block", marginBottom: 6 }}>XY Datum Position</label>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--hc-border-strong, #2d3440)", background: "var(--hc-panel-bg, #1a1f28)" }}>
                  <XyDatumSelector
                    value={draft.xyOrigin}
                    onChange={(xyOrigin) => setDraft({ ...draft, xyOrigin })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--hc-muted, #9ca3af)", display: "block", marginBottom: 6 }}>Stock Material (Auto-sets Feeds & Speeds)</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(Object.keys(MATERIAL_LABELS) as MaterialKey[]).map((m) => {
                const info = MATERIAL_LABELS[m];
                const active = draft.material === m;
                return (
                  <button
                    key={m}
                    onClick={() => setDraft({ ...draft, material: m })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      textAlign: "left",
                      border: active ? "1px solid var(--hc-accent, #3b82f6)" : "1px solid #2d3440",
                      background: active ? "color-mix(in srgb, var(--hc-accent, #2563eb) 20%, transparent)" : "var(--hc-subpanel-bg, #111419)",
                      color: "var(--hc-text, #e6edf3)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--hc-text, #f8fafc)" }}>{info.title}</div>
                      <div style={{ fontSize: 12, color: "var(--hc-muted, #cbd5e1)" }}>{info.subtitle}</div>
                    </div>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: `#${info.color.toString(16).padStart(6, "0")}`,
                        border: "1px solid rgba(255,255,255,0.2)",
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--hc-border, #262c36)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={handleOk}
            style={{
              padding: "10px 26px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: "var(--hc-accent, #2563eb)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            OK — Apply Work Area →
          </button>
        </div>
      </div>
    </div>
  );
};
