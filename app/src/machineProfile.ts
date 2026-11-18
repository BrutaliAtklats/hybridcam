import { XyOriginMode } from "./camEngine";

export interface MachineProfile {
  name: string;
  bedXMm: number;
  bedYMm: number;
  maxZTravelMm: number;
  defaultThicknessMm: number;
  minRpm: number;
  maxRpm: number;
  maxRapidMmMin: number;
  maxFeedMmMin: number;
  maxPlungeMmMin: number;
  spindleDwellSec: number;
  safeZMm: number;
  defaultXyOrigin: XyOriginMode;
  defaultZZero: "top" | "spoilboard";
  controllerDialect: string;
  hasHoming: boolean;
  emitCoolantM8: boolean;
  autoClampLimits?: boolean;
  parkAtEnd: boolean;
  parkXMm: number;
  parkYMm: number;
}

export const DEFAULT_MACHINE_PROFILE: MachineProfile = {
  name: "Custom CNC Router",
  bedXMm: 200,
  bedYMm: 150,
  maxZTravelMm: 80,
  defaultThicknessMm: 20,
  minRpm: 1000,
  maxRpm: 24000,
  maxRapidMmMin: 4000,
  maxFeedMmMin: 3000,
  maxPlungeMmMin: 1000,
  spindleDwellSec: 0,
  safeZMm: 5,
  defaultXyOrigin: "front-left",
  defaultZZero: "top",
  controllerDialect: "Grbl",
  hasHoming: true,
  emitCoolantM8: false,
  autoClampLimits: false,
  parkAtEnd: false,
  parkXMm: 0,
  parkYMm: 0,
};

export const MACHINE_PRESETS: Array<{ id: string; label: string; profile: Partial<MachineProfile> }> = [
  {
    id: "3018",
    label: "3018 Pro",
    profile: {
      name: "3018 Pro Desktop CNC",
      bedXMm: 300,
      bedYMm: 180,
      maxZTravelMm: 45,
      maxRpm: 10000,
      maxRapidMmMin: 2000,
      maxFeedMmMin: 1200,
      maxPlungeMmMin: 400,
      controllerDialect: "Grbl",
      hasHoming: false,
    },
  },
  {
    id: "shapeoko",
    label: "Shapeoko 4 XL",
    profile: {
      name: "Carbide Shapeoko 4 XL",
      bedXMm: 838,
      bedYMm: 444,
      maxZTravelMm: 100,
      maxRpm: 24000,
      maxRapidMmMin: 5000,
      maxFeedMmMin: 3500,
      maxPlungeMmMin: 1200,
      controllerDialect: "Grbl",
      hasHoming: true,
    },
  },
  {
    id: "mpcnc",
    label: "MPCNC / PrintNC",
    profile: {
      name: "MPCNC / PrintNC",
      bedXMm: 600,
      bedYMm: 600,
      maxZTravelMm: 100,
      maxRpm: 24000,
      maxRapidMmMin: 3500,
      maxFeedMmMin: 2400,
      maxPlungeMmMin: 800,
      controllerDialect: "Marlin",
      hasHoming: true,
    },
  },
  {
    id: "4x4",
    label: "1200×1200 Router",
    profile: {
      name: "1200×1200 Pro Router",
      bedXMm: 1200,
      bedYMm: 1200,
      maxZTravelMm: 150,
      maxRpm: 24000,
      maxRapidMmMin: 8000,
      maxFeedMmMin: 5000,
      maxPlungeMmMin: 1800,
      controllerDialect: "Grbl",
      hasHoming: true,
    },
  },
];

/**
 * Applies machine-level G-code options (spindle dwell, dust/coolant M8/M9, end-of-job park)
 * without altering motion coordinates.
 */
export function applyMachineProfileToGcode(gcode: string, profile: MachineProfile): string {
  if (!gcode) return gcode;
  const lines = gcode.split(/\r?\n/);
  const out: string[] = [];
  let insertedStartExtras = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.trim().toUpperCase();

    if (
      !insertedStartExtras &&
      (upper.startsWith("M3") || upper.startsWith("M03") || /\bM3\b/.test(upper))
    ) {
      out.push(line);
      if (profile.spindleDwellSec > 0) {
        out.push(`G4 P${profile.spindleDwellSec.toFixed(1)} ( Spindle Spin-Up Dwell )`);
      }
      if (profile.emitCoolantM8) {
        out.push("M8 ( Dust / Coolant ON )");
      }
      insertedStartExtras = true;
      continue;
    }

    if (upper === "M30" || upper === "M2" || upper === "M02") {
      if (profile.emitCoolantM8) {
        out.push("M9 ( Dust / Coolant OFF )");
      }
      if (profile.parkAtEnd) {
        out.push(`G0 X${profile.parkXMm.toFixed(2)} Y${profile.parkYMm.toFixed(2)} ( Park )`);
      }
      out.push(line);
      continue;
    }

    out.push(
      profile.autoClampLimits
        ? line
            .replace(/\bS(\d+(?:\.\d+)?)/gi, (_, v: string) => {
              const clamped = Math.max(profile.minRpm, Math.min(profile.maxRpm, parseFloat(v)));
              return `S${Math.round(clamped)}`;
            })
            .replace(/\bF(\d+(?:\.\d+)?)/gi, (_, v: string) => {
              const clamped = Math.min(profile.maxFeedMmMin, parseFloat(v));
              return `F${Math.round(clamped)}`;
            })
        : line
    );
  }

  return out.join("\n");
}

/**
 * Shifts X and Y coordinates in generated G-code by (oxMm, oyMm) to match
 * the user's selected 5-dot XY Datum Position (preserving comments and relative I/J arcs).
 */
export function shiftGcodeXyOrigin(gcode: string, oxMm: number, oyMm: number): string {
  if (!gcode || (Math.abs(oxMm) < 1e-6 && Math.abs(oyMm) < 1e-6)) return gcode;
  return gcode
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("(") || trimmed.startsWith(";")) return line;
      const commentIdx = line.search(/[;(]/);
      const codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
      const commentPart = commentIdx >= 0 ? line.slice(commentIdx) : "";
      const shifted = codePart
        .replace(/X(-?\d+(?:\.\d+)?)/gi, (_, num: string) => `X${(parseFloat(num) + oxMm).toFixed(3)}`)
        .replace(/Y(-?\d+(?:\.\d+)?)/gi, (_, num: string) => `Y${(parseFloat(num) + oyMm).toFixed(3)}`);
      return shifted + commentPart;
    })
    .join("\n");
}

export function getMachineLimitWarnings(
  job: { widthMm: number; depthMm: number; thicknessMm: number },
  tool: { rpm: number; feedMmMin: number; plungeMmMin: number },
  profile: MachineProfile
): string[] {
  const warnings: string[] = [];
  if (job.widthMm > profile.bedXMm) {
    warnings.push(`Stock width (${job.widthMm}mm) exceeds machine Bed X (${profile.bedXMm}mm)`);
  }
  if (job.depthMm > profile.bedYMm) {
    warnings.push(`Stock depth (${job.depthMm}mm) exceeds machine Bed Y (${profile.bedYMm}mm)`);
  }
  if (job.thicknessMm > profile.maxZTravelMm) {
    warnings.push(`Stock thickness (${job.thicknessMm}mm) exceeds Max Z Travel (${profile.maxZTravelMm}mm)`);
  }
  if (tool.rpm > profile.maxRpm) {
    warnings.push(`Spindle ${tool.rpm} RPM exceeds machine Max RPM (${profile.maxRpm})`);
  }
  if (tool.feedMmMin > profile.maxFeedMmMin) {
    warnings.push(`Feed ${tool.feedMmMin} mm/min exceeds machine Max Feed (${profile.maxFeedMmMin})`);
  }
  if (tool.plungeMmMin > profile.maxPlungeMmMin) {
    warnings.push(`Plunge ${tool.plungeMmMin} mm/min exceeds machine Max Plunge (${profile.maxPlungeMmMin})`);
  }
  return warnings;
}
