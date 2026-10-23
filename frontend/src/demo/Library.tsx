import { ArrowRight, FileText, FileUp, Presentation, Sparkles, Type, UploadCloud, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { demoApi } from "./api";
import { cn } from "./lib/utils";
import type { PackSummary } from "./types";
import { BlurFade } from "./ui/magicui/blur-fade";
import { BorderBeam } from "./ui/magicui/border-beam";
import { Button, Card, Eyebrow, inputClass, Pill } from "./ui/primitives";
import SpotlightCard from "./ui/reactbits/SpotlightCard";
import { go } from "./useRoute";

const STAGES = [
  { at: 0, text: "Reading the document and extracting its text" },
  { at: 1.5, text: "Gemini is outlining the topics" },
  { at: 8, text: "Gemini is writing 12 questions per topic, in parallel" },
  { at: 30, text: "Checking every question: answer among the options, one gap per blank, no duplicates" },
];

function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const I = kind === "pptx" ? Presentation : kind === "paste" ? Type : FileText;
  return <I className={className} />;
}

export function PackCard({ p, i }: { p: PackSummary; i: number }) {
  const n = p.topics.reduce((s, t) => s + t.questions, 0);
  return (
    <BlurFade delay={0.05 * i} inView>
      <button type="button" data-testid={`pack-${p.id}`} onClick={() => go(`/pack/${p.id}`)} className="block h-full w-full text-left">
        <SpotlightCard className="h-full !rounded-2xl border border-white/10 !p-5 transition hover:border-white/20" spotlightColor="rgba(59,130,246,0.2)">
          <div className="flex items-start justify-between gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-blue-500/10 text-blue-300 ring-1 ring-white/10">
              <KindIcon kind={p.source_kind} className="size-5" />
            </div>
            <Pill tone={p.seeded ? "default" : "green"}>{p.seeded ? "sample" : "yours"}</Pill>
          </div>
          <div className="mt-4 line-clamp-2 font-semibold">{p.title}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{p.source_name}</div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
            <span>
              {p.topics.length} topics · {n} questions
            </span>
            <ArrowRight className="size-4 text-slate-500" />
          </div>
        </SpotlightCard>
      </button>
    </BlurFade>
  );
}

function Generating({ elapsed }: { elapsed: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-[#060a13]/80 p-4 backdrop-blur-md"
      data-testid="generating"
      role="status"
    >
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} className="glass relative w-full max-w-xl overflow-hidden rounded-3xl p-6">
        <BorderBeam size={200} duration={4} colorFrom="#3b82f6" colorTo="#22d3ee" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300">
              <Sparkles className="size-4 animate-pulse" />
            </div>
            <div>
              <div className="font-semibold">Building your question bank</div>
              <div className="text-xs text-slate-400">Live Gemini calls · usually 20 to 60 seconds</div>
            </div>
          </div>
          <span className="font-mono text-sm tabular-nums text-slate-300">{elapsed.toFixed(1)} s</span>
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[12.5px] leading-relaxed">
          {STAGES.map((s, i) => {
            const next = STAGES[i + 1]?.at ?? Infinity;
            const state = elapsed >= next ? "done" : elapsed >= s.at ? "run" : "wait";
            return (
              <AnimatePresence key={s.text}>
                {state !== "wait" && (
                  <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className={cn("flex gap-2", state === "done" ? "text-emerald-300" : "text-slate-100")}>
                    <span>{state === "done" ? "✔" : "›"}</span>
                    <span>
                      {s.text}
                      {state === "run" && <span className="ml-1 inline-block w-2 animate-pulse bg-cyan-300">&nbsp;</span>}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            );
          })}
        </div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-violet-400" animate={{ width: `${Math.min(96, 8 + elapsed * 1.8)}%` }} transition={{ ease: "easeOut" }} />
        </div>
      </motion.div>
    </motion.div>
  );
}

export function Library() {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    demoApi.packs().then(setPacks, (e) => setError(String(e.message ?? e)));
  }, []);
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    return () => window.clearInterval(id);
  }, [busy]);

  const run = async (job: () => Promise<PackSummary>) => {
    setBusy(true);
    setElapsed(0);
    setError(null);
    try {
      const pack = await job();
      go(`/pack/${pack.id}${pack.cached ? "/cached" : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const samples = packs?.filter((p) => p.seeded) ?? [];
  const mine = packs?.filter((p) => !p.seeded) ?? [];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <AnimatePresence>{busy && <Generating elapsed={elapsed} />}</AnimatePresence>
      <BlurFade>
        <Eyebrow>Step 2 · material</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">What do you want to learn?</h1>
        <p className="mt-2 max-w-2xl text-slate-400">Upload a document or paste text. Gemini turns it into topics, each with twelve checked questions at four levels.</p>
      </BlurFade>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="overflow-hidden p-2">
          <div className="flex gap-1 p-1" role="tablist">
            {(["upload", "paste"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                type="button"
                onClick={() => setTab(t)}
                className={cn("relative flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition", tab === t ? "text-white" : "text-slate-400 hover:text-white")}
              >
                {tab === t && <motion.span layoutId="tab" className="absolute inset-0 rounded-xl bg-white/[0.07] ring-1 ring-white/10" />}
                <span className="relative flex items-center justify-center gap-2">
                  {t === "upload" ? <FileUp className="size-4" /> : <Type className="size-4" />}
                  {t === "upload" ? "Upload a file" : "Paste text"}
                </span>
              </button>
            ))}
          </div>
          <div className="p-4 md:p-6">
            {tab === "upload" ? (
              <div
                data-testid="dropzone"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  const f = e.dataTransfer.files[0];
                  if (f) setFile(f);
                }}
                className={cn(
                  "relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed px-6 py-12 text-center transition",
                  drag ? "border-cyan-400/70 bg-cyan-400/5" : file ? "border-blue-400/40 bg-blue-500/5" : "border-white/15 hover:border-white/25",
                )}
              >
                {file && <BorderBeam size={120} duration={6} colorFrom="#3b82f6" colorTo="#22d3ee" />}
                <motion.div animate={{ y: drag ? -4 : 0 }} className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/25 to-cyan-400/10 text-cyan-300 ring-1 ring-white/10">
                  <UploadCloud className="size-7" />
                </motion.div>
                {file ? (
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-3 pr-1.5 text-sm">
                    <KindIcon kind={file.name.endsWith(".pptx") ? "pptx" : "pdf"} className="size-4 text-blue-300" />
                    <span className="max-w-64 truncate">{file.name}</span>
                    <span className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB</span>
                    <button type="button" aria-label="remove file" onClick={() => setFile(null)} className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium">Drop a file here</div>
                    <div className="mt-1 text-sm text-slate-400">PDF, PowerPoint, Markdown or text · up to 15 MB</div>
                  </div>
                )}
                <input ref={input} data-testid="file-input" type="file" accept=".pdf,.pptx,.txt,.md,.markdown" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
                    Choose file
                  </Button>
                  <Button disabled={busy || !file} onClick={() => file && void run(() => demoApi.uploadFile(file))} data-testid="generate-file">
                    <Sparkles className="size-4" /> Generate topics
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                <input data-testid="paste-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Title (optional)" maxLength={80} className={inputClass} />
                <textarea
                  data-testid="paste-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={10}
                  placeholder="Paste notes, a chapter or an article (at least 200 characters)."
                  className={cn(inputClass, "resize-y font-mono text-[13px] leading-relaxed")}
                />
                <div className="flex items-center justify-between">
                  <span className={cn("font-mono text-xs", text.trim().length >= 200 ? "text-emerald-300" : "text-slate-500")}>{text.length.toLocaleString()} characters</span>
                  <Button disabled={busy || text.trim().length < 200} onClick={() => void run(() => demoApi.uploadText(text, name))} data-testid="generate-text">
                    <Sparkles className="size-4" /> Generate topics
                  </Button>
                </div>
              </div>
            )}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  data-testid="upload-error"
                  role="alert"
                  className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>

        <aside className="space-y-4">
          <Card className="p-5">
            <div className="font-semibold">How generation works</div>
            <ol className="mt-3 space-y-3 text-sm text-slate-400">
              {["One Gemini call outlines 2 to 5 topics from the text.", "One call per topic writes 12 questions: recognise, understand, recall (fill the gap) and apply.", "Every question is checked; bad ones are dropped and counted.", "The same file uploaded again opens instantly from cache."].map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-500/15 font-mono text-[10px] text-blue-300">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>

      <section className="mt-12" data-testid="samples">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold">Sample packs</h2>
            <p className="text-sm text-slate-400">Generated by the same pipeline from the documents in docs/demo/samples. Open instantly, work offline.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packs === null ? [0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/[0.03]" />) : samples.map((p, i) => <PackCard key={p.id} p={p} i={i} />)}
        </div>
      </section>
      {mine.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Generated on this server</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((p, i) => (
              <PackCard key={p.id} p={p} i={i} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
