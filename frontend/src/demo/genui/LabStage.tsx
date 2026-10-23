// The "learn by doing" stage of a topic: a Gemini-composed, server-validated interactive lab,
// played level by level before the adaptive check questions.
import { ArrowLeft, ArrowRight, BookOpen, Check, Eye, FlaskConical, ShieldCheck, SkipForward, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { demoApi } from "../api";
import { cn } from "../lib/utils";
import type { DemoView } from "../types";
import { Button, Card, Eyebrow, Pill } from "../ui/primitives";
import { go } from "../useRoute";
import { family, prettyType } from "./registry";
import { Station, type StationResult } from "./Station";
import type { Lab } from "./types";

const STEPS = [
  "Reading your topic and your profile",
  "Gemini is choosing components from the 30-part catalog",
  "Writing each level: goal, hints, worked solution",
  "Validating every level and re-checking that it can be solved",
  "Sending rejected levels back to Gemini to fix",
];

function Loader() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), 4500);
    return () => clearInterval(t);
  }, []);
  return (
    <Card className="mx-auto mt-10 max-w-xl p-8" data-testid="lab-loading">
      <div className="flex items-center gap-3">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: "linear" }} className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30">
          <FlaskConical className="size-5 text-cyan-200" />
        </motion.div>
        <div>
          <div className="font-semibold">Building your interactive lab</div>
          <div className="text-xs text-slate-400">usually 10 to 35 seconds the first time, then cached</div>
        </div>
      </div>
      <ol className="mt-6 space-y-2.5">
        {STEPS.map((s, k) => (
          <li key={s} className={cn("flex items-center gap-2.5 text-sm transition", k < i ? "text-emerald-300" : k === i ? "text-white" : "text-slate-600")}>
            <span className={cn("grid size-5 place-items-center rounded-full border text-[10px]", k < i ? "border-emerald-400/50 bg-emerald-500/15" : k === i ? "border-cyan-300/60" : "border-white/10")}>
              {k < i ? <Check className="size-3" /> : k === i ? <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }} className="size-1.5 rounded-full bg-cyan-300" /> : null}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function HowMade({ lab }: { lab: Lab }) {
  const fixedFail = lab.rejected.filter((r) => r.startsWith("after repair")).length;
  const down = lab.rejected.find((r) => r.startsWith("gemini unavailable"));
  const nTemplate = lab.source === "template" ? lab.stations.length : 0;
  return (
    <Card className="p-5" data-testid="lab-gate">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="size-4 text-emerald-300" /> How this lab was made
      </div>
      <ol className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-slate-300">
        <li>
          {lab.source === "template" ? (
            <>Gemini was {down ? `not available (${down.replace("gemini unavailable: ", "")})` : "not used"}, so the lab was built from your material&apos;s question bank by the fixed fallback.</>
          ) : (
            <>
              <b className="text-white">{lab.model}</b> wrote this lab for your profile as JSON in {(lab.latency_ms / 1000).toFixed(1)} s, choosing {lab.stations.length} components from a catalog of 30.
            </>
          )}
        </li>
        <li>The server validated every level against the component&apos;s schema and re-computed that the goal can be reached (for example that the pans can balance, or the target is inside the slider range).</li>
        <li>
          {lab.rejected.length === 0 ? (
            <>No level was rejected.</>
          ) : (
            <>
              The gate rejected {lab.rejected.length} draft{lab.rejected.length === 1 ? "" : "s"}; the reasons went back to Gemini to fix{fixedFail ? `, ${fixedFail} still failed` : ""}
              {lab.source === "mixed" ? " and the fallback filled the gap" : ""}.
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-slate-500">gate reasons</summary>
                <ul className="mt-1 space-y-1 font-mono text-[11px] text-slate-400">
                  {lab.rejected.slice(0, 8).map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </li>
        <li>The browser renders each level with a fixed React component. Gemini never writes code, only data for those components.</li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Pill tone={lab.source === "gemini" ? "green" : lab.source === "mixed" ? "amber" : "default"}>{lab.source === "gemini" ? "all levels by Gemini" : lab.source === "mixed" ? "Gemini + fallback" : `fallback (${nTemplate})`}</Pill>
        <Pill>{lab.schema_version}</Pill>
      </div>
    </Card>
  );
}

export function LabStage({ view, onFinish }: { view: DemoView; onFinish: (v: DemoView) => void }) {
  const sid = view.session_id;
  const [lab, setLab] = useState<Lab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [results, setResults] = useState<Record<string, StationResult>>({});
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let live = true;
    demoApi.lab(sid).then(
      (l) => live && setLab(l),
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [sid]);

  const onDone = useCallback(
    (r: StationResult) => {
      setResults((o) => ({ ...o, [r.station_id]: r }));
      void demoApi.labResult(sid, r).catch(() => undefined);
    },
    [sid],
  );

  const finish = async () => {
    setLeaving(true);
    try {
      onFinish(await demoApi.finishLab(sid));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLeaving(false);
    }
  };

  if (error && !lab)
    return (
      <main className="mx-auto max-w-xl p-10 text-center">
        <p className="text-rose-300">Could not build the lab: {error}</p>
        <Button className="mt-4" onClick={finish} loading={leaving}>
          Go straight to the check
        </Button>
      </main>
    );
  if (!lab) return <Loader />;

  const total = lab.stations.length;
  const allDone = at >= total;
  const solved = Object.values(results).filter((r) => r.solved).length;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="flex min-w-0 flex-col gap-4">
        <div>
          <button type="button" onClick={() => go(`/pack/${view.pack_id}`)} className="mb-1 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
            <ArrowLeft className="size-3.5" /> Topics
          </button>
          <Eyebrow>Step 1 of 2 · Learn by doing</Eyebrow>
          <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl" data-testid="lab-title">
            {lab.title}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-300">{lab.intro}</p>
        </div>

        <div className="flex gap-1.5" data-testid="lab-steps">
          {lab.stations.map((s, i) => {
            const r = results[s.id];
            return (
              <button
                key={s.id}
                type="button"
                disabled={!r && i !== at}
                onClick={() => setAt(i)}
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-1 rounded-xl border px-3 py-2 text-left transition",
                  i === at ? "border-cyan-300/60 bg-cyan-400/10" : r ? "border-white/10 bg-white/[0.03] hover:border-white/25" : "border-white/5 opacity-50",
                )}
              >
                <span className={cn("h-1 rounded-full", r?.solved ? "bg-emerald-400" : r ? "bg-slate-400" : i === at ? "bg-cyan-400" : "bg-white/10")} />
                <span className="truncate font-mono text-[10px] uppercase tracking-wider text-slate-400">Level {i + 1}</span>
                <span className="hidden truncate text-xs text-slate-200 sm:block">{prettyType(s.type)}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {!allDone ? (
            <motion.div key={lab.stations[at].id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
              <Station station={lab.stations[at]} index={at} total={total} onDone={onDone} onNext={() => setAt((x) => x + 1)} />
            </motion.div>
          ) : (
            <motion.div key="end" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-6" data-testid="lab-done">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <Sparkles className="size-5 text-cyan-300" /> Lab finished: {solved} of {total} levels solved
                </div>
                <ul className="mt-4 space-y-2">
                  {lab.stations.map((s) => {
                    const r = results[s.id];
                    return (
                      <li key={s.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm">
                        <span className={cn("grid size-6 place-items-center rounded-full", r?.solved ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-slate-400")}>
                          {r?.solved ? <Check className="size-3.5" /> : r?.revealed ? <Eye className="size-3.5" /> : <SkipForward className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-slate-200">{s.title}</span>
                        <span className="text-xs text-slate-500">{prettyType(s.type)}</span>
                        <span className="w-24 text-right font-mono text-[11px] text-slate-400">{r ? (r.solved ? `${r.attempts || 1} tr${(r.attempts || 1) === 1 ? "y" : "ies"}` : r.revealed ? "solution" : "skipped") : ""}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-4 text-sm text-slate-300">
                  Next, the check: up to {view.max_items} questions. The closed loop picks each question&apos;s difficulty from your answers and stops early once your mastery estimate passes {view.setpoint}.
                </p>
                <Button className="mt-4" size="lg" onClick={finish} loading={leaving} data-testid="start-check">
                  Start the check <ArrowRight className="size-4" />
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <aside className="flex flex-col gap-4">
        <Card className="p-5" data-testid="toolbox">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="size-4 text-cyan-300" /> Toolbox
          </div>
          <p className="mt-1 text-xs text-slate-500">The ideas and rules from your material that these levels use.</p>
          <ul className="mt-3 space-y-2">
            {lab.toolbox.map((t, i) => (
              <li key={i} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[13px] leading-relaxed text-slate-200">
                {t}
              </li>
            ))}
          </ul>
        </Card>
        <HowMade lab={lab} />
        <Card className="p-5 text-[13px] text-slate-300">
          <div className="mb-2 text-sm font-semibold text-white">This lab&apos;s components</div>
          <div className="flex flex-wrap gap-1.5">
            {lab.stations.map((s) => (
              <Pill key={s.id} tone={family(s.type) === "simulation" ? "violet" : "blue"}>
                {prettyType(s.type)}
              </Pill>
            ))}
          </div>
        </Card>
        <Button variant="ghost" onClick={finish} loading={leaving} data-testid="skip-lab">
          Skip the lab and go to the check
        </Button>
      </aside>
    </main>
  );
}
