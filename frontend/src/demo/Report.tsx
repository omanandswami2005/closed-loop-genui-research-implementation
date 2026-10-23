import { ArrowRight, BookOpen, CheckCircle2, ChevronDown, Lightbulb, Printer, Target, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { demoApi } from "./api";
import { cn } from "./lib/utils";
import type { LearnerReport, TopicReport } from "./types";
import { AnimatedCircularProgressBar } from "./ui/magicui/animated-circular-progress-bar";
import { BlurFade } from "./ui/magicui/blur-fade";
import { NumberTicker } from "./ui/magicui/number-ticker";
import { Button, Card, Eyebrow, LEVELS, Pill, Spinner } from "./ui/primitives";
import { go } from "./useRoute";

const PRIOR = { new: "new to the material", little: "knows a little", well: "knows it fairly well" };
const TONE = { mastered: "green", "in progress": "blue", "needs support": "red", "not started": "default" } as const;

function Spark({ start, trace }: { start: number; trace: number[] }) {
  const vals = [start, ...trace];
  const W = 220;
  const H = 56;
  const x = (i: number) => (vals.length < 2 ? 0 : (i / (vals.length - 1)) * (W - 4) + 2);
  const y = (v: number) => H - 4 - v * (H - 8);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full max-w-56" aria-label="mastery estimate over answers">
      <defs>
        <linearGradient id="sp" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={0} x2={W} y1={y(0.95)} y2={y(0.95)} stroke="#a78bfa" strokeDasharray="3 3" strokeOpacity={0.7} />
      <path d={`${d} L${x(vals.length - 1)} ${H} L${x(0)} ${H} Z`} fill="url(#sp)" />
      <motion.path d={d} fill="none" stroke="#22d3ee" strokeWidth={2} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
    </svg>
  );
}

function TopicCard({ t, i }: { t: TopicReport; i: number }) {
  const [open, setOpen] = useState(false);
  return (
    <BlurFade delay={0.06 * i} inView>
      <Card className="p-6">
        <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
          <AnimatedCircularProgressBar className="size-24 text-lg" value={Math.round(t.mastery_now * 100)} gaugePrimaryColor="#22d3ee" gaugeSecondaryColor="rgba(255,255,255,0.08)" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{t.topic_title}</h3>
              <span data-testid="report-status">
                <Pill tone={TONE[t.status]}>{t.status}</Pill>
              </span>
            </div>
            <div className="mt-0.5 text-xs text-slate-500">{t.pack_title}</div>
            <p className="mt-2 text-sm text-slate-300">{t.advice}</p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <Spark start={t.mastery_start} trace={t.trace} />
            <span className="font-mono text-[11px] text-slate-400">
              estimate {t.mastery_start.toFixed(2)} → {t.mastery_now.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Lab levels", t.lab?.stations ? `${t.lab.solved}/${t.lab.stations} solved · ${t.lab.first_try} first try` : "—"],
            ["Answers", `${t.correct}/${t.answered} correct`],
            ["Highest level", t.highest_level ? `${t.highest_level} · ${LEVELS[t.highest_level - 1]}` : "—"],
            ["Hints opened", String(t.hints_opened)],
            ["Screens", `${t.gemini_screens} Gemini · ${t.template_screens ?? 0} template · ${t.fallback_screens} fallback`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
              <div className="text-[11px] text-slate-500">{k}</div>
              <div className="text-sm font-medium text-slate-100">{v}</div>
            </div>
          ))}
        </div>
        {t.missed.length > 0 && (
          <div className="mt-4">
            <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between rounded-xl px-1 py-2 text-sm font-medium text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <Lightbulb className="size-4 text-amber-300" /> To review ({t.missed.length})
              </span>
              <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-2 overflow-hidden">
                  {t.missed.map((m, j) => (
                    <li key={j} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm">
                      <div className="text-slate-100">{m.prompt}</div>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                        <Pill tone="red">given: {m.your_answer || "—"}</Pill>
                        <Pill tone="green">correct: {m.correct_answer}</Pill>
                      </div>
                      <p className="mt-1.5 text-slate-400">{m.explanation}</p>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </Card>
    </BlurFade>
  );
}

export function Report({ learnerId }: { learnerId: string }) {
  const [r, setR] = useState<LearnerReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    demoApi.report(learnerId).then(setR, (e) => setError(e.message));
  }, [learnerId]);
  if (error) return <p className="p-8 text-sm text-rose-300">{error}</p>;
  if (!r)
    return (
      <div className="grid place-items-center p-24 text-slate-400">
        <Spinner />
      </div>
    );
  const p = r.profile;
  const acc = r.totals.answered ? Math.round((100 * r.totals.correct) / r.totals.answered) : 0;
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <BlurFade>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Progress report</Eyebrow>
            <h1 data-testid="report-name" className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              {p.name}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {p.grade}
              {p.interests ? ` · interests: ${p.interests}` : ""} · started as {PRIOR[p.prior]}
              {p.goal ? ` · goal: ${p.goal}` : ""}
            </p>
          </div>
          <Button variant="secondary" onClick={() => window.print()} className="no-print">
            <Printer className="size-4" /> Print or save as PDF
          </Button>
        </div>
      </BlurFade>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { icon: BookOpen, label: "Topics started", v: r.totals.topics_started, testId: "report-started" },
          { icon: Trophy, label: "Topics mastered", v: r.totals.topics_mastered },
          { icon: CheckCircle2, label: "Answers", v: r.totals.answered },
          { icon: Target, label: "Accuracy %", v: acc },
        ].map((s, i) => (
          <BlurFade key={s.label} delay={0.05 * i}>
            <Card className="p-5">
              <s.icon className="size-5 text-cyan-300" />
              <div className="mt-3 text-3xl font-semibold tabular-nums">
                <span data-testid={s.testId} className="sr-only">
                  {s.v}
                </span>
                <NumberTicker value={s.v} className="!text-white" />
              </div>
              <div className="text-xs text-slate-400">{s.label}</div>
            </Card>
          </BlurFade>
        ))}
      </div>

      <div className="mt-8 space-y-4">
        {r.topics.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-slate-300">No topics started yet.</p>
            <Button className="mt-4" onClick={() => go("/library")}>
              Pick some material <ArrowRight className="size-4" />
            </Button>
          </Card>
        ) : (
          r.topics.map((t, i) => <TopicCard key={`${t.pack_id}:${t.topic_id}`} t={t} i={i} />)
        )}
      </div>
      <p className="mt-8 text-xs leading-relaxed text-slate-500">
        &quot;Estimate&quot; is the Bayesian Knowledge Tracing model&apos;s probability that the topic is known, updated after each answer. It is a model output for this
        demo, not a validated measure of learning.
      </p>
    </main>
  );
}
