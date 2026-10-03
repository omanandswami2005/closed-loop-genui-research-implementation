import { useState } from "react";
import { api } from "../api";
import type { StepCheck, SymbolicEquationWorkspaceNode } from "../types";
import { useItem } from "./context";
import { Btn, Panel } from "./Panel";

export function SymbolicEquationWorkspace({ node }: { node: SymbolicEquationWorkspaceNode }) {
  const { sessionId, submit, busy } = useItem();
  const [lines, setLines] = useState<string[]>(() => Array(node.input_lines).fill(""));
  const [checks, setChecks] = useState<(StepCheck | null)[]>(() => Array(node.input_lines).fill(null));

  const check = async (i: number) => {
    const line = lines[i].trim();
    const next = [...checks];
    next[i] = line ? await api.check(sessionId, line).catch(() => null) : null;
    setChecks(next);
  };

  const filled = lines.map((l) => l.trim()).filter(Boolean);

  return (
    <Panel code="C4" title="Equation workspace" meta={`${node.input_lines} lines`}>
      <p className="mb-2 text-sm text-slate-600">Write one transformed equation per line. Each line is checked against the original.</p>
      <div className="space-y-1.5">
        {lines.map((line, i) => {
          const c = checks[i];
          const mark = !c ? "" : c.solved ? "solved" : c.equivalent ? "valid" : c.parsed ? "changes x" : "unreadable";
          const color = !c ? "text-slate-400" : c.equivalent ? "text-emerald-700" : "text-red-700";
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-right font-mono text-[11px] text-slate-400">{i + 1}</span>
              <input
                value={line}
                onChange={(e) => {
                  const next = [...lines];
                  next[i] = e.target.value;
                  setLines(next);
                }}
                onBlur={() => check(i)}
                onKeyDown={(e) => e.key === "Enter" && check(i)}
                placeholder={i === 0 ? "e.g. 3x = 15" : ""}
                aria-label={`step ${i + 1}`}
                className="flex-1 border border-zinc-800 px-2 py-1 font-mono text-sm focus:border-cobalt"
              />
              <span className={`w-20 font-mono text-[11px] ${color}`} title={c?.message}>
                {mark}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <Btn variant="primary" disabled={!filled.length || busy} onClick={() => submit(filled[filled.length - 1], filled)}>
          submit last line
        </Btn>
      </div>
    </Panel>
  );
}
