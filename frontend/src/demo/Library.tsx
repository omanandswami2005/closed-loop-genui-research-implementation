import { FileText, FileUp, Loader2, Presentation, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Btn, Panel } from "../clt/Panel";
import { demoApi } from "./api";
import type { PackSummary } from "./types";
import { go } from "./useRoute";

const STAGES = [
  "reading the document and extracting its text",
  "Gemini is outlining the topics",
  "Gemini is writing 12 questions per topic (in parallel)",
  "checking every question: answer among the options, one gap per blank, no duplicates",
];

function KindIcon({ kind }: { kind: string }) {
  if (kind === "pptx") return <Presentation size={14} className="text-cobalt" aria-hidden />;
  if (kind === "paste") return <Type size={14} className="text-cobalt" aria-hidden />;
  return <FileText size={14} className="text-cobalt" aria-hidden />;
}

export function PackRow({ p }: { p: PackSummary }) {
  return (
    <li>
      <button
        type="button"
        data-testid={`pack-${p.id}`}
        onClick={() => go(`/pack/${p.id}`)}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-zinc-200 px-1 py-2 text-left hover:bg-slate-50"
      >
        <KindIcon kind={p.source_kind} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">{p.title}</span>
          <span className="block truncate font-mono text-[11px] text-slate-500">
            {p.source_name} · {p.topics.length} topics · {p.topics.reduce((n, t) => n + t.questions, 0)} questions
          </span>
        </span>
        <span className={`font-mono text-[10px] uppercase ${p.seeded ? "text-slate-500" : "text-emerald-700"}`}>{p.seeded ? "sample" : "yours"}</span>
      </button>
    </li>
  );
}

export function Library() {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
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
    const id = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);
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

  const stage = elapsed < 1.5 ? 0 : elapsed < 8 ? 1 : elapsed < 30 ? 2 : 3;
  const samples = packs?.filter((p) => p.seeded) ?? [];
  const mine = packs?.filter((p) => !p.seeded) ?? [];

  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="flex flex-col gap-4">
        <Panel code="M1" title="Upload a document" meta="PDF · PPTX · TXT · MD · max 15 MB">
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
            className={`flex flex-col items-center gap-2 border border-dashed px-4 py-6 text-center ${drag ? "border-cobalt bg-blue-50" : "border-zinc-400"}`}
          >
            <FileUp size={20} className="text-cobalt" aria-hidden />
            <p className="text-sm text-slate-700">{file ? file.name : "Drop a file here, or choose one"}</p>
            <input
              ref={input}
              data-testid="file-input"
              type="file"
              accept=".pdf,.pptx,.txt,.md,.markdown"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex gap-2">
              <Btn onClick={() => input.current?.click()} disabled={busy}>
                choose file
              </Btn>
              <Btn variant="primary" disabled={busy || !file} onClick={() => file && void run(() => demoApi.uploadFile(file))}>
                generate topics
              </Btn>
            </div>
          </div>
        </Panel>

        <Panel code="M2" title="Or paste text" meta={`${text.length.toLocaleString()} characters`}>
          <div className="grid gap-2">
            <input
              data-testid="paste-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Title (optional)"
              maxLength={80}
              className="border border-zinc-800 px-2 py-1 text-sm focus:border-cobalt"
            />
            <textarea
              data-testid="paste-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder="Paste notes, a chapter or an article (at least 200 characters)."
              className="border border-zinc-800 px-2 py-1 font-mono text-xs leading-relaxed focus:border-cobalt"
            />
            <div>
              <Btn variant="primary" disabled={busy || text.trim().length < 200} onClick={() => void run(() => demoApi.uploadText(text, name))}>
                generate topics from text
              </Btn>
            </div>
          </div>
        </Panel>

        {busy && (
          <div data-testid="generating" role="status" className="border border-cobalt bg-slatebase p-3 font-mono text-xs text-slate-200">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-blue-300">
                <Loader2 size={12} className="animate-spin" aria-hidden /> generating question bank
              </span>
              <span className="tabular-nums text-slate-400">{elapsed.toFixed(1)} s</span>
            </div>
            <ol className="space-y-1">
              {STAGES.map((s, i) => (
                <li key={s} className={i < stage ? "text-emerald-400" : i === stage ? "text-slate-100" : "text-slate-600"}>
                  {i < stage ? "✓" : i === stage ? "›" : "·"} {s}
                </li>
              ))}
            </ol>
          </div>
        )}
        {error && (
          <div data-testid="upload-error" role="alert" className="border border-red-700 bg-red-950/40 px-3 py-2 font-mono text-xs text-red-300">
            {error}
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <Panel code="M3" title="Ready-made sample packs" meta="pre-generated by Gemini">
          {packs === null ? <p className="font-mono text-xs text-slate-500">loading…</p> : <ul>{samples.map((p) => <PackRow key={p.id} p={p} />)}</ul>}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Built from the sample documents in <span className="font-mono">docs/demo/samples/</span> with the same pipeline as an upload, so they open
            instantly and work offline.
          </p>
        </Panel>
        {mine.length > 0 && (
          <Panel code="M4" title="Generated on this server" meta={`${mine.length}`}>
            <ul>
              {mine.map((p) => (
                <PackRow key={p.id} p={p} />
              ))}
            </ul>
          </Panel>
        )}
        <div className="space-y-2 text-[12px] leading-relaxed text-slate-400">
          <p>
            One Gemini call outlines 3 to 5 topics; then one call per topic writes 12 questions at four levels: recognise, understand, recall
            (fill the gap) and apply.
          </p>
          <p>Every question is checked before use. The same file uploaded again is served from cache.</p>
        </div>
      </aside>
    </main>
  );
}
