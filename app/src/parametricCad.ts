/**
 * Parametric Expression Engine for HybridCAM Fusion-style CAD.
 * Supports user-defined parameters (e.g. `wall = 4`, `inner_w = plate_w - wall * 2`),
 * built-in stock variables (`stock_w`, `stock_d`, `stock_t`), and math functions.
 */

export interface UserParameter {
  id: string;
  name: string;
  expression: string;
  unit: "mm" | "deg" | "";
  comment?: string;
}

export const DEFAULT_USER_PARAMETERS: UserParameter[] = [
  { id: "p-wall", name: "wall", expression: "4", unit: "mm", comment: "Standard wall thickness" },
  { id: "p-hole", name: "hole_d", expression: "8", unit: "mm", comment: "Mounting hole diameter" },
  { id: "p-fillet", name: "fillet_r", expression: "2", unit: "mm", comment: "Default edge fillet radius" },
];

type Token =
  | { type: "num"; value: number }
  | { type: "id"; value: string }
  | { type: "op"; value: string };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let start = i;
      while (i < expr.length && /[0-9.]/.test(expr[i])) i++;
      const num = parseFloat(expr.slice(start, i));
      if (!Number.isFinite(num)) throw new Error("Invalid number");
      tokens.push({ type: "num", value: num });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let start = i;
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) i++;
      tokens.push({ type: "id", value: expr.slice(start, i) });
      continue;
    }
    if ("+-*/(),^".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character: ${ch}`);
  }
  return tokens;
}

/**
 * Recursive-descent safe arithmetic expression parser.
 */
export function evalParamExpr(
  expr: string,
  env: Record<string, number>,
  fallback: number
): number {
  const trimmed = (expr ?? "").trim();
  if (!trimmed) return fallback;
  const direct = Number(trimmed);
  if (Number.isFinite(direct)) return direct;

  try {
    const tokens = tokenize(trimmed);
    let pos = 0;

    const peek = (): Token | undefined => tokens[pos];
    const consume = (): Token => tokens[pos++];

    const parseExpr = (): number => {
      let left = parseTerm();
      while (peek()?.type === "op" && (peek()!.value === "+" || peek()!.value === "-")) {
        const op = consume().value;
        const right = parseTerm();
        left = op === "+" ? left + right : left - right;
      }
      return left;
    };

    const parseTerm = (): number => {
      let left = parsePower();
      while (peek()?.type === "op" && (peek()!.value === "*" || peek()!.value === "/")) {
        const op = consume().value;
        const right = parsePower();
        left = op === "*" ? left * right : Math.abs(right) > 1e-9 ? left / right : fallback;
      }
      return left;
    };

    const parsePower = (): number => {
      let base = parseUnary();
      if (peek()?.type === "op" && peek()!.value === "^") {
        consume();
        const exp = parsePower();
        base = Math.pow(base, exp);
      }
      return base;
    };

    const parseUnary = (): number => {
      if (peek()?.type === "op" && peek()!.value === "-") {
        consume();
        return -parseUnary();
      }
      if (peek()?.type === "op" && peek()!.value === "+") {
        consume();
        return parseUnary();
      }
      return parsePrimary();
    };

    const parsePrimary = (): number => {
      const tok = peek();
      if (!tok) return fallback;
      if (tok.type === "num") {
        consume();
        return tok.value;
      }
      if (tok.type === "op" && tok.value === "(") {
        consume();
        const v = parseExpr();
        if (peek()?.type === "op" && peek()!.value === ")") consume();
        return v;
      }
      if (tok.type === "id") {
        consume();
        const name = tok.value;
        const lower = name.toLowerCase();
        // Function call
        if (peek()?.type === "op" && peek()!.value === "(") {
          consume();
          const args: number[] = [];
          if (!(peek()?.type === "op" && peek()!.value === ")")) {
            args.push(parseExpr());
            while (peek()?.type === "op" && peek()!.value === ",") {
              consume();
              args.push(parseExpr());
            }
          }
          if (peek()?.type === "op" && peek()!.value === ")") consume();
          if (lower === "sin") return Math.sin(((args[0] ?? 0) * Math.PI) / 180);
          if (lower === "cos") return Math.cos(((args[0] ?? 0) * Math.PI) / 180);
          if (lower === "tan") return Math.tan(((args[0] ?? 0) * Math.PI) / 180);
          if (lower === "sqrt") return Math.sqrt(Math.max(0, args[0] ?? 0));
          if (lower === "abs") return Math.abs(args[0] ?? 0);
          if (lower === "min") return args.length ? Math.min(...args) : 0;
          if (lower === "max") return args.length ? Math.max(...args) : 0;
          if (lower === "round") return Math.round(args[0] ?? 0);
          return args[0] ?? fallback;
        }
        if (lower === "pi") return Math.PI;
        if (name in env) return env[name];
        if (lower in env) return env[lower];
        return fallback;
      }
      return fallback;
    };

    const result = parseExpr();
    return Number.isFinite(result) ? result : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Resolve all user parameters plus built-in stock variables into a numeric map.
 * Performs multi-pass evaluation so dependent parameters resolve cleanly without cycles.
 */
export function resolveParameterEnv(
  params: UserParameter[],
  stock: { widthMm: number; depthMm: number; thicknessMm: number }
): Record<string, number> {
  const env: Record<string, number> = {
    stock_w: stock.widthMm,
    stock_d: stock.depthMm,
    stock_t: stock.thicknessMm,
  };
  for (const p of params) {
    if (p.name.trim()) env[p.name.trim()] = 0;
  }
  for (let pass = 0; pass < 4; pass++) {
    for (const p of params) {
      const key = p.name.trim();
      if (!key) continue;
      env[key] = evalParamExpr(p.expression, env, env[key] ?? 0);
    }
  }
  return env;
}
