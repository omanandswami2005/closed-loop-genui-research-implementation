import { defineConfig } from "@playwright/test";

// Runs against a live server: the demo app (FastAPI) serving the built frontend.
// By default it starts one; set E2E_BASE_URL to test an existing deployment instead.
const port = 8765;
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "report" }]],
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: external
    ? undefined
    : {
        command: `cd ../backend && GENUI_STATIC_DIR=../frontend/dist GENUI_DEMO_CACHE=$(mktemp -d) uvicorn closedloop_demo.app:app --port ${port}`,
        url: `http://127.0.0.1:${port}/api/demo/health`,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
