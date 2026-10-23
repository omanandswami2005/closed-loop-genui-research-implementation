import { Activity, BookOpen, FlaskConical, LineChart, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import type { Profile } from "./types";
import { go, type Route } from "./useRoute";

function NavLink({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`flex items-center gap-1.5 border px-2 py-0.5 font-mono text-xs ${active ? "border-cobalt bg-cobalt text-white" : "border-zinc-700 text-slate-300 hover:border-slate-400"}`}
    >
      {children}
    </button>
  );
}

/** Page frame: header with navigation, the scope notice, and the page body. */
export function Shell({ route, profile, children }: { route: Route; profile: Profile | null; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2 print:hidden">
        <div className="flex items-center gap-3">
          <Activity size={16} className="text-blue-400" aria-hidden />
          <h1 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Closed-loop GenUI · your material</h1>
          <span className="border border-amber-700 px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-amber-300">demo extension</span>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          {profile && (
            <>
              <NavLink testId="nav-library" active={route.name === "library" || route.name === "pack"} onClick={() => go("/library")}>
                <BookOpen size={12} aria-hidden /> material
              </NavLink>
              <NavLink testId="nav-report" active={route.name === "report"} onClick={() => go("/report")}>
                <LineChart size={12} aria-hidden /> progress report
              </NavLink>
              <NavLink testId="nav-profile" active={route.name === "welcome"} onClick={() => go("/welcome")}>
                <UserRound size={12} aria-hidden /> {profile.name}
              </NavLink>
            </>
          )}
          <a
            href="/"
            className="flex items-center gap-1.5 border border-zinc-700 px-2 py-0.5 font-mono text-xs text-slate-300 hover:border-slate-400"
            title="The evaluated research testbed (linear equations)"
          >
            <FlaskConical size={12} aria-hidden /> research mode
          </a>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-zinc-800 px-4 py-2 font-mono text-[11px] leading-relaxed text-slate-400 print:text-slate-600">
        Demo extension: the same controller (BKT mastery estimate, PID complexity budget, policy, validation gate) on a new general-content
        component pack. Not evaluated. The paper&apos;s results cover linear equations with simulated learners only. Mastery values are the
        model&apos;s estimate, not a measured learning gain.
      </footer>
    </div>
  );
}
