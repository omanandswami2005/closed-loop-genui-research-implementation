import { useRef, useState } from "react";
import type { CartesianVerificationPlaneNode } from "../types";
import { useItem } from "./context";
import { Btn, Panel } from "./Panel";

const W = 640;
const H = 300;

/** Slider meanings, in the order ``parameter_sliders`` adds them. */
const SLIDERS = ["probe x", "zoom", "pan y", "pan x"] as const;

export function CartesianVerificationPlane({ node }: { node: CartesianVerificationPlaneNode }) {
  const { equation, propose, busy } = useItem();
  const svg = useRef<SVGSVGElement>(null);
  const [probe, setProbe] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [panY, setPanY] = useState(0);
  const [panX, setPanX] = useState(0);
  const sliders = SLIDERS.slice(0, node.parameter_sliders);

  // Always show both sides of the equation; the second line may be omitted by the plan.
  const lines = node.lines.length > 1 ? node.lines : [...node.lines, { slope: 0, intercept: equation.c }];
  const xr = 10 / zoom;
  const yr = Math.max(25, ...lines.map((l) => Math.abs(l.intercept) * 1.4 + 5)) / zoom;
  const sx = (x: number) => ((x - panX + xr) / (2 * xr)) * W;
  const sy = (y: number) => H - ((y - panY + yr) / (2 * yr)) * H;
  const fromPx = (px: number) => (px / W) * 2 * xr - xr + panX;

  const drag = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    setProbe(Math.round(fromPx(((clientX - r.left) / r.width) * W) * 10) / 10);
  };

  const ys = lines.map((l) => l.slope * probe + l.intercept);
  const gap = Math.abs(ys[0] - ys[1]);

  return (
    <Panel code="C6" title="Graph verification" meta={`${lines.length} lines · ${node.parameter_sliders} sliders`}>
      <p className="mb-2 text-sm text-slate-600">
        Each side of the equation is a line. Where they cross, both sides are equal: that x is the solution.
      </p>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full border border-zinc-300 bg-white ${node.draggable ? "cursor-ew-resize" : ""}`}
        onPointerDown={(e) => node.draggable && (e.currentTarget.setPointerCapture(e.pointerId), drag(e.clientX))}
        onPointerMove={(e) => node.draggable && e.buttons === 1 && drag(e.clientX)}
        onKeyDown={(e) => {
          const step = { ArrowLeft: -0.1, ArrowRight: 0.1, ArrowDown: -1, ArrowUp: 1 }[e.key];
          if (!node.draggable || step === undefined) return;
          e.preventDefault();
          setProbe((p) => Math.round(Math.min(10, Math.max(-10, p + step)) * 10) / 10);
        }}
        tabIndex={node.draggable ? 0 : undefined}
        role={node.draggable ? "slider" : "img"}
        aria-label={node.draggable ? "probe x on the Cartesian plane (arrow keys move it)" : "Cartesian plane"}
        aria-valuemin={node.draggable ? -10 : undefined}
        aria-valuemax={node.draggable ? 10 : undefined}
        aria-valuenow={node.draggable ? probe : undefined}
      >
        {Array.from({ length: 21 }, (_, i) => {
          const gx = Math.round(-xr + panX) + i * Math.max(1, Math.round(xr / 10));
          return <line key={`gx${i}`} x1={sx(gx)} x2={sx(gx)} y1={0} y2={H} stroke="#f1f5f9" />;
        })}
        <line x1={0} x2={W} y1={sy(0)} y2={sy(0)} stroke="#27272a" />
        <line x1={sx(0)} x2={sx(0)} y1={0} y2={H} stroke="#27272a" />
        {lines.map((l, i) => (
          <line
            key={i}
            x1={sx(-xr + panX)}
            y1={sy(l.slope * (-xr + panX) + l.intercept)}
            x2={sx(xr + panX)}
            y2={sy(l.slope * (xr + panX) + l.intercept)}
            stroke={i === 0 ? "#2563eb" : "#047857"}
            strokeWidth={2}
          />
        ))}
        <line x1={sx(probe)} x2={sx(probe)} y1={0} y2={H} stroke="#b91c1c" strokeDasharray="4 3" />
        {ys.map((y, i) => (
          <circle key={i} cx={sx(probe)} cy={sy(y)} r={3.5} fill={i === 0 ? "#2563eb" : "#047857"} />
        ))}
        <text x={8} y={16} fontSize={13} className="font-mono" fill="#2563eb">
          y = {equation.a}x {equation.b >= 0 ? "+" : "−"} {Math.abs(equation.b)}
        </text>
        <text x={6} y={32} fontSize={13} className="font-mono" fill="#047857">
          y = {equation.c}
        </text>
      </svg>
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
        <span className="text-slate-500">probe</span>
        <span>
          x = {probe.toFixed(1)} · gap |Δy| = {gap.toFixed(2)}
        </span>
      </div>
      {sliders.length > 0 && (
        <div className="mt-2 grid grid-cols-[5rem_1fr] items-center gap-x-3 gap-y-1">
          {sliders.map((s) => (
            <label key={s} className="contents font-mono text-[11px] text-slate-600">
              {s}
              {s === "probe x" && (
                <input type="range" min={-10} max={10} step={0.1} value={probe} onChange={(e) => setProbe(Number(e.target.value))} />
              )}
              {s === "zoom" && <input type="range" min={0.5} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />}
              {s === "pan y" && (
                <input type="range" min={-60} max={60} step={1} value={panY} onChange={(e) => setPanY(Number(e.target.value))} />
              )}
              {s === "pan x" && (
                <input type="range" min={-10} max={10} step={0.5} value={panX} onChange={(e) => setPanX(Number(e.target.value))} />
              )}
            </label>
          ))}
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <Btn disabled={busy} onClick={() => propose(`x = ${Number.isInteger(probe) ? probe : probe.toFixed(1)}`)}>
          read x at probe
        </Btn>
      </div>
    </Panel>
  );
}
