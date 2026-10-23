// Drives the full demo flow in Chromium and captures it frame by frame (CDP screencast),
// pacing each scene to its narration clip. Writes frames + timeline.json for assemble.py.
//
//   node record.ts WORK_DIR AUDIO_DIR UPLOAD.pdf
//   env: BASE (demo server URL), GENUI_DEMO_CACHE (the server's pack cache, read for the answer key),
//        PW_CHROMIUM (optional Chromium path)
import { chromium, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const [WORK, AUDIO, UPLOAD] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://127.0.0.1:8000";
const CACHE = process.env.GENUI_DEMO_CACHE ?? "";
const HERE = import.meta.dirname;
const dur: Record<string, number> = JSON.parse(fs.readFileSync(path.join(AUDIO, "durations.json"), "utf8"));
const framesDir = path.join(WORK, "frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

const frames: { file: string; t: number }[] = [];
const marks: { name: string; t: number }[] = [];
const busy: { t0: number; t1: number }[] = [];
let gen = { t0: 0, t1: 0 };
const now = () => Date.now() / 1000;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
await context.addInitScript({ path: path.join(HERE, "overlay.js") });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", (f: { data: string; sessionId: number; metadata: { timestamp: number } }) => {
  const file = path.join(framesDir, `${String(frames.length).padStart(6, "0")}.jpg`);
  fs.writeFileSync(file, Buffer.from(f.data, "base64"));
  frames.push({ file, t: f.metadata.timestamp });
  void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});

const pause = (ms: number) => page.waitForTimeout(ms);
const ov = (fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as any).__ov?.[f as string]?.(...(a as unknown[])), [fn, args] as const).catch(() => {});

async function scene(name: string, fn: () => Promise<void>, pad = 700) {
  const t0 = Date.now();
  marks.push({ name, t: t0 / 1000 });
  await fn();
  const need = (dur[name] ?? 0) * 1000 + pad;
  const left = need - (Date.now() - t0);
  if (left > 0) await pause(left);
}

async function show(loc: Locator) {
  await loc.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await pause(650);
}
async function moveTo(loc: Locator) {
  const b = await loc.boundingBox();
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 24 });
}
async function click(loc: Locator) {
  await show(loc);
  await moveTo(loc);
  await pause(250);
  await loc.click();
}
async function type(loc: Locator, text: string) {
  await click(loc);
  await loc.pressSequentially(text, { delay: 42 });
}
async function hl(selector: string, label: string, ms = 3200, below = false) {
  await ov("hl", selector, label, ms, below);
  await pause(ms * 0.45);
}

// ---- answer key (the recording knows the answers; the browser never does) ----
type Q = { prompt: string; answer: string; options: string[]; kind: string; level: number };
const norm = (s: string) => s.replace(/_{2,}/g, "").replace(/\s+/g, " ").trim().toLowerCase();
function key(): Q[] {
  const qs: Q[] = [];
  for (const f of fs.readdirSync(CACHE)) {
    const p = JSON.parse(fs.readFileSync(path.join(CACHE, f), "utf8"));
    for (const t of p.topics) qs.push(...t.questions);
  }
  return qs;
}
async function currentQuestion(): Promise<Q> {
  const text = norm((await page.getByTestId("question-prompt").textContent()) ?? "");
  const q = key().find((x) => norm(x.prompt) === text);
  if (!q) throw new Error(`question not in cache: ${text}`);
  return q;
}
async function itemLabel() {
  return (await page.getByTestId("item-label").textContent()) ?? "";
}
async function answer(correct: boolean, openHint = false) {
  const q = await currentQuestion();
  if (openHint) {
    const reveal = page.getByRole("button", { name: /^Reveal hint/ }).first();
    if (await reveal.isVisible().catch(() => false)) {
      await click(reveal);
      await pause(1600);
    }
  }
  if (q.kind === "blank") {
    const chip = page.locator("button", { hasText: new RegExp(`^${q.answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
    if (correct && (await chip.count())) await click(chip.first());
    else await type(page.getByTestId("blank-input"), correct ? q.answer : "diffusion");
  } else {
    const opts = page.locator('[data-testid^="option-"]');
    const n = await opts.count();
    let target = 0;
    for (let i = 0; i < n; i++) {
      const t = ((await opts.nth(i).textContent()) ?? "").slice(1).trim();
      if ((t === q.answer) === correct) {
        target = i;
        break;
      }
    }
    await click(opts.nth(target));
    const boxes = page.locator('fieldset input[type="checkbox"]');
    if ((await boxes.count()) > 0) {
      await click(boxes.first());
      await pause(300);
    }
  }
  await pause(500);
  const before = await itemLabel();
  await click(page.getByTestId("submit"));
  const t0 = now();
  await page.waitForFunction((b) => document.querySelector('[data-testid="item-label"]')?.textContent !== b, before, { timeout: 90_000 });
  busy.push({ t0, t1: now() });
  await pause(900);
}

await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

// ---- intro card, landing page, architecture card ----
await page.goto(`file://${HERE}/intro.html`);
await scene("intro", async () => {}, 1500);

await page.goto(`${BASE}/demo.html#/`);
await page.getByTestId("hero-start").waitFor();
await scene("landing", async () => {
  await page.mouse.move(800, 300);
  await pause(2600);
  await moveTo(page.getByTestId("hero-start"));
  await pause(800);
  for (const id of ["how", "features", "scope"]) {
    await page.locator(`#${id}`).evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    await pause(1900);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await pause(1200);
}, 400);

await page.goto(`file://${HERE}/architecture.html?d=${dur.architecture}`);
await scene("architecture", async () => {}, 2200);

// ---- onboarding (3 steps) ----
await page.goto(`${BASE}/demo.html#/`);
await click(page.getByTestId("hero-start"));
await page.locator("#name").waitFor();
await scene("onboarding", async () => {
  await ov("cap", "01", "Learner profile", "three steps · sets the starting estimate");
  await type(page.locator("#name"), "Asha");
  await click(page.locator("#grade"));
  await page.locator("#grade").selectOption("Grade 9-10");
  await pause(400);
  await click(page.getByTestId("onboarding-next"));
  await type(page.locator("#interests"), "cricket and cooking");
  await pause(300);
  await click(page.getByTestId("onboarding-next"));
  await click(page.getByText("New to me"));
  await hl("fieldset", "starting point → P(L₀) = 0.10", 2600);
});
await click(page.getByTestId("onboarding-save"));
await page.getByTestId("dropzone").waitFor();

// ---- material ----
await scene("material", async () => {
  await ov("cap", "02", "Bring your own material", "PDF · PPTX · TXT · MD · paste");
  await pause(500);
  await show(page.getByTestId("samples"));
  await hl('[data-testid="samples"]', "sample packs, pre-generated by Gemini", 2400);
  await show(page.getByTestId("dropzone"));
  const chooser = page.waitForEvent("filechooser");
  await click(page.getByRole("button", { name: "Choose file" }));
  await (await chooser).setFiles(UPLOAD);
  await pause(900);
});

// ---- generation (live Gemini) ----
await click(page.getByTestId("generate-file"));
gen.t0 = now();
await scene("generating", async () => {
  await ov("cap", "03", "Gemini builds the question bank", "live call · validated before use");
  await page.getByTestId("generating").waitFor();
  await hl('[data-testid="generating"]', "live pipeline status", 4200, true);
});
await page.getByTestId("pack-title").waitFor({ timeout: 240_000 });
gen.t1 = now();
await pause(800);

// ---- topics ----
await scene("topics", async () => {
  await ov("cap", "04", "Topics from the document", "summary · key points · 12 questions each");
  await hl('[data-testid="topics"] section', "topic 1 of the generated pack", 2800);
  await page.mouse.wheel(0, 350);
  await pause(900);
  await page.mouse.wheel(0, -350);
  await pause(500);
});
await click(page.getByTestId("learn-t1"));
await page.getByTestId("question-prompt").waitFor({ timeout: 90_000 });
await pause(600);

// ---- first screen ----
await scene("first", async () => {
  await ov("cap", "05", "The adaptive screen", "low mastery → small budget → guided question");
  await hl('[data-testid="question-prompt"]', "guided question, few options", 2800);
  if (await page.getByTestId("key-idea").isVisible().catch(() => false)) await hl('[data-testid="key-idea"]', "nudge written by Gemini for this learner", 3000);
  await hl('[data-testid="explain"]', "why this screen, in plain words", 3600);
  await show(page.getByTestId("telemetry"));
  await hl('[data-testid="telemetry"]', "under the hood: mastery, error, effort, budget, measured complexity", 3600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await pause(600);
});

// ---- answering ----
await scene("answering", async () => {
  await ov("cap", "06", "Answer → update → regenerate", "BKT update · PID step · new screen");
  await answer(true);
  await answer(true);
});
await scene("wrong", async () => {
  await ov("cap", "07", "A wrong answer", "the estimate drops · the screen steps back");
  await answer(false);
  await hl('[data-testid="outcome"]', "marked against the bank, with the explanation", 3200);
});

// ---- climb ----
await scene("higher", async () => {
  await ov("cap", "08", "Climbing the levels", "recognise → understand → recall → apply");
  let sawBlank = false;
  let sawApply = false;
  for (let i = 0; i < 14 && !(sawBlank && sawApply && i >= 4); i++) {
    const q = await currentQuestion();
    if (q.kind === "blank") sawBlank = true;
    if (q.level === 4) {
      sawApply = true;
      await hl('[data-testid="question-prompt"]', "level 4: apply the idea", 2400);
    }
    await answer(true, i === 1);
  }
  await show(page.locator("table").first());
  await hl("table", "gate log: budget vs. measured complexity, every screen", 3600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
});

// ---- report ----
await click(page.getByTestId("to-report"));
await page.getByTestId("report-name").waitFor();
await scene("report", async () => {
  await ov("cap", "09", "Progress report", "per topic · printable · for learner or teacher");
  await hl('[data-testid="report-status"]', "status and advice", 2600);
  await hl('svg[aria-label="mastery estimate over answers"]', "mastery estimate over answers", 2600);
  await page.mouse.wheel(0, 500);
  await pause(1500);
});

// ---- research mode ----
await scene("research", async () => {
  await ov("cap", "10", "Research mode, unchanged", "linear equations · evaluated in simulation");
  await click(page.getByRole("link", { name: "Research mode" }));
  await page.getByText("linear equations testbed").waitFor();
  await pause(800);
  await ov("cap", "10", "Research mode, unchanged", "linear equations · evaluated in simulation");
});

// ---- outro ----
await page.goto(`file://${HERE}/outro.html`);
await scene("outro", async () => {}, 2500);

await cdp.send("Page.stopScreencast");
const end = now();
await browser.close();
fs.writeFileSync(path.join(WORK, "timeline.json"), JSON.stringify({ frames, marks, busy, gen, end }, null, 1));
console.log(`frames ${frames.length}, scenes ${marks.length}, ${(end - marks[0].t).toFixed(1)} s`);
