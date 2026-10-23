// One level of a lab: the shell around a component, after Google's practice interactives
// (goal, hints one at a time, feedback on each check, worked solution after attempts).
import confetti from "canvas-confetti";
import { ArrowRight, Check, Eye, Lightbulb, RotateCcw, SkipForward, Target, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Button, Card, Pill } from "../ui/primitives";
import { family, prettyType, REGISTRY } from "./registry";
import type { CheckState, Station as StationT } from "./types";

export interface StationResult {
  station_id: string;
  type: string;
  solved: boolean;
  attempts: number;
  revealed: boolean;
  seconds: number;
}

const SHOW_SOLUTION_AFTER = 2;

function burst() {
  void confetti({ particleCount: 60, spread: 65, startVelocity: 34, ticks: 140, origin: { x: 0.4, y: 0.65 }, colors: ["#22d3ee", "#34d399", "#a78bfa", "#ffffff"] });
}

export function Station({
  station,
  index,
  total,
  onDone,
  onNext,
  gallery = false,
}: {
  station: StationT;
  index: number;
  total: number;
  onDone: (r: StationResult) => void;
  onNext: () => void;
  gallery?: boolean; // component gallery: the worked solution is always available, no level counter
}) {
  const Widget = REGISTRY[station.type];
  const [state, setState] = useState<CheckState>({ ready: false, correct: false });
  const [attempts, setAttempts] = useState(0);
  const [checked, setChecked] = useState(0);
  const [hints, setHints] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<"solved" | "revealed" | "skipped" | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const t0 = useRef(performance.now());

  const finish = useCallback(
    (kind: "solved" | "revealed" | "skipped", tries: number) => {
      setResult(kind);
      if (kind === "solved") burst();
      onDone({
        station_id: station.id,
        type: station.type,
        solved: kind === "solved",
        attempts: tries,
        revealed: kind === "revealed",
        seconds: Math.round((performance.now() - t0.current) / 100) / 10,
      });
    },
    [onDone, station.id, station.type],
  );

  // components that finish themselves (explore every part, flip every card, play the scenario through)
  useEffect(() => {
    if (!result && !revealed && state.auto && state.ready) finish(state.correct ? "solved" : "revealed", 1);
  }, [state, result, revealed, finish]);

  const report = useCallback((s: CheckState) => {
    setState(s);
    setFailed(null);
  }, []);

  const check = () => {
    const n = attempts + 1;
    setAttempts(n);
    setChecked((c) => c + 1);
    if (state.correct) finish("solved", n);
    else setFailed(state.feedback ?? "Not yet. Look again and adjust.");
  };

  const reveal = () => {
    setRevealed(true);
    setFailed(null);
    finish("revealed", attempts);
  };

  const reset = () => {
    setNonce((x) => x + 1);
    setFailed(null);
    setState({ ready: false, correct: false });
  };

  const fam = family(station.type);
  const done = result !== null;

  return (
    <Card className="overflow-hidden" data-testid="station" data-type={station.type} data-correct={state.correct} data-ready={state.ready}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
            {gallery ? `Component ${index + 1} of ${total}` : `Level ${index + 1} of ${total}`}
          </span>
          <Pill tone={fam === "simulation" ? "violet" : "blue"}>
            <span data-testid="station-type">{prettyType(station.type)}</span>
          </Pill>
          <span className="text-[11px] text-slate-500">{fam}</span>
        </div>
        {!done && (
          <button type="button" onClick={() => finish("skipped", attempts)} data-testid="skip-level" className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-200">
            <SkipForward className="size-3.5" /> Skip level
          </button>
        )}
      </div>

      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white" data-testid="station-title">
            {station.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{station.intro}</p>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] px-3 py-2 text-sm text-cyan-100" data-testid="station-goal">
            <Target className="mt-0.5 size-4 shrink-0 text-cyan-300" />
            <span>
              <b>Goal: </b>
              {station.goal}
            </span>
          </div>
        </div>

        <div className={cn("transition", done && !revealed && "pointer-events-none")}>
          <Widget key={`${station.id}:${nonce}`} data={station} revealed={revealed} checked={checked} report={report} />
        </div>

        {hints > 0 && (
          <div className="space-y-2" data-testid="hints">
            {station.hints.slice(0, hints).map((h, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2 text-sm text-amber-100">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-300" />
                <span>
                  <b>Hint {i + 1}: </b>
                  {h}
                </span>
              </motion.div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {failed && !done && (
            <motion.div key={`f${attempts}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} exit={{ opacity: 0 }} data-testid="station-feedback" className="flex gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              <X className="mt-0.5 size-4 shrink-0 text-rose-300" />
              <span>{failed}</span>
            </motion.div>
          )}
          {done && (
            <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} data-testid="station-result" data-result={result} className={cn("rounded-2xl border p-4 text-sm", result === "solved" ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]")}>
              <div className={cn("flex items-center gap-2 font-semibold", result === "solved" ? "text-emerald-200" : "text-slate-200")}>
                {result === "solved" ? <Check className="size-4" /> : result === "revealed" ? <Eye className="size-4" /> : <SkipForward className="size-4" />}
                {result === "solved" ? (attempts <= 1 ? "Solved first try" : `Solved in ${attempts} tries`) : result === "revealed" ? "Worked solution" : "Level skipped"}
              </div>
              {result !== "solved" && <p className="mt-2 text-slate-300"><b className="text-white">How to solve it: </b>{station.solution}</p>}
              <p className="mt-2 text-slate-300"><b className="text-white">Why it works: </b>{station.explain}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-2">
          {!done && !state.auto && (
            <Button onClick={check} disabled={!state.ready} data-testid="station-check">
              <Check className="size-4" /> Check
            </Button>
          )}
          {!done && state.auto && <span className="text-xs text-slate-400">This level finishes by itself when you have explored it.</span>}
          {!done && hints < station.hints.length && (
            <Button variant="secondary" onClick={() => setHints((h) => h + 1)} data-testid="station-hint">
              <Lightbulb className="size-4" /> {hints ? "Another hint" : "Hint"}
            </Button>
          )}
          {!done && (gallery || attempts >= SHOW_SOLUTION_AFTER) && (
            <Button variant="secondary" onClick={reveal} data-testid="station-reveal">
              <Eye className="size-4" /> Show worked solution
            </Button>
          )}
          {!done && attempts > 0 && (
            <Button variant="ghost" onClick={reset}>
              <RotateCcw className="size-4" /> Start over
            </Button>
          )}
          {done && gallery && (
            <Button variant="secondary" onClick={() => { setResult(null); setRevealed(false); setAttempts(0); setHints(0); reset(); t0.current = performance.now(); }} data-testid="station-again">
              <RotateCcw className="size-4" /> Try again
            </Button>
          )}
          {done && (
            <Button onClick={onNext} data-testid="station-next">
              {gallery ? "Next component" : index + 1 < total ? "Next level" : "Finish the lab"} <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
