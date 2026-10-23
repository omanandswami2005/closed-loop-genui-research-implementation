import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TelemetryBar } from "../TelemetryBar";
import { TracePlot } from "../TracePlot";
import { demoApi } from "./api";
import { LearnContext, type LearnContextValue, LearnRenderer } from "./LearnRenderer";
import type { DemoView, Outcome } from "./types";
import { go } from "./useRoute";

const MODE = {
  worked_example: "worked example first",
  guided_scaffold: "guided practice",
  open_symbolic: "open practice",
};
const LEVEL_SCREEN = {
  1: "guided multiple choice, key ideas on screen",
  2: "plain multiple choice",
  3: "fill the gap",
  4: "apply the idea to a new situation",
} as Record<number, string>;

function Explain({ v }: { v: DemoView }) {
  const t = v.telemetry;
  return (
    <div data-testid="explain" className="border border-zinc-800 p-3 text-[12px] leading-relaxed text-slate-300">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">why this screen</div>
      <ol className="list-decimal space-y-1 pl-4">
        <li>
          Mastery estimate after your answers so far: <span className="font-mono text-blue-300">{t.mastery.toFixed(2)}</span> (target{" "}
          {v.setpoint}).
        </li>
        <li>
          The PID governor turned the gap to the target into a complexity budget of{" "}
          <span className="font-mono text-blue-300">{t.budget.toFixed(2)}</span> (level {t.level} of 4).
        </li>
        <li>
          The policy chose <span className="text-slate-100">{MODE[t.decision.scaffolding_mode]}</span>, hints {t.decision.hint_enabled ? "on" : "off"}:{" "}
          {LEVEL_SCREEN[t.alpha] ?? ""}.
        </li>
        <li>
          {t.plant === "gemini" && !t.fallback_used
            ? "Gemini wrote this screen's text for your profile; the gate checked its structure, that it does not give the answer away, and that it is within the budget."
            : t.fallback_used
              ? `The gate rejected the generated screen (${t.reason ?? "unknown"}) and rendered the deterministic template instead.`
              : "This screen was built by the deterministic template from the question bank."}{" "}
          Measured complexity <span className="font-mono">{t.m_i.toFixed(3)}</span>, off by {t.abs_error.toFixed(3)}.
        </li>
      </ol>
    </div>
  );
}

export function Learn({ sid }: { sid: string }) {
  const [view, setView] = useState<DemoView | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hints = useRef(0);

  useEffect(() => {
    demoApi.session(sid).then(setView, (e) => setError(e.message));
  }, [sid]);

  const submit = useCallback(
    async (answer: string, justification: string) => {
      if (!view) return;
      setBusy(true);
      setError(null);
      try {
        const next = await demoApi.respond(view.session_id, answer, hints.current, justification);
        hints.current = 0;
        setOutcome(next.outcome);
        setView(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [view],
  );

  const ctx: LearnContextValue | null = useMemo(
    () =>
      view && {
        question: view.question,
        busy,
        submit: (a, j) => void submit(a, j),
        hintOpened: (n) => {
          hints.current = Math.max(hints.current, n);
        },
      },
    [view, busy, submit],
  );

  if (error && !view)
    return (
      <div className="p-4 font-mono text-xs text-red-300">
        {error}{" "}
        <button type="button" className="underline" onClick={() => go("/library")}>
          back to material
        </button>
      </div>
    );
  if (!view || !ctx) return <p className="p-4 font-mono text-xs text-slate-400">loading…</p>;
  const t = view.telemetry;
  const correct = view.responses.filter(Boolean).length;

  return (
    <>
      <TelemetryBar t={t} setpoint={view.setpoint} />
      <main className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border border-zinc-800 bg-white px-4 py-3 text-slate-900">
            <div className="flex items-baseline gap-3">
              <button type="button" onClick={() => go(`/pack/${view.pack_id}`)} className="text-slate-500 hover:text-cobalt" title="Back to topics">
                <ArrowLeft size={14} aria-hidden />
              </button>
              <h2 data-testid="topic-title" className="text-base font-semibold">
                {view.topic.title}
              </h2>
            </div>
            <span data-testid="item-label" className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
              item {view.item + 1} · level {view.question.level} {view.level_name} · {correct}/{view.responses.length} correct
            </span>
          </div>

          {view.notice && (
            <div role="status" className="flex items-center gap-2 border border-amber-700 bg-amber-950/40 px-4 py-2 font-mono text-xs text-amber-300">
              <Info size={12} aria-hidden /> {view.notice}
            </div>
          )}

          {outcome && (
            <div
              data-testid="outcome"
              role="status"
              className={`border px-4 py-2 text-sm ${outcome.correct ? "border-emerald-700 bg-emerald-950/40 text-emerald-200" : "border-red-700 bg-red-950/40 text-red-200"}`}
            >
              <span className="font-mono text-xs uppercase">{outcome.correct ? "previous: correct" : "previous: not correct"}</span>
              {!outcome.correct && (
                <span>
                  {" "}
                  · answer: <span className="font-semibold">{outcome.correct_answer}</span>
                </span>
              )}
              <span className="block text-[13px] opacity-90">{outcome.explanation}</span>
            </div>
          )}

          {error && <div className="border border-red-700 px-4 py-2 font-mono text-xs text-red-300">{error}</div>}

          <div className="relative">
            <div className={busy ? "pointer-events-none opacity-40" : ""}>
              <LearnContext.Provider value={ctx}>
                <LearnRenderer key={`${view.session_id}:${view.item}`} node={view.document.root} />
              </LearnContext.Provider>
            </div>
            {busy && (
              <div data-testid="busy" className="absolute inset-x-0 top-6 mx-auto flex w-fit items-center gap-2 border border-cobalt bg-slatebase px-3 py-2 font-mono text-xs text-blue-200">
                <Loader2 size={12} className="animate-spin" aria-hidden />
                marking, updating mastery, {view.plant === "gemini" ? "Gemini writing the next screen" : "building the next screen"}…
              </div>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-3">
          <TracePlot history={view.history} responses={view.responses} setpoint={view.setpoint} />
          <Explain v={view} />
          <div className="border border-zinc-800">
            <div className="border-b border-zinc-800 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-slate-400">gate log</div>
            <table className="w-full font-mono text-[11px] tabular-nums">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-left font-normal">#</th>
                  <th className="px-2 text-right font-normal">P(L)</th>
                  <th className="px-2 text-right font-normal">M_I*</th>
                  <th className="px-2 text-right font-normal">M_I</th>
                  <th className="px-2 text-left font-normal">L</th>
                  <th className="px-2 text-left font-normal">gate</th>
                </tr>
              </thead>
              <tbody>
                {[...view.history].reverse().slice(0, 10).map((h) => (
                  <tr key={h.item} className="border-t border-zinc-900">
                    <td className="px-2 py-0.5 text-slate-400">{h.item + 1}</td>
                    <td className="px-2 text-right">{h.mastery.toFixed(2)}</td>
                    <td className="px-2 text-right">{h.budget.toFixed(3)}</td>
                    <td className="px-2 text-right">{h.m_i.toFixed(3)}</td>
                    <td className="px-2">L{h.level}</td>
                    <td className={`px-2 ${h.fallback_used ? "text-red-400" : "text-emerald-400"}`} title={h.reason ?? ""}>
                      {h.fallback_used ? "fallback" : h.plant === "gemini" ? "gemini" : "template"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            data-testid="to-report"
            onClick={() => go("/report")}
            className="border border-zinc-700 px-3 py-1.5 font-mono text-xs text-slate-300 hover:border-slate-400"
          >
            open progress report
          </button>
        </aside>
      </main>
    </>
  );
}
