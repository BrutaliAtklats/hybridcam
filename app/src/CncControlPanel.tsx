import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { UI } from "./uiTheme";
import { DesignIcon } from "./DesignIcons";

export interface CncStatusSnapshot {
  connected: boolean;
  port: string;
  state: string;
  mpos: [number, number, number];
  wpos: [number, number, number];
  feed_ovr: number;
  spindle_ovr: number;
  streaming: boolean;
  paused: boolean;
  stream_index: number;
  stream_total: number;
  logs: string[];
}

const DEFAULT_STATUS: CncStatusSnapshot = {
  connected: false,
  port: "",
  state: "Disconnected",
  mpos: [0, 0, 0],
  wpos: [0, 0, 0],
  feed_ovr: 100,
  spindle_ovr: 100,
  streaming: false,
  paused: false,
  stream_index: 0,
  stream_total: 0,
  logs: [],
};

export const CncControlPanel: React.FC<{
  gcodeText: string;
  defaultRpm: number;
  onStatusMsg: (msg: string) => void;
  onLiveWpos?: (wpos: [number, number, number], connected: boolean) => void;
}> = ({ gcodeText, defaultRpm, onStatusMsg, onLiveWpos }) => {
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [baud, setBaud] = useState<number>(115200);
  const [status, setStatus] = useState<CncStatusSnapshot>(DEFAULT_STATUS);
  const [jogStep, setJogStep] = useState<number>(10);
  const [jogFeed, setJogFeed] = useState<number>(1500);
  const [probePlateMm, setProbePlateMm] = useState<number>(15);
  const [spindleOn, setSpindleOn] = useState<boolean>(false);
  const [mdiCmd, setMdiCmd] = useState<string>("");

  const refreshPorts = async () => {
    try {
      const list = await invoke<string[]>("list_serial_ports_ipc");
      setPorts(list);
      if (list.length > 0 && (!selectedPort || !list.includes(selectedPort))) {
        setSelectedPort(list[0]);
      }
    } catch {
      setPorts([]);
    }
  };

  useEffect(() => {
    refreshPorts();
    const id = setInterval(async () => {
      try {
        const snap = await invoke<CncStatusSnapshot>("get_cnc_status_ipc");
        setStatus(snap);
        onLiveWpos?.(snap.wpos, snap.connected);
      } catch {
        // outside tauri
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

  const sendLine = async (line: string) => {
    try {
      await invoke("send_serial_line_ipc", { line });
    } catch (err) {
      onStatusMsg(String(err));
    }
  };

  const sendRt = async (byte: number) => {
    try {
      await invoke("send_realtime_byte_ipc", { byte });
    } catch (err) {
      onStatusMsg(String(err));
    }
  };

  const jog = (axis: "X" | "Y" | "Z", dir: 1 | -1) => {
    const dist = (jogStep * dir).toFixed(2);
    sendLine(`$J=G91 G21 ${axis}${dist} F${jogFeed}`);
  };

  const stateColor =
    status.state === "Idle"
      ? "#4ade80"
      : status.state === "Run"
      ? "#38bdf8"
      : status.state === "Hold"
      ? "#fbbf24"
      : status.state === "Alarm"
      ? "#f87171"
      : "var(--hc-muted, #9ca3af)";

  const jobPct =
    status.stream_total > 0 ? Math.min(100, (status.stream_index / status.stream_total) * 100) : 0;

  return (
    <>
      <div style={UI.pageHeader}>
        <h3 style={UI.pageTitle}>Run CNC (USB Sender)</h3>
        <span style={{ fontSize: 11, fontWeight: 700, color: stateColor }}>{status.state}</span>
      </div>

      {/* Connection */}
      <div style={UI.panel}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 86px auto", gap: 5 }}>
          <select
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={status.connected}
            style={UI.input}
          >
            {ports.length === 0 ? (
              <option value="">No COM Ports</option>
            ) : (
              ports.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))
            )}
          </select>
          <select
            value={baud}
            onChange={(e) => setBaud(Number(e.target.value))}
            disabled={status.connected}
            style={UI.input}
          >
            <option value={115200}>115200</option>
            <option value={250000}>250000</option>
          </select>
          <button type="button" onClick={refreshPorts} title="Scan COM ports" style={UI.btnSecondary}>
            Scan
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 4 }}>
          {!status.connected ? (
            <button
              type="button"
              disabled={!selectedPort}
              onClick={async () => {
                try {
                  await invoke("connect_serial_ipc", { port: selectedPort, baud });
                  onStatusMsg(`Connected to ${selectedPort}`);
                } catch (err) {
                  onStatusMsg(String(err));
                }
              }}
              style={{ ...UI.btnAccentSmall, background: "#16a34a" }}
            >
              Connect
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                await invoke("disconnect_serial_ipc");
                onStatusMsg("Disconnected");
              }}
              style={{ ...UI.btnSecondary, borderColor: "#7f1d1d", color: "#fca5a5" }}
            >
              Disconnect
            </button>
          )}
          <button type="button" disabled={!status.connected} onClick={() => sendLine("$H")} style={UI.btnSecondary}>
            Home
          </button>
          <button type="button" disabled={!status.connected} onClick={() => sendLine("$X")} style={UI.btnSecondary}>
            Unlock
          </button>
          <button type="button" disabled={!status.connected} onClick={() => sendRt(0x18)} style={UI.btnSecondary}>
            Reset
          </button>
        </div>
      </div>

      {/* Live DRO */}
      <div style={UI.panel}>
        <span style={UI.sectionTitle}>Digital Readout (Work / Machine)</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {(["X", "Y", "Z"] as const).map((ax, i) => (
            <div key={ax} style={{ ...UI.subPanel, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--hc-muted, #9ca3af)" }}>{ax} WORK</div>
              <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "var(--hc-text, #f8fafc)" }}>
                {status.wpos[i].toFixed(2)}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "var(--hc-muted, #64748b)" }}>
                M: {status.mpos[i].toFixed(1)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
          <button type="button" disabled={!status.connected} onClick={() => sendLine("G10 L20 P1 X0")} style={UI.btnSecondary}>Zero X</button>
          <button type="button" disabled={!status.connected} onClick={() => sendLine("G10 L20 P1 Y0")} style={UI.btnSecondary}>Zero Y</button>
          <button type="button" disabled={!status.connected} onClick={() => sendLine("G10 L20 P1 Z0")} style={UI.btnSecondary}>Zero Z</button>
          <button type="button" disabled={!status.connected} onClick={() => sendLine("G10 L20 P1 X0 Y0 Z0")} style={UI.btnAccentSmall}>Zero All</button>
        </div>
      </div>

      {/* Jog Pad & Spindle / Probe */}
      <div style={UI.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={UI.sectionTitle}>Jog &amp; Probe</span>
          <div style={{ display: "flex", gap: 3 }}>
            {[0.1, 1, 10, 50].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setJogStep(st)}
                style={{
                  ...UI.btnSecondary,
                  padding: "3px 6px",
                  fontSize: 10,
                  border: jogStep === st ? "1px solid var(--hc-accent-secondary, #38bdf8)" : "1px solid var(--hc-border-strong, #30363d)",
                  background: jogStep === st ? "var(--hc-accent, #2563eb)" : "var(--hc-subpanel-bg, #111419)",
                  color: jogStep === st ? "#fff" : "var(--hc-text, #f1f5f9)",
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
          <div />
          <button type="button" disabled={!status.connected} onClick={() => jog("Y", 1)} style={UI.btnSecondary}>Y+</button>
          <div />
          <button type="button" disabled={!status.connected} onClick={() => jog("Z", 1)} style={UI.btnSecondary}>Z+</button>

          <button type="button" disabled={!status.connected} onClick={() => jog("X", -1)} style={UI.btnSecondary}>X-</button>
          <button type="button" disabled={!status.connected} onClick={() => sendLine("G90 G0 X0 Y0")} style={{ ...UI.btnSecondary, fontSize: 10 }}>XY 0</button>
          <button type="button" disabled={!status.connected} onClick={() => jog("X", 1)} style={UI.btnSecondary}>X+</button>
          <div />

          <div />
          <button type="button" disabled={!status.connected} onClick={() => jog("Y", -1)} style={UI.btnSecondary}>Y-</button>
          <div />
          <button type="button" disabled={!status.connected} onClick={() => jog("Z", -1)} style={UI.btnSecondary}>Z-</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
          <select value={jogFeed} onChange={(e) => setJogFeed(Number(e.target.value))} style={UI.input}>
            <option value={300}>Jog Slow (300)</option>
            <option value={1500}>Jog Med (1500)</option>
            <option value={3500}>Jog Fast (3500)</option>
          </select>
          <button
            type="button"
            disabled={!status.connected}
            onClick={() => {
              const next = !spindleOn;
              setSpindleOn(next);
              sendLine(next ? `M3 S${defaultRpm}` : "M5");
            }}
            style={{
              ...UI.btnSecondary,
              borderColor: spindleOn ? "#f59e0b" : "var(--hc-border-strong, #30363d)",
              color: spindleOn ? "#fbbf24" : "var(--hc-text, #f1f5f9)",
            }}
          >
            {spindleOn ? "Spindle OFF (M5)" : `Spindle ON (${defaultRpm})`}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "82px 1fr", gap: 5, alignItems: "center" }}>
          <input
            type="number"
            step="0.1"
            value={probePlateMm}
            onChange={(e) => setProbePlateMm(Number(e.target.value) || 0)}
            title="Touch plate thickness (mm)"
            style={UI.input}
          />
          <button
            type="button"
            disabled={!status.connected}
            onClick={() => sendLine(`G38.2 Z-30 F100\nG92 Z${probePlateMm.toFixed(2)}\nG91 G0 Z5\nG90`)}
            style={UI.btnSecondary}
          >
            Probe Z (Touch Plate {probePlateMm}mm)
          </button>
        </div>
      </div>

      {/* Job Streamer */}
      <div style={UI.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={UI.sectionTitle}>Job Streamer</span>
          <span style={{ fontSize: 11, color: "var(--hc-muted, #9ca3af)" }}>
            {status.stream_index} / {status.stream_total} ({jobPct.toFixed(0)}%)
          </span>
        </div>
        <div style={{ height: 7, borderRadius: 999, background: "var(--hc-subpanel-bg, #111419)", overflow: "hidden" }}>
          <div style={{ width: `${jobPct}%`, height: "100%", background: "#22c55e", transition: "width 150ms" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 5 }}>
          <button
            type="button"
            disabled={!status.connected || !gcodeText || status.streaming}
            onClick={async () => {
              try {
                await invoke("start_gcode_stream_ipc", { lines: gcodeText.split(/\r?\n/) });
              } catch (err) {
                onStatusMsg(String(err));
              }
            }}
            style={{ ...UI.btnAccentSmall, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: "#16a34a" }}
          >
            <DesignIcon name="play" size={14} />
            <span>Start Job</span>
          </button>
          <button
            type="button"
            disabled={!status.connected}
            onClick={() => sendRt(status.paused ? 0x7e : 0x21)}
            style={UI.btnSecondary}
          >
            {status.paused ? "Resume (~)" : "Pause (!)"}
          </button>
          <button
            type="button"
            disabled={!status.connected}
            onClick={async () => {
              await invoke("stop_gcode_stream_ipc");
            }}
            style={{ ...UI.btnSecondary, borderColor: "#7f1d1d", color: "#fca5a5" }}
          >
            Stop
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, fontSize: 10 }}>
          <button type="button" disabled={!status.connected} onClick={() => sendRt(0x92)} style={UI.btnSecondary}>Feed -10%</button>
          <button type="button" disabled={!status.connected} onClick={() => sendRt(0x90)} style={UI.btnSecondary}>Feed 100% ({status.feed_ovr}%)</button>
          <button type="button" disabled={!status.connected} onClick={() => sendRt(0x91)} style={UI.btnSecondary}>Feed +10%</button>
          <button type="button" disabled={!status.connected} onClick={() => sendRt(0x99)} style={UI.btnSecondary}>Spindle 100%</button>
        </div>
      </div>

      {/* Console / MDI */}
      <div style={UI.panel}>
        <span style={UI.sectionTitle}>Serial Console &amp; MDI</span>
        <div
          style={{
            height: 95,
            overflowY: "auto",
            background: "var(--hc-bg, #0d1015)",
            border: "1px solid var(--hc-border, #262c36)",
            borderRadius: 6,
            padding: 6,
            fontFamily: "monospace",
            fontSize: 10.5,
            color: "var(--hc-muted, #cbd5e1)",
          }}
        >
          {status.logs.length === 0 ? "Ready." : status.logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <input
            type="text"
            value={mdiCmd}
            onChange={(e) => setMdiCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && mdiCmd.trim()) {
                sendLine(mdiCmd);
                setMdiCmd("");
              }
            }}
            placeholder="Send G-code or $ command..."
            style={{ ...UI.input, flex: 1, fontFamily: "monospace", fontSize: 11 }}
          />
          <button
            type="button"
            disabled={!status.connected || !mdiCmd.trim()}
            onClick={() => {
              sendLine(mdiCmd);
              setMdiCmd("");
            }}
            style={UI.btnAccentSmall}
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
};
