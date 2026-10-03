import type { PlantName, SessionView, StepCheck } from "./types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  createSession: (plant: PlantName, seed?: number) => post<SessionView>("/api/sessions", { plant, seed }),
  respond: (id: string, answer: string, steps: string[] = []) =>
    post<SessionView>(`/api/sessions/${id}/responses`, { answer, steps }),
  check: (id: string, line: string) => post<StepCheck>(`/api/sessions/${id}/check`, { line }),
};
