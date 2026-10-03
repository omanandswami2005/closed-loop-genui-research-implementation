import type { Telemetry } from "./types";

function Cell({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "alert" | "accent" }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "alert" ? "text-red-400" : tone === "accent" ? "text-blue-400" : "text-slate-100";
  return (
    <div className="flex min-w-0 flex-col border-r border-zinc-800 px-3 py-1.5 last:border-r-0" title={hint}>
      <span className="font-mono text-[10px] tracking-wider text-slate-500">{label}</span>
      <span className={`font-mono text-sm tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

/** Persistent instrumentation header (spec Section 4). */
export function TelemetryBar({ t, setpoint }: { t: Telemetry | null; setpoint: number }) {
  const f = (v: number | undefined, d = 3) => (v === undefined ? "—" : v.toFixed(d));
  const gate = !t ? "—" : t.fallback_used ? "FALLBACK" : "PASS";
  return (
    <div className="grid grid-cols-3 border-b border-zinc-800 bg-slatebase sm:grid-cols-5 lg:grid-cols-10">
      <Cell label="P(Lₙ)" value={f(t?.mastery)} hint={`BKT mastery estimate; setpoint P* = ${setpoint}`} tone="accent" />
      <Cell label="eₙ" value={f(t?.error)} hint="normalized error, [-1, 1]" />
      <Cell label="uₙ" value={f(t?.effort)} hint="PID control effort" />
      <Cell label="M_I*" value={f(t?.budget)} hint="committed complexity budget" tone="accent" />
      <Cell label="M_I" value={f(t?.m_i)} hint="achieved complexity of the rendered tree" />
      <Cell label="|Δ|" value={f(t?.abs_error)} hint="|M_I − M_I*|, gate tolerance 0.05" tone={t && t.abs_error > 0.05 ? "alert" : undefined} />
      <Cell label="level" value={t ? `L${t.level}` : "—"} hint="complexity level 1-4" />
      <Cell label="ρ α δ" value={t ? `${t.rho} ${t.alpha} ${t.delta}` : "—"} hint="interactive elements, abstraction, depth" />
      <Cell
        label="gate"
        value={gate}
        hint={t?.reason ?? "schema and budget checks passed"}
        tone={!t ? undefined : t.fallback_used ? "alert" : "ok"}
      />
      <Cell
        label={t?.plant ?? "plant"}
        value={t ? `${t.plant_ms < 10 ? t.plant_ms.toFixed(2) : Math.round(t.plant_ms)} ms` : "—"}
        hint={t ? `System-1 (BKT+PID+policy) ${t.system1_ms.toFixed(3)} ms` : undefined}
      />
    </div>
  );
}
