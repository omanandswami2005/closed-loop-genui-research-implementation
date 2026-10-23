import { ArrowRight, BookOpenCheck, FileStack, FlaskConical, Gauge, ListChecks, Lock, ScrollText, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { demoApi } from "./api";
import { LoopDiagram } from "./LoopDiagram";
import type { PackSummary } from "./types";
import { BlurFade } from "./ui/magicui/blur-fade";
import { BorderBeam } from "./ui/magicui/border-beam";
import { FlickeringGrid } from "./ui/magicui/flickering-grid";
import { Marquee } from "./ui/magicui/marquee";
import { NumberTicker } from "./ui/magicui/number-ticker";
import { ShimmerButton } from "./ui/magicui/shimmer-button";
import { ShineBorder } from "./ui/magicui/shine-border";
import { WordRotate } from "./ui/magicui/word-rotate";
import { Button, Eyebrow, LevelSteps, Logo } from "./ui/primitives";
import Aurora from "./ui/reactbits/Aurora";
import BlurText from "./ui/reactbits/BlurText";
import ShinyText from "./ui/reactbits/ShinyText";
import SpotlightCard from "./ui/reactbits/SpotlightCard";
import { go } from "./useRoute";

const FEATURES = [
  {
    icon: Gauge,
    title: "Every screen is sized to you",
    body: "A mastery estimate drives a PID controller that sets how complex the next screen may be: fewer choices and more support when you struggle, open questions when you are ready.",
    wide: true,
  },
  { icon: FileStack, title: "Built from your own material", body: "Topics, key points and questions come only from the document you upload." },
  { icon: ListChecks, title: "Marked by rules, not by AI", body: "Answers are checked against a validated question bank. The language model never decides what is correct." },
  { icon: ShieldCheck, title: "Safe by construction", body: "Generated screens are JSON for a fixed set of components. Each one is checked before it renders; failures fall back to a template." },
  {
    icon: ScrollText,
    title: "A report you can hand in",
    body: "Per-topic progress: the estimate from start to now, the highest level reached, hints used, and every question to review with its explanation.",
    wide: true,
  },
];

const STEPS = [
  { n: "01", title: "Tell us about you", body: "Level, interests and how well you know the topic. Your prior sets the starting estimate." },
  { n: "02", title: "Add your material", body: "Upload a PDF, slides or notes, or paste text. Gemini outlines topics and writes a checked question bank." },
  { n: "03", title: "Learn, adaptively", body: "Each answer updates the estimate; the next screen is regenerated within a complexity budget." },
  { n: "04", title: "Review the report", body: "See what is mastered and what to revisit, with explanations." },
];

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? "border-b border-white/10 bg-[#060a13]/75 backdrop-blur-xl" : ""}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <a href="#/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Adaptive GenUI</span>
        </a>
        <nav className="hidden items-center gap-1 text-sm text-slate-300 md:flex">
          <a href="#how" onClick={(e) => { e.preventDefault(); document.getElementById("how")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">How it works</a>
          <a href="#features" onClick={(e) => { e.preventDefault(); document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">Features</a>
          <a href="#scope" onClick={(e) => { e.preventDefault(); document.getElementById("scope")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">Scope</a>
          <a href="/" className="flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">
            <FlaskConical className="size-3.5" /> Research mode
          </a>
        </nav>
        <Button size="sm" onClick={() => go("/start")} data-testid="nav-start">
          Start learning <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </header>
  );
}

export function Landing({ hasProfile }: { hasProfile: boolean }) {
  const [packs, setPacks] = useState<PackSummary[]>([]);
  useEffect(() => {
    demoApi.packs().then(setPacks, () => setPacks([]));
  }, []);
  const questions = packs.reduce((n, p) => n + p.topics.reduce((m, t) => m + t.questions, 0), 0);
  const topics = packs.flatMap((p) => p.topics.map((t) => t.title));
  const start = () => go(hasProfile ? "/library" : "/start");

  return (
    <div className="relative overflow-x-clip">
      <Nav />

      {/* Hero */}
      <section className="relative isolate flex min-h-[100svh] flex-col items-center justify-center px-5 pb-24 pt-28 text-center">
        <div className="absolute inset-0 -z-10 opacity-80">
          <Aurora colorStops={["#1d4ed8", "#22d3ee", "#7c3aed"]} amplitude={1.1} blend={0.55} speed={0.6} />
        </div>
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_10%,#060a13_72%)]" />
        <BlurFade delay={0.05}>
          <div className="glass mb-7 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs">
            <Sparkles className="size-3.5 text-cyan-300" />
            <ShinyText text="Closed-loop adaptive learning, powered by Gemini" speed={3} color="#9fb3d1" shineColor="#ffffff" />
          </div>
        </BlurFade>
        <h1 className="mx-auto max-w-6xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl xl:text-7xl">
          <BlurText text="Turn any document into lessons" className="justify-center" delay={90} animateBy="words" direction="top" />
          <span className="text-gradient mt-1 block pb-2">that adapt to you.</span>
        </h1>
        <BlurFade delay={0.55}>
          <div className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-x-2 text-lg text-slate-300 md:text-xl">
            Bring your
            <WordRotate words={["PDF chapter", "lecture slides", "revision notes", "pasted article"]} className="font-semibold text-white" />
            and learn it one screen at a time.
          </div>
        </BlurFade>
        <BlurFade delay={0.75}>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <ShimmerButton onClick={start} className="h-12 px-7 text-base font-semibold" background="linear-gradient(180deg,#2563eb,#1d4ed8)" data-testid="hero-start">
              <span className="flex items-center gap-2">
                Upload your material <ArrowRight className="size-4" />
              </span>
            </ShimmerButton>
            <Button variant="secondary" size="lg" onClick={start}>
              Try a sample pack
            </Button>
          </div>
        </BlurFade>
        <BlurFade delay={0.95}>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">BKT · PID governor · policy · Gemini on Vertex AI · validation gate</p>
        </BlurFade>

        {/* product glimpse */}
        <BlurFade delay={1.1} className="mt-16 w-full max-w-4xl">
          <div className="glass relative overflow-hidden rounded-3xl p-5 text-left md:p-7">
            <BorderBeam size={180} duration={9} colorFrom="#3b82f6" colorTo="#22d3ee" />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <Eyebrow>What a learning screen tracks</Eyebrow>
                <p className="mt-1 text-sm text-slate-300">Each answer moves the estimate; the controller picks the next level.</p>
              </div>
              <LevelSteps level={3} />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              {[
                ["Mastery estimate", "P(L)", "updated after every answer"],
                ["Complexity budget", "M_I*", "set by the PID governor"],
                ["Measured complexity", "M_I", "of the rendered screen"],
                ["Gate", "pass / fallback", "schema · leak · budget"],
              ].map(([t, v, s]) => (
                <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs text-slate-400">{t}</div>
                  <div className="mt-1 font-mono text-lg text-cyan-300">{v}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{s}</div>
                </div>
              ))}
            </div>
          </div>
        </BlurFade>
      </section>

      {/* Marquee */}
      <section className="relative border-y border-white/5 bg-white/[0.015] py-6">
        <Marquee pauseOnHover className="[--duration:45s] [--gap:2.5rem]">
          {["PDF", "PowerPoint", "Markdown", "Plain text", "Pasted notes", ...topics].map((t, i) => (
            <span key={`${t}-${i}`} className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-400">
              <span className="size-1.5 rounded-full bg-cyan-400/70" /> {t}
            </span>
          ))}
        </Marquee>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#060a13]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#060a13]" />
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-28">
        <BlurFade inView>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-5xl">A control loop, not a chatbot.</h2>
            <p className="mt-4 text-slate-400">
              Gemini writes the question bank once. After that, every screen goes round the same loop: estimate, budget, policy, generate, check, render.
            </p>
          </div>
        </BlurFade>
        <BlurFade inView delay={0.15}>
          <div className="glass mt-14 rounded-3xl">
            <LoopDiagram />
          </div>
        </BlurFade>
        <div className="mt-14 grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <BlurFade key={s.n} inView delay={0.08 * i}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="font-mono text-xs text-cyan-300">{s.n}</div>
                <div className="mt-2 font-semibold">{s.title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.body}</p>
              </div>
            </BlurFade>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-5 pb-28">
        <BlurFade inView>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Features</Eyebrow>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-5xl">Adaptive where it helps. Deterministic where it matters.</h2>
          </div>
        </BlurFade>
        <div className="mt-14 grid auto-rows-fr gap-4 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <BlurFade key={f.title} inView delay={0.06 * i} className={f.wide ? "md:col-span-2" : ""}>
              <SpotlightCard className="h-full !rounded-2xl border border-white/10 !p-7" spotlightColor="rgba(34, 211, 238, 0.18)">
                <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-400/10 text-cyan-300 ring-1 ring-white/10">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
              </SpotlightCard>
            </BlurFade>
          ))}
        </div>
      </section>

      {/* Numbers */}
      <section className="mx-auto max-w-7xl px-5 pb-28">
        <div className="grid gap-4 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8 md:grid-cols-4">
          {[
            { v: 4, label: "difficulty levels per topic", sub: "recognise → apply" },
            { v: 12, label: "checked questions per topic", sub: "3 at each level" },
            { v: questions || 132, label: "questions in the sample packs", sub: "generated live, then cached" },
            { v: 1000, label: "simulated learners", sub: "in the research benchmark" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-gradient text-4xl font-semibold tabular-nums md:text-5xl">
                <NumberTicker value={s.v} className="!text-transparent" />
              </div>
              <div className="mt-2 text-sm text-slate-300">{s.label}</div>
              <div className="font-mono text-[11px] text-slate-500">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Scope */}
      <section id="scope" className="mx-auto max-w-4xl scroll-mt-20 px-5 pb-28">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a1120] p-8 md:p-10">
          <ShineBorder shineColor={["#3b82f6", "#22d3ee", "#a78bfa"]} duration={12} />
          <div className="flex items-center gap-3">
            <Lock className="size-5 text-amber-300" />
            <Eyebrow className="text-amber-300/90">Honest scope</Eyebrow>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">This is a demo of the method, not a validated product.</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold text-emerald-300">Real and running live</div>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
                <li>Text extraction from your file</li>
                <li>Gemini calls for topics, questions and screen text</li>
                <li>Mastery tracking, PID budget, policy and gate</li>
                <li>Rule-based marking and template fallback</li>
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-amber-300">Not evaluated</div>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
                <li>This general-content mode as a whole</li>
                <li>The quality of generated questions</li>
                <li>Any learning gain for real learners</li>
                <li>The paper covers linear equations with simulated learners only</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden border-t border-white/5 px-5 py-28 text-center">
        <FlickeringGrid className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_70%)]" squareSize={4} gridGap={6} color="#22d3ee" maxOpacity={0.25} flickerChance={0.08} />
        <BookOpenCheck className="mx-auto size-10 text-cyan-300" />
        <h2 className="mx-auto mt-5 max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-5xl">Ready to learn your own material?</h2>
        <p className="mt-3 text-slate-400">Takes about thirty seconds to set up. No account needed.</p>
        <div className="mt-8 flex justify-center">
          <ShimmerButton onClick={start} className="h-12 px-7 text-base font-semibold" background="linear-gradient(180deg,#2563eb,#1d4ed8)">
            <span className="flex items-center gap-2">
              Start now <ArrowRight className="size-4" />
            </span>
          </ShimmerButton>
        </div>
      </section>

      <footer className="border-t border-white/5 px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-slate-500 md:flex-row">
          <div className="flex items-center gap-2">
            <Logo className="size-5" /> Learner-State-Aware Generative User Interfaces · demo extension
          </div>
          <a className="hover:text-slate-300" href="https://github.com/omanandswami2005/closed-loop-genui-research-implementation" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
