import { ArrowLeft, ArrowRight, Check, GraduationCap, Heart, Target } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "./lib/utils";
import type { Profile } from "./types";
import { AnimatedCircularProgressBar } from "./ui/magicui/animated-circular-progress-bar";
import { BorderBeam } from "./ui/magicui/border-beam";
import { Button, Card, Eyebrow, inputClass } from "./ui/primitives";

const GRADES = ["Grade 6-8", "Grade 9-10", "Grade 11-12", "First-year university", "Adult learner"];
const PRIORS: { value: Profile["prior"]; label: string; hint: string; p: number }[] = [
  { value: "new", label: "New to me", hint: "Start with guided, simpler screens", p: 0.1 },
  { value: "little", label: "I know a little", hint: "Start in the middle", p: 0.25 },
  { value: "well", label: "I know it fairly well", hint: "Start with more open questions", p: 0.45 },
];
const STEPS = [
  { title: "About you", icon: GraduationCap },
  { title: "Interests", icon: Heart },
  { title: "Starting point", icon: Target },
];
const SUGGESTED = ["cricket", "football", "cooking", "music", "space", "gaming", "art", "coding"];

export function Onboarding({ initial, onSave, busy }: { initial: Profile | null; onSave: (p: Profile) => void; busy: boolean }) {
  const [p, setP] = useState<Profile>(initial ?? { name: "", grade: GRADES[1], interests: "", prior: "little", goal: "" });
  const [step, setStep] = useState(0);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((o) => ({ ...o, [k]: v }));
  const prior = PRIORS.find((x) => x.value === p.prior)!;
  const canNext = step !== 0 || p.name.trim().length > 0;
  const finish = () => p.name.trim() && onSave({ ...p, name: p.name.trim() });
  const addInterest = (w: string) => {
    const list = p.interests.split(",").map((s) => s.trim()).filter(Boolean);
    if (!list.includes(w)) set("interests", [...list, w].join(", "));
  };

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="overflow-hidden p-6 md:p-8">
        <BorderBeam size={140} duration={10} colorFrom="#3b82f6" colorTo="#22d3ee" />
        <Eyebrow>Learner profile</Eyebrow>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Let&apos;s set up your learning.</h1>
        <ol className="mt-6 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => (i <= step || canNext) && setStep(i)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  i === step ? "border-blue-400/50 bg-blue-500/15 text-blue-200" : i < step ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-500",
                )}
              >
                {i < step ? <Check className="size-3.5" /> : <s.icon className="size-3.5" />}
                {s.title}
              </button>
              {i < STEPS.length - 1 && <div className={cn("h-px flex-1", i < step ? "bg-emerald-400/40" : "bg-white/10")} />}
            </li>
          ))}
        </ol>

        <form
          className="mt-8 min-h-[16rem]"
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 2) canNext && setStep(step + 1);
            else finish();
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24, filter: "blur(6px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -24, filter: "blur(6px)" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="grid gap-5"
            >
              {step === 0 && (
                <>
                  <div>
                    <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-300">
                      Your name
                    </label>
                    <input id="name" autoFocus className={inputClass} value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Asha" maxLength={60} />
                  </div>
                  <div>
                    <label htmlFor="grade" className="mb-1.5 block text-sm font-medium text-slate-300">
                      Level
                    </label>
                    <select id="grade" className={cn(inputClass, "appearance-none")} value={p.grade} onChange={(e) => set("grade", e.target.value)}>
                      {GRADES.map((g) => (
                        <option key={g} className="bg-[#0c1220]">
                          {g}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-slate-500">Gemini writes explanations and hints for this level.</p>
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <div>
                    <label htmlFor="interests" className="mb-1.5 block text-sm font-medium text-slate-300">
                      Interests
                    </label>
                    <input id="interests" className={inputClass} value={p.interests} onChange={(e) => set("interests", e.target.value)} placeholder="e.g. cricket, cooking, space" maxLength={160} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {SUGGESTED.map((w) => (
                        <button key={w} type="button" onClick={() => addInterest(w)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-white">
                          + {w}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Used for worked examples and analogies.</p>
                  </div>
                  <div>
                    <label htmlFor="goal" className="mb-1.5 block text-sm font-medium text-slate-300">
                      Goal <span className="text-slate-500">(optional)</span>
                    </label>
                    <input id="goal" className={inputClass} value={p.goal} onChange={(e) => set("goal", e.target.value)} placeholder="e.g. revise for Friday's test" maxLength={160} />
                  </div>
                </>
              )}
              {step === 2 && (
                <fieldset>
                  <legend className="mb-3 text-sm font-medium text-slate-300">How well do you know the material you&apos;ll add?</legend>
                  <div className="grid gap-3">
                    {PRIORS.map((o) => (
                      <label
                        key={o.value}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 transition",
                          p.prior === o.value ? "border-blue-400/60 bg-blue-500/10 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]" : "border-white/10 bg-white/[0.02] hover:border-white/20",
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <input type="radio" name="prior" className="accent-blue-500" checked={p.prior === o.value} onChange={() => set("prior", o.value)} />
                          <span>
                            <span className="block text-sm font-medium">{o.label}</span>
                            <span className="block text-xs text-slate-400">{o.hint}</span>
                          </span>
                        </span>
                        <span className="font-mono text-xs text-cyan-300">P(L₀) = {o.p.toFixed(2)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {step < 2 ? (
              <Button type="submit" disabled={!canNext} data-testid="onboarding-next">
                Continue <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button type="submit" loading={busy} disabled={!p.name.trim()} data-testid="onboarding-save">
                Save profile and continue <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </form>
      </Card>

      <aside className="flex flex-col gap-4">
        <Card className="flex flex-col items-center p-6 text-center">
          <Eyebrow>Your starting estimate</Eyebrow>
          <AnimatedCircularProgressBar
            className="mt-4 size-36 text-2xl font-semibold"
            value={Math.round(prior.p * 100)}
            gaugePrimaryColor="#22d3ee"
            gaugeSecondaryColor="rgba(255,255,255,0.08)"
          />
          <p className="mt-4 text-sm text-slate-300">
            The mastery tracker starts at <span className="font-mono text-cyan-300">{prior.p.toFixed(2)}</span>. Each answer moves it; the first screen you see depends on it.
          </p>
        </Card>
        <Card className="p-5 text-sm text-slate-400">
          <div className="font-medium text-slate-200">What is stored</div>
          <p className="mt-1.5 leading-relaxed">Your profile stays in this browser and in the demo server&apos;s memory. Nothing is saved permanently and there is no account.</p>
        </Card>
      </aside>
    </main>
  );
}
