// All 30 lab-ui/1 components, one Gemini-written example each, playable with the same level shell as a lab.
import { Hand, LineChart, Shapes } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { demoApi } from "../api";
import { cn } from "../lib/utils";
import { Card, Eyebrow, Spinner } from "../ui/primitives";
import { go } from "../useRoute";
import { family, prettyType } from "./registry";
import { Station } from "./Station";
import type { Station as StationT } from "./types";

export function Gallery({ type }: { type?: string }) {
  const [stations, setStations] = useState<StationT[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    demoApi.gallery().then((g) => setStations(g.stations), (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const idx = useMemo(() => Math.max(0, stations?.findIndex((s) => s.type === type) ?? 0), [stations, type]);
  if (error) return <p className="p-10 text-center text-rose-300">{error}</p>;
  if (!stations)
    return (
      <div className="grid place-items-center p-24 text-slate-400">
        <Spinner />
      </div>
    );
  const cur = stations[idx];
  const groups: [string, typeof Hand][] = [
    ["hands-on", Hand],
    ["simulation", LineChart],
  ];
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4">
        <div>
          <Eyebrow>lab-ui/1 catalog</Eyebrow>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Shapes className="size-5 text-cyan-300" /> {stations.length} interactive components
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Gemini picks from these when it builds a lab for a topic. Each example below was written by Gemini and passed the same validator a live lab goes through.
          </p>
        </div>
        {groups.map(([fam, Icon]) => (
          <Card key={fam} className="p-2">
            <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <Icon className="size-3.5" /> {fam === "hands-on" ? "Hands-on manipulatives" : "Simulations and explorables"}
            </div>
            <div className="grid grid-cols-2 gap-1 lg:grid-cols-1" data-testid={`gallery-${fam}`}>
              {stations
                .filter((s) => family(s.type) === fam)
                .map((s) => (
                  <button
                    key={s.type}
                    type="button"
                    data-testid={`gallery-item-${s.type}`}
                    onClick={() => go(`/gallery/${s.type}`)}
                    className={cn("truncate rounded-lg px-2.5 py-1.5 text-left text-[13px] transition", s.type === cur.type ? "bg-cyan-400/15 text-white" : "text-slate-300 hover:bg-white/5")}
                  >
                    {prettyType(s.type)}
                  </button>
                ))}
            </div>
          </Card>
        ))}
      </aside>
      <section className="min-w-0">
        <AnimatePresence mode="wait">
          <motion.div key={cur.type} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <Station gallery station={cur} index={idx} total={stations.length} onDone={() => undefined} onNext={() => go(`/gallery/${stations[(idx + 1) % stations.length].type}`)} />
          </motion.div>
        </AnimatePresence>
      </section>
    </main>
  );
}
