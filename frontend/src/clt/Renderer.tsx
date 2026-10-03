import { Tex } from "../Tex";
import type { CltNode } from "../types";
import { CartesianVerificationPlane } from "./CartesianVerificationPlane";
import { ConcreteBalanceScale } from "./ConcreteBalanceScale";
import { ScaffoldedOperationPad } from "./ScaffoldedOperationPad";
import { SteppedHintAccordion } from "./SteppedHintAccordion";
import { SymbolicEquationWorkspace } from "./SymbolicEquationWorkspace";
import { WorkedSolutionStep } from "./WorkedSolutionStep";

/**
 * Deterministic renderer: each AST node type maps to one pre-audited
 * component. Unknown types cannot reach here (the server's gate rejects them),
 * but are still rendered as an inert notice rather than trusted.
 */
export function Renderer({ node }: { node: CltNode }) {
  switch (node.type) {
    case "Stack":
      return (
        <div className={node.direction === "horizontal" ? "grid gap-3 md:grid-flow-col md:auto-cols-fr" : "flex flex-col gap-3"}>
          {node.children.map((child, i) => (
            <Renderer key={i} node={child} />
          ))}
        </div>
      );
    case "MathText":
      return (
        <div className="border border-zinc-300 bg-white px-3 py-2 text-slate-900">
          <Tex math={node.latex} display />
        </div>
      );
    case "ConcreteBalanceScale":
      return <ConcreteBalanceScale node={node} />;
    case "WorkedSolutionStep":
      return <WorkedSolutionStep node={node} />;
    case "ScaffoldedOperationPad":
      return <ScaffoldedOperationPad node={node} />;
    case "SymbolicEquationWorkspace":
      return <SymbolicEquationWorkspace node={node} />;
    case "SteppedHintAccordion":
      return <SteppedHintAccordion node={node} />;
    case "CartesianVerificationPlane":
      return <CartesianVerificationPlane node={node} />;
    default:
      return <div className="border border-red-700 p-2 font-mono text-xs text-red-700">unsupported node</div>;
  }
}
