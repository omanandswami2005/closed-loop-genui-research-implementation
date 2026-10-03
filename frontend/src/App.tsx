import { Activity, Info, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { ItemContext, type ItemContextValue } from "./clt/context";
import { Btn } from "./clt/Panel";
import { Renderer } from "./clt/Renderer";
import { TelemetryBar } from "./TelemetryBar";
import { Tex } from "./Tex";
import { TracePlot } from "./TracePlot";
import type { Outcome, PlantName, SessionView } from "./types";

const MODE_LABEL = { worked_example: "worked example", guided_scaffold: "guided scaffold", open_symbolic: "open symbolic" };

export function App() {
  const [plant, setPlant] = useState<PlantName>("surrogate");
  const [view, setView] = useState<SessionView | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (p: PlantName) => {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      setView(await api.createSession(p));
      setAnswer("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void start("surrogate");
  }, [start]);

  const submit = useCallback(
    async (value: string, steps: string[] = []) => {
      if (!view || !value.trim()) return;
      setBusy(true);
      setError(null);
      try {
        const next = await api.respond(view.session_id, value.trim(), steps);
        setOutcome(next.outcome ?? null);
        setView(next);
        setAnswer("");
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [view],
  );

  const ctx: ItemContextValue | null = useMemo(
    () =>
      view && {
        equation: view.equation,
        sessionId: view.session_id,
        busy,
        submit: (a, s) => void submit(a, s),
        propose: setAnswer,
      },
    [view, busy, submit],
  );

  const t = view?.telemetry ?? null;
  const usesWorkspace = JSON.stringify(view?.document.root ?? "").includes("SymbolicEquationWorkspace");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <Activity size={16} className="text-blue-400" aria-hidden />
          <h1 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Closed-loop GenUI · linear equations testbed</h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-500">plant</span>
          {(["surrogate", "gemini"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlant(p)}
              className={`border px-2 py-0.5 ${plant === p ? "border-cobalt bg-cobalt text-white" : "border-zinc-700 text-slate-300 hover:border-slate-400"}`}
            >
              {p === "gemini" ? "gemini 3.7 flash" : "surrogate"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void start(plant)}
            disabled={busy}
            className="ml-2 flex items-center gap-1 border border-zinc-700 px-2 py-0.5 text-slate-300 hover:border-slate-400 disabled:opacity-40"
          >
            <RotateCcw size={12} aria-hidden /> new session
          </button>
        </div>
      </header>

      <TelemetryBar t={t} setpoint={view?.setpoint ?? 0.95} />

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex items-baseline justify-between border border-zinc-800 bg-white px-4 py-3 text-slate-900">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">item {view ? view.item + 1 : "—"} · solve for x</span>
            {view && <Tex math={view.equation_latex} display className="text-xl" />}
          </div>

          {view?.notice && (
            <div role="status" className="flex items-center gap-2 border border-amber-700 bg-amber-950/40 px-4 py-2 font-mono text-xs text-amber-300">
              <Info size={12} aria-hidden /> {view.notice}
            </div>
          )}

          {outcome && (
            <div
              role="status"
              className={`border px-4 py-2 font-mono text-xs ${outcome.correct ? "border-emerald-700 bg-emerald-950/40 text-emerald-300" : "border-red-700 bg-red-950/40 text-red-300"}`}
            >
              previous item: {outcome.correct ? "correct" : `not correct (x = ${outcome.solution})`}
              {outcome.steps.length > 0 && ` · ${outcome.steps.filter((s) => s.equivalent).length}/${outcome.steps.length} steps valid`}
            </div>
          )}

          {error && <div className="border border-red-700 px-4 py-2 font-mono text-xs text-red-300">{error}</div>}

          <div className={busy ? "pointer-events-none opacity-60" : ""}>
            {ctx && view && (
              <ItemContext.Provider value={ctx}>
                <Renderer key={`${view.session_id}:${view.item}`} node={view.document.root} />
              </ItemContext.Provider>
            )}
          </div>

          {!usesWorkspace && view && (
            <form
              className="flex items-center gap-2 border border-zinc-800 bg-white px-3 py-2 text-slate-900"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(answer);
              }}
            >
              <label htmlFor="answer" className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
                answer
              </label>
              <input
                id="answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="x = …"
                className="flex-1 border border-zinc-800 px-2 py-1 font-mono text-sm outline-none focus:border-cobalt"
              />
              <Btn variant="primary" disabled={busy || !answer.trim()} onClick={() => void submit(answer)}>
                {busy ? "generating…" : "submit"}
              </Btn>
            </form>
          )}
        </section>

        <aside className="flex flex-col gap-3">
          {view && <TracePlot history={view.history} responses={view.responses} setpoint={view.setpoint} />}

          {t && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border border-zinc-800 p-3 font-mono text-xs">
              <dt className="col-span-2 mb-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">policy (system 1)</dt>
              <dt className="text-slate-500">mode</dt>
              <dd>{MODE_LABEL[t.decision.scaffolding_mode]}</dd>
              <dt className="text-slate-500">balance scale</dt>
              <dd>{t.decision.show_balance_scale ? "yes" : "no"}</dd>
              <dt className="text-slate-500">hints</dt>
              <dd>{t.decision.hint_enabled ? "yes" : "no"}</dd>
              <dt className="text-slate-500">density</dt>
              <dd>{t.decision.density_limit} / 5</dd>
              <dt className="text-slate-500">abstraction α</dt>
              <dd>{t.decision.alpha}</dd>
              <dt className="text-slate-500">lapse alarms</dt>
              <dd>{t.lapse_alarms}</dd>
            </dl>
          )}

          {view && (
            <div className="border border-zinc-800">
              <div className="border-b border-zinc-800 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">gate log</div>
              <table className="w-full font-mono text-[11px] tabular-nums">
                <thead className="text-slate-500">
                  <tr>
                    <th className="px-2 py-1 text-left font-normal">#</th>
                    <th className="px-2 text-right font-normal">M_I*</th>
                    <th className="px-2 text-right font-normal">M_I</th>
                    <th className="px-2 text-left font-normal">L</th>
                    <th className="px-2 text-left font-normal">gate</th>
                  </tr>
                </thead>
                <tbody>
                  {[...view.history].reverse().slice(0, 12).map((h) => (
                    <tr key={h.item} className="border-t border-zinc-900">
                      <td className="px-2 py-0.5 text-slate-500">{h.item + 1}</td>
                      <td className="px-2 text-right">{h.budget.toFixed(3)}</td>
                      <td className="px-2 text-right">{h.m_i.toFixed(3)}</td>
                      <td className="px-2">L{h.level}</td>
                      <td className={`px-2 ${h.fallback_used ? "text-red-400" : "text-emerald-400"}`} title={h.reason ?? ""}>
                        {h.fallback_used ? "fallback" : "pass"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-slate-500">
            Research testbed. The interface is regenerated after every answer from the learner&apos;s mastery estimate; every generated
            screen is schema-checked and measured before it is shown.
          </p>
        </aside>
      </main>
    </div>
  );
}
