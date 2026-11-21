import React, { useState } from "react";
import { evalParamExpr, UserParameter } from "./parametricCad";
import { UI } from "./uiTheme";

interface ParametricModalProps {
  open: boolean;
  parameters: UserParameter[];
  env: Record<string, number>;
  stock: { widthMm: number; depthMm: number; thicknessMm: number };
  onChangeParameters: (next: UserParameter[]) => void;
  onClose: () => void;
}

export const ParametricModal: React.FC<ParametricModalProps> = ({
  open,
  parameters,
  env,
  stock,
  onChangeParameters,
  onClose,
}) => {
  const [newName, setNewName] = useState("");
  const [newExpr, setNewExpr] = useState("10");
  const [newUnit, setNewUnit] = useState<"mm" | "deg" | "">("mm");
  const [newComment, setNewComment] = useState("");

  if (!open) return null;

  const handleAdd = () => {
    const clean = newName.trim().replace(/[^a-zA-Z0-9_]/g, "_");
    if (!clean || /^[0-9]/.test(clean)) return;
    const item: UserParameter = {
      id: `p-${Date.now()}`,
      name: clean,
      expression: newExpr.trim() || "10",
      unit: newUnit,
      comment: newComment.trim(),
    };
    onChangeParameters([...parameters, item]);
    setNewName("");
    setNewExpr("10");
    setNewComment("");
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(6, 10, 18, 0.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 95vw)",
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 16,
          borderRadius: 12,
          background: "var(--hc-panel-bg, #1a1f28)",
          border: "1px solid var(--hc-border-strong, #334155)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.65)",
          color: "var(--hc-text, #f1f5f9)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--hc-accent-secondary, #38bdf8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>fx</span>
              <span>Change Parameters</span>
            </h3>
            <div style={{ fontSize: 11, color: "var(--hc-muted, #94a3b8)", marginTop: 2 }}>
              Use parameter names or math formulas (e.g. <code>stock_w - wall * 2</code>, <code>hole_d / 2</code>) in any sketch or 3D dimension.
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ ...UI.btnSecondary, padding: "5px 10px" }}>
            Close
          </button>
        </div>

        {/* Built-in Stock Variables */}
        <div style={{ ...UI.subPanel, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 11 }}>
          <span style={{ fontWeight: 700, color: "var(--hc-section-title, #93c5fd)", letterSpacing: "0.05em" }}>BUILT-IN STOCK:</span>
          <span><code>stock_w</code> = <strong>{stock.widthMm}</strong> mm</span>
          <span><code>stock_d</code> = <strong>{stock.depthMm}</strong> mm</span>
          <span><code>stock_t</code> = <strong>{stock.thicknessMm}</strong> mm</span>
        </div>

        {/* User Parameters Table */}
        <div style={{ overflowY: "auto", maxHeight: "42vh", border: "1px solid var(--hc-border, #262c36)", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--hc-subpanel-bg, #111419)", textAlign: "left", color: "var(--hc-muted, #94a3b8)", fontSize: 11 }}>
                <th style={{ padding: "7px 8px" }}>Name</th>
                <th style={{ padding: "7px 8px" }}>Expression</th>
                <th style={{ padding: "7px 8px" }}>Value</th>
                <th style={{ padding: "7px 8px" }}>Unit</th>
                <th style={{ padding: "7px 8px" }}>Comment</th>
                <th style={{ padding: "7px 8px", width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {parameters.map((p) => {
                const val = evalParamExpr(p.expression, env, 0);
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--hc-border, #262c36)" }}>
                    <td style={{ padding: "5px 6px" }}>
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) =>
                          onChangeParameters(
                            parameters.map((x) =>
                              x.id === p.id ? { ...x, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_") } : x
                            )
                          )
                        }
                        style={{ ...UI.input, width: 105, fontFamily: "monospace", fontWeight: 600 }}
                      />
                    </td>
                    <td style={{ padding: "5px 6px" }}>
                      <input
                        type="text"
                        value={p.expression}
                        onChange={(e) =>
                          onChangeParameters(
                            parameters.map((x) => (x.id === p.id ? { ...x, expression: e.target.value } : x))
                          )
                        }
                        style={{ ...UI.input, width: 155, fontFamily: "monospace" }}
                      />
                    </td>
                    <td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--hc-accent-secondary, #38bdf8)", whiteSpace: "nowrap" }}>
                      {Number(val.toFixed(3))} {p.unit}
                    </td>
                    <td style={{ padding: "5px 6px" }}>
                      <select
                        value={p.unit}
                        onChange={(e) =>
                          onChangeParameters(
                            parameters.map((x) => (x.id === p.id ? { ...x, unit: e.target.value as "mm" | "deg" | "" } : x))
                          )
                        }
                        style={{ ...UI.input, width: 58, padding: "4px 4px" }}
                      >
                        <option value="mm">mm</option>
                        <option value="deg">deg</option>
                        <option value="">none</option>
                      </select>
                    </td>
                    <td style={{ padding: "5px 6px" }}>
                      <input
                        type="text"
                        value={p.comment ?? ""}
                        onChange={(e) =>
                          onChangeParameters(
                            parameters.map((x) => (x.id === p.id ? { ...x, comment: e.target.value } : x))
                          )
                        }
                        style={{ ...UI.input, width: "100%" }}
                      />
                    </td>
                    <td style={{ padding: "5px 6px", textAlign: "center" }}>
                      <button
                        type="button"
                        title="Delete parameter"
                        onClick={() => onChangeParameters(parameters.filter((x) => x.id !== p.id))}
                        style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 13 }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add New User Parameter Row */}
        <div style={{ ...UI.subPanel, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="param_name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            style={{ ...UI.input, width: 115, fontFamily: "monospace" }}
          />
          <input
            type="text"
            placeholder="Expression (e.g. wall * 2)"
            value={newExpr}
            onChange={(e) => setNewExpr(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            style={{ ...UI.input, width: 170, fontFamily: "monospace" }}
          />
          <select
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value as "mm" | "deg" | "")}
            style={{ ...UI.input, width: 64 }}
          >
            <option value="mm">mm</option>
            <option value="deg">deg</option>
            <option value="">none</option>
          </select>
          <input
            type="text"
            placeholder="Comment (optional)"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            style={{ ...UI.input, flex: 1, minWidth: 120 }}
          />
          <button type="button" onClick={handleAdd} style={UI.btnAccentSmall}>
            + Add Parameter
          </button>
        </div>
      </div>
    </div>
  );
};

interface ParamInputProps {
  label: string;
  value: number;
  expr?: string;
  unit?: string;
  env: Record<string, number>;
  onChange: (numVal: number, expr?: string) => void;
}

/**
 * Fusion-style parametric input field: type either a number (e.g. `40`)
 * or a parametric expression (e.g. `stock_w - wall * 2`)!
 */
export const ParamInput: React.FC<ParamInputProps> = ({ label, value, expr, unit = "mm", env, onChange }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const isParam = Boolean(expr && expr.trim().length > 0);
  const display = draft !== null ? draft : isParam ? expr! : String(Number(value.toFixed(2)));

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setDraft(null);
      return;
    }
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) {
      onChange(asNum, undefined);
    } else {
      const evaluated = evalParamExpr(trimmed, env, value);
      onChange(Number(evaluated.toFixed(3)), trimmed);
    }
    setDraft(null);
  };

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--hc-muted, #94a3b8)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
        <span>{label}</span>
        {isParam && (
          <span
            title={`Evaluates to ${Number(value.toFixed(2))} ${unit}`}
            style={{ fontSize: 10, color: "var(--hc-accent-secondary, #38bdf8)", fontWeight: 700 }}
          >
            fx = {Number(value.toFixed(2))}{unit}
          </span>
        )}
      </div>
      <input
        type="text"
        value={display}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        style={{
          ...UI.input,
          fontFamily: isParam ? "monospace" : "inherit",
          borderColor: isParam ? "var(--hc-accent-secondary, #38bdf8)" : undefined,
        }}
      />
    </label>
  );
};
