export type BuiltinDialect = "Grbl" | "Marlin" | "LinuxCnc" | "Mach34" | "Masso" | "FanucIso";

export interface CustomPostProcessor {
  id: string;
  name: string;
  baseDialect: BuiltinDialect;
  fileExt: string;
  commentStyle: "paren" | "semicolon";
  decimals: 2 | 3 | 4;
  emitLineNumbers: boolean;
  headerLines: string;
  footerLines: string;
}

export const DEFAULT_CUSTOM_POST_TEMPLATE: Omit<CustomPostProcessor, "id"> = {
  name: "My Custom CNC Post",
  baseDialect: "Grbl",
  fileExt: "nc",
  commentStyle: "paren",
  decimals: 3,
  emitLineNumbers: false,
  headerLines: "( Program: {PROGRAM} )\n( Tool: {TOOL} )\nG90 G94 G17\n{UNITS}\nG0 Z{SAFE_Z}\nM3 S{RPM}",
  footerLines: "M5\nG0 Z{SAFE_Z}\nG0 X0 Y0\nM30",
};

export interface PostContext {
  programName: string;
  toolLabel: string;
  rpm: number;
  safeZ: number;
  units: "mm" | "in" | "inch";
}

function expandTokens(tpl: string, ctx: PostContext): string[] {
  const unitCode = ctx.units === "mm" ? "G21" : "G20";
  return tpl
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/\{PROGRAM\}/g, ctx.programName)
        .replace(/\{TOOL\}/g, ctx.toolLabel)
        .replace(/\{RPM\}/g, String(Math.round(ctx.rpm)))
        .replace(/\{SAFE_Z\}/g, ctx.safeZ.toFixed(3))
        .replace(/\{UNITS\}/g, unitCode)
        .trim()
    )
    .filter((l) => l.length > 0);
}

function formatComment(text: string, style: "paren" | "semicolon"): string {
  const clean = text.replace(/^\(|\)$/g, "").replace(/^;\s*/, "").trim();
  return style === "semicolon" ? `; ${clean}` : `( ${clean} )`;
}

/**
 * Post-processes generated G-code using a user-defined CustomPostProcessor:
 * replaces standard header/footer boilerplate, normalizes comment syntax,
 * formats coordinate decimals, and optionally adds N10/N20 line numbers.
 */
export function applyCustomPostProcessor(
  rawGcode: string,
  post: CustomPostProcessor,
  ctx: PostContext
): string {
  const rawLines = rawGcode.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Strip leading header lines up to the first XY/Z motion or keep motion body
  let startIdx = 0;
  for (let i = 0; i < Math.min(rawLines.length, 15); i++) {
    const u = rawLines[i].toUpperCase();
    if (/^G0[01]?\s+[XYZ]/.test(u) || /^G1\s/.test(u) || /^G2\s/.test(u) || /^G3\s/.test(u)) {
      startIdx = i;
      break;
    }
  }
  let endIdx = rawLines.length;
  for (let i = rawLines.length - 1; i >= Math.max(startIdx, rawLines.length - 8); i--) {
    const u = rawLines[i].toUpperCase();
    if (u === "M5" || u === "M30" || u === "M2" || u.startsWith("M05") || u.startsWith("M02")) {
      endIdx = i;
    } else {
      break;
    }
  }

  const bodyLines = rawLines.slice(startIdx, endIdx).map((line) => {
    if (line.startsWith("(") || line.startsWith(";")) {
      return formatComment(line, post.commentStyle);
    }
    return line.replace(/([XYZIJKR])(-?\d+\.\d+)/g, (_, axis: string, num: string) => {
      const n = parseFloat(num);
      return Number.isFinite(n) ? `${axis}${n.toFixed(post.decimals)}` : `${axis}${num}`;
    });
  });

  const header = expandTokens(post.headerLines, ctx).map((l) =>
    l.startsWith("(") || l.startsWith(";") ? formatComment(l, post.commentStyle) : l
  );
  const footer = expandTokens(post.footerLines, ctx).map((l) =>
    l.startsWith("(") || l.startsWith(";") ? formatComment(l, post.commentStyle) : l
  );

  const combined = [...header, ...bodyLines, ...footer];
  if (!post.emitLineNumbers) return combined.join("\n");
  return combined.map((line, i) => `N${(i + 1) * 10} ${line}`).join("\n");
}
