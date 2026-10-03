import { Tex } from "../Tex";
import type { WorkedSolutionStepNode } from "../types";
import { Panel } from "./Panel";

/** Each operation, its result and its explanation sit on one row (no split attention). */
export function WorkedSolutionStep({ node }: { node: WorkedSolutionStepNode }) {
  return (
    <Panel code="C2" title="Worked example" meta={`${node.steps.length} steps`}>
      <ol className="divide-y divide-zinc-200">
        {node.steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[2rem_minmax(8rem,auto)_1fr] items-baseline gap-3 py-1.5">
            <span className="font-mono text-[11px] text-slate-500">{String(i + 1).padStart(2, "0")}</span>
            <span>
              <span className="block font-mono text-[11px] text-cobalt">{s.operation}</span>
              <Tex math={s.result_latex} />
            </span>
            <span className="text-sm text-slate-600">{s.explanation}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
