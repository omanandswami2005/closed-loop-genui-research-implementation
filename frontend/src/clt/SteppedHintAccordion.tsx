import { useState } from "react";
import type { SteppedHintAccordionNode } from "../types";
import { Btn, Panel } from "./Panel";

/** Progressive disclosure: each tier opens only after the previous one. */
export function SteppedHintAccordion({ node }: { node: SteppedHintAccordionNode }) {
  const [open, setOpen] = useState(0);
  return (
    <Panel code="C5" title="Hints" meta={`${open}/${node.hints.length} opened`}>
      <ol className="space-y-1.5">
        {node.hints.map((hint, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-1 w-12 font-mono text-[11px] text-slate-500">tier {i + 1}</span>
            {i < open ? (
              <p className="flex-1 border-l-2 border-cobalt pl-2 text-sm">{hint}</p>
            ) : (
              <Btn disabled={i !== open} onClick={() => setOpen(i + 1)}>
                reveal
              </Btn>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
