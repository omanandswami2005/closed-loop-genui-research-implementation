// The 15 interactive simulations and explorables of lab-ui/1.
import { Check, FlaskConical, Pause, Play, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { compile } from "../expr";
import { Axes, fmt, linePath, Panel, PLOT, Readout, shuffled, SliderRow, Slot, usePlacement, useReport, useScale } from "../kit";
import type * as T from "../types";
import type { Param, WidgetProps } from "../types";

const C = ["#22d3ee", "#a78bfa", "#f59e0b", "#34d399"];
const { w: W, h: H, l: L, r: R, t: TOP, b: B } = PLOT;

function useParams(params: Param[], revealed: boolean) {
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(params.map((p) => [p.name, p.value])));
  const v = revealed ? Object.fromEntries(params.map((p) => [p.name, p.answer])) : vals;
  const set = (name: string, x: number) => setVals((o) => ({ ...o, [name]: x }));
  const moved = params.some((p) => vals[p.name] !== p.value);
  return { v, set, moved };
}

function ParamSliders({ params, v, set }: { params: Param[]; v: Record<string, number>; set: (n: string, x: number) => void }) {
  return (
    <div className="space-y-3">
      {params.map((p, i) => (
        <SliderRow key={p.name} label={p.label} value={v[p.name]} min={p.min} max={p.max} step={p.step} unit={p.unit} color={C[i % 4]} onChange={(x) => set(p.name, x)} testId={`param-${p.name}`} />
      ))}
    </div>
  );
}

function sampleXY(f: (x: number) => number, lo: number, hi: number, n = 120): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const x = lo + ((hi - lo) * i) / (n - 1);
    return [x, f(x)] as [number, number];
  });
}

function extent(ys: number[], pad = 0.08): [number, number] {
  const f = ys.filter(Number.isFinite);
  if (!f.length) return [0, 1];
  let lo = Math.min(...f);
  let hi = Math.max(...f);
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
  const d = (hi - lo) * pad;
  return [lo - d, hi + d];
}

// 16 -----------------------------------------------------------------------
export function ParameterLabW({ data, revealed, report }: WidgetProps<T.ParameterLab>) {
  const f = useMemo(() => compile(data.expression), [data.expression]);
  const { v, set, moved } = useParams(data.params, revealed);
  const out = f(v);
  const ok = Math.abs(out - data.target) <= data.tolerance;
  useReport(report, { ready: moved || revealed, correct: ok, feedback: `The ${data.output_label} is ${fmt(out)} ${data.output_unit}; the target is ${fmt(data.target)}.` });
  const p0 = data.params[0];
  const sweep = useMemo(() => sampleXY((x) => f({ ...v, [p0.name]: x }), p0.min, p0.max, 80), [f, v, p0]);
  const x = useScale([p0.min, p0.max], [L, W - R]);
  const y = useScale(extent([...sweep.map((s) => s[1]), data.target]), [H - B, TOP]);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_17rem]">
      <Panel>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <Axes x={x} y={y} xLabel={p0.label} yLabel={data.output_label} />
          <line x1={L} x2={W - R} y1={y(data.target)} y2={y(data.target)} stroke="#f59e0b" strokeDasharray="6 5" />
          <text x={W - R - 4} y={y(data.target) - 6} textAnchor="end" fill="#f59e0b" fontSize="11">target {fmt(data.target)}</text>
          <path d={linePath(sweep.map(([a, b]) => [x(a), y(b)]))} stroke="#22d3ee" strokeWidth="2.5" fill="none" />
          <motion.circle initial={false} cx={x(v[p0.name])} cy={y(out)} animate={{ cx: x(v[p0.name]), cy: y(out) }} r="7" fill={ok ? "#34d399" : "#fff"} stroke="#0f172a" strokeWidth="2" />
        </svg>
      </Panel>
      <div className="space-y-3">
        <ParamSliders params={data.params} v={v} set={set} />
        <Readout label={data.output_label} value={fmt(out)} unit={data.output_unit} tone={ok ? "good" : undefined} />
        <div className="font-mono text-xs text-slate-500">{data.output_label} = {data.expression}</div>
      </div>
    </div>
  );
}

// 17 -----------------------------------------------------------------------
export function FunctionPlotW({ data, revealed, report }: WidgetProps<T.FunctionPlot>) {
  const f = useMemo(() => compile(data.expression), [data.expression]);
  const { v, set, moved } = useParams(data.params, revealed);
  const target = useMemo(() => sampleXY((x) => f({ ...Object.fromEntries(data.params.map((p) => [p.name, p.answer])), x }), data.x_min, data.x_max), [f, data]);
  const mine = sampleXY((x) => f({ ...v, x }), data.x_min, data.x_max);
  const [y0, y1] = extent([...target.map((p) => p[1]), ...mine.map((p) => p[1])]);
  const span = Math.max(...target.map((p) => p[1])) - Math.min(...target.map((p) => p[1])) || 1;
  const diff = Math.max(...mine.map((p, i) => Math.abs(p[1] - target[i][1])));
  const ok = diff <= 0.04 * span + 1e-9;
  useReport(report, { ready: moved || revealed, correct: ok, feedback: "Your curve doesn't sit on the dashed target curve yet." });
  const x = useScale([data.x_min, data.x_max], [L, W - R]);
  const y = useScale([y0, y1], [H - B, TOP]);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
      <Panel>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <Axes x={x} y={y} xLabel={data.x_label} yLabel={data.y_label} />
          <path d={linePath(target.map(([a, b]) => [x(a), y(b)]))} stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="7 6" fill="none" />
          <path d={linePath(mine.map(([a, b]) => [x(a), y(b)]))} stroke={ok ? "#34d399" : "#22d3ee"} strokeWidth="3" fill="none" />
        </svg>
        <div className="mt-1 flex gap-4 text-xs text-slate-400"><span className="text-amber-400">- - target</span><span className="text-cyan-300">— yours</span></div>
      </Panel>
      <div className="space-y-3">
        <ParamSliders params={data.params} v={v} set={set} />
        <div className="font-mono text-xs text-slate-500">y = {data.expression}</div>
      </div>
    </div>
  );
}

// 18 -----------------------------------------------------------------------
export function ProjectileW({ data, revealed, report }: WidgetProps<T.Projectile>) {
  const [speed, setSpeed] = useState(data.speed.value);
  const [angle, setAngle] = useState(data.angle.value);
  const [shot, setShot] = useState<{ v: number; a: number; key: number } | null>(null);
  const [t, setT] = useState(1);
  const v = revealed ? data.speed.answer : speed;
  const a = revealed ? data.angle.answer : angle;
  const range = (sv: number, sa: number) => (sv * sv * Math.sin((2 * sa * Math.PI) / 180)) / data.gravity;
  const maxRange = Math.max((data.speed.max ** 2) / data.gravity, data.target_distance * 1.3);
  const landed = shot ? range(shot.v, shot.a) : null;
  const ok = landed !== null && Math.abs(landed - data.target_distance) <= data.tolerance;
  useReport(report, { ready: shot !== null, correct: ok, feedback: `It landed at ${fmt(landed ?? 0)} m; the target is at ${fmt(data.target_distance)} m.` });
  useEffect(() => {
    if (!shot) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 1400);
      setT(k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [shot]);
  useEffect(() => {
    if (revealed) setShot({ v: data.speed.answer, a: data.angle.answer, key: Date.now() });
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps
  const peak = (data.speed.max ** 2) / (2 * data.gravity);
  const x = useScale([0, maxRange], [30, W - 20]);
  const y = useScale([0, Math.min(peak, maxRange * 0.7)], [H - 30, 20]);
  const path = shot
    ? sampleXY((tt) => tt, 0, 1, 60).map(([k]) => {
        const T = (2 * shot.v * Math.sin((shot.a * Math.PI) / 180)) / data.gravity;
        const tt = k * T * t;
        return [x(shot.v * Math.cos((shot.a * Math.PI) / 180) * tt), y(shot.v * Math.sin((shot.a * Math.PI) / 180) * tt - 0.5 * data.gravity * tt * tt)] as [number, number];
      })
    : [];
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
      <Panel>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <rect x="0" y={H - 30} width={W} height="30" fill="#0f2a1d" />
          <rect x={x(data.target_distance - data.tolerance)} y={H - 32} width={Math.max(4, x(data.target_distance + data.tolerance) - x(data.target_distance - data.tolerance))} height="6" fill="#f59e0b" />
          <line x1={x(data.target_distance)} x2={x(data.target_distance)} y1={H - 30} y2={H - 70} stroke="#f59e0b" strokeWidth="2" />
          <path d={`M${x(data.target_distance)},${H - 70} l18,6 l-18,6z`} fill="#f59e0b" />
          <line x1={30} y1={H - 30} x2={30 + 40 * Math.cos((a * Math.PI) / 180)} y2={H - 30 - 40 * Math.sin((a * Math.PI) / 180)} stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
          {path.length > 0 && <path d={linePath(path)} stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeDasharray="4 4" />}
          {path.length > 0 && <circle cx={path.at(-1)![0]} cy={path.at(-1)![1]} r="7" fill={ok && t >= 1 ? "#34d399" : "#fff"} />}
          <text x={W - 20} y={H - 10} textAnchor="end" fill="#64748b" fontSize="11">distance (m)</text>
        </svg>
      </Panel>
      <div className="space-y-3">
        <SliderRow label="Launch speed" value={v} min={data.speed.min} max={data.speed.max} unit="m/s" onChange={setSpeed} />
        <SliderRow label="Launch angle" value={a} min={data.angle.min} max={data.angle.max} unit="°" color="#a78bfa" onChange={setAngle} />
        <button type="button" data-testid="launch" onClick={() => setShot({ v, a, key: Date.now() })} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-2.5 text-sm font-semibold text-[#060a13] hover:bg-cyan-400">
          <Play className="size-4" /> Launch
        </button>
        {landed !== null && <Readout label="Landed at" value={fmt(landed)} unit="m" tone={ok ? "good" : "bad"} />}
      </div>
    </div>
  );
}

// 19 -----------------------------------------------------------------------
export function PendulumW({ data, revealed, report }: WidgetProps<T.Pendulum>) {
  const [len, setLen] = useState(data.length.value);
  const L0 = revealed ? data.length.answer : len;
  const period = 2 * Math.PI * Math.sqrt(L0 / data.gravity);
  const ok = Math.abs(period - data.target_period) <= data.tolerance;
  useReport(report, { ready: len !== data.length.value || revealed, correct: ok, feedback: `The period is ${fmt(period)} s; the target is ${fmt(data.target_period)} s.` });
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      setPhase(((now - t0) / 1000) * ((2 * Math.PI) / period));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [period]);
  const px = 220 * (L0 / data.length.max);
  const ang = 0.45 * Math.sin(phase);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
      <Panel className="flex justify-center">
        <svg viewBox="-150 -10 300 270" className="h-72">
          <line x1="-80" x2="80" y1="0" y2="0" stroke="#64748b" strokeWidth="4" />
          <line x1="0" y1="0" x2={px * Math.sin(ang)} y2={px * Math.cos(ang)} stroke="#cbd5e1" strokeWidth="2" />
          <circle cx={px * Math.sin(ang)} cy={px * Math.cos(ang)} r="14" fill={ok ? "#34d399" : "#22d3ee"} />
          <path d={`M${-px * 0.43},${px * 0.9} A${px},${px} 0 0 0 ${px * 0.43},${px * 0.9}`} stroke="rgba(255,255,255,0.12)" fill="none" strokeDasharray="4 5" />
        </svg>
      </Panel>
      <div className="space-y-3">
        <SliderRow label="String length" value={L0} min={data.length.min} max={data.length.max} unit="m" onChange={setLen} />
        <Readout label="Period (one full swing)" value={fmt(period)} unit="s" tone={ok ? "good" : undefined} />
        <div className="text-xs text-slate-500">Target: {fmt(data.target_period)} s · g = {data.gravity} m/s²</div>
      </div>
    </div>
  );
}

// 20 -----------------------------------------------------------------------
export function WaveExplorerW({ data, revealed, report }: WidgetProps<T.WaveExplorer>) {
  const [amp, setAmp] = useState(data.amplitude.value);
  const [freq, setFreq] = useState(data.frequency.value);
  const [ph, setPh] = useState(data.phase.value);
  const A = revealed ? data.amplitude.answer : amp;
  const F = revealed ? data.frequency.answer : freq;
  const P = revealed ? data.phase.answer : ph;
  const xmax = 2 / Math.max(data.frequency.min, 0.1);
  const wave = (a: number, f: number, p: number) => sampleXY((x) => a * Math.sin(2 * Math.PI * f * x + (p * Math.PI) / 180), 0, xmax, 200);
  const target = wave(data.amplitude.answer, data.frequency.answer, data.phase.answer);
  const mine = wave(A, F, P);
  const top = Math.max(data.amplitude.max, 0.1) * 1.1;
  const diff = Math.max(...mine.map((p, i) => Math.abs(p[1] - target[i][1])));
  const ok = diff <= 0.08 * top;
  useReport(report, { ready: amp !== data.amplitude.value || freq !== data.frequency.value || ph !== data.phase.value || revealed, correct: ok, feedback: "Your wave doesn't line up with the dashed target wave yet." });
  const x = useScale([0, xmax], [L, W - R]);
  const y = useScale([-top, top], [H - B, TOP]);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
      <Panel>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <Axes x={x} y={y} xLabel={data.x_label} yLabel={data.y_label} />
          <path d={linePath(target.map(([a, b]) => [x(a), y(b)]))} stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="7 6" fill="none" />
          <path d={linePath(mine.map(([a, b]) => [x(a), y(b)]))} stroke={ok ? "#34d399" : "#22d3ee"} strokeWidth="3" fill="none" />
        </svg>
      </Panel>
      <div className="space-y-3">
        <SliderRow label="Amplitude" value={A} min={data.amplitude.min} max={data.amplitude.max} onChange={setAmp} />
        <SliderRow label="Frequency" value={F} min={data.frequency.min} max={data.frequency.max} color="#a78bfa" onChange={setFreq} />
        <SliderRow label="Phase" value={P} min={data.phase.min} max={data.phase.max} unit="°" color="#f59e0b" onChange={setPh} />
      </div>
    </div>
  );
}

// 21 -----------------------------------------------------------------------
function growth(d: T.GrowthCurve, r: number, t: number) {
  if (d.model === "exponential") return d.start_value * Math.exp(r * t);
  if (d.model === "decay") return d.start_value * Math.exp(-r * t);
  const K = d.capacity ?? d.start_value * 10;
  return K / (1 + (K / d.start_value - 1) * Math.exp(-r * t));
}
export function GrowthCurveW({ data, revealed, report }: WidgetProps<T.GrowthCurve>) {
  const [rate, setRate] = useState(data.rate.value);
  const r = revealed ? data.rate.answer : rate;
  const pts = sampleXY((t) => growth(data, r, t), 0, data.t_max);
  const at = growth(data, r, data.target_time);
  const ok = Math.abs(at - data.target_value) <= 0.05 * data.target_value;
  useReport(report, { ready: rate !== data.rate.value || revealed, correct: ok, feedback: `At ${data.t_label} ${fmt(data.target_time)} the curve is at ${fmt(at)}; it should pass ${fmt(data.target_value)}.` });
  const ymax = Math.max(data.target_value * 1.6, data.start_value * 1.2, data.capacity ?? 0);
  const x = useScale([0, data.t_max], [L, W - R]);
  const y = useScale([0, ymax], [H - B, TOP]);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
      <Panel>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <Axes x={x} y={y} xLabel={data.t_label} yLabel={data.y_label} />
          {data.capacity && <line x1={L} x2={W - R} y1={y(data.capacity)} y2={y(data.capacity)} stroke="#a78bfa" strokeDasharray="4 6" />}
          <path d={`${linePath(pts.map(([a, b]) => [x(a), y(Math.min(b, ymax))]))} L${x(data.t_max)},${y(0)} L${x(0)},${y(0)}Z`} fill="rgba(34,211,238,0.12)" />
          <path d={linePath(pts.map(([a, b]) => [x(a), y(Math.min(b, ymax))]))} stroke="#22d3ee" strokeWidth="3" fill="none" />
          <circle cx={x(data.target_time)} cy={y(data.target_value)} r="9" fill="none" stroke="#f59e0b" strokeWidth="3" />
          <motion.circle initial={false} cy={y(Math.min(at, ymax))} animate={{ cy: y(Math.min(at, ymax)) }} cx={x(data.target_time)} r="5" fill={ok ? "#34d399" : "#fff"} />
        </svg>
      </Panel>
      <div className="space-y-3">
        <SliderRow label="Rate" value={r} min={data.rate.min} max={data.rate.max} onChange={setRate} />
        <Readout label={`${data.y_label} at ${fmt(data.target_time)}`} value={fmt(at)} tone={ok ? "good" : undefined} />
        <div className="text-xs text-slate-500">Goal: pass through the orange ring ({fmt(data.target_value)})</div>
      </div>
    </div>
  );
}

// 22 -----------------------------------------------------------------------
export function TrendLineW({ data, revealed, report }: WidgetProps<T.TrendLine>) {
  const xs = data.points.map((p) => p.x);
  const ys = data.points.map((p) => p.y);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  const best = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const bestB = my - best * mx;
  const sse = (m: number, b: number) => data.points.reduce((s, p) => s + (p.y - (m * p.x + b)) ** 2, 0);
  const span = Math.max(Math.abs(best) * 3, (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs) || 1) * 2, 1e-6);
  const [m0, setM] = useState(0);
  const [b0, setB] = useState(my);
  const m = revealed ? best : m0;
  const b = revealed ? bestB : b0;
  const ratio = sse(m, b) / Math.max(sse(best, bestB), 1e-9);
  const ok = sse(m, b) <= sse(best, bestB) * 1.25 + 1e-9 * Math.abs(my);
  useReport(report, { ready: m0 !== 0 || b0 !== my || revealed, correct: ok, feedback: `Your line's error is ${fmt(ratio, 2)}× the best fit; get it under 1.25×.` });
  const x = useScale(extent(xs), [L, W - R]);
  const yr = extent([...ys, m * Math.min(...xs) + b, m * Math.max(...xs) + b]);
  const y = useScale(extent(ys, 0.3), [H - B, TOP]);
  void yr;
  const [x0, x1] = x.domain;
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
      <Panel>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <Axes x={x} y={y} xLabel={data.x_label} yLabel={data.y_label} />
          <clipPath id="tl"><rect x={L} y={TOP} width={W - L - R} height={H - TOP - B} /></clipPath>
          <g clipPath="url(#tl)">
            {data.points.map((p, i) => <line key={i} x1={x(p.x)} x2={x(p.x)} y1={y(p.y)} y2={y(m * p.x + b)} stroke="rgba(251,113,133,0.6)" strokeDasharray="3 3" />)}
            <line x1={x(x0)} x2={x(x1)} y1={y(m * x0 + b)} y2={y(m * x1 + b)} stroke={ok ? "#34d399" : "#22d3ee"} strokeWidth="3" />
          </g>
          {data.points.map((p, i) => <circle key={i} cx={x(p.x)} cy={y(p.y)} r="5" fill="#f8fafc" />)}
        </svg>
      </Panel>
      <div className="space-y-3">
        <SliderRow label="Slope" value={m} min={-span} max={span} step={span / 200} onChange={setM} />
        <SliderRow label="Intercept" value={b} min={Math.min(...ys) - (Math.max(...ys) - Math.min(...ys)) - Math.abs(best * mx)} max={Math.max(...ys) + (Math.max(...ys) - Math.min(...ys)) + Math.abs(best * mx)} color="#a78bfa" onChange={setB} />
        <Readout label="Error vs best line" value={`${fmt(ratio, 2)}×`} tone={ok ? "good" : undefined} />
      </div>
    </div>
  );
}

// 23 -----------------------------------------------------------------------
function interp(pts: T.Pt[], x: number) {
  if (x <= pts[0].x) return pts[0].y;
  for (let i = 1; i < pts.length; i++) if (x <= pts[i].x) return pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * (x - pts[i - 1].x)) / (pts[i].x - pts[i - 1].x);
  return pts.at(-1)!.y;
}
export function DataCursorW({ data, revealed, checked, report }: WidgetProps<T.DataCursor>) {
  const all = data.series.flatMap((s) => s.points);
  const [lo, hi] = [Math.min(...all.map((p) => p.x)), Math.max(...all.map((p) => p.x))];
  const [cx, setCx] = useState(lo);
  const at = revealed ? data.answer_x : cx;
  const ok = Math.abs(at - data.answer_x) <= data.tolerance;
  useReport(report, { ready: cx !== lo || revealed, correct: ok, feedback: "Not there yet: read the graph again at the cursor." });
  const x = useScale([lo, hi], [L, W - R]);
  const y = useScale(extent(all.map((p) => p.y)), [H - B, TOP]);
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/[0.06] px-4 py-2.5 text-sm text-cyan-100">{data.question}</div>
      <Panel>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <Axes x={x} y={y} xLabel={data.x_label} yLabel={data.y_label} />
          {data.series.map((s, i) => (
            <g key={s.label}>
              <path d={linePath(s.points.map((p) => [x(p.x), y(p.y)]))} stroke={C[i]} strokeWidth="2.5" fill="none" />
              {s.points.map((p, j) => <circle key={j} cx={x(p.x)} cy={y(p.y)} r="3" fill={C[i]} />)}
            </g>
          ))}
          <line x1={x(at)} x2={x(at)} y1={TOP} y2={H - B} stroke={checked ? (ok ? "#34d399" : "#fb7185") : "#fff"} strokeWidth="2" strokeDasharray="5 4" />
          {data.series.map((s, i) => <circle key={i} cx={x(at)} cy={y(interp(s.points, at))} r="6" fill="#060a13" stroke={C[i]} strokeWidth="3" />)}
        </svg>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {data.series.map((s, i) => <span key={i} style={{ color: C[i] }}>{s.label}: {fmt(interp(s.points, at))}</span>)}
        </div>
      </Panel>
      <SliderRow label={`Cursor (${data.x_label})`} value={at} min={lo} max={hi} step={(hi - lo) / 200} onChange={setCx} testId="cursor" />
    </div>
  );
}

// 24 -----------------------------------------------------------------------
export function ProcessScrubberW({ data, revealed, report }: WidgetProps<T.ProcessScrubber>) {
  const total = data.stages.reduce((s, x) => s + x.duration, 0);
  const starts = data.stages.reduce<number[]>((a, _s, i) => [...a, i ? a[i - 1] + data.stages[i - 1].duration : 0], []);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const ti = data.stages.findIndex((s) => s.label === data.target_stage);
  const time = revealed ? starts[ti] + data.stages[ti].duration / 2 : t;
  const idx = Math.max(0, starts.findIndex((s, i) => time >= s && time < s + data.stages[i].duration + (i === data.stages.length - 1 ? 1e-9 : 0)));
  const ok = data.stages[idx]?.label === data.target_stage;
  useReport(report, { ready: t > 0 || revealed, correct: ok, feedback: `You stopped at "${data.stages[idx]?.label}".` });
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((x) => (x + total / 120 > total ? 0 : x + total / 120)), 50);
    return () => clearInterval(id);
  }, [playing, total]);
  return (
    <div className="space-y-4">
      <div className="flex h-12 overflow-hidden rounded-2xl border border-white/10">
        {data.stages.map((s, i) => (
          <div key={s.label} className={cn("flex items-center justify-center border-r border-[#060a13] text-[11px] font-semibold transition", i === idx ? "text-[#060a13]" : "text-slate-300")} style={{ width: `${(s.duration / total) * 100}%`, background: i === idx ? C[i % 4] : `${C[i % 4]}22` }}>
            {s.label}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "pause" : "play"} className="grid size-10 place-items-center rounded-full bg-cyan-500 text-[#060a13]">{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
        <div className="flex-1"><SliderRow label={`Time${data.unit ? ` (${data.unit})` : ""}`} value={time} min={0} max={total} step={total / 300} onChange={(v) => { setPlaying(false); setT(v); }} testId="scrub" /></div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={idx} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold" style={{ color: C[idx % 4] }}>{data.stages[idx]?.label}</div>
          <p className="mt-1 text-sm text-slate-300">{data.stages[idx]?.detail}</p>
        </motion.div>
      </AnimatePresence>
      <div className="text-xs text-slate-500">Goal: stop the process during <b className="text-slate-300">{data.target_stage}</b></div>
    </div>
  );
}

// 25 -----------------------------------------------------------------------
export function PredictObserveW({ data, revealed, report }: WidgetProps<T.PredictObserve>) {
  const [pick, setPick] = useState<string | null>(null);
  const [ran, setRan] = useState(false);
  const show = ran || revealed;
  const chosen = revealed ? data.answer : pick;
  const top = Math.max(data.measure.before, data.measure.after, 1e-9);
  useReport(report, { ready: show, correct: chosen === data.answer, feedback: "Your prediction didn't match what happened. Read the observation, then try again." });
  return (
    <div className="space-y-4">
      <Panel className="text-sm text-slate-300"><b className="text-white">Setup: </b>{data.setup}<div className="mt-2"><b className="text-cyan-200">Change: </b>{data.change}</div></Panel>
      <div className="grid gap-2">
        {data.options.map((o, i) => (
          <button key={o} type="button" data-testid={`predict-${i}`} disabled={show} onClick={() => setPick(o)} className={cn("rounded-xl border px-4 py-2.5 text-left text-sm transition", chosen === o ? "border-cyan-300 bg-cyan-400/15 text-white" : "border-white/10 bg-white/[0.03] hover:border-white/30", show && o === data.answer && "border-emerald-400/60 bg-emerald-500/10")}>
            {o}
          </button>
        ))}
      </div>
      {!show ? (
        <button type="button" data-testid="run-experiment" disabled={!pick} onClick={() => setRan(true)} className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-[#060a13] disabled:opacity-40"><FlaskConical className="size-4" /> Run the experiment</button>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[12rem_1fr]">
          <div className="flex h-40 items-end justify-center gap-6">
            {[["before", data.measure.before], ["after", data.measure.after]].map(([k, v], i) => (
              <div key={k as string} className="flex h-full flex-col items-center justify-end gap-1">
                <span className="font-mono text-xs text-white">{fmt(v as number)}</span>
                <motion.div initial={{ height: 0 }} animate={{ height: `${((v as number) / top) * 100}%` }} transition={{ delay: 0.2 + i * 0.5, duration: 0.8 }} className="w-12 rounded-t-lg" style={{ background: C[i] }} />
                <span className="text-xs text-slate-400">{k as string}</span>
              </div>
            ))}
          </div>
          <div className="text-sm text-slate-300"><div className="text-[11px] uppercase tracking-wider text-slate-500">{data.measure.label}</div><p className="mt-1">{data.observation}</p></div>
        </motion.div>
      )}
      {ran && pick !== data.answer && !revealed && <button type="button" onClick={() => { setRan(false); setPick(null); }} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"><RotateCcw className="size-3.5" /> Predict again</button>}
    </div>
  );
}

// 26 -----------------------------------------------------------------------
export function ScenarioBranchW({ data, revealed, report }: WidgetProps<T.ScenarioBranch>) {
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const done = revealed || step >= data.steps.length;
  useReport(report, { ready: done, correct: done && !revealed, auto: true, feedback: `${mistakes} wrong turn(s)` });
  if (done)
    return (
      <div className="space-y-2">
        {data.steps.map((s, i) => {
          const c = s.choices.find((x) => x.correct)!;
          return <div key={i} className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] p-3 text-sm"><div className="text-slate-400">{s.situation}</div><div className="mt-1 font-semibold text-emerald-200"><Check className="mr-1 inline size-4" />{c.text}</div></div>;
        })}
      </div>
    );
  const s = data.steps[step];
  const c = chosen !== null ? s.choices[chosen] : null;
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">{data.steps.map((_, i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-emerald-400" : i === step ? "bg-cyan-400" : "bg-white/10")} />)}</div>
      <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[15px] text-slate-200">{s.situation}</motion.div>
      <div className="grid gap-2">
        {s.choices.map((ch, i) => (
          <button key={i} type="button" data-testid={`choice-${i}`} disabled={c?.correct} onClick={() => { setChosen(i); if (!ch.correct) setMistakes((m) => m + 1); }} className={cn("rounded-xl border px-4 py-2.5 text-left text-sm transition", chosen === i ? (ch.correct ? "border-emerald-400/60 bg-emerald-500/10" : "border-rose-400/60 bg-rose-500/10") : "border-white/10 bg-white/[0.03] hover:border-white/30")}>{ch.text}</button>
        ))}
      </div>
      {c && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-sm", c.correct ? "text-emerald-200" : "text-rose-200")}>
          {c.correct ? <Check className="mt-0.5 size-4" /> : <X className="mt-0.5 size-4" />} {c.feedback}
        </motion.div>
      )}
      {c?.correct && <button type="button" data-testid="scenario-next" onClick={() => { setStep((x) => x + 1); setChosen(null); }} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-[#060a13]">{step + 1 < data.steps.length ? "Next situation" : "Finish"}</button>}
    </div>
  );
}

// 27 -----------------------------------------------------------------------
export function SpotTheErrorW({ data, revealed, checked, report }: WidgetProps<T.SpotTheError>) {
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const m = revealed ? new Set(data.statements.map((s, i) => (s.wrong ? i : -1)).filter((i) => i >= 0)) : marked;
  const wrongIdx = data.statements.map((s, i) => (s.wrong ? i : -1)).filter((i) => i >= 0);
  const ok = m.size === wrongIdx.length && wrongIdx.every((i) => m.has(i));
  useReport(report, { ready: m.size > 0, correct: ok, feedback: `There ${wrongIdx.length === 1 ? "is 1 false statement" : `are ${wrongIdx.length} false statements`}; your selection isn't right yet.` });
  return (
    <div className="space-y-2">
      {data.statements.map((s, i) => (
        <button key={i} type="button" data-testid={`statement-${i}`} disabled={revealed} onClick={() => setMarked((o) => { const n = new Set(o); if (n.has(i)) n.delete(i); else n.add(i); return n; })} className={cn("w-full rounded-xl border px-4 py-3 text-left text-sm transition", m.has(i) ? "border-rose-400/60 bg-rose-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/30")}>
          <span className={cn(m.has(i) && "line-through decoration-rose-400/70")}>{s.text}</span>
          {(revealed || (checked && ok)) && s.wrong && <span className="mt-1 block text-emerald-200">✓ {s.correction}</span>}
        </button>
      ))}
      <p className="text-xs text-slate-500">Tap each statement you think is false.</p>
    </div>
  );
}

// 28 -----------------------------------------------------------------------
export function ConceptMapW({ data, revealed, checked, report }: WidgetProps<T.ConceptMap>) {
  const labels = useMemo(() => shuffled(data.edges.map((e) => e.label), 8), [data]);
  const ids = data.edges.map((_, i) => `e${i}`);
  const p = usePlacement(ids);
  const slots = revealed ? Object.fromEntries(ids.map((id, i) => [id, data.edges[i].label])) : p.slots;
  const ready = ids.every((i) => slots[i]);
  const wrong = ids.filter((id, i) => slots[id] && slots[id] !== data.edges[i].label).length;
  useReport(report, { ready, correct: ready && wrong === 0, feedback: `${wrong} link label${wrong === 1 ? " is" : "s are"} wrong.` });
  const n = data.nodes.length;
  const pos = (name: string) => {
    const i = data.nodes.indexOf(name);
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return [50 + 38 * Math.cos(a), 50 + 38 * Math.sin(a)];
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
        {labels.filter((l) => !Object.values(slots).includes(l)).map((l) => (
          <button key={l} type="button" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", l)} onClick={() => p.setPicked(l)} className={cn("rounded-full border px-3 py-1 text-xs", p.picked === l ? "border-cyan-300 bg-cyan-400/20" : "border-white/15 bg-white/[0.05]")}>{l}</button>
        ))}
      </div>
      <div className="relative mx-auto aspect-[4/3] w-full max-w-xl">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
          {data.edges.map((e, i) => {
            const [x1, y1] = pos(e.source);
            const [x2, y2] = pos(e.target);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(34,211,238,0.45)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
        {data.nodes.map((nm) => {
          const [x, y] = pos(nm);
          return <div key={nm} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-blue-400/40 bg-[#0d1830] px-3 py-1.5 text-center text-xs font-semibold text-blue-100" style={{ left: `${x}%`, top: `${y}%` }}>{nm}</div>;
        })}
        {data.edges.map((e, i) => {
          const [x1, y1] = pos(e.source);
          const [x2, y2] = pos(e.target);
          return (
            <div key={i} className="absolute z-20 w-28 -translate-x-1/2 -translate-y-1/2" style={{ left: `${(x1 + x2) / 2}%`, top: `${(y1 + y2) / 2}%` }}>
              <Slot id={ids[i]} filled={!!slots[ids[i]]} onPlace={(s, c) => !revealed && p.place(s, c ?? p.picked)} className="min-h-7 bg-[#060a13] py-0.5 text-[11px]" tone={checked && slots[ids[i]] ? (slots[ids[i]] === e.label ? "good" : "bad") : undefined} placeholder="link?">
                {slots[ids[i]] ?? undefined}
              </Slot>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 29 -----------------------------------------------------------------------
export function FlashcardsW({ data, revealed, report }: WidgetProps<T.Flashcards>) {
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [marks, setMarks] = useState<Record<number, boolean>>({});
  const done = revealed || Object.keys(marks).length === data.cards.length;
  const knew = Object.values(marks).filter(Boolean).length;
  useReport(report, { ready: done, correct: done, auto: true, feedback: `${knew}/${data.cards.length} known` });
  const card = data.cards[Math.min(i, data.cards.length - 1)];
  const mark = (k: boolean) => {
    setMarks((m) => ({ ...m, [i]: k }));
    setFlip(false);
    const next = data.cards.findIndex((_, j) => j > i && marks[j] === undefined);
    setI(next === -1 ? data.cards.findIndex((_, j) => j !== i && marks[j] === undefined && j < i) : next);
  };
  if (done)
    return <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-center text-sm text-emerald-100">All {data.cards.length} cards reviewed · you knew {knew}. Cards you missed are worth another look in the toolbox.</div>;
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">Card {i + 1} of {data.cards.length}</div>
      <button type="button" data-testid="flashcard" onClick={() => setFlip((f) => !f)} className="relative block h-48 w-full [perspective:1000px]">
        <motion.div animate={{ rotateY: flip ? 180 : 0 }} transition={{ duration: 0.5 }} className="relative size-full [transform-style:preserve-3d]">
          <div className="absolute inset-0 grid place-items-center rounded-2xl border border-white/15 bg-gradient-to-br from-blue-500/20 to-cyan-400/10 p-6 text-lg font-semibold [backface-visibility:hidden]">{card.front}</div>
          <div className="absolute inset-0 grid place-items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6 text-base [backface-visibility:hidden] [transform:rotateY(180deg)]">{card.back}</div>
        </motion.div>
      </button>
      <div className="flex justify-center gap-2">
        {flip ? (
          <>
            <button type="button" data-testid="knew" onClick={() => mark(true)} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#060a13]">I knew it</button>
            <button type="button" data-testid="not-yet" onClick={() => mark(false)} className="rounded-xl border border-white/15 px-4 py-2 text-sm">Not yet</button>
          </>
        ) : (
          <span className="text-xs text-slate-500">Answer in your head, then tap the card to flip it.</span>
        )}
      </div>
    </div>
  );
}

// 30 -----------------------------------------------------------------------
export function DraggableBarsW({ data, revealed, checked, report }: WidgetProps<T.DraggableBars>) {
  const [vals, setVals] = useState(() => data.bars.map(() => data.y_max / 2));
  const v = revealed ? data.bars.map((b) => b.value) : vals;
  const ok = data.bars.map((b, i) => Math.abs(v[i] - b.value) <= data.tolerance);
  const moved = vals.some((x) => x !== data.y_max / 2);
  useReport(report, { ready: moved || revealed, correct: ok.every(Boolean), feedback: `${ok.filter((x) => !x).length} bar(s) are off by more than ${fmt(data.tolerance)} ${data.unit}.` });
  const show = revealed || checked > 0;
  const barRef = useRef<HTMLDivElement>(null);
  return (
    <div className="space-y-3">
      <div ref={barRef} className="flex h-64 items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 pb-2 pt-6">
        {data.bars.map((b, i) => (
          <div key={b.label} className="relative flex h-full flex-1 flex-col items-center justify-end">
            {show && <div className="absolute bottom-6 w-full rounded-t-lg border-2 border-dashed border-amber-400/70" style={{ height: `calc(${(b.value / data.y_max) * 100}% - 24px)` }} />}
            <motion.div animate={{ height: `calc(${(v[i] / data.y_max) * 100}% - 24px)` }} className={cn("w-full rounded-t-lg", checked && !ok[i] && !revealed ? "bg-rose-400/80" : "")} style={{ background: checked && !ok[i] && !revealed ? undefined : C[i % 4] }} />
            <span className="mt-1 h-5 truncate text-[11px] text-slate-400">{b.label}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data.bars.map((b, i) => (
          <SliderRow key={b.label} label={b.label} value={v[i]} min={0} max={data.y_max} unit={data.unit} color={C[i % 4]} onChange={(x) => setVals((o) => o.map((y, j) => (j === i ? x : y)))} />
        ))}
      </div>
      {show && <p className="text-xs text-amber-300/80">Dashed outlines show the real values.</p>}
    </div>
  );
}
