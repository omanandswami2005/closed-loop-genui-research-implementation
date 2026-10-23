import confetti from "canvas-confetti";
import { ArrowLeft, Check, ChevronDown, Info, LineChart, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { demoApi } from "./api";
import { LearnContext, type LearnContextValue, LearnRenderer } from "./LearnRenderer";
import { cn } from "./lib/utils";
import { TraceChart } from "./TraceChart";
import type { DemoView, Outcome } from "./types";
import { AnimatedCircularProgressBar } from "./ui/magicui/animated-circular-progress-bar";
import { NumberTicker } from "./ui/magicui/number-ticker";
import { Button, Card, Eyebrow, LevelSteps, Pill, Spinner } from "./ui/primitives";
import { go } from "./useRoute";

const MODE = { worked_example: "worked example first", guided_scaffold: "guided practice", open_symbolic: "open practice" };
const SCREEN = {
  1: "a guided multiple-choice question with the key idea highlighted (or a nudge when the budget leaves no room for the card)",
  2: "a plain multiple-choice question",
  3: "a fill-the-gap question",
  4: "an apply-it question in a new situation",
} as Record<number, string>;

function Explain({ v }: { v: DemoView }) {
  const t = v.telemetry;
  const rows = [
    <>
      Your mastery estimate is <b className="font-mono text-cyan-300">{t.mastery.toFixed(2)}</b>; the target is {v.setpoint}.
    </>,
    <>
      The PID governor set a complexity budget of <b className="font-mono text-cyan-300">{t.budget.toFixed(2)}</b> (level {t.level} of 4).
    </>,
    <>
      The policy chose <b className="text-white">{MODE[t.decision.scaffolding_mode]}</b>, hints {t.decision.hint_enabled ? "on" : "off"}: {SCREEN[t.alpha]}.
    </>,
    t.plant === "gemini" && !t.fallback_used && !t.reason ? (
      <>Gemini wrote this screen&apos;s text for your profile. The gate checked its structure, that it does not reveal the answer, and that it fits the budget.</>
    ) : t.fallback_used && t.reason?.startsWith("gemini unavailable") ? (
      <>Gemini did not answer in time ({t.reason.replace("gemini unavailable: ", "")}), so the deterministic template is shown.</>
    ) : t.fallback_used ? (
      <>The gate rejected the generated screen ({t.reason ?? "unknown"}) and showed the deterministic template instead.</>
    ) : t.reason ? (
      <>This screen is just the question, with no text to personalise, so Gemini was not called.</>
    ) : (
      <>The deterministic template built this screen from the question bank.</>
    ),
  ];
  return (
    <Card className="p-5" data-testid="explain">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Info className="size-4 text-blue-300" /> Why this screen
      </div>
      <ol className="mt-3 space-y-2.5">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-slate-300">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/5 font-mono text-[10px] text-slate-400">{i + 1}</span>
            <span>{r}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function UnderTheHood({ v }: { v: DemoView }) {
  const [open, setOpen] = useState(true);
  const t = v.telemetry;
  const cells: [string, string, string?][] = [
    ["P(L)", t.mastery.toFixed(3), "mastery"],
    ["e", t.error.toFixed(3), "error"],
    ["u", t.effort.toFixed(3), "effort"],
    ["M_I*", t.budget.toFixed(3), "budget"],
    ["M_I", t.m_i.toFixed(3), "measured"],
    ["|Δ|", t.abs_error.toFixed(3), "≤ 0.05"],
    ["ρ α δ", `${t.rho} ${t.alpha} ${t.delta}`, "structure"],
    ["writer", `${t.plant_ms < 10 ? t.plant_ms.toFixed(1) : Math.round(t.plant_ms)} ms`, t.plant],
  ];
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <LineChart className="size-4 text-violet-300" /> Under the hood
        </span>
        <ChevronDown className={cn("size-4 text-slate-400 transition", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-5 pb-5">
              <TraceChart history={v.history} responses={v.responses} setpoint={v.setpoint} />
              <div className="mt-4 grid grid-cols-4 gap-2" data-testid="telemetry">
                {cells.map(([k, val, sub]) => (
                  <div key={k} className="rounded-xl border border-white/5 bg-white/[0.02] px-2 py-1.5">
                    <div className="font-mono text-[10px] text-slate-500">{k}</div>
                    <div className={cn("font-mono text-[12px] tabular-nums", k === "|Δ|" && t.abs_error > 0.05 ? "text-rose-300" : "text-slate-100")}>{val}</div>
                    <div className="truncate text-[9px] text-slate-500">{sub}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs font-medium text-slate-400">Gate log</div>
              <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-white/5">
                <table className="w-full font-mono text-[11px] tabular-nums">
                  <thead className="sticky top-0 bg-[#0c1220] text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-normal">#</th>
                      <th className="px-2 text-right font-normal">P(L)</th>
                      <th className="px-2 text-right font-normal">M_I*</th>
                      <th className="px-2 text-right font-normal">M_I</th>
                      <th className="px-2 text-left font-normal">gate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...v.history].reverse().map((h) => (
                      <tr key={h.item} className="border-t border-white/5">
                        <td className="px-2 py-1 text-slate-500">{h.item + 1}</td>
                        <td className="px-2 text-right">{h.mastery.toFixed(2)}</td>
                        <td className="px-2 text-right">{h.budget.toFixed(3)}</td>
                        <td className="px-2 text-right">{h.m_i.toFixed(3)}</td>
                        <td className={cn("px-2", h.fallback_used ? "text-rose-300" : "text-emerald-300")} title={h.reason ?? ""}>
                          {h.fallback_used ? "fallback" : h.plant === "gemini" && !h.reason ? "gemini ✓" : "template ✓"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function celebrate() {
  const opts = { particleCount: 70, spread: 70, startVelocity: 38, ticks: 160, colors: ["#3b82f6", "#22d3ee", "#a78bfa", "#ffffff"] };
  void confetti({ ...opts, origin: { x: 0.35, y: 0.7 } });
  void confetti({ ...opts, origin: { x: 0.65, y: 0.7 } });
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
        const levelUp = next.telemetry.level > view.telemetry.level;
        if (next.outcome?.correct && (levelUp || next.telemetry.mastery >= next.setpoint)) celebrate();
        setOutcome(next.outcome);
        setView(next);
        window.scrollTo({ top: 0, behavior: "smooth" });
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
      <div className="mx-auto max-w-xl p-10 text-center">
        <p className="text-rose-300">{error}</p>
        <Button className="mt-4" variant="secondary" onClick={() => go("/library")}>
          Back to material
        </Button>
      </div>
    );
  if (!view || !ctx)
    return (
      <div className="grid place-items-center p-24 text-slate-400">
        <Spinner />
      </div>
    );
  const t = view.telemetry;
  const correct = view.responses.filter(Boolean).length;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <button type="button" onClick={() => go(`/pack/${view.pack_id}`)} className="mb-1 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
              <ArrowLeft className="size-3.5" /> Topics
            </button>
            <h1 data-testid="topic-title" className="truncate text-xl font-semibold tracking-tight md:text-2xl">
              {view.topic.title}
            </h1>
            <div data-testid="item-label" className="mt-1 font-mono text-[11px] uppercase tracking-wider text-slate-500">
              Item {view.item + 1} · level {view.question.level} {view.level_name} · {correct}/{view.responses.length} correct
            </div>
          </div>
          <LevelSteps level={view.question.level} />
        </div>

        <AnimatePresence mode="popLayout">
          {view.notice && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="status" className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
              <Info className="size-4" /> {view.notice}
            </motion.div>
          )}
          {outcome && (
            <motion.div
              key={`o-${view.item}`}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              data-testid="outcome"
              role="status"
              className={cn(
                "flex gap-3 rounded-2xl border px-4 py-3.5",
                outcome.correct ? "border-emerald-400/30 bg-emerald-500/10" : "border-rose-400/30 bg-rose-500/10",
              )}
            >
              <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", outcome.correct ? "bg-emerald-500 text-white" : "bg-rose-500 text-white")}>
                {outcome.correct ? <Check className="size-4" /> : <X className="size-4" />}
              </span>
              <div className="text-sm">
                <div className={cn("font-semibold", outcome.correct ? "text-emerald-200" : "text-rose-200")}>
                  {outcome.correct ? "Correct" : "Not quite"}
                  {!outcome.correct && (
                    <span className="font-normal text-slate-300">
                      {" "}
                      · answer: <b className="text-white">{outcome.correct_answer}</b>
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-slate-300">{outcome.explanation}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">{error}</div>}

        <div className="relative">
          <div className={cn("transition duration-300", busy && "pointer-events-none scale-[0.99] opacity-40 blur-[1px]")}>
            <LearnContext.Provider value={ctx}>
              <LearnRenderer key={`${view.session_id}:${view.item}`} node={view.document.root} />
            </LearnContext.Provider>
          </div>
          <AnimatePresence>
            {busy && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                data-testid="busy"
                className="glass absolute inset-x-0 top-10 mx-auto flex w-fit items-center gap-3 rounded-2xl px-5 py-3 text-sm shadow-2xl"
              >
                <Sparkles className="size-4 animate-pulse text-cyan-300" />
                Marking, updating mastery, {view.plant === "gemini" ? "Gemini is writing your next screen" : "building your next screen"}…
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <Card className="flex items-center gap-5 p-5">
          <AnimatedCircularProgressBar className="size-24 text-lg" value={Math.round(t.mastery * 100)} gaugePrimaryColor="#22d3ee" gaugeSecondaryColor="rgba(255,255,255,0.08)" />
          <div>
            <Eyebrow>Mastery estimate</Eyebrow>
            <div className="mt-1 text-3xl font-semibold tabular-nums">
              <NumberTicker value={t.mastery} decimalPlaces={2} className="!text-white" key={view.item} startValue={view.history.at(-2)?.mastery ?? 0} />
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Pill tone="blue">budget {t.budget.toFixed(2)}</Pill>
              <Pill tone={t.fallback_used ? "red" : "green"}>{t.fallback_used ? "fallback" : "gate pass"}</Pill>
            </div>
          </div>
        </Card>
        <Explain v={view} />
        <UnderTheHood v={view} />
        <Button variant="secondary" onClick={() => go("/report")} data-testid="to-report">
          <LineChart className="size-4" /> Open progress report
        </Button>
      </aside>
    </main>
  );
}
