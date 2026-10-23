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
  await expect(page.getByTestId("item-label")).not.toHaveText(before ?? "", { timeout: 60_000 });
  await expect(page.getByTestId("outcome")).toBeVisible();
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
  await expect(page.getByTestId("question-prompt")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("explain")).toContainText("mastery estimate");
  await page.screenshot({ path: `${SHOTS}/02-first-item.png`, fullPage: true });

  for (let i = 0; i < 6; i++) await answerItem(page, i === 2);
  await page.screenshot({ path: `${SHOTS}/03-after-six.png`, fullPage: true });
  // Telemetry advanced: the gate log has one row per screen generated.
  await expect(page.locator("tbody tr")).toHaveCount(7);

  await page.getByTestId("to-report").click();
  await expect(page.getByTestId("report-name")).toHaveText("Asha");
  await expect(page.getByTestId("report-started")).toHaveText("1");
  await expect(page.getByTestId("report-status")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/04-report.png`, fullPage: true });
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
