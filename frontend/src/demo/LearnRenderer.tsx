import { Check, ChevronDown, Lightbulb, Lock, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useState } from "react";
import { cn } from "./lib/utils";
import type {
  BlankQuestionNode,
  ChoiceQuestionNode,
  ConceptCardNode,
  HintAccordionNode,
  LearnNode,
  QuestionView,
  WorkedExplanationNode,
} from "./types";
import { BorderBeam } from "./ui/magicui/border-beam";
import { Button, Card } from "./ui/primitives";

export interface LearnContextValue {
  question: QuestionView;
  busy: boolean;
  submit: (answer: string, justification: string) => void;
  hintOpened: (count: number) => void;
}

export const LearnContext = createContext<LearnContextValue | null>(null);

function useLearn(): LearnContextValue {
  const ctx = useContext(LearnContext);
  if (!ctx) throw new Error("LearnContext missing");
  return ctx;
}

const appear = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: "easeOut" as const } };

function ConceptCard({ node }: { node: ConceptCardNode }) {
  return (
    <motion.div {...appear}>
      <Card className="p-5" data-component="ConceptCard">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Sparkles className="size-4 text-cyan-300" /> Key ideas
          <span className="ml-auto truncate text-xs font-normal text-slate-500">{node.title}</span>
        </div>
        <ul className="mt-3 space-y-2">
          {node.points.map((p, i) => (
            <li
              key={i}
              className={cn(
                "rounded-xl px-3 py-2 text-sm leading-relaxed",
                i === node.highlight ? "border border-cyan-400/40 bg-cyan-400/10 text-white shadow-[0_0_24px_-10px_rgba(34,211,238,0.6)]" : "text-slate-300",
              )}
            >
              {p}
              {i === node.highlight && <span className="ml-2 rounded-full bg-cyan-400/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-cyan-200">look here</span>}
            </li>
          ))}
        </ul>
      </Card>
    </motion.div>
  );
}

function WorkedExplanation({ node }: { node: WorkedExplanationNode }) {
  return (
    <motion.div {...appear}>
      <Card className="p-5" data-component="WorkedExplanation">
        <div className="text-sm font-semibold text-slate-200">Worked example</div>
        <ol className="relative mt-4 space-y-4 border-l border-white/10 pl-5">
          {node.steps.map((s, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[27px] top-0.5 grid size-3.5 place-items-center rounded-full border border-blue-400/60 bg-[#0b1222]">
                <span className="size-1.5 rounded-full bg-blue-400" />
              </span>
              <div className="font-mono text-[11px] uppercase tracking-wider text-blue-300">{s.label}</div>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-300">{s.text}</p>
            </li>
          ))}
        </ol>
      </Card>
    </motion.div>
  );
}

function HintAccordion({ node }: { node: HintAccordionNode }) {
  const { hintOpened } = useLearn();
  const [open, setOpen] = useState(0);
  return (
    <motion.div {...appear}>
      <Card className="p-5" data-component="HintAccordion">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Lightbulb className="size-4 text-amber-300" /> Hints
          <span className="ml-auto font-mono text-xs font-normal text-slate-500">
            {open}/{node.hints.length} opened
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {node.hints.map((hint, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-white/10">
              {i < open ? (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="bg-amber-400/5 px-4 py-3 text-sm text-slate-200">
                  <span className="mr-2 font-mono text-[11px] text-amber-300">#{i + 1}</span>
                  {hint}
                </motion.p>
              ) : (
                <button
                  type="button"
                  disabled={i !== open}
                  onClick={() => {
                    setOpen(i + 1);
                    hintOpened(i + 1);
                  }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-400 transition enabled:hover:bg-white/5 enabled:hover:text-white disabled:opacity-50"
                >
                  <span>{i === open ? `Reveal hint ${i + 1}` : `Hint ${i + 1}`}</span>
                  {i === open ? <ChevronDown className="size-4" /> : <Lock className="size-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

const STYLE_TITLE = { guided: "Guided question", plain: "Question", apply: "Apply it" };
const LETTERS = "ABCD";

function QuestionCard({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <motion.div {...appear}>
      <Card className="overflow-hidden p-6 md:p-7">
        <BorderBeam size={160} duration={8} colorFrom="#3b82f6" colorTo="#22d3ee" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-200">{title}</span>
          <span className="font-mono text-[11px] text-slate-500">{meta}</span>
        </div>
        {children}
      </Card>
    </motion.div>
  );
}

function ChoiceQuestion({ node }: { node: ChoiceQuestionNode }) {
  const { question, busy, submit } = useLearn();
  const [picked, setPicked] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const options = question.options ?? [];
  const evidence = question.evidence ?? [];
  const extras = [node.justify && "reasoning", evidence.length > 0 && `${evidence.length} key ideas`].filter(Boolean).join(" + ");
  return (
    <QuestionCard title={STYLE_TITLE[node.style]} meta={`${options.length} options${extras ? ` + ${extras}` : ""}`}>
      <p data-testid="question-prompt" className="text-lg font-semibold leading-snug text-white md:text-xl">
        {question.prompt}
      </p>
      {node.key_idea && (
        <div data-testid="key-idea" className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-3.5 py-2.5 text-sm text-amber-50">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <span>
            <span className="font-semibold text-amber-200">Think about: </span>
            {node.key_idea}
          </span>
        </div>
      )}
      <div role="radiogroup" className="mt-5 grid gap-2.5">
        {options.map((o, i) => (
          <motion.button
            key={o}
            type="button"
            role="radio"
            aria-checked={picked === o}
            data-testid={`option-${i}`}
            onClick={() => setPicked(o)}
            whileTap={{ scale: 0.99 }}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0, transition: { delay: 0.05 * i } }}
            className={cn(
              "group flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left text-[15px] transition",
              picked === o ? "border-blue-400/70 bg-blue-500/15 text-white shadow-[0_0_0_4px_rgba(59,130,246,0.15)]" : "border-white/10 bg-white/[0.02] text-slate-200 hover:border-white/25 hover:bg-white/[0.05]",
            )}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-lg font-mono text-xs transition",
                picked === o ? "bg-blue-500 text-white" : "bg-white/5 text-slate-400 group-hover:text-white",
              )}
            >
              {picked === o ? <Check className="size-4" /> : LETTERS[i]}
            </span>
            <span className="pt-0.5">{o}</span>
          </motion.button>
        ))}
      </div>
      {evidence.length > 0 && (
        <fieldset className="mt-5 rounded-2xl border border-white/10 p-4">
          <legend className="px-1 text-xs font-medium text-slate-400">Which key ideas support your choice? (not marked)</legend>
          <div className="grid gap-2">
            {evidence.map((k, i) => (
              <label key={k} className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="mt-1 accent-cyan-400"
                  checked={ticked.has(i)}
                  onChange={() =>
                    setTicked((old) => {
                      const next = new Set(old);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                />
                {k}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {node.justify && (
        <textarea
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          rows={2}
          maxLength={600}
          placeholder="Why? (optional, not marked)"
          className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-blue-400/60"
        />
      )}
      <div className="mt-6 flex justify-end">
        <Button size="lg" disabled={busy || !picked} onClick={() => picked && submit(picked, why)} data-testid="submit">
          {busy ? "Checking…" : "Submit answer"}
        </Button>
      </div>
    </QuestionCard>
  );
}

function BlankQuestion({ node }: { node: BlankQuestionNode }) {
  const { question, busy, submit } = useLearn();
  const [value, setValue] = useState("");
  const [before, after] = question.prompt.split("____");
  const chips = question.word_bank ?? [];
  return (
    <QuestionCard title="Fill the gap" meta={node.word_bank ? `word bank · ${chips.length}` : "from memory"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) submit(value.trim(), "");
        }}
      >
        <p data-testid="question-prompt" className="text-lg font-semibold leading-[2.2] text-white md:text-xl">
          {before}
          <input
            data-testid="blank-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="missing word"
            className="mx-1.5 inline-block w-48 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-0.5 font-mono text-base text-cyan-100 outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/15"
            maxLength={80}
          />
          {after}
        </p>
        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValue(c)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition",
                  value === c ? "border-cyan-300 bg-cyan-400/20 text-white" : "border-white/15 bg-white/[0.03] text-slate-300 hover:border-white/30",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <Button size="lg" disabled={busy || !value.trim()} onClick={() => value.trim() && submit(value.trim(), "")} data-testid="submit">
            {busy ? "Checking…" : "Submit answer"}
          </Button>
        </div>
      </form>
    </QuestionCard>
  );
}

/** Deterministic renderer: a closed set of components; no generated code is ever executed. */
export function LearnRenderer({ node }: { node: LearnNode }) {
  switch (node.type) {
    case "Stack":
      return (
        <div className={node.direction === "horizontal" ? "grid gap-4 md:grid-cols-2" : "flex flex-col gap-4"}>
          <AnimatePresence>
            {node.children.map((c, i) => (
              <LearnRenderer key={i} node={c} />
            ))}
          </AnimatePresence>
        </div>
      );
    case "Prompt":
      return (
        <motion.p {...appear} className="flex items-center gap-2 text-sm text-slate-400">
          <span className="h-px w-6 bg-gradient-to-r from-cyan-400 to-transparent" />
          {node.text}
        </motion.p>
      );
    case "ConceptCard":
      return <ConceptCard node={node} />;
    case "WorkedExplanation":
      return <WorkedExplanation node={node} />;
    case "HintAccordion":
      return <HintAccordion node={node} />;
    case "ChoiceQuestion":
      return <ChoiceQuestion node={node} />;
    case "BlankQuestion":
      return <BlankQuestion node={node} />;
  }
}
