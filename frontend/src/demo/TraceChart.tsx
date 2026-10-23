import type { Telemetry } from "../types";

const W = 340;
const H = 150;
const P = { l: 26, r: 8, t: 10, b: 22 };

/** Mastery estimate, budget and measured complexity per screen, with answer markers. */
export function TraceChart({ history, responses, setpoint }: { history: Telemetry[]; responses: boolean[]; setpoint: number }) {
  const n = Math.max(history.length, 2);
  const x = (i: number) => P.l + (i / (n - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - v) * (H - P.t - P.b);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const mastery = history.map((h) => h.mastery);
  const area = mastery.length ? `${line(mastery)} L${x(mastery.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z` : "";
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="trace of mastery and complexity">
        <defs>
          <linearGradient id="mast" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0.35" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
            <text x={2} y={y(v) + 3} fontSize={8} fill="#64748b" className="font-mono">
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        <line x1={P.l} x2={W - P.r} y1={y(setpoint)} y2={y(setpoint)} stroke="#a78bfa" strokeDasharray="3 3" strokeOpacity={0.7} />
        <text x={W - P.r - 2} y={y(setpoint) - 3} fontSize={8} fill="#a78bfa" textAnchor="end" className="font-mono">
          target {setpoint}
        </text>
        {area && <path d={area} fill="url(#mast)" />}
        <path d={line(history.map((h) => h.budget))} fill="none" stroke="#e2e8f0" strokeWidth={1.4} strokeDasharray="4 3" strokeOpacity={0.8} />
        <path d={line(history.map((h) => h.m_i))} fill="none" stroke="#3b82f6" strokeWidth={1.6} />
        <path d={line(mastery)} fill="none" stroke="#22d3ee" strokeWidth={2.2} strokeLinejoin="round" />
        {responses.map((r, i) => (
          <circle key={i} cx={x(i)} cy={H - 8} r={3} fill={r ? "#10b981" : "#f43f5e"} />
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-cyan-400" /> mastery estimate</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-slate-200" /> budget M_I*</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-blue-500" /> measured M_I</span>
      </figcaption>
    </figure>
  );
}
