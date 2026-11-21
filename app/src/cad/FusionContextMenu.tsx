import React, { useEffect, useRef } from "react";

export interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  accent?: "blue" | "green" | "red";
  dividerBefore?: boolean;
  disabled?: boolean;
  run: () => void;
}

interface Props {
  x: number;
  y: number;
  title: string;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * Autodesk Fusion 360-style Right-Click Context / Marking Menu.
 */
export const FusionContextMenu: React.FC<Props> = ({ x, y, title, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const clampedX = Math.max(8, Math.min(window.innerWidth - 220, x));
  const clampedY = Math.max(8, Math.min(window.innerHeight - Math.min(380, items.length * 30 + 40), y));

  return (
    <div
      ref={menuRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left: clampedX,
        top: clampedY,
        width: 210,
        zIndex: 140,
        padding: 4,
        borderRadius: 6,
        background: "#26282b",
        border: "1px solid #4a4e54",
        boxShadow: "0 14px 36px rgba(0,0,0,0.7)",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        userSelect: "none",
      }}
    >
      <div
        style={{
          padding: "4px 8px",
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.08em",
          color: "#8b929a",
          borderBottom: "1px solid #35383d",
          marginBottom: 2,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {items.map((item) => (
        <React.Fragment key={item.id}>
          {item.dividerBefore && <div style={{ height: 1, background: "#35383d", margin: "3px 0" }} />}
          <button
            type="button"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.run();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "6px 9px",
              borderRadius: 4,
              border: "none",
              background: "transparent",
              color: item.disabled
                ? "#525860"
                : item.accent === "red"
                ? "#f87171"
                : item.accent === "green"
                ? "#4ade80"
                : item.accent === "blue"
                ? "#38bdf8"
                : "#e5e7eb",
              fontSize: 12,
              fontWeight: item.accent ? 700 : 500,
              textAlign: "left",
              cursor: item.disabled ? "not-allowed" : "pointer",
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <span style={{ fontSize: 10, color: "#8b929a", fontFamily: "monospace" }}>{item.shortcut}</span>}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};
