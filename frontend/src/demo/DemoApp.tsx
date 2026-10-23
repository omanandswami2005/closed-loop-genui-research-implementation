import { useEffect, useState } from "react";
import { demoApi } from "./api";
import { Landing } from "./Landing";
import { Learn } from "./Learn";
import { Library } from "./Library";
import { Onboarding } from "./Onboarding";
import { PackView } from "./PackView";
import { Report } from "./Report";
import { Shell } from "./Shell";
import { loadLearner, type Saved, saveLearner } from "./storage";
import type { Profile } from "./types";
import { Spinner } from "./ui/primitives";
import { go, useRoute } from "./useRoute";

export function DemoApp() {
  const route = useRoute();
  const [learner, setLearner] = useState<Saved | null>(() => loadLearner());
  const [synced, setSynced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server keeps learners in memory: re-register a remembered profile on load.
  useEffect(() => {
    if (!learner) {
      setSynced(true);
      return;
    }
    demoApi.saveLearner(learner.profile, learner.learnerId).then(
      () => setSynced(true),
      (e) => {
        setError(String(e.message ?? e));
        setSynced(true);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (profile: Profile) => {
    setBusy(true);
    setError(null);
    try {
      const r = await demoApi.saveLearner(profile, learner?.learnerId);
      const s = { learnerId: r.learner_id, profile: r.profile };
      saveLearner(s);
      setLearner(s);
      go("/library");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (route.name === "landing") return <Landing hasProfile={!!learner} />;

  let body;
  if (!synced)
    body = (
      <div className="grid place-items-center p-24 text-slate-400">
        <Spinner />
      </div>
    );
  else if (!learner || route.name === "start") body = <Onboarding initial={learner?.profile ?? null} onSave={(p) => void save(p)} busy={busy} />;
  else if (route.name === "library") body = <Library />;
  else if (route.name === "pack") body = <PackView id={route.id} learnerId={learner.learnerId} cached={route.cached} />;
  else if (route.name === "learn") body = <Learn sid={route.sid} />;
  else body = <Report learnerId={learner.learnerId} />;

  return (
    <Shell route={route} profile={learner?.profile ?? null}>
      {error && <div className="border-b border-rose-400/30 bg-rose-500/10 px-4 py-2 text-center text-sm text-rose-200">{error}</div>}
      {body}
    </Shell>
  );
}
