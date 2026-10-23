import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-[0_8px_30px_-8px_rgba(59,130,246,0.7)] hover:from-blue-400 hover:to-blue-600 border border-blue-400/40",
  secondary: "glass text-foreground hover:bg-white/[0.07]",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-white/5",
  danger: "bg-rose-500/90 text-white hover:bg-rose-500",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const sz = size === "sm" ? "h-8 px-3 text-xs" : size === "lg" ? "h-12 px-6 text-base" : "h-10 px-4 text-sm";
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        sz,
        VARIANT[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("glass relative rounded-2xl", className)}>
      {children}
    </div>
  );
}

export function Pill({ tone = "default", className, children }: { tone?: "default" | "blue" | "green" | "red" | "amber" | "violet"; className?: string; children: ReactNode }) {
  const t = {
    default: "border-white/10 bg-white/5 text-slate-300",
    blue: "border-blue-400/30 bg-blue-500/10 text-blue-300",
    green: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    red: "border-rose-400/30 bg-rose-500/10 text-rose-300",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    violet: "border-violet-400/30 bg-violet-500/10 text-violet-300",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", t, className)}>{children}</span>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-blue-300/80", className)}>{children}</p>;
}

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-foreground placeholder:text-slate-500 outline-none transition focus:border-blue-400/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-blue-500/15";

export const LEVELS = ["Recognise", "Understand", "Recall", "Apply"];

/** Four-step level indicator (the question's difficulty level, 1-4). */
export function LevelSteps({ level, className }: { level: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)} aria-label={`level ${level} of 4`}>
      {LEVELS.map((name, i) => (
        <div key={name} className="flex flex-col items-start gap-1">
          <div
            className={cn(
              "h-1.5 w-14 rounded-full transition-all duration-500",
              i < level ? "bg-gradient-to-r from-blue-500 to-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.45)]" : "bg-white/10",
            )}
          />
          <span className={cn("text-[10px] font-medium", i + 1 === level ? "text-cyan-300" : "text-slate-500")}>{name}</span>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden />;
}

/** Brand mark: a closed loop with a signal trace. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#0b1324" stroke="url(#lg)" strokeWidth="1.5" />
      <path d="M6 18h4l2.5-7 3.5 11 2.5-6H26" fill="none" stroke="url(#lg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
