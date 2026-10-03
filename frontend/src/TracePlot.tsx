import type { Telemetry } from "./types";

const W = 320;
const H = 140;
const PAD = 22;

/** Oscilloscope-style trace of P(L_n), M_I* and M_I over items. */
export function TracePlot({ history, responses, setpoint }: { history: Telemetry[]; responses: boolean[]; setpoint: number }) {
  const n = Math.max(history.length, 2);
  const x = (i: number) => PAD + (i / (n - 1)) * (W - PAD - 6);
  const y = (v: number) => H - PAD - v * (H - PAD - 8);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const series = [
    { key: "mastery", label: "P(Lₙ)", color: "#60a5fa", dash: "" },
    { key: "budget", label: "M_I*", color: "#f8fafc", dash: "4 3" },
    { key: "m_i", label: "M_I", color: "#34d399", dash: "" },
  ] as const;
  return (
    <figure className="border border-zinc-800 bg-slatebase">
      <figcaption className="flex justify-between border-b border-zinc-800 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-slate-400">
        <span>trace</span>
        <span className="flex gap-3 normal-case tracking-normal">
          {series.map((s) => (
            <span key={s.key} className="font-mono" style={{ color: s.color }}>
              ── {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={PAD} x2={W - 6} y1={y(v)} y2={y(v)} stroke="#1e293b" />
            <text x={2} y={y(v) + 3} fontSize={8} fill="#64748b" className="font-mono">
              {v.toFixed(2)}
            </text>
          </g>
        ))}
        <line x1={PAD} x2={W - 6} y1={y(setpoint)} y2={y(setpoint)} stroke="#2563eb" strokeDasharray="2 3" />
        <text x={W - 40} y={y(setpoint) - 3} fontSize={8} fill="#2563eb" className="font-mono">
          P*={setpoint}
        </text>
        {series.map((s) => (
          <path key={s.key} d={path(history.map((h) => h[s.key]))} fill="none" stroke={s.color} strokeWidth={1.5} strokeDasharray={s.dash} />
        ))}
        {responses.map((r, i) => (
          <rect key={i} x={x(i) - 2} y={H - 12} width={4} height={6} fill={r ? "#047857" : "#b91c1c"} />
        ))}
      </svg>
    </figure>
  );
}
