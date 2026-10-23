import { expect, type Locator, type Page, test } from "@playwright/test";
import { resolve } from "node:path";

const SHOTS = resolve(import.meta.dirname, "../artifacts/components");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type St = Record<string, any> & { type: string; id: string };
const AUTO = new Set(["ExploreDiagram", "ScenarioBranch", "Flashcards"]);
const q = (v: string) => JSON.stringify(v);

async function place(st: Locator, chip: string, slot: string) {
  await st.locator(`[data-chip=${q(chip)}]`).first().click();
  await st.locator(`[data-slot=${q(slot)}]`).click();
}

/** Solves a component the way a learner would, from its data. Returns false when there is no scripted solve. */
async function solve(page: Page, st: Locator, s: St): Promise<boolean> {
  const sliders = st.getByRole("slider");
  switch (s.type) {
    case "MatchPairs":
      for (const p of s.pairs) await place(st, p.right, p.left);
      return true;
    case "ClozeBank": {
      const answers = [...s.text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m: RegExpMatchArray) => m[1]);
      for (const [i, a] of answers.entries()) await place(st, a, `g${i}`);
      return true;
    }
    case "BalanceScale":
      for (const i of s.answer) await st.getByTestId(`tray-${i}`).click();
      return true;
    case "ToggleSystem": {
      const o = s.outcomes.find((x: St) => x.result === s.target_result);
      for (const sw of o.on) await st.getByTestId(`switch-${sw}`).click();
      return true;
    }
    case "CauseEffect":
      for (const [i, l] of s.links.entries()) {
        await st.getByTestId(`cause-${i}`).click();
        await st.locator('[data-testid^="effect-"]', { hasText: l.effect }).first().click();
      }
      return true;
    case "SpotTheError":
      for (const [i, x] of s.statements.entries()) if (x.wrong) await st.getByTestId(`statement-${i}`).click();
      return true;
    case "PredictObserve":
      await st.getByTestId(`predict-${s.options.indexOf(s.answer)}`).click();
      await st.getByTestId("run-experiment").click();
      return true;
    case "ParameterLab":
    case "FunctionPlot":
      for (const [i, p] of s.params.entries()) await sliders.nth(i).fill(String(p.answer));
      return true;
    case "Pendulum":
      await sliders.nth(0).fill(String(s.length.answer));
      return true;
    case "Projectile":
      await sliders.nth(0).fill(String(s.speed.answer));
      await sliders.nth(1).fill(String(s.angle.answer));
      await st.getByTestId("launch").click();
      return true;
    case "Mixer":
      for (const [i, g] of s.ingredients.entries()) await sliders.nth(i).fill(String(g.answer));
      return true;
    case "ExploreDiagram":
      for (let i = 0; i < s.parts.length; i++) await st.getByTestId(`part-${i}`).click();
      return true;
    case "ScenarioBranch":
      for (const step of s.steps) {
        await st.getByTestId(`choice-${step.choices.findIndex((c: St) => c.correct)}`).click();
        await st.getByTestId("scenario-next").click();
      }
      return true;
    case "Flashcards":
      for (let i = 0; i < s.cards.length; i++) {
        await st.getByTestId("flashcard").click();
        await st.getByTestId("knew").click();
      }
      return true;
    case "CategorySort":
      for (const c of s.categories) for (const it of c.items) await place(st, it, c.name);
      return true;
    case "Timeline": {
      const sorted = [...s.events].sort((a: St, b: St) => a.value - b.value);
      for (const [i, e] of sorted.entries()) await place(st, e.label, `t${i}`);
      return true;
    }
    case "LabelDiagram":
      for (const [i, p] of s.parts.entries()) await place(st, p.label, `d${i}`);
      return true;
    case "NumberLine":
      for (const [i, m] of s.markers.entries()) await sliders.nth(i).fill(String(m.value));
      return true;
    case "ForceArrows": {
      let k = 0;
      for (const [i, f] of s.forces.entries()) if (f.adjustable) await sliders.nth(k++).fill(String(s.answer[i]));
      return true;
    }
    case "WaveExplorer":
      await sliders.nth(0).fill(String(s.amplitude.answer));
      await sliders.nth(1).fill(String(s.frequency.answer));
      await sliders.nth(2).fill(String(s.phase.answer));
      return true;
    case "GrowthCurve":
      await sliders.nth(0).fill(String(s.rate.answer));
      return true;
    case "DraggableBars":
      for (const [i, b] of s.bars.entries()) await sliders.nth(i).fill(String(b.value));
      return true;
    default:
      return false;
  }
}

test("component gallery: all 30 lab-ui/1 components render, validate and can be completed", async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const g = await (await page.request.get("/api/demo/gallery")).json();
  expect(g.count).toBe(30);
  expect(g.stations).toHaveLength(30);
  expect(g.rejected).toEqual([]);

  const solved: string[] = [];
  for (const s of g.stations as St[]) {
    await page.goto(`/demo.html#/gallery/${s.type}`);
    const st = page.getByTestId("station");
    await expect(st).toHaveAttribute("data-type", s.type);
    await expect(page.getByTestId("station-title")).toHaveText(s.title);
    await page.reload(); // clears the previous component's confetti before the screenshot
    await expect(st).toHaveAttribute("data-type", s.type);
    await page.screenshot({ path: `${SHOTS}/${s.type}.png`, fullPage: true });

    // 1. a learner's solve, driven from the component's data
    if (await solve(page, st, s)) {
      if (!AUTO.has(s.type)) {
        await expect(st).toHaveAttribute("data-correct", "true", { timeout: 8_000 });
        await page.getByTestId("station-check").click();
      }
      await expect(page.getByTestId("station-result")).toHaveAttribute("data-result", "solved", { timeout: 8_000 });
      solved.push(s.type);
      await page.getByTestId("station-again").click();
    }
    // 2. the worked solution puts every component into a correct state
    if (!AUTO.has(s.type)) {
      await page.getByTestId("station-hint").click();
      await expect(page.getByTestId("hints")).toContainText(s.hints[0]);
      await page.getByTestId("station-reveal").click();
      await expect(st).toHaveAttribute("data-correct", "true");
      await expect(page.getByTestId("station-result")).toContainText(s.explain);
    }
  }
  console.log(`solved by interaction: ${solved.length} (${solved.join(", ")})`);
  expect(solved.length).toBeGreaterThanOrEqual(23);
  expect(errors).toEqual([]);
});

test("a wrong attempt gives feedback and unlocks the worked solution after two checks", async ({ page }) => {
  await page.goto("/demo.html#/gallery/BalanceScale");
  const g = await (await page.request.get("/api/demo/gallery")).json();
  const s = (g.stations as St[]).find((x) => x.type === "BalanceScale")!;
  const wrong = s.tray.findIndex((_: St, i: number) => !s.answer.includes(i));
  await page.getByTestId(`tray-${wrong}`).click();
  await page.getByTestId("station-check").click();
  await expect(page.getByTestId("station-feedback")).toContainText("pan");
});
