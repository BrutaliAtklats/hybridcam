import React, { useEffect, useRef, useState } from "react";

export interface ShortcutCommand {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  commands: ShortcutCommand[];
  onClose: () => void;
}

/**
 * Autodesk Fusion 360 'S' Key Design Shortcuts Popup.
 * Press 'S' anywhere in Design (CAD) to search & launch any command in 2 keystrokes.
 */
export const FusionShortcutBox: React.FC<Props> = ({ open, commands, onClose }) => {
  const [query, setQuery] = useState("");
  const [selIdx, setSelIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelIdx(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? commands.filter(
        (c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
      )
    : commands.slice(0, 10);

  const clampedIdx = Math.min(selIdx, Math.max(0, filtered.length - 1));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 130,
        background: "rgba(6, 10, 18, 0.38)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "14vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 340,
          borderRadius: 10,
          background: "rgba(15, 20, 28, 0.98)",
          border: "1px solid var(--hc-accent-secondary, #38bdf8)",
          boxShadow: "0 18px 48px rgba(0,0,0,0.7)",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.08em" }}>
          <span>DESIGN SHORTCUTS (S)</span>
          <span>↵ Run · Esc Close</span>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search commands (Move, Extrude, Hole, Fillet, Shell...)"
          onChange={(e) => {
            setQuery(e.target.value);
            setSelIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelIdx((i) => Math.min(filtered.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelIdx((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && filtered[clampedIdx]) {
              e.preventDefault();
              const cmd = filtered[clampedIdx];
              onClose();
              cmd.run();
            }
          }}
          style={{
            padding: "7px 10px",
            borderRadius: 6,
            border: "1px solid #334155",
            background: "#0b0e14",
            color: "#f8fafc",
            fontSize: 13,
            outline: "none",
          }}
        />
        <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "8px 6px", fontSize: 12, color: "#64748b" }}>No matching commands</div>
          ) : (
            filtered.map((cmd, idx) => (
              <button
                key={cmd.id}
                type="button"
                onMouseEnter={() => setSelIdx(idx)}
                onClick={() => {
                  onClose();
                  cmd.run();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "none",
                  background: idx === clampedIdx ? "var(--hc-accent, #2563eb)" : "transparent",
                  color: idx === clampedIdx ? "#fff" : "#e2e8f0",
                  fontSize: 12,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontWeight: 600 }}>{cmd.label}</span>
                <span style={{ fontSize: 10, color: idx === clampedIdx ? "#dbeafe" : "#64748b" }}>
                  {cmd.category} {cmd.shortcut ? `· ${cmd.shortcut}` : ""}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
