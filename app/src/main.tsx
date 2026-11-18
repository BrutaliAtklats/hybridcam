import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#0d1015",
            color: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: "Inter, Segoe UI, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: 520,
              background: "#1a1f28",
              border: "1px solid #30363d",
              borderRadius: 10,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, color: "#f87171" }}>
              HybridCAM UI Error
            </h2>
            <div style={{ fontSize: 13, color: "#cbd5e1" }}>
              {this.state.error.message}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Reload App
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("hybridcam.customPosts");
                  localStorage.removeItem("hybridcam.theme");
                  window.location.reload();
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: "1px solid #30363d",
                  background: "#111419",
                  color: "#f1f5f9",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Reset Saved Settings &amp; Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
