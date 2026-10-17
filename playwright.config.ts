import { defineConfig } from "@playwright/test";
import { ensureBrowser } from "@remotion/renderer";
const browser = await ensureBrowser();
if (!("path" in browser))
  throw new Error("Chromium is unavailable. Run npm run render:sample first.");
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: { executablePath: browser.path },
  },
  outputDir: "out/browser-results",
});
