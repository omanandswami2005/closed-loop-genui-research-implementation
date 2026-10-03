import { useMemo, useState } from "react";
import { Frac, apply, eqLatex, isolated, side, type LinEq, type Side } from "../algebra";
import { Tex } from "../Tex";
import type { ConcreteBalanceScaleNode } from "../types";
import { useItem } from "./context";
import { Btn, Panel } from "./Panel";

interface Weight {
  op: "+" | "-" | "/";
  v: number;
  label: string;
}

/** Weight tokens, most useful first; ``draggable_weights`` decides how many appear. */
function weightPool(node: ConcreteBalanceScaleNode): Weight[] {
  const xSide = node.left.coef_x !== 0 ? node.left : node.right;
  const b = xSide.const;
  const a = xSide.coef_x;
  const pool: Weight[] = [];
  if (b > 0) pool.push({ op: "-", v: b, label: `remove ${b}` });
  if (b < 0) pool.push({ op: "+", v: -b, label: `add ${-b}` });
  if (a !== 1 && a !== 0) pool.push({ op: "/", v: a, label: `split into ${a}` });
  for (const w of [
    { op: "-", v: 1, label: "remove 1" },
    { op: "+", v: 1, label: "add 1" },
    { op: "-", v: 5, label: "remove 5" },
    { op: "+", v: 5, label: "add 5" },
    { op: "/", v: 2, label: "split into 2" },
  ] as Weight[]) {
    if (!pool.some((p) => p.op === w.op && p.v === w.v)) pool.push(w);
  }
  return pool.slice(0, node.draggable_weights);
}

function Pan({ s, x }: { s: Side; x: number }) {
  // Cups for x, unit blocks for the constant; negatives drawn hatched red.
  const cups = s.coef.d === 1 && Math.abs(s.coef.n) <= 9 ? Math.abs(s.coef.n) : s.coef.isZero() ? 0 : -1;
  const units = s.k.d === 1 && Math.abs(s.k.n) <= 9 ? Math.abs(s.k.n) : s.k.isZero() ? 0 : -1;
  const items: { kind: "cup" | "unit" | "label"; neg: boolean; text?: string }[] = [];
  if (cups === -1) items.push({ kind: "label", neg: s.coef.n < 0, text: `${s.coef.toString()}x` });
  else for (let i = 0; i < cups; i++) items.push({ kind: "cup", neg: s.coef.n < 0 });
  if (units === -1) items.push({ kind: "label", neg: s.k.n < 0, text: s.k.toString() });
  else for (let i = 0; i < units; i++) items.push({ kind: "unit", neg: s.k.n < 0 });
  const perRow = 7;
  return (
    <g transform={`translate(${x},0)`}>
      <line x1={-70} x2={70} y1={118} y2={118} stroke="#27272a" strokeWidth={2} />
      <path d="M -70 118 L -55 132 L 55 132 L 70 118" fill="none" stroke="#27272a" strokeWidth={1.5} />
      {items.map((it, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const cx = -60 + col * 18;
        const cy = 100 - row * 18;
        const stroke = it.neg ? "#b91c1c" : "#0f172a";
        if (it.kind === "label")
          return (
            <text key={i} x={cx} y={cy + 12} className="font-mono" fontSize={12} fill={stroke}>
              {it.text}
            </text>
          );
        if (it.kind === "cup")
          return (
            <g key={i}>
              <path d={`M ${cx} ${cy} L ${cx + 14} ${cy} L ${cx + 11} ${cy + 16} L ${cx + 3} ${cy + 16} Z`} fill={it.neg ? "#fee2e2" : "#dbeafe"} stroke={stroke} />
              <text x={cx + 7} y={cy + 12} textAnchor="middle" fontSize={9} className="font-mono" fill={stroke}>
                x
              </text>
            </g>
          );
        return <rect key={i} x={cx + 1} y={cy + 3} width={13} height={13} fill={it.neg ? "url(#hatch)" : "#e2e8f0"} stroke={stroke} />;
      })}
    </g>
  );
}

export function ConcreteBalanceScale({ node }: { node: ConcreteBalanceScaleNode }) {
  const { propose, busy } = useItem();
  const start: LinEq = useMemo(
    () => ({ left: side(node.left.coef_x, node.left.const), right: side(node.right.coef_x, node.right.const) }),
    [node],
  );
  const [trail, setTrail] = useState<LinEq[]>([start]);
  const [over, setOver] = useState(false);
  const eq = trail[trail.length - 1];
  const weights = weightPool(node);
  const x = isolated(eq);

  const use = (w: Weight) => {
    try {
      const next = apply(eq, w.op, new Frac(w.v));
      setTrail([...trail, next]);
      const v = isolated(next);
      if (v) propose(`x = ${v.toString()}`);
    } catch {
      /* division by zero: ignore */
    }
  };

  return (
    <Panel code="C1" title="Balance scale" meta={`${weights.length} weights`}>
      <p className="mb-2 text-sm text-slate-600">Whatever you do to one pan happens to the other, so the scale stays level. Get x alone.</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const i = Number(e.dataTransfer.getData("text/weight"));
          if (weights[i]) use(weights[i]);
        }}
        className={`border ${over ? "border-cobalt bg-blue-50" : "border-zinc-300 bg-slate-50"}`}
      >
        <svg viewBox="0 0 360 150" className="h-44 w-full" role="img" aria-label={`Balance: ${eqLatex(eq)}`}>
          <defs>
            <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke="#b91c1c" strokeWidth="1.5" />
            </pattern>
          </defs>
          <line x1={90} x2={270} y1={60} y2={60} stroke="#0f172a" strokeWidth={3} />
          <line x1={90} x2={90} y1={60} y2={118} stroke="#27272a" />
          <line x1={270} x2={270} y1={60} y2={118} stroke="#27272a" />
          <path d="M 180 60 L 168 146 L 192 146 Z" fill="#27272a" />
          <circle cx={180} cy={60} r={4} fill="#2563eb" />
          <Pan s={eq.left} x={90} />
          <Pan s={eq.right} x={270} />
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Tex math={eqLatex(eq)} className="font-mono text-lg" />
        {x && <span className="font-mono text-xs text-emerald-700">x isolated</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {weights.map((w, i) => (
          <span
            key={i}
            draggable={!busy}
            onDragStart={(e) => e.dataTransfer.setData("text/weight", String(i))}
            className="cursor-grab"
          >
            <Btn onClick={() => use(w)} disabled={busy} title="Click or drag onto the scale">
              {w.label}
            </Btn>
          </span>
        ))}
        <span className="ml-auto flex gap-2">
          <Btn onClick={() => setTrail(trail.slice(0, -1))} disabled={trail.length < 2}>
            undo
          </Btn>
          <Btn onClick={() => setTrail([start])} disabled={trail.length < 2}>
            reset
          </Btn>
        </span>
      </div>
    </Panel>
  );
}
