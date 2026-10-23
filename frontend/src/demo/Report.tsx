import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Btn, Panel } from "../clt/Panel";
import { demoApi } from "./api";
import type { LearnerReport, TopicReport } from "./types";
import { go } from "./useRoute";

const PRIOR = { new: "new to the material", little: "knows a little", well: "knows it fairly well" };
const TONE: Record<TopicReport["status"], string> = {
  mastered: "text-emerald-700 border-emerald-700",
  "in progress": "text-cobalt border-cobalt",
  "needs support": "text-red-700 border-red-700",
  "not started": "text-slate-500 border-slate-400",
};

function Spark({ start, trace }: { start: number; trace: number[] }) {
  const vals = [start, ...trace];
  const W = 160;
  const H = 36;
  const x = (i: number) => (vals.length < 2 ? 0 : (i / (vals.length - 1)) * (W - 4) + 2);
  const y = (v: number) => H - 3 - v * (H - 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-40" aria-label="mastery estimate over answers">
      <line x1={0} x2={W} y1={y(0.95)} y2={y(0.95)} stroke="#2563eb" strokeDasharray="2 3" />
      <path d={vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")} fill="none" stroke="#0f172a" strokeWidth={1.5} />
    </svg>
  );
}

export function Report({ learnerId }: { learnerId: string }) {
  const [r, setR] = useState<LearnerReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    demoApi.report(learnerId).then(setR, (e) => setError(e.message));
  }, [learnerId]);
  if (error) return <p className="p-4 font-mono text-xs text-red-300">{error}</p>;
  if (!r) return <p className="p-4 font-mono text-xs text-slate-400">loading…</p>;
  const p = r.profile;
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border border-zinc-800 bg-white px-4 py-3 text-slate-900">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">progress report</span>
          <h2 data-testid="report-name" className="text-lg font-semibold">
            {p.name}
          </h2>
          <p className="font-mono text-[11px] text-slate-600">
            {p.grade}
            {p.interests ? ` · interests: ${p.interests}` : ""} · onboarding: {PRIOR[p.prior]}
            {p.goal ? ` · goal: ${p.goal}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <dl className="grid grid-cols-2 gap-x-3 font-mono text-[11px] text-slate-700">
            <dt className="text-slate-400">topics started</dt>
            <dd data-testid="report-started">{r.totals.topics_started}</dd>
            <dt className="text-slate-400">mastered</dt>
            <dd>{r.totals.topics_mastered}</dd>
            <dt className="text-slate-400">answers</dt>
            <dd>
              {r.totals.correct}/{r.totals.answered} correct
            </dd>
          </dl>
          <span className="print:hidden">
            <Btn onClick={() => window.print()}>
              <span className="flex items-center gap-1.5">
                <Printer size={12} aria-hidden /> print
              </span>
            </Btn>
          </span>
        </div>
      </div>

      {r.topics.length === 0 && (
        <p className="border border-zinc-800 p-4 text-sm text-slate-300">
          No topics started yet.{" "}
          <button type="button" className="text-blue-400 underline" onClick={() => go("/library")}>
            Pick some material
          </button>
          .
        </p>
      )}

      {r.topics.map((t, i) => (
        <Panel key={`${t.pack_id}:${t.topic_id}`} code={`R${i + 1}`} title={t.topic_title} meta={t.pack_title}>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <span data-testid="report-status" className={`inline-block border px-1.5 py-px font-mono text-[10px] uppercase ${TONE[t.status]}`}>
                {t.status}
              </span>
              <p className="mt-1 text-sm text-slate-700">{t.advice}</p>
            </div>
            <div className="flex items-center gap-3">
              <Spark start={t.mastery_start} trace={t.trace} />
              <dl className="grid grid-cols-2 gap-x-3 font-mono text-[11px] text-slate-700">
                <dt className="text-slate-400">estimate</dt>
                <dd>
                  {t.mastery_start.toFixed(2)} → {t.mastery_now.toFixed(2)}
                </dd>
                <dt className="text-slate-400">answers</dt>
                <dd>
                  {t.correct}/{t.answered}
                </dd>
                <dt className="text-slate-400">top level</dt>
                <dd>{t.highest_level ?? "—"} of 4</dd>
                <dt className="text-slate-400">hints</dt>
                <dd>{t.hints_opened}</dd>
              </dl>
            </div>
          </div>
          {t.missed.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">to review ({t.missed.length})</div>
              <ul className="divide-y divide-zinc-200 border-t border-zinc-200">
                {t.missed.map((m, j) => (
                  <li key={j} className="grid gap-0.5 py-1.5 text-[13px]">
                    <span className="text-slate-900">{m.prompt}</span>
                    <span className="font-mono text-[11px]">
                      <span className="text-red-700">given: {m.your_answer || "—"}</span> · <span className="text-emerald-700">correct: {m.correct_answer}</span>
                    </span>
                    <span className="text-slate-600">{m.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 font-mono text-[10px] text-slate-400">
            {t.minutes} min · {t.gemini_screens} screens written by Gemini · {t.fallback_screens} fallback screens · levels seen{" "}
            {t.levels_seen.join(", ") || "—"}
          </p>
        </Panel>
      ))}
      <p className="text-[11px] leading-relaxed text-slate-400">
        &quot;Estimate&quot; is the Bayesian Knowledge Tracing model&apos;s probability that the topic is known, updated after each answer. It is
        a model output for this demo, not a validated measure of learning.
      </p>
    </main>
  );
}
