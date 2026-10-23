// The same small arithmetic language as backend/closedloop_demo/expr.py: numbers, names,
// + - * / % ^, parentheses and a few math functions. Parsed once, evaluated many times.

type Node =
  | { k: "n"; v: number }
  | { k: "v"; name: string }
  | { k: "u"; arg: Node }
  | { k: "b"; op: string; a: Node; b: Node }
  | { k: "f"; fn: string; args: Node[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  log10: Math.log10,
  sqrt: Math.sqrt,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

function tokenize(src: string): string[] {
  const out: string[] = [];
  const re = /\s*(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|\*\*|[-+*/%^(),])/y;
  let m: RegExpExecArray | null;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(i))) break;
      throw new Error(`bad formula near "${src.slice(i, i + 8)}"`);
    }
    out.push(m[1] === "**" ? "^" : m[1]);
    i = re.lastIndex;
  }
  return out;
}

export function parse(src: string): Node {
  const t = tokenize(src);
  let p = 0;
  const peek = () => t[p];
  const eat = (s?: string) => {
    const v = t[p++];
    if (s && v !== s) throw new Error(`expected ${s}`);
    return v;
  };
  function expr(): Node {
    let a = term();
    while (peek() === "+" || peek() === "-") a = { k: "b", op: eat(), a, b: term() };
    return a;
  }
  function term(): Node {
    let a = unary();
    while (peek() === "*" || peek() === "/" || peek() === "%") a = { k: "b", op: eat(), a, b: unary() };
    return a;
  }
  function unary(): Node {
    if (peek() === "-") {
      eat();
      return { k: "u", arg: unary() };
    }
    if (peek() === "+") {
      eat();
      return unary();
    }
    return power();
  }
  function power(): Node {
    const a = atom();
    if (peek() === "^") {
      eat();
      return { k: "b", op: "^", a, b: unary() };
    }
    return a;
  }
  function atom(): Node {
    const v = eat();
    if (v === undefined) throw new Error("formula ended early");
    if (v === "(") {
      const e = expr();
      eat(")");
      return e;
    }
    if (/^[\d.]/.test(v)) return { k: "n", v: parseFloat(v) };
    if (/^[A-Za-z_]/.test(v)) {
      if (peek() === "(") {
        eat("(");
        const args: Node[] = [];
        if (peek() !== ")") {
          args.push(expr());
          while (peek() === ",") {
            eat(",");
            args.push(expr());
          }
        }
        eat(")");
        if (!FUNCS[v]) throw new Error(`unknown function ${v}`);
        return { k: "f", fn: v, args };
      }
      return { k: "v", name: v };
    }
    throw new Error(`unexpected ${v}`);
  }
  const root = expr();
  if (p < t.length) throw new Error("extra text in formula");
  return root;
}

export function evaluate(n: Node, env: Record<string, number>): number {
  switch (n.k) {
    case "n":
      return n.v;
    case "v":
      if (n.name in env) return env[n.name];
      if (n.name in CONSTS) return CONSTS[n.name];
      throw new Error(`unknown name ${n.name}`);
    case "u":
      return -evaluate(n.arg, env);
    case "f":
      return FUNCS[n.fn](...n.args.map((a) => evaluate(a, env)));
    case "b": {
      const a = evaluate(n.a, env);
      const b = evaluate(n.b, env);
      switch (n.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "%":
          return a % b;
        default:
          return a ** b;
      }
    }
  }
}

/** Compile a formula to a function; a broken formula evaluates to NaN instead of throwing. */
export function compile(src: string): (env: Record<string, number>) => number {
  try {
    const tree = parse(src);
    return (env) => {
      try {
        return evaluate(tree, env);
      } catch {
        return NaN;
      }
    };
  } catch {
    return () => NaN;
  }
}
