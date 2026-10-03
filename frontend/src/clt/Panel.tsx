import type { ReactNode } from "react";

/** Instrument panel frame shared by every CLT-UI component. */
export function Panel({ code, title, meta, children }: { code: string; title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="border border-zinc-800 bg-white text-slate-900">
      <header className="flex items-baseline justify-between gap-3 border-b border-zinc-800 bg-slate-100 px-3 py-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
          <span className="mr-2 font-mono text-cobalt">{code}</span>
          {title}
        </h3>
        {meta && <span className="font-mono text-[10px] text-slate-500">{meta}</span>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  variant = "default",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
  title?: string;
}) {
  const base = "border px-2.5 py-1 font-mono text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const look =
    variant === "primary"
      ? "border-cobalt bg-cobalt text-white hover:bg-blue-700"
      : "border-zinc-800 bg-white text-slate-900 hover:bg-slate-100";
  return (
    <button type="button" className={`${base} ${look}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}
