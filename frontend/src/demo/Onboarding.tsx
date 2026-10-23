import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Btn, Panel } from "../clt/Panel";
import type { Profile } from "./types";

const GRADES = ["Grade 6-8", "Grade 9-10", "Grade 11-12", "First-year university", "Adult learner"];
const PRIORS: { value: Profile["prior"]; label: string; p: string }[] = [
  { value: "new", label: "New to me", p: "0.10" },
  { value: "little", label: "I know a little", p: "0.25" },
  { value: "well", label: "I know it fairly well", p: "0.45" },
];

const field = "w-full border border-zinc-800 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-cobalt";
const label = "mb-1 block font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500";

export function Onboarding({ initial, onSave, busy }: { initial: Profile | null; onSave: (p: Profile) => void; busy: boolean }) {
  const [p, setP] = useState<Profile>(initial ?? { name: "", grade: GRADES[1], interests: "", prior: "little", goal: "" });
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((old) => ({ ...old, [k]: v }));
  return (
    <main className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel code="P0" title="Learner profile" meta="onboarding">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (p.name.trim()) onSave({ ...p, name: p.name.trim() });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className={label}>
                name
              </label>
              <input id="name" className={field} value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Asha" maxLength={60} required />
            </div>
            <div>
              <label htmlFor="grade" className={label}>
                level
              </label>
              <select id="grade" className={field} value={p.grade} onChange={(e) => set("grade", e.target.value)}>
                {GRADES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="interests" className={label}>
              interests (used for examples and analogies)
            </label>
            <input
              id="interests"
              className={field}
              value={p.interests}
              onChange={(e) => set("interests", e.target.value)}
              placeholder="e.g. cricket, cooking, space"
              maxLength={160}
            />
          </div>
          <fieldset>
            <legend className={label}>how well do you know the material you will upload?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {PRIORS.map((o) => (
                <label
                  key={o.value}
                  className={`flex cursor-pointer flex-col border px-3 py-2 text-sm ${p.prior === o.value ? "border-cobalt bg-blue-50" : "border-zinc-300 hover:border-zinc-500"}`}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="prior" value={o.value} checked={p.prior === o.value} onChange={() => set("prior", o.value)} />
                    {o.label}
                  </span>
                  <span className="mt-1 font-mono text-[11px] text-slate-500">starting estimate P(L₀) = {o.p}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="goal" className={label}>
              goal (optional)
            </label>
            <input id="goal" className={field} value={p.goal} onChange={(e) => set("goal", e.target.value)} placeholder="e.g. revise for Friday's test" maxLength={160} />
          </div>
          <div>
            <Btn variant="primary" disabled={busy || !p.name.trim()} onClick={() => p.name.trim() && onSave({ ...p, name: p.name.trim() })}>
              <span className="flex items-center gap-1.5">
                save profile and continue <ArrowRight size={12} aria-hidden />
              </span>
            </Btn>
          </div>
        </form>
      </Panel>
      <aside className="space-y-3 text-sm leading-relaxed text-slate-300">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-400">what the profile changes</h2>
        <p>
          <span className="text-blue-400">Prior knowledge</span> sets the mastery tracker&apos;s starting estimate, so the first screen you see
          is simpler or more open.
        </p>
        <p>
          <span className="text-blue-400">Level and interests</span> are given to Gemini when it writes each screen&apos;s explanations, hints and
          worked examples.
        </p>
        <p className="text-slate-400">Answers are always marked against the question bank, never by the language model.</p>
        <p className="text-slate-400">The profile stays in this browser and on the demo server&apos;s memory; nothing is stored permanently.</p>
      </aside>
    </main>
  );
}
