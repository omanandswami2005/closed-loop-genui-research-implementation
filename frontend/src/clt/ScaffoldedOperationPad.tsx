import { useState } from "react";
import { Frac, apply, eqLatex, isolated, side, type LinEq } from "../algebra";
import { Tex } from "../Tex";
import type { Operation, ScaffoldedOperationPadNode } from "../types";
import { useItem } from "./context";
import { Btn, Panel } from "./Panel";

const SYMBOL: Record<Operation, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

/** The inverse operation the learner most likely needs next (used without a value field). */
function suggested(eq: LinEq, op: Operation): Frac | null {
  const s = eq.left.coef.isZero() ? eq.right : eq.left;
  if (op === "-" && s.k.n > 0) return s.k;
  if (op === "+" && s.k.n < 0) return new Frac(-s.k.n, s.k.d);
  if ((op === "/" || op === "*") && !s.coef.isZero() && !s.coef.eq(new Frac(1)))
    return op === "/" ? s.coef : new Frac(s.coef.d, s.coef.n);
  return null;
}

export function ScaffoldedOperationPad({ node }: { node: ScaffoldedOperationPadNode }) {
  const { equation, propose, busy } = useItem();
  const start: LinEq = { left: side(equation.a, equation.b), right: side(0, equation.c) };
  const [trail, setTrail] = useState<{ eq: LinEq; label: string }[]>([{ eq: start, label: "start" }]);
  const [op, setOp] = useState<Operation | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const eq = trail[trail.length - 1].eq;

  const run = (o: Operation, v: Frac | null) => {
    if (!v) {
      setError(`nothing useful to ${o === "-" ? "subtract" : o === "+" ? "add" : o === "/" ? "divide by" : "multiply by"} here`);
      return;
    }
    try {
      const next = apply(eq, o, v);
      setTrail([...trail, { eq: next, label: `${SYMBOL[o]} ${v.toString()}` }]);
      setError(null);
      setValue("");
      const x = isolated(next);
      if (x) propose(`x = ${x.toString()}`);
    } catch {
      setError("cannot divide by zero");
    }
  };

  const parseValue = (): Frac | null => {
    const m = value.trim().match(/^(-?\d+)(?:\/(-?\d+))?$/);
    if (!m) return null;
    const d = m[2] ? Number(m[2]) : 1;
    return d === 0 ? null : new Frac(Number(m[1]), d);
  };

  return (
    <Panel code="C3" title="Operation pad" meta={node.value_input ? "operation + value" : "operation only"}>
      <p className="mb-2 text-sm text-slate-600">Pick the inverse operation; it is applied to both sides.</p>
      <ol className="mb-3 space-y-1 border-l-2 border-zinc-300 pl-3">
        {trail.map((t, i) => (
          <li key={i} className="flex items-baseline gap-3">
            <span className="w-14 font-mono text-[11px] text-slate-500">{i === 0 ? "start" : t.label}</span>
            <Tex math={eqLatex(t.eq)} />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {node.operations.map((o) => (
          <Btn
            key={o}
            variant={op === o ? "primary" : "default"}
            disabled={busy}
            onClick={() => (node.value_input ? setOp(o) : run(o, suggested(eq, o)))}
          >
            {SYMBOL[o]}
          </Btn>
        ))}
        {node.value_input && (
          <>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && op && run(op, parseValue())}
              placeholder="value"
              aria-label="value to apply to both sides"
              className="w-24 border border-zinc-800 px-2 py-1 font-mono text-sm outline-none focus:border-cobalt"
            />
            <Btn disabled={!op || busy} onClick={() => op && run(op, parseValue())}>
              apply to both sides
            </Btn>
          </>
        )}
        <span className="ml-auto">
          <Btn onClick={() => setTrail(trail.slice(0, -1))} disabled={trail.length < 2}>
            undo
          </Btn>
        </span>
      </div>
      {error && <p className="mt-2 font-mono text-xs text-red-700">{error}</p>}
    </Panel>
  );
}
