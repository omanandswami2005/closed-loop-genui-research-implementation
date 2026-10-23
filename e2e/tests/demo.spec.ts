import { expect, type Page, test } from "@playwright/test";
import { resolve } from "node:path";

const SAMPLES = resolve(import.meta.dirname, "../../docs/demo/samples");
const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const SHOTS = resolve(import.meta.dirname, "../artifacts");

async function onboard(page: Page, name = "Asha", prior: "New to me" | "I know a little" | "I know it fairly well" = "New to me") {
  await page.goto("/demo.html#/start");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Level").selectOption("Grade 9-10");
  await page.getByTestId("onboarding-next").click();
  await page.getByLabel("Interests").fill("cricket and cooking");
  await page.getByTestId("onboarding-next").click();
  await page.getByText(prior).click();
  await page.getByTestId("onboarding-save").click();
  await expect(page.getByTestId("dropzone")).toBeVisible();
}

/** Plays the topic's interactive lab: solves nothing on purpose, so every level is skipped or its solution shown. */
async function playLab(page: Page) {
  await expect(page.getByTestId("lab-title")).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId("toolbox")).toBeVisible();
  await expect(page.getByTestId("lab-gate")).toBeVisible();
  const levels = await page.getByTestId("lab-steps").locator("button").count();
  expect(levels).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < levels; i++) {
    await expect(page.getByTestId("station")).toBeVisible();
    await page.getByTestId("skip-level").click();
    await expect(page.getByTestId("station-result")).toBeVisible();
    await page.getByTestId("station-next").click();
  }
  await expect(page.getByTestId("lab-done")).toBeVisible();
  await page.getByTestId("start-check").click();
  await expect(page.getByTestId("question-prompt")).toBeVisible({ timeout: 60_000 });
}

/** Answers the current item: option A for multiple choice, the first chip or a guess for blanks. */
async function answerItem(page: Page, wrong = false) {
  const before = await page.getByTestId("item-label").textContent();
  const blank = page.getByTestId("blank-input");
  if (await blank.isVisible()) {
    await blank.fill(wrong ? "zzz" : "unknown");
  } else {
    await page.getByTestId(wrong ? "option-1" : "option-0").click();
  }
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("topic-done").or(page.getByTestId("item-label").filter({ hasNotText: before ?? "" }))).toBeVisible({ timeout: 60_000 });
  if (await page.getByTestId("topic-done").isVisible()) return true;
  await expect(page.getByTestId("outcome")).toBeVisible();
  return false;
}

test("full flow: onboarding, live Gemini topic generation from pasted text, adaptive items, progress report", async ({ page }) => {
  await onboard(page);
  const fs = await import("node:fs");
  // A run stamp changes the text, so the pack is generated live, never served from the cache.
  const text = `${fs.readFileSync(`${FIXTURES}/human-heart.txt`, "utf8")}\n\nNotes taken on ${new Date().toISOString()}.`;
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.getByTestId("paste-name").fill("The human heart");
  await page.getByTestId("paste-text").fill(text);
  await page.getByTestId("generate-text").click();
  await expect(page.getByTestId("generating")).toBeVisible();
  await expect(page.getByTestId("pack-title")).toBeVisible({ timeout: 180_000 });
  const topics = page.getByTestId("topics").locator("section");
  expect(await topics.count()).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: `${SHOTS}/01-topics-live.png`, fullPage: true });

  await page.getByTestId("learn-t1").click();
  await expect(page.getByTestId("lab-loading")).toBeVisible();
  await expect(page.getByTestId("lab-title")).toBeVisible({ timeout: 150_000 });
  await page.screenshot({ path: `${SHOTS}/02-lab.png`, fullPage: true });
  await playLab(page);
  await expect(page.getByTestId("explain")).toContainText("mastery estimate");
  await expect(page.getByTestId("item-label")).toContainText("question 1 of 10");
  await page.screenshot({ path: `${SHOTS}/03-first-item.png`, fullPage: true });

  // The check is limited: it ends after at most 10 questions (or earlier once mastery passes 0.95) with a summary.
  let done = false;
  let answered = 0;
  while (!done && answered < 10) {
    done = await answerItem(page, answered % 3 === 2);
    answered += 1;
    if (!done) {
      await expect(page.getByTestId("item-label")).toContainText(`question ${answered + 1} of 10`);
      // Telemetry advanced: the gate log has one row per screen generated.
      await expect(page.locator("tbody tr")).toHaveCount(answered + 1);
    }
    if (answered === 3) await page.screenshot({ path: `${SHOTS}/03b-after-three.png`, fullPage: true });
  }
  expect(done).toBe(true);
  await expect(page.getByTestId("end-reason")).toContainText("The check ended:");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/04-topic-done.png`, fullPage: true });

  await page.getByTestId("to-report").click();
  await expect(page.getByTestId("report-name")).toHaveText("Asha");
  await expect(page.getByTestId("report-started")).toHaveText("1");
  await expect(page.getByTestId("report-status")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/05-report.png`, fullPage: true });
});

test("PDF upload of a sample is served from the cache and opens its topics", async ({ page }) => {
  await onboard(page, "Ravi", "I know a little");
  await page.getByTestId("file-input").setInputFiles(`${SAMPLES}/photosynthesis.pdf`);
  await page.getByTestId("generate-file").click();
  await expect(page.getByTestId("pack-title")).toHaveText("Photosynthesis: How Plants Make Food");
  await expect(page.getByText("served from cache")).toBeVisible();
});

test("PPTX upload works and a topic starts", async ({ page }) => {
  await onboard(page, "Meera", "I know it fairly well");
  await page.getByTestId("file-input").setInputFiles(`${SAMPLES}/newtons-laws.pptx`);
  await page.getByTestId("generate-file").click();
  await expect(page.getByTestId("pack-title")).toBeVisible();
  await page.getByTestId("learn-t1").click();
  await expect(page.getByTestId("lab-title")).toBeVisible({ timeout: 150_000 });
  await page.getByTestId("skip-lab").click();
  await expect(page.getByTestId("question-prompt")).toBeVisible({ timeout: 60_000 });
});

test("unsupported and empty uploads show a clear error", async ({ page }) => {
  await onboard(page, "Kiran");
  await page.getByTestId("file-input").setInputFiles({ name: "notes.docx", mimeType: "application/octet-stream", buffer: Buffer.from("x") });
  await page.getByTestId("generate-file").click();
  await expect(page.getByTestId("upload-error")).toContainText("Unsupported file type");
  await page.getByTestId("file-input").setInputFiles({ name: "empty.txt", mimeType: "text/plain", buffer: Buffer.from("") });
  await page.getByTestId("generate-file").click();
  await expect(page.getByTestId("upload-error")).toContainText("empty");
});

test("profile is remembered across reloads", async ({ page }) => {
  await onboard(page, "Neha");
  await page.reload();
  await expect(page.getByTestId("nav-profile")).toContainText("Neha");
  await expect(page.getByTestId("dropzone")).toBeVisible();
});

test("landing page renders and leads to onboarding", async ({ page }) => {
  await page.goto("/demo.html");
  await expect(page.getByText("that adapt to you.")).toBeVisible();
  await expect(page.getByText("A control loop, not a chatbot.")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/00-landing.png` });
  await page.getByTestId("hero-start").click();
  await expect(page.getByLabel("Your name")).toBeVisible();
});

test("research mode (linear equations) is unchanged and still works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("linear equations testbed")).toBeVisible();
  await expect(page.getByText("item 1")).toBeVisible();
  await expect(page.getByText("P(Lₙ)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "new session" }).click();
  await expect(page.getByText("item 1")).toBeVisible();
});
