import { defineConfig } from "@playwright/test";
import { ensureBrowser } from "@remotion/renderer";

const port = Number(process.env.DEMOPOP_TEST_PORT ?? "3107");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("DEMOPOP_TEST_PORT must be an available TCP port (1–65535).");
const baseURL = `http://127.0.0.1:${port}`;
const browser = await ensureBrowser();
if (!("path" in browser))
  throw new Error("Chromium is unavailable. Run npm run render:sample first.");
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL,
    headless: true,
    launchOptions: { executablePath: browser.path },
  },
  webServer: {
    command: "node scripts/browser-server.mjs",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180000,
    env: { DEMOPOP_TEST_PORT: String(port) },
  },
  outputDir: "out/browser-results",
});
