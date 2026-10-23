import type { Lab, Station } from "./genui/types";
import type { DemoView, LearnerReport, PackSummary, Profile } from "./types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      detail = `${res.status} ${await res.text().catch(() => "")}`;
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return parse<T>(
    await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
}

async function get<T>(path: string): Promise<T> {
  return parse<T>(await fetch(`${BASE}${path}`));
}

export const demoApi = {
  saveLearner: (profile: Profile, learner_id?: string) =>
    post<{ learner_id: string; profile: Profile }>("/api/demo/learners", { ...profile, learner_id }),
  packs: () => get<PackSummary[]>("/api/demo/packs"),
  pack: (id: string) => get<PackSummary>(`/api/demo/packs/${id}`),
  uploadFile: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return parse<PackSummary>(await fetch(`${BASE}/api/demo/packs`, { method: "POST", body: form }));
  },
  uploadText: async (text: string, name: string) => {
    const form = new FormData();
    form.append("text", text);
    form.append("name", name);
    return parse<PackSummary>(await fetch(`${BASE}/api/demo/packs`, { method: "POST", body: form }));
  },
  startSession: (learner_id: string, pack_id: string, topic_id: string, plant?: "gemini" | "deterministic") =>
    post<DemoView>("/api/demo/sessions", { learner_id, pack_id, topic_id, plant }),
  session: (sid: string) => get<DemoView>(`/api/demo/sessions/${sid}`),
  respond: (sid: string, answer: string, hints_opened: number, justification: string) =>
    post<DemoView>(`/api/demo/sessions/${sid}/responses`, { answer, hints_opened, justification }),
  gallery: () => get<{ stations: Station[]; rejected: string[]; hands_on: string[]; simulations: string[]; count: number }>("/api/demo/gallery"),
  lab: (sid: string) => post<Lab>(`/api/demo/sessions/${sid}/lab`, {}),
  labResult: (sid: string, r: { station_id: string; type: string; solved: boolean; attempts: number; revealed: boolean; seconds: number }) =>
    post<{ ok: boolean }>(`/api/demo/sessions/${sid}/lab/results`, r),
  finishLab: (sid: string) => post<DemoView>(`/api/demo/sessions/${sid}/lab/finish`, {}),
  report: (lid: string) => get<LearnerReport>(`/api/demo/learners/${lid}/report`),
};
