import { createContext, useContext, useState } from "react";
import { Btn, Panel } from "../clt/Panel";
import type {
  BlankQuestionNode,
  ChoiceQuestionNode,
  ConceptCardNode,
  HintAccordionNode,
  LearnNode,
  QuestionView,
  WorkedExplanationNode,
} from "./types";

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

function ConceptCard({ node }: { node: ConceptCardNode }) {
  return (
    <Panel code="K1" title="Key ideas" meta={node.title}>
      <ul className="space-y-1.5">
        {node.points.map((p, i) => (
          <li
            key={i}
            className={`border-l-2 pl-2 text-sm ${i === node.highlight ? "border-cobalt bg-blue-50 py-0.5 text-slate-900" : "border-zinc-200 text-slate-700"}`}
          >
            {p}
            {i === node.highlight && <span className="ml-2 font-mono text-[10px] uppercase text-cobalt">look here</span>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function WorkedExplanation({ node }: { node: WorkedExplanationNode }) {
  return (
    <Panel code="K2" title="Worked example" meta={`${node.steps.length} step${node.steps.length > 1 ? "s" : ""}`}>
      <ol className="divide-y divide-zinc-200">
        {node.steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[5rem_1fr] items-baseline gap-3 py-1.5">
            <span className="font-mono text-[11px] uppercase text-cobalt">{s.label}</span>
            <span className="text-sm text-slate-700">{s.text}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function HintAccordion({ node }: { node: HintAccordionNode }) {
  const { hintOpened } = useLearn();
  const [open, setOpen] = useState(0);
  return (
    <Panel code="K3" title="Hints" meta={`${open}/${node.hints.length} opened`}>
      <ol className="space-y-1.5">
        {node.hints.map((hint, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-1 w-12 font-mono text-[11px] text-slate-500">tier {i + 1}</span>
            {i < open ? (
              <p className="flex-1 border-l-2 border-cobalt pl-2 text-sm">{hint}</p>
            ) : (
              <Btn
                disabled={i !== open}
                onClick={() => {
                  setOpen(i + 1);
                  hintOpened(i + 1);
                }}
              >
                reveal
              </Btn>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

const STYLE_TITLE = { guided: "Guided question", plain: "Question", apply: "Apply it" };
const LETTERS = "ABCD";

function ChoiceQuestion({ node }: { node: ChoiceQuestionNode }) {
  const { question, busy, submit } = useLearn();
  const [picked, setPicked] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const options = question.options ?? [];
  const evidence = question.evidence ?? [];
  const extras = [node.justify && "reasoning", evidence.length > 0 && `${evidence.length} key ideas`].filter(Boolean).join(" + ");
  return (
    <Panel code="Q" title={STYLE_TITLE[node.style]} meta={`${options.length} options${extras ? ` + ${extras}` : ""}`}>
      <p data-testid="question-prompt" className="mb-3 text-[15px] font-semibold leading-snug text-slate-900">
        {question.prompt}
      </p>
      <div role="radiogroup" className="grid gap-1.5">
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={picked === o}
            data-testid={`option-${i}`}
            onClick={() => setPicked(o)}
            className={`grid grid-cols-[1.75rem_1fr] items-baseline border px-2 py-1.5 text-left text-sm ${picked === o ? "border-cobalt bg-blue-50" : "border-zinc-300 hover:border-zinc-600"}`}
          >
            <span className="font-mono text-xs text-cobalt">{LETTERS[i]}</span>
            <span>{o}</span>
          </button>
        ))}
      </div>
      {evidence.length > 0 && (
        <fieldset className="mt-3 border-t border-zinc-200 pt-2">
          <legend className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">which key ideas support your choice? (not marked)</legend>
          <div className="mt-1 grid gap-1">
            {evidence.map((k, i) => (
              <label key={k} className="flex items-start gap-2 text-[13px] text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1"
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
          className="mt-2 w-full border border-zinc-300 px-2 py-1 text-sm focus:border-cobalt"
        />
      )}
      <div className="mt-3">
        <Btn variant="primary" disabled={busy || !picked} onClick={() => picked && submit(picked, why)}>
          <span data-testid="submit">{busy ? "checking…" : "submit answer"}</span>
        </Btn>
      </div>
    </Panel>
  );
}

function BlankQuestion({ node }: { node: BlankQuestionNode }) {
  const { question, busy, submit } = useLearn();
  const [value, setValue] = useState("");
  const [before, after] = question.prompt.split("____");
  const chips = question.word_bank ?? [];
  return (
    <Panel code="Q" title="Fill the gap" meta={node.word_bank ? `word bank · ${chips.length}` : "from memory"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) submit(value.trim(), "");
        }}
      >
        <p data-testid="question-prompt" className="text-[15px] font-semibold leading-loose text-slate-900">
          {before}
          <input
            data-testid="blank-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="missing word"
            className="mx-1 inline-block w-44 border-b-2 border-cobalt bg-blue-50 px-1 font-mono text-sm focus:outline-none"
            maxLength={80}
          />
          {after}
        </p>
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValue(c)}
                className={`border px-2 py-0.5 font-mono text-xs ${value === c ? "border-cobalt bg-cobalt text-white" : "border-zinc-400 hover:border-zinc-700"}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Btn variant="primary" disabled={busy || !value.trim()} onClick={() => value.trim() && submit(value.trim(), "")}>
            <span data-testid="submit">{busy ? "checking…" : "submit answer"}</span>
          </Btn>
        </div>
      </form>
    </Panel>
  );
}

/** Deterministic renderer: a closed set of components, no generated code is ever executed. */
export function LearnRenderer({ node }: { node: LearnNode }) {
  switch (node.type) {
    case "Stack":
      return (
        <div className={node.direction === "horizontal" ? "grid gap-3 md:grid-cols-2" : "flex flex-col gap-3"}>
          {node.children.map((c, i) => (
            <LearnRenderer key={i} node={c} />
          ))}
        </div>
      );
    case "Prompt":
      return <p className="border-l-2 border-zinc-600 pl-2 text-sm text-slate-300">{node.text}</p>;
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
