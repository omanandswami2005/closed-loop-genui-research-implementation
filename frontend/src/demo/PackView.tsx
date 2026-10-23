import { ArrowLeft, ArrowRight, Clock, Cpu, FileText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { demoApi } from "./api";
import type { LearnerReport, PackSummary } from "./types";
import { AnimatedCircularProgressBar } from "./ui/magicui/animated-circular-progress-bar";
import { BlurFade } from "./ui/magicui/blur-fade";
import { Button, Eyebrow, Pill, Spinner } from "./ui/primitives";
import SpotlightCard from "./ui/reactbits/SpotlightCard";
import { go } from "./useRoute";

const KIND = { pdf: "PDF pages", pptx: "slides", markdown: "lines", text: "lines", paste: "lines" } as Record<string, string>;
const TONE = { mastered: "green", "in progress": "blue", "needs support": "red", "not started": "default" } as const;

export function PackView({ id, learnerId, cached }: { id: string; learnerId: string; cached: boolean }) {
  const [pack, setPack] = useState<PackSummary | null>(null);
  const [report, setReport] = useState<LearnerReport | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    demoApi.pack(id).then(setPack, (e) => setError(e.message));
    demoApi.report(learnerId).then(setReport, () => setReport(null));
  }, [id, learnerId]);

  const start = async (topicId: string) => {
    setStarting(topicId);
    setError(null);
    try {
      const view = await demoApi.startSession(learnerId, id, topicId);
      go(`/learn/${view.session_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(null);
    }
  };

  if (error && !pack) return <p className="p-8 text-sm text-rose-300">{error}</p>;
  if (!pack)
    return (
      <div className="grid place-items-center p-20 text-slate-400">
        <Spinner />
      </div>
    );
  const status = (tid: string) => report?.topics.find((t) => t.pack_id === id && t.topic_id === tid);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <button type="button" onClick={() => go("/library")} className="mb-6 flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="size-4" /> All material
      </button>
      <BlurFade>
        <Eyebrow>Step 3 · pick a topic</Eyebrow>
        <h1 data-testid="pack-title" className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          {pack.title}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill>
            <FileText className="size-3.5" /> {pack.source_name}
          </Pill>
          <Pill>
            {pack.chars.toLocaleString()} characters · {pack.source_units} {KIND[pack.source_kind] ?? ""}
            {pack.truncated ? " (truncated)" : ""}
          </Pill>
          <Pill tone="violet">
            <Cpu className="size-3.5" /> {pack.model}
          </Pill>
          <Pill tone="blue">
            <Clock className="size-3.5" /> generated in {(pack.generation_ms / 1000).toFixed(1)} s
          </Pill>
          <Pill tone="green">
            <ShieldCheck className="size-3.5" /> {pack.dropped_questions} questions dropped by validation
          </Pill>
          {cached && <Pill tone="amber">this upload served from cache</Pill>}
        </div>
      </BlurFade>
      {error && <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
      <div className="mt-8 grid gap-5 md:grid-cols-2" data-testid="topics">
        {pack.topics.map((t, i) => {
          const s = status(t.id);
          return (
            <BlurFade key={t.id} delay={0.06 * i} inView>
              <SpotlightCard className="flex h-full flex-col !rounded-2xl border border-white/10 !p-6" spotlightColor="rgba(34,211,238,0.14)">
                <section className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono text-xs text-cyan-300">Topic {i + 1}</div>
                      <h3 className="mt-1 text-lg font-semibold leading-snug">{t.title}</h3>
                    </div>
                    {s ? (
                      <div className="flex flex-col items-center gap-1">
                        <AnimatedCircularProgressBar className="size-14 text-xs" value={Math.round(s.mastery_now * 100)} gaugePrimaryColor="#22d3ee" gaugeSecondaryColor="rgba(255,255,255,0.08)" />
                        <Pill tone={TONE[s.status]}>{s.status}</Pill>
                      </div>
                    ) : (
                      <Pill>{t.questions} questions</Pill>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">{t.summary}</p>
                  <ul className="mt-4 space-y-2">
                    {t.key_points.map((k) => (
                      <li key={k} className="flex gap-2.5 text-[13px] text-slate-400">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cyan-400/70" />
                        {k}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex items-center justify-between pt-6">
                    <span className="text-xs text-slate-500">Recognise · Understand · Recall · Apply</span>
                    <Button onClick={() => void start(t.id)} disabled={starting !== null} data-testid={`learn-${t.id}`}>
                      {starting === t.id ? <Spinner /> : null}
                      {s ? "Learn again" : "Start topic"} <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </section>
              </SpotlightCard>
            </BlurFade>
          );
        })}
      </div>
    </main>
  );
}
