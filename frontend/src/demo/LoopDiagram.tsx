import { Brain, CheckCircle2, FileText, Gauge, LayoutTemplate, ShieldCheck, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";
import { forwardRef, type ReactNode, useRef } from "react";
import { cn } from "./lib/utils";
import { AnimatedBeam } from "./ui/magicui/animated-beam";

const Node = forwardRef<HTMLDivElement, { icon: ReactNode; title: string; sub: string; accent?: boolean; className?: string }>(
  ({ icon, title, sub, accent, className }, ref) => (
    <div
      ref={ref}
      className={cn(
        "z-10 flex w-full max-w-[11.5rem] items-center gap-3 rounded-2xl border bg-[#0b1222]/95 px-3.5 py-3 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur",
        accent ? "border-cyan-400/40 shadow-[0_0_30px_-8px_rgba(34,211,238,0.45)]" : "border-white/10",
        className,
      )}
    >
      <div className={cn("grid size-9 shrink-0 place-items-center rounded-xl", accent ? "bg-cyan-400/15 text-cyan-300" : "bg-blue-500/10 text-blue-300")}>{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-slate-100">{title}</div>
        <div className="truncate font-mono text-[10px] text-slate-400">{sub}</div>
      </div>
    </div>
  ),
);
Node.displayName = "Node";

/** The closed loop drawn with Magic UI animated beams (positions are illustrative, the flow is the real one). */
export function LoopDiagram() {
  const box = useRef<HTMLDivElement>(null);
  const material = useRef<HTMLDivElement>(null);
  const bank = useRef<HTMLDivElement>(null);
  const bkt = useRef<HTMLDivElement>(null);
  const pid = useRef<HTMLDivElement>(null);
  const policy = useRef<HTMLDivElement>(null);
  const writer = useRef<HTMLDivElement>(null);
  const gate = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const learner = useRef<HTMLDivElement>(null);
  const beam = { gradientStartColor: "#3b82f6", gradientStopColor: "#22d3ee", pathColor: "#334155", pathOpacity: 0.35, pathWidth: 2 };

  return (
    <div ref={box} className="relative mx-auto grid w-full max-w-5xl grid-cols-2 gap-x-6 gap-y-10 p-4 md:grid-cols-4 md:gap-x-10 md:p-8">
      <Node ref={material} icon={<FileText className="size-4" />} title="Your material" sub="PDF · PPTX · MD · text" />
      <Node ref={bank} icon={<Sparkles className="size-4" />} title="Question bank" sub="Gemini · once per file" accent />
      <Node ref={bkt} icon={<Brain className="size-4" />} title="Mastery estimate" sub="Bayesian Knowledge Tracing" />
      <Node ref={pid} icon={<Gauge className="size-4" />} title="Complexity budget" sub="PID governor" />
      <Node ref={learner} icon={<UserRound className="size-4" />} title="You answer" sub="marked by rules" />
      <Node ref={screen} icon={<LayoutTemplate className="size-4" />} title="Rendered screen" sub="fixed components" />
      <Node ref={gate} icon={<ShieldCheck className="size-4" />} title="Validation gate" sub="schema · leak · budget" />
      <Node ref={policy} icon={<SlidersHorizontal className="size-4" />} title="Policy" sub="scaffold · hints · level" />
      <div className="col-span-2 flex justify-center md:col-span-4">
        <Node ref={writer} icon={<CheckCircle2 className="size-4" />} title="Screen writer" sub="Gemini · inside budget" accent className="max-w-[13rem]" />
      </div>
      <AnimatedBeam containerRef={box} fromRef={material} toRef={bank} duration={4} {...beam} />
      <AnimatedBeam containerRef={box} fromRef={bank} toRef={writer} curvature={-60} duration={5} delay={0.4} {...beam} />
      <AnimatedBeam containerRef={box} fromRef={learner} toRef={bkt} curvature={70} duration={4.5} delay={0.2} {...beam} />
      <AnimatedBeam containerRef={box} fromRef={bkt} toRef={pid} duration={3.5} delay={0.6} {...beam} />
      <AnimatedBeam containerRef={box} fromRef={pid} toRef={policy} duration={3.5} delay={1} {...beam} />
      <AnimatedBeam containerRef={box} fromRef={policy} toRef={writer} curvature={40} duration={4} delay={1.4} {...beam} />
      <AnimatedBeam containerRef={box} fromRef={writer} toRef={gate} curvature={40} duration={4} delay={1.8} {...beam} />
      <AnimatedBeam containerRef={box} fromRef={gate} toRef={screen} duration={3.5} delay={2.2} reverse {...beam} />
      <AnimatedBeam containerRef={box} fromRef={screen} toRef={learner} duration={3.5} delay={2.6} reverse {...beam} />
    </div>
  );
}
