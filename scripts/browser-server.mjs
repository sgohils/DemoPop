import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const next = require.resolve("next/dist/bin/next");
const preview = process.env.DEMOPOP_LOCAL_PREVIEW === "1";
const cloudUI = !preview && process.env.DEMOPOP_TEST_CLOUD_UI === "1";
const port = Number(
  preview
    ? (process.env.DEMOPOP_PREVIEW_PORT ?? "3001")
    : (process.env.DEMOPOP_TEST_PORT ?? (cloudUI ? "3108" : "3107")),
);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error(
    `${preview ? "DEMOPOP_PREVIEW_PORT" : "DEMOPOP_TEST_PORT"} must be an available TCP port (1–65535).`,
  );

// Never inherit real cloud credentials from the developer's .env.local. The
// configured-UI suite uses dummy loopback credentials and mocks every API call;
// it verifies browser recovery behavior, not a live Supabase integration.
// Isolated output directories leave a running development server alone.
const env = preview
  ? {
      ...process.env,
      NODE_ENV: "production",
      DEMOPOP_TEST_DIST_DIR: ".next-preview",
    }
  : {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: cloudUI ? "http://127.0.0.1:1" : "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: cloudUI
        ? "mocked-ui-publishable-key"
        : "",
      SUPABASE_SERVICE_ROLE_KEY: cloudUI ? "mocked-ui-service-key" : "",
      DEMOPOP_BILLING_ENABLED: cloudUI ? "1" : "0",
      APP_ORIGIN: `http://127.0.0.1:${port}`,
      STRIPE_SECRET_KEY: cloudUI ? "sk_test_mocked_ui" : "",
      STRIPE_WEBHOOK_SECRET: cloudUI ? "whsec_mocked_ui" : "",
      STRIPE_PACKAGE_PRICE_ID: cloudUI ? "price_package_ui" : "",
      STRIPE_STUDIO_PRICE_ID: cloudUI ? "price_studio_ui" : "",
      DEMOPOP_TEST_DIST_DIR: cloudUI
        ? ".next-browser-cloud-ui"
        : ".next-browser",
    };

await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
});

let child;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child?.kill(signal));
}

function run(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [next, ...args], {
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      child = undefined;
      if (code === 0) resolve();
      else reject(new Error(`Next ${args[0]} stopped (${signal ?? code}).`));
    });
  });
}

// Next updates these root files even with an isolated distDir. Preserve their
// exact bytes so a browser test build does not change the developer's type setup.
const typeFiles = await Promise.all(
  ["tsconfig.json", "next-env.d.ts"].map(async (path) => ({
    path,
    original: await readFile(path),
  })),
);
try {
  await run(["build"]);
} finally {
  await Promise.all(
    typeFiles.map(async ({ path, original }) => {
      const current = await readFile(path);
      if (!current.equals(original)) await writeFile(path, original);
    }),
  );
}
await run(["start", "--hostname", "127.0.0.1", "--port", String(port)]);
