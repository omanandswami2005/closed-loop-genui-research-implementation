import type { Profile } from "./types";

const KEY = "genui-demo-learner";

export interface Saved {
  learnerId: string;
  profile: Profile;
}

export function loadLearner(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export function saveLearner(s: Saved | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private window: the session still works, it just is not remembered */
  }
}
