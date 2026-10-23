// Shared building blocks for the lab components: tap-or-drag placement, sliders, plot axes.
import { motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";
import type { CheckState } from "./types";

export function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(2);
  return String(Number(v.toFixed(digits)));
}

/** Seeded shuffle that never returns the original order (for ordering tasks). */
export function shuffled<T>(items: T[], seed = 7): T[] {
  const out = [...items];
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let tries = 0; tries < 6; tries++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.length < 2 || out.some((x, i) => x !== items[i])) break;
  }
  return out;
}

/** Report the component's check state whenever it changes. */
export function useReport(report: (s: CheckState) => void, state: CheckState) {
  const key = JSON.stringify(state);
  const ref = useRef(report);
  ref.current = report;
  useEffect(() => ref.current(state), [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Placement of chips into slots, by tapping (chip, then slot) or by dragging.
 * `slots` maps a slot id to a chip id (or null).
 */
export function usePlacement(slotIds: string[], initial?: Record<string, string | null>) {
  const [slots, setSlots] = useState<Record<string, string | null>>(() => initial ?? Object.fromEntries(slotIds.map((s) => [s, null])));
  const [picked, setPicked] = useState<string | null>(null);
  const place = (slot: string, chip: string | null = picked) => {
    if (!chip) {
      // tapping a filled slot with nothing picked sends the chip back
      setSlots((old) => ({ ...old, [slot]: null }));
      return;
    }
    setSlots((old) => {
      const next = { ...old };
      for (const k of Object.keys(next)) if (next[k] === chip) next[k] = null;
      next[slot] = chip;
      return next;
    });
    setPicked(null);
  };
  const placed = new Set(Object.values(slots).filter(Boolean) as string[]);
  return { slots, setSlots, picked, setPicked, place, placed };
}

export function Chip({
  id,
  label,
  picked,
  onPick,
  tone = "default",
  className,
}: {
  id: string;
  label: ReactNode;
  picked?: boolean;
  onPick?: (id: string) => void;
  tone?: "default" | "good" | "bad";
  className?: string;
}) {
  return (
    <motion.button
      layout
      type="button"
      draggable
      onDragStart={(e) => {
        (e as unknown as DragEvent).dataTransfer?.setData("text/plain", id);
        onPick?.(id);
      }}
      onClick={() => onPick?.(id)}
      whileTap={{ scale: 0.96 }}
      data-chip={id}
      className={cn(
        "cursor-grab select-none rounded-xl border px-3 py-1.5 text-left text-sm font-medium shadow-sm transition active:cursor-grabbing",
        picked ? "border-cyan-300 bg-cyan-400/20 text-white ring-2 ring-cyan-300/40" : "border-white/15 bg-white/[0.06] text-slate-100 hover:border-white/30",
        tone === "good" && "border-emerald-400/60 bg-emerald-500/15",
        tone === "bad" && "border-rose-400/70 bg-rose-500/15",
        className,
      )}
    >
      {label}
    </motion.button>
  );
}

export function Slot({
  id,
  filled,
  onPlace,
  children,
  placeholder = "drop here",
  className,
  tone,
}: {
  id: string;
  filled: boolean;
  onPlace: (slot: string, chip?: string) => void;
  children?: ReactNode;
  placeholder?: string;
  className?: string;
  tone?: "good" | "bad";
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      data-slot={id}
      onClick={() => onPlace(id)}
      onKeyDown={(e) => e.key === "Enter" && onPlace(id)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onPlace(id, e.dataTransfer.getData("text/plain") || undefined);
      }}
      className={cn(
        "flex min-h-11 items-center justify-center rounded-xl border-2 border-dashed px-2 py-1.5 text-center text-sm transition",
        filled ? "border-solid border-white/15 bg-white/[0.04]" : "border-white/15 text-slate-500 hover:border-cyan-300/50",
        over && "border-cyan-300 bg-cyan-400/10",
        tone === "good" && "border-emerald-400/70 bg-emerald-500/10",
        tone === "bad" && "border-rose-400/70 bg-rose-500/10",
        className,
      )}
    >
      {children ?? <span className="text-xs">{placeholder}</span>}
    </div>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  color = "#22d3ee",
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number | "any";
  unit?: string;
  onChange: (v: number) => void;
  color?: string;
  testId?: string;
}) {
  const st = step ?? "any"; // continuous unless the data gives a grid
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono tabular-nums text-white">
          {fmt(value)}
          {unit ? <span className="ml-1 text-slate-400">{unit}</span> : null}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={st}
        value={value}
        data-testid={testId}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="genui-range w-full"
        style={{ background: `linear-gradient(90deg, ${color} ${pct}%, rgba(255,255,255,0.1) ${pct}%)` }}
      />
    </label>
  );
}

/** Linear scale helpers for SVG plots. */
export function useScale(domain: [number, number], range: [number, number]) {
  return useMemo(() => {
    const [d0, d1] = domain[0] === domain[1] ? [domain[0] - 1, domain[1] + 1] : domain;
    const f = (v: number) => range[0] + ((v - d0) / (d1 - d0)) * (range[1] - range[0]);
    return Object.assign(f, { domain: [d0, d1] as [number, number] });
  }, [domain[0], domain[1], range[0], range[1]]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export const PLOT = { w: 560, h: 300, l: 52, r: 16, t: 14, b: 40 };

export function Axes({
  x,
  y,
  xLabel,
  yLabel,
}: {
  x: ((v: number) => number) & { domain: [number, number] };
  y: ((v: number) => number) & { domain: [number, number] };
  xLabel?: string;
  yLabel?: string;
}) {
  const { w, h, l, r, t, b } = PLOT;
  return (
    <g className="text-[10px]">
      {niceTicks(...y.domain).map((v) => (
        <g key={`y${v}`}>
          <line x1={l} x2={w - r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
          <text x={l - 6} y={y(v) + 3} textAnchor="end" fill="#64748b" fontFamily="JetBrains Mono">
            {fmt(v, 2)}
          </text>
        </g>
      ))}
      {niceTicks(...x.domain).map((v) => (
        <g key={`x${v}`}>
          <line x1={x(v)} x2={x(v)} y1={t} y2={h - b} stroke="rgba(255,255,255,0.04)" />
          <text x={x(v)} y={h - b + 14} textAnchor="middle" fill="#64748b" fontFamily="JetBrains Mono">
            {fmt(v, 2)}
          </text>
        </g>
      ))}
      <line x1={l} x2={w - r} y1={h - b} y2={h - b} stroke="rgba(255,255,255,0.25)" />
      <line x1={l} x2={l} y1={t} y2={h - b} stroke="rgba(255,255,255,0.25)" />
      {xLabel && (
        <text x={(l + w - r) / 2} y={h - 6} textAnchor="middle" fill="#94a3b8" fontSize="11">
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text x={12} y={(t + h - b) / 2} textAnchor="middle" fill="#94a3b8" fontSize="11" transform={`rotate(-90 12 ${(t + h - b) / 2})`}>
          {yLabel}
        </text>
      )}
    </g>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-white/10 bg-[#0a1020]/80 p-4", className)}>{children}</div>;
}

export function Readout({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "good" | "bad" }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2", tone === "good" ? "border-emerald-400/40 bg-emerald-500/10" : tone === "bad" ? "border-amber-400/40 bg-amber-500/10" : "border-white/10 bg-white/[0.03]")}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="font-mono text-lg tabular-nums text-white">
        {value}
        {unit && <span className="ml-1 text-sm text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

export function linePath(pts: [number, number][]): string {
  return pts.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)).map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
}
