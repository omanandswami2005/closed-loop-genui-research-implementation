import { BookOpen, FlaskConical, LineChart, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./lib/utils";
import type { Profile } from "./types";
import { Logo } from "./ui/primitives";
import { go, type Route } from "./useRoute";

function Tab({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition",
        active ? "bg-white/10 text-white shadow-inner" : "text-slate-400 hover:bg-white/5 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

/** Frame for the app pages: navigation bar, page body and the scope line. */
export function Shell({ route, profile, children }: { route: Route; profile: Profile | null; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_10%_-10%,rgba(37,99,235,0.18),transparent),radial-gradient(50rem_30rem_at_110%_10%,rgba(124,58,237,0.12),transparent)]" />
      <header className="no-print sticky top-0 z-40 border-b border-white/10 bg-[#060a13]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <a href="#/" className="flex items-center gap-2.5" data-testid="nav-home">
            <Logo className="size-6" />
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">Adaptive GenUI</span>
            <span className="rounded-md border border-amber-400/30 bg-amber-500/10 px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-amber-300">demo</span>
          </a>
          {profile && (
            <nav className="flex items-center gap-1">
              <Tab testId="nav-library" active={route.name === "library" || route.name === "pack" || route.name === "learn"} onClick={() => go("/library")}>
                <BookOpen className="size-4" /> <span className="hidden sm:inline">Material</span>
              </Tab>
              <Tab testId="nav-report" active={route.name === "report"} onClick={() => go("/report")}>
                <LineChart className="size-4" /> <span className="hidden sm:inline">Progress</span>
              </Tab>
            </nav>
          )}
          <div className="flex items-center gap-2">
            <a href="/" className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-white/5 hover:text-white md:flex" title="The evaluated research testbed (linear equations)">
              <FlaskConical className="size-3.5" /> Research mode
            </a>
            {profile && (
              <button
                type="button"
                data-testid="nav-profile"
                onClick={() => go("/start")}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm hover:bg-white/10"
              >
                <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-[11px] font-semibold text-white">
                  {profile.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-28 truncate">{profile.name}</span>
                <UserRound className="hidden size-3.5 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="no-print border-t border-white/5 px-4 py-4 text-center text-[11px] leading-relaxed text-slate-500">
        Demo extension: the research controller (mastery estimate, PID budget, policy, validation gate) on general content. Not evaluated; the
        paper&apos;s results cover linear equations with simulated learners only. Mastery is the model&apos;s estimate, not a measured learning gain.
      </footer>
    </div>
  );
}
