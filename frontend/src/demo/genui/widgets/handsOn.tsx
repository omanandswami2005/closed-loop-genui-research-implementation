// The 15 hands-on manipulatives of lab-ui/1.
import { ArrowDown, ArrowRight, Check, GripVertical, Power, Scale } from "lucide-react";
import { AnimatePresence, motion, Reorder } from "motion/react";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { Chip, fmt, Panel, Readout, shuffled, SliderRow, Slot, usePlacement, useReport } from "../kit";
import type * as T from "../types";
import type { Layout, WidgetProps } from "../types";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function Pool({ ids, label, picked, onPick, placed, empty = "All placed" }: { ids: string[]; label: (id: string) => ReactNode; picked: string | null; onPick: (id: string) => void; placed: Set<string>; empty?: string }) {
  const left = ids.filter((i) => !placed.has(i));
  return (
    <div className="flex min-h-12 flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3" data-testid="chip-pool">
      {left.length ? left.map((id) => <Chip key={id} id={id} label={label(id)} picked={picked === id} onPick={onPick} />) : <span className="text-xs text-slate-500">{empty}</span>}
    </div>
  );
}

// 1 ------------------------------------------------------------------------
export function SequenceSortW({ data, revealed, report }: WidgetProps<T.SequenceSort>) {
  const [order, setOrder] = useState(() => shuffled(data.items, data.items.length * 13));
  const shown = revealed ? data.items : order;
  const correct = shown.every((x, i) => x === data.items[i]);
  const wrong = shown.filter((x, i) => x !== data.items[i]).length;
  useReport(report, { ready: true, correct, feedback: `${wrong} step${wrong === 1 ? " is" : "s are"} out of place.` });
  return (
    <Reorder.Group axis="y" values={shown} onReorder={setOrder} className="space-y-2">
      {shown.map((item, i) => (
        <Reorder.Item key={item} value={item} className="flex cursor-grab items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm active:cursor-grabbing" data-testid="seq-item">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-cyan-400/15 font-mono text-xs text-cyan-200">{i + 1}</span>
          <span className="flex-1">{item}</span>
          <span className="flex flex-col">
            <button type="button" aria-label="move up" className="px-1 text-slate-400 hover:text-white disabled:opacity-20" disabled={i === 0 || revealed} onClick={() => setOrder((o) => { const n = [...o]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>▲</button>
            <button type="button" aria-label="move down" className="px-1 text-slate-400 hover:text-white disabled:opacity-20" disabled={i === shown.length - 1 || revealed} onClick={() => setOrder((o) => { const n = [...o]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>▼</button>
          </span>
          <GripVertical className="size-4 text-slate-500" />
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

// 2 ------------------------------------------------------------------------
export function CategorySortW({ data, revealed, checked, report }: WidgetProps<T.CategorySort>) {
  const items = useMemo(() => shuffled(data.categories.flatMap((c) => c.items), 5), [data]);
  const home = (it: string) => data.categories.find((c) => c.items.includes(it))!.name;
  const [where, setWhere] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const at = revealed ? Object.fromEntries(items.map((i) => [i, home(i)])) : where;
  const wrong = items.filter((i) => at[i] && at[i] !== home(i)).length;
  const ready = items.every((i) => at[i]);
  useReport(report, { ready, correct: ready && wrong === 0, feedback: `${wrong} item${wrong === 1 ? " is" : "s are"} in the wrong group.` });
  const drop = (cat: string, chip?: string) => {
    const c = chip ?? picked;
    if (!c) return;
    setWhere((w) => ({ ...w, [c]: cat }));
    setPicked(null);
  };
  return (
    <div className="space-y-3">
      <Pool ids={items} label={(i) => i} picked={picked} onPick={setPicked} placed={new Set(Object.keys(at))} />
      <div className={cn("grid gap-3", data.categories.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {data.categories.map((c) => (
          <div
            key={c.name}
            role="button"
            tabIndex={0}
            data-slot={c.name}
            onClick={() => drop(c.name)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(c.name, e.dataTransfer.getData("text/plain"))}
            className="min-h-32 rounded-2xl border-2 border-dashed border-white/15 p-3 transition hover:border-cyan-300/50"
          >
            <div className="mb-2 text-sm font-semibold text-cyan-200">{c.name}</div>
            <div className="flex flex-wrap gap-2">
              {items.filter((i) => at[i] === c.name).map((i) => (
                <Chip key={i} id={i} label={i} tone={checked && !revealed ? (home(i) === c.name ? "good" : "bad") : revealed ? "good" : "default"} onPick={() => !revealed && !picked && setWhere((w) => { const n = { ...w }; delete n[i]; return n; })} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 3 ------------------------------------------------------------------------
export function MatchPairsW({ data, revealed, checked, report }: WidgetProps<T.MatchPairs>) {
  const rights = useMemo(() => shuffled(data.pairs.map((p) => p.right), 11), [data]);
  const p = usePlacement(data.pairs.map((x) => x.left));
  const slots = revealed ? Object.fromEntries(data.pairs.map((x) => [x.left, x.right])) : p.slots;
  const ready = data.pairs.every((x) => slots[x.left]);
  const wrong = data.pairs.filter((x) => slots[x.left] && slots[x.left] !== x.right).length;
  useReport(report, { ready, correct: ready && wrong === 0, feedback: `${wrong} pair${wrong === 1 ? " doesn't" : "s don't"} match yet.` });
  return (
    <div className="space-y-3">
      <Pool ids={rights} label={(r) => r} picked={p.picked} onPick={p.setPicked} placed={new Set(Object.values(slots).filter(Boolean) as string[])} />
      <div className="space-y-2">
        {data.pairs.map((x) => (
          <div key={x.left} className="grid items-center gap-2 md:grid-cols-[minmax(0,14rem)_auto_1fr]">
            <div className="rounded-xl bg-blue-500/15 px-3 py-2 text-sm font-semibold text-blue-100">{x.left}</div>
            <ArrowRight className="hidden size-4 text-slate-500 md:block" />
            <Slot id={x.left} filled={!!slots[x.left]} onPlace={(s, c) => !revealed && p.place(s, c ?? p.picked)} tone={checked && slots[x.left] ? (slots[x.left] === x.right ? "good" : "bad") : undefined} placeholder="tap a card, then here">
              {slots[x.left] ?? undefined}
            </Slot>
          </div>
        ))}
      </div>
    </div>
  );
}

// 4 ------------------------------------------------------------------------
export function CycleBuilderW({ data, revealed, checked, report }: WidgetProps<T.CycleBuilder>) {
  const n = data.stages.length;
  const chips = useMemo(() => shuffled(data.stages, 3), [data]);
  const ids = data.stages.map((_, i) => `c${i}`);
  const p = usePlacement(ids, { c0: data.stages[0], ...Object.fromEntries(ids.slice(1).map((i) => [i, null])) });
  const slots = revealed ? Object.fromEntries(ids.map((id, i) => [id, data.stages[i]])) : p.slots;
  const ready = ids.every((i) => slots[i]);
  const correct = ready && ids.every((id, i) => slots[id] === data.stages[i]);
  useReport(report, { ready, correct, feedback: "Follow the cycle clockwise from the first stage: one or more stages are out of order." });
  const R = 140;
  return (
    <div className="space-y-3">
      <Pool ids={chips} label={(c) => c} picked={p.picked} onPick={p.setPicked} placed={new Set(Object.values(slots).filter(Boolean) as string[])} />
      <div className="relative mx-auto h-[360px] w-full max-w-[420px]">
        <svg viewBox="-180 -180 360 360" className="absolute inset-0 size-full">
          <circle r={R} fill="none" stroke="rgba(34,211,238,0.25)" strokeWidth="2" strokeDasharray="6 8">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="30s" repeatCount="indefinite" />
          </circle>
          {ids.map((_, i) => {
            const a = ((i + 0.5) / n) * 2 * Math.PI - Math.PI / 2;
            return <path key={i} d="M-6,-5 L4,0 L-6,5" fill="#22d3ee" transform={`translate(${R * Math.cos(a)},${R * Math.sin(a)}) rotate(${(a * 180) / Math.PI + 90})`} />;
          })}
        </svg>
        <div className="absolute left-1/2 top-1/2 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/30 bg-cyan-400/10 p-3 text-center text-sm font-semibold text-cyan-100">{data.center}</div>
        {ids.map((id, i) => {
          const a = (i / n) * 2 * Math.PI - Math.PI / 2;
          return (
            <div key={id} className="absolute w-32 -translate-x-1/2 -translate-y-1/2" style={{ left: `calc(50% + ${R * Math.cos(a)}px)`, top: `calc(50% + ${R * Math.sin(a)}px)` }}>
              <Slot id={id} filled={!!slots[id]} onPlace={(s, c) => !revealed && i > 0 && p.place(s, c ?? p.picked)} tone={checked && slots[id] ? (slots[id] === data.stages[i] ? "good" : "bad") : undefined} placeholder={`stage ${i + 1}`} className="text-xs">
                {slots[id] ?? undefined}
              </Slot>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 5 ------------------------------------------------------------------------
export function TimelineW({ data, revealed, checked, report }: WidgetProps<T.Timeline>) {
  const sorted = useMemo(() => [...data.events].sort((a, b) => a.value - b.value), [data]);
  const chips = useMemo(() => shuffled(data.events.map((e) => e.label), 9), [data]);
  const ids = sorted.map((_, i) => `t${i}`);
  const p = usePlacement(ids);
  const slots = revealed ? Object.fromEntries(ids.map((id, i) => [id, sorted[i].label])) : p.slots;
  const ready = ids.every((i) => slots[i]);
  const correct = ready && ids.every((id, i) => slots[id] === sorted[i].label);
  useReport(report, { ready, correct, feedback: "Some events are in the wrong place on the timeline." });
  return (
    <div className="space-y-4">
      <Pool ids={chips} label={(c) => c} picked={p.picked} onPick={p.setPicked} placed={new Set(Object.values(slots).filter(Boolean) as string[])} />
      <div className="relative pt-2">
        <div className="absolute left-0 right-0 top-[38px] h-1 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-violet-400" />
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${ids.length}, minmax(0,1fr))` }}>
          {ids.map((id, i) => (
            <div key={id} className="flex flex-col items-center gap-2">
              <span className="text-[11px] text-slate-500">{i === 0 ? "earliest" : i === ids.length - 1 ? "latest" : " "}</span>
              <span className="z-10 size-4 rounded-full border-2 border-[#060a13] bg-cyan-300" />
              <Slot id={id} filled={!!slots[id]} onPlace={(s, c) => !revealed && p.place(s, c ?? p.picked)} className="w-full text-xs" tone={checked && slots[id] ? (slots[id] === sorted[i].label ? "good" : "bad") : undefined}>
                {slots[id] ?? undefined}
              </Slot>
              {(revealed || (checked && correct)) && <span className="font-mono text-xs text-cyan-200">{sorted[i].display} {data.unit}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// diagram layouts shared by LabelDiagram and ExploreDiagram -----------------
function Diagram({ layout, center, cells }: { layout: Layout; center: string; cells: ReactNode[] }) {
  if (layout === "flow")
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {cells.map((c, i) => (
          <Fragment key={i}>
            <div className="w-40">{c}</div>
            {i < cells.length - 1 && <ArrowRight className="size-5 shrink-0 text-cyan-300" />}
          </Fragment>
        ))}
      </div>
    );
  if (layout === "layers")
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-1.5">
        {cells.map((c, i) => (
          <Fragment key={i}>
            <div className="w-full" style={{ maxWidth: `${100 - i * 6}%` }}>{c}</div>
            {i < cells.length - 1 && <ArrowDown className="size-4 text-cyan-300/60" />}
          </Fragment>
        ))}
      </div>
    );
  const n = cells.length;
  const R = layout === "hub" ? 150 : 140;
  return (
    <div className="relative mx-auto h-[380px] w-full max-w-[520px]">
      <svg viewBox="-260 -190 520 380" className="absolute inset-0 size-full">
        {layout === "cycle" ? (
          <circle r={R} fill="none" stroke="rgba(34,211,238,0.3)" strokeWidth="2" strokeDasharray="5 7" />
        ) : (
          cells.map((_, i) => {
            const a = (i / n) * 2 * Math.PI - Math.PI / 2;
            return <line key={i} x1={0} y1={0} x2={R * 1.25 * Math.cos(a)} y2={R * Math.sin(a)} stroke="rgba(34,211,238,0.3)" strokeWidth="2" />;
          })
        )}
      </svg>
      {center && <div className="absolute left-1/2 top-1/2 z-10 w-36 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-cyan-400/40 bg-[#07101f] p-3 text-center text-sm font-semibold text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.25)]">{center}</div>}
      {cells.map((c, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        return (
          <div key={i} className="absolute z-10 w-40 -translate-x-1/2 -translate-y-1/2" style={{ left: `calc(50% + ${R * 1.25 * Math.cos(a)}px)`, top: `calc(50% + ${R * Math.sin(a)}px)` }}>
            {c}
          </div>
        );
      })}
    </div>
  );
}

// 6 ------------------------------------------------------------------------
export function LabelDiagramW({ data, revealed, checked, report }: WidgetProps<T.LabelDiagram>) {
  const chips = useMemo(() => shuffled(data.parts.map((x) => x.label), 4), [data]);
  const ids = data.parts.map((_, i) => `d${i}`);
  const p = usePlacement(ids);
  const slots = revealed ? Object.fromEntries(ids.map((id, i) => [id, data.parts[i].label])) : p.slots;
  const ready = ids.every((i) => slots[i]);
  const wrong = ids.filter((id, i) => slots[id] && slots[id] !== data.parts[i].label).length;
  useReport(report, { ready, correct: ready && wrong === 0, feedback: `${wrong} label${wrong === 1 ? " is" : "s are"} on the wrong part.` });
  return (
    <div className="space-y-4">
      <Pool ids={chips} label={(c) => c} picked={p.picked} onPick={p.setPicked} placed={new Set(Object.values(slots).filter(Boolean) as string[])} />
      <Diagram
        layout={data.layout}
        center={data.center}
        cells={data.parts.map((part, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-[#0b1324] p-2">
            <p className="mb-1.5 text-[11px] leading-snug text-slate-400">{part.clue}</p>
            <Slot id={ids[i]} filled={!!slots[ids[i]]} onPlace={(s, c) => !revealed && p.place(s, c ?? p.picked)} className="text-xs" tone={checked && slots[ids[i]] ? (slots[ids[i]] === part.label ? "good" : "bad") : undefined} placeholder="label">
              {slots[ids[i]] ? <b className="text-white">{slots[ids[i]]}</b> : undefined}
            </Slot>
          </div>
        ))}
      />
    </div>
  );
}

// 7 ------------------------------------------------------------------------
export function BalanceScaleW({ data, revealed, report }: WidgetProps<T.BalanceScale>) {
  const [on, setOn] = useState<number[]>([]);
  const right = revealed ? data.answer : on;
  const lhs = data.left.reduce((s, w) => s + w.value, 0);
  const rhs = right.reduce((s, i) => s + data.tray[i].value, 0);
  const diff = rhs - lhs;
  const tilt = Math.max(-14, Math.min(14, (diff / Math.max(lhs, 1)) * 30));
  const balanced = Math.abs(diff) <= 1e-6 * Math.max(1, lhs);
  useReport(report, { ready: right.length > 0, correct: balanced, feedback: diff > 0 ? "The right pan is too heavy." : "The right pan is too light." });
  const pan = (items: { label: string; value: number }[], color: string) => (
    <div className="flex min-h-14 w-44 flex-wrap items-end justify-center gap-1">
      <AnimatePresence>
        {items.map((w, i) => (
          <motion.span key={w.label + i} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} className="rounded-md px-2 py-1 text-xs font-semibold text-white" style={{ background: color }}>
            {w.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
  return (
    <div className="space-y-4">
      <Panel className="flex flex-col items-center">
        <motion.div animate={{ rotate: tilt }} transition={{ type: "spring", stiffness: 60, damping: 9 }} className="flex w-full max-w-md origin-center items-end justify-between">
          {pan(data.left, "#2563eb")}
          {pan(right.map((i) => data.tray[i]), "#0891b2")}
        </motion.div>
        <motion.div animate={{ rotate: tilt }} transition={{ type: "spring", stiffness: 60, damping: 9 }} className="h-1.5 w-full max-w-md rounded-full bg-slate-300" />
        <div className="h-16 w-2 bg-slate-400" />
        <div className="h-2 w-32 rounded-full bg-slate-500" />
        <div className={cn("mt-3 flex items-center gap-2 text-sm", balanced ? "text-emerald-300" : "text-slate-400")}>
          <Scale className="size-4" /> {balanced ? "Balanced!" : diff > 0 ? "Right side heavier" : "Left side heavier"}
        </div>
      </Panel>
      <div className="flex flex-wrap gap-2">
        {data.tray.map((w, i) => (
          <button key={i} type="button" disabled={revealed} data-testid={`tray-${i}`} onClick={() => setOn((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]))} className={cn("rounded-xl border px-3 py-2 text-sm transition", right.includes(i) ? "border-cyan-300 bg-cyan-400/20 text-white" : "border-white/15 bg-white/[0.05] text-slate-200 hover:border-white/30")}>
            {w.label} <span className="ml-1 font-mono text-xs text-slate-400">{fmt(w.value)} {data.unit}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">Left pan: {data.left.map((w) => `${w.label} (${fmt(w.value)} ${data.unit})`).join(" + ")}</p>
    </div>
  );
}

// 8 ------------------------------------------------------------------------
export function NumberLineW({ data, revealed, checked, report }: WidgetProps<T.NumberLine>) {
  const tol = Math.max(data.step, (data.max - data.min) * 0.03);
  const [pos, setPos] = useState(() => data.markers.map(() => data.min));
  const at = revealed ? data.markers.map((m) => m.value) : pos;
  const ok = data.markers.map((m, i) => Math.abs(at[i] - m.value) <= tol);
  const moved = pos.some((v) => v !== data.min);
  useReport(report, { ready: moved || revealed, correct: ok.every(Boolean), feedback: `${ok.filter((x) => !x).length} marker(s) are not close enough yet.` });
  const pct = (v: number) => ((v - data.min) / (data.max - data.min)) * 100;
  const colors = ["#22d3ee", "#a78bfa", "#f59e0b", "#34d399"];
  return (
    <div className="space-y-5">
      <div className="relative mx-2 mt-10 h-12">
        <div className="absolute inset-x-0 top-5 h-1 rounded-full bg-white/25" />
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} className="absolute top-3 flex -translate-x-1/2 flex-col items-center" style={{ left: `${i * 10}%` }}>
            <span className="h-5 w-px bg-white/30" />
            <span className="mt-1 font-mono text-[10px] text-slate-500">{fmt(data.min + ((data.max - data.min) * i) / 10, 2)}</span>
          </div>
        ))}
        {data.markers.map((m, i) => (
          <motion.div key={m.label} animate={{ left: `${pct(at[i])}%` }} className="absolute -top-8 -translate-x-1/2" style={{ left: `${pct(at[i])}%` }}>
            <div className={cn("whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold text-[#060a13]", checked && !ok[i] && "ring-2 ring-rose-400")} style={{ background: colors[i] }}>{m.label}</div>
            <div className="mx-auto h-6 w-0.5" style={{ background: colors[i] }} />
          </motion.div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data.markers.map((m, i) => (
          <SliderRow key={m.label} label={m.label} value={at[i]} min={data.min} max={data.max} step={data.step} unit={data.unit} color={colors[i]} onChange={(v) => setPos((p) => p.map((x, j) => (j === i ? v : x)))} />
        ))}
      </div>
    </div>
  );
}

// 9 ------------------------------------------------------------------------
export function CauseEffectW({ data, revealed, checked, report }: WidgetProps<T.CauseEffect>) {
  const effects = useMemo(() => shuffled(data.links.map((l) => l.effect), 2), [data]);
  const [from, setFrom] = useState<number | null>(null);
  const [map, setMap] = useState<Record<number, number>>({});
  const m = revealed ? Object.fromEntries(data.links.map((l, i) => [i, effects.indexOf(l.effect)])) : map;
  const ready = data.links.every((_, i) => m[i] !== undefined);
  const wrong = data.links.filter((l, i) => m[i] !== undefined && effects[m[i]] !== l.effect).length;
  useReport(report, { ready, correct: ready && wrong === 0, feedback: `${wrong} arrow${wrong === 1 ? " points" : "s point"} to the wrong effect.` });
  const H = 58;
  const colors = ["#22d3ee", "#a78bfa", "#f59e0b", "#34d399", "#f472b6"];
  return (
    <div className="relative grid grid-cols-[1fr_5rem_1fr] gap-y-2">
      <svg className="pointer-events-none absolute inset-0 col-start-2 h-full w-full" style={{ gridColumn: 2 }} viewBox={`0 0 80 ${data.links.length * H}`} preserveAspectRatio="none">
        {Object.entries(m).map(([c, e]) => (
          <motion.path key={c} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} d={`M0,${+c * H + H / 2} C40,${+c * H + H / 2} 40,${e * H + H / 2} 80,${e * H + H / 2}`} stroke={checked && effects[e] !== data.links[+c].effect ? "#fb7185" : colors[+c % 5]} strokeWidth="3" fill="none" />
        ))}
      </svg>
      {data.links.map((l, i) => (
        <Fragment key={i}>
          <button type="button" disabled={revealed} data-testid={`cause-${i}`} onClick={() => setFrom(i)} className={cn("col-start-1 flex items-center rounded-xl border px-3 text-left text-sm", from === i ? "border-cyan-300 bg-cyan-400/15" : "border-white/10 bg-white/[0.04]")} style={{ height: H - 8, gridRow: i + 1, borderLeft: `4px solid ${colors[i % 5]}` }}>
            {l.cause}
          </button>
          <button type="button" disabled={revealed} data-testid={`effect-${i}`} onClick={() => { if (from !== null) { setMap((mm) => { const n = Object.fromEntries(Object.entries(mm).filter(([, v]) => v !== i)); return { ...n, [from]: i }; }); setFrom(null); } }} className="col-start-3 flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-left text-sm hover:border-white/30" style={{ height: H - 8, gridRow: i + 1 }}>
            {effects[i]}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

// 10 -----------------------------------------------------------------------
export function ClozeBankW({ data, revealed, checked, report }: WidgetProps<T.ClozeBank>) {
  const parts = useMemo(() => data.text.split(/(\[\[[^\]]+\]\])/g), [data]);
  const answers = parts.filter((x) => x.startsWith("[[")).map((x) => x.slice(2, -2));
  const bank = useMemo(() => shuffled([...answers, ...data.distractors], 6), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const ids = answers.map((_, i) => `g${i}`);
  const p = usePlacement(ids);
  const slots = revealed ? Object.fromEntries(ids.map((id, i) => [id, answers[i]])) : p.slots;
  const ready = ids.every((i) => slots[i]);
  const wrong = ids.filter((id, i) => slots[id] && !same(slots[id]!, answers[i])).length;
  useReport(report, { ready, correct: ready && wrong === 0, feedback: `${wrong} gap${wrong === 1 ? " has" : "s have"} the wrong word.` });
  let g = -1;
  return (
    <div className="space-y-4">
      <Pool ids={bank} label={(w) => w} picked={p.picked} onPick={p.setPicked} placed={new Set(Object.values(slots).filter(Boolean) as string[])} empty="Bank empty" />
      <Panel className="text-[15px] leading-[2.6] text-slate-200">
        {parts.map((part, i) => {
          if (!part.startsWith("[[")) return <span key={i}>{part}</span>;
          g += 1;
          const id = ids[g];
          const k = g;
          return (
            <span key={i} className="mx-1 inline-block min-w-24 align-middle">
              <Slot id={id} filled={!!slots[id]} onPlace={(s, c) => !revealed && p.place(s, c ?? p.picked)} className="min-h-8 py-0.5 text-sm" tone={checked && slots[id] ? (same(slots[id]!, answers[k]) ? "good" : "bad") : undefined} placeholder="____">
                {slots[id] ? <b className="text-white">{slots[id]}</b> : undefined}
              </Slot>
            </span>
          );
        })}
      </Panel>
    </div>
  );
}

// 11 -----------------------------------------------------------------------
const SEG = ["#3b82f6", "#22d3ee", "#a78bfa", "#f59e0b", "#34d399"];
export function ProportionBarW({ data, revealed, checked, report }: WidgetProps<T.ProportionBar>) {
  const n = data.segments.length;
  const [cuts, setCuts] = useState(() => Array.from({ length: n - 1 }, (_, i) => Math.round(((i + 1) * 100) / n)));
  const truth = data.segments.reduce<number[]>((acc, s, i) => (i < n - 1 ? [...acc, (acc.at(-1) ?? 0) + s.value] : acc), []);
  const c = revealed ? truth : cuts;
  const widths = [...c, 100].map((v, i) => v - (i ? c[i - 1] : 0));
  const ok = widths.map((w, i) => Math.abs(w - data.segments[i].value) <= data.tolerance);
  const moved = cuts.some((v, i) => v !== Math.round(((i + 1) * 100) / n));
  useReport(report, { ready: moved || revealed, correct: ok.every(Boolean), feedback: `${ok.filter((x) => !x).length} part(s) are more than ${data.tolerance} points off.` });
  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-400">{data.whole}</div>
      <div className="flex h-14 overflow-hidden rounded-2xl border border-white/10">
        {widths.map((w, i) => (
          <motion.div key={i} animate={{ width: `${w}%` }} className={cn("flex items-center justify-center overflow-hidden text-xs font-semibold text-[#060a13]", checked && !ok[i] && "outline outline-2 outline-rose-400")} style={{ background: SEG[i] }}>
            {w > 8 && `${data.segments[i].label} ${Math.round(w)}%`}
          </motion.div>
        ))}
      </div>
      {(revealed || (checked && ok.every(Boolean))) && (
        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
          {data.segments.map((s, i) => <span key={i} className="rounded-md px-2 py-1" style={{ background: `${SEG[i]}33` }}>{s.label}: {s.value}%</span>)}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {cuts.map((_, i) => (
          <SliderRow key={i} label={`Divider ${data.segments[i].label} | ${data.segments[i + 1].label}`} value={c[i]} min={0} max={100} step={1} unit="%" color={SEG[i]} onChange={(nv) => setCuts((old) => old.map((x, j) => (j === i ? Math.min(Math.max(nv, j ? old[j - 1] + 1 : 1), j < old.length - 1 ? old[j + 1] - 1 : 99) : x)))} />
        ))}
      </div>
    </div>
  );
}

// 12 -----------------------------------------------------------------------
export function ForceArrowsW({ data, revealed, report }: WidgetProps<T.ForceArrows>) {
  const [mag, setMag] = useState(() => data.forces.map((f) => f.value));
  const m = revealed ? data.answer : mag;
  const dir = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] } as const;
  const nx = data.forces.reduce((s, f, i) => s + (f.direction === "right" ? m[i] : f.direction === "left" ? -m[i] : 0), 0);
  const ny = data.forces.reduce((s, f, i) => s + (f.direction === "up" ? m[i] : f.direction === "down" ? -m[i] : 0), 0);
  const okk = Math.abs(nx - data.target_x) <= data.step / 2 && Math.abs(ny - data.target_y) <= data.step / 2;
  const maxF = Math.max(...data.forces.map((f) => f.max), 1);
  useReport(report, { ready: true, correct: okk, feedback: `Net force is (${fmt(nx)}, ${fmt(ny)}) ${data.unit}; the goal is (${fmt(data.target_x)}, ${fmt(data.target_y)}).` });
  const colors = ["#22d3ee", "#a78bfa", "#f59e0b", "#34d399"];
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
      <Panel>
        <svg viewBox="-200 -150 400 300" className="w-full">
          <defs>{colors.map((c, i) => <marker key={i} id={`fa${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10z" fill={c} /></marker>)}</defs>
          <motion.rect animate={{ x: -40 + Math.max(-60, Math.min(60, nx * 3)), y: -30 - Math.max(-40, Math.min(40, ny * 3)) }} width="80" height="60" rx="10" fill="#1e293b" stroke="#475569" />
          <text x="0" y="5" textAnchor="middle" fill="#e2e8f0" fontSize="13">{data.object}</text>
          {data.forces.map((f, i) => {
            const [dx, dy] = dir[f.direction];
            const len = 20 + (m[i] / maxF) * 100;
            const sx = dx * 42;
            const sy = dy * 32;
            return (
              <g key={i}>
                <line x1={sx} y1={sy} x2={sx + dx * len} y2={sy + dy * len} stroke={colors[i]} strokeWidth="5" markerEnd={`url(#fa${i})`} />
                <text x={sx + dx * (len + 14)} y={sy + dy * (len + 14) + 4} textAnchor="middle" fill={colors[i]} fontSize="11">{f.label} {fmt(m[i])}{data.unit}</text>
              </g>
            );
          })}
        </svg>
      </Panel>
      <div className="space-y-3">
        {data.forces.map((f, i) =>
          f.adjustable ? (
            <SliderRow key={i} label={`${f.label} (${f.direction})`} value={m[i]} min={0} max={f.max} step={data.step} unit={data.unit} color={colors[i]} onChange={(v) => setMag((o) => o.map((x, j) => (j === i ? v : x)))} />
          ) : (
            <div key={i} className="text-sm text-slate-400">{f.label}: fixed at {fmt(f.value)} {data.unit} ({f.direction})</div>
          ),
        )}
        <Readout label="Net force (x, y)" value={`${fmt(nx)}, ${fmt(ny)}`} unit={data.unit} tone={okk ? "good" : undefined} />
      </div>
    </div>
  );
}

// 13 -----------------------------------------------------------------------
export function MixerW({ data, revealed, report }: WidgetProps<T.Mixer>) {
  const [amt, setAmt] = useState(() => data.ingredients.map(() => 0));
  const a = revealed ? data.ingredients.map((i) => i.answer) : amt;
  const ratios = a.map((v, i) => v / data.ingredients[i].answer);
  const k = ratios[0];
  const ok = k > 0 && ratios.every((r) => Math.abs(r - k) <= 0.05 * k);
  const total = a.reduce((s, v, i) => s + v / data.ingredients[i].max, 0) || 1;
  useReport(report, { ready: a.every((v) => v > 0), correct: ok, feedback: "The amounts are not in the right ratio yet." });
  return (
    <div className="grid gap-5 md:grid-cols-[12rem_1fr]">
      <div className="flex flex-col items-center">
        <div className="relative flex h-56 w-36 flex-col-reverse overflow-hidden rounded-b-[2rem] rounded-t-md border-2 border-white/25 bg-white/[0.02]">
          {a.map((v, i) => (
            <motion.div key={i} animate={{ height: `${((v / data.ingredients[i].max) / Math.max(total, 1)) * 100 * Math.min(1, total / data.ingredients.length + 0.4)}%` }} style={{ background: SEG[i] }} className="opacity-80" />
          ))}
          {ok && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center bg-emerald-500/30 text-center text-sm font-semibold text-white">{data.product}</motion.div>}
        </div>
        <span className="mt-2 text-xs text-slate-400">{ok ? "Reaction complete" : "Mix the ingredients"}</span>
      </div>
      <div className="space-y-3">
        {data.ingredients.map((ing, i) => (
          <SliderRow key={i} label={ing.label} value={a[i]} min={0} max={ing.max} step={ing.step} unit={ing.unit} color={SEG[i]} onChange={(v) => setAmt((o) => o.map((x, j) => (j === i ? v : x)))} />
        ))}
        <p className="text-xs text-slate-500">Product: {data.product}</p>
      </div>
    </div>
  );
}

// 14 -----------------------------------------------------------------------
export function ToggleSystemW({ data, revealed, report }: WidgetProps<T.ToggleSystem>) {
  const target = data.outcomes.find((o) => o.result === data.target_result)!;
  const [on, setOn] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const state = revealed ? target.on : on;
  const result = data.outcomes.find((o) => o.on.length === state.length && o.on.every((s) => state.includes(s)))?.result ?? data.default_result;
  const ok = result === data.target_result;
  useReport(report, { ready: log.length > 0 || revealed, correct: ok, feedback: `This setting gives "${result}", not the target.` });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        {data.switches.map((s) => {
          const active = state.includes(s);
          return (
            <button key={s} type="button" role="switch" aria-checked={active} disabled={revealed} data-testid={`switch-${s}`} onClick={() => { const next = active ? on.filter((x) => x !== s) : [...on, s]; setOn(next); setLog((l) => [...l.slice(-5), next.length ? next.join(" + ") : "all off"]); }} className={cn("flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition", active ? "border-cyan-300/60 bg-cyan-400/10" : "border-white/10 bg-white/[0.03]")}>
              <span className="flex items-center gap-2"><Power className={cn("size-4", active ? "text-cyan-300" : "text-slate-500")} /> {s}</span>
              <span className={cn("relative h-6 w-11 rounded-full transition", active ? "bg-cyan-400" : "bg-white/15")}><motion.span animate={{ x: active ? 22 : 2 }} className="absolute top-1 size-4 rounded-full bg-white" /></span>
            </button>
          );
        })}
      </div>
      <div className="space-y-3">
        <motion.div key={result} initial={{ scale: 0.95, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className={cn("rounded-2xl border p-5 text-center", ok ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]")}>
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Result</div>
          <div className="mt-1 text-lg font-semibold text-white">{result}</div>
        </motion.div>
        <div className="text-xs text-slate-500">Target: <b className="text-slate-300">{data.target_result}</b></div>
        {log.length > 0 && <div className="text-xs text-slate-500">Tried: {log.join(" · ")}</div>}
      </div>
    </div>
  );
}

// 15 -----------------------------------------------------------------------
export function ExploreDiagramW({ data, revealed, report }: WidgetProps<T.ExploreDiagram>) {
  const [open, setOpen] = useState<number | null>(null);
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const all = revealed || seen.size === data.parts.length;
  useReport(report, { ready: all, correct: all, auto: true });
  return (
    <div className="space-y-4">
      <Diagram
        layout={data.layout}
        center={data.center}
        cells={data.parts.map((p, i) => (
          <button key={i} type="button" data-testid={`part-${i}`} onClick={() => { setOpen(i); setSeen((s) => new Set(s).add(i)); }} className={cn("w-full rounded-xl border px-3 py-2.5 text-sm font-semibold transition", open === i ? "border-cyan-300 bg-cyan-400/20 text-white" : seen.has(i) ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" : "border-white/15 bg-[#0b1324] text-slate-200 hover:border-white/30")}>
            {seen.has(i) && <Check className="mr-1 inline size-3.5" />}
            {p.label}
          </button>
        ))}
      />
      <AnimatePresence mode="wait">
        {open !== null && (
          <motion.div key={open} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.06] p-4 text-sm text-slate-200">
            <b className="text-cyan-200">{data.parts[open].label}: </b>
            {data.parts[open].detail}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="text-xs text-slate-500">{seen.size}/{data.parts.length} explored</div>
    </div>
  );
}
