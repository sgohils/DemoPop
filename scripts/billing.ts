import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import {
  setupTestBilling,
  STRIPE_WEBHOOK_EVENTS,
} from "../src/server/billing-setup";
import { billingReadiness } from "../src/server/billing-readiness";
import { mergeBillingEnvironment } from "./billing-env";

dotenv.config({ path: [".env.local", ".env"], quiet: true });
const command = process.argv[2];
if (!["setup", "check"].includes(command) || process.argv.length !== 3) {
  console.error("Use npm run billing:setup or npm run billing:check");
  process.exitCode = 1;
} else {
  try {
    if (command === "setup") {
      const { updates, notices } = await setupTestBilling(process.env);
      const file = ".env.local";
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ENOENT"
        )
          throw error;
        contents = await readFile(".env.example", "utf8");
      }
      const temporary = `.env.local.billing-${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, mergeBillingEnvironment(contents, updates), {
          mode: 0o600,
          flag: "wx",
        });
        await rename(temporary, file);
      } finally {
        await unlink(temporary).catch(() => {});
      }
      console.log(
        `Stripe test setup saved to .env.local (${Object.keys(updates).join(", ")}). Secret values are not displayed.`,
      );
      notices.forEach((notice) => console.log(notice));
      console.log(
        "Restart the web server after changing .env.local. Run npm run billing:check to verify readiness.",
      );
      console.log(
        `Local webhook listener: stripe listen --events ${STRIPE_WEBHOOK_EVENTS.join(",")} --forward-to http://127.0.0.1:3001/api/billing/webhook`,
      );
    } else {
      const result = await billingReadiness(process.env);
      for (const check of result.checks)
        console.log(
          `${check.ok ? "OK" : "MISSING"} ${check.name}: ${check.detail}`,
        );
      console.log(
        result.ready
          ? "Configuration checks passed. Verify a test checkout and webhook delivery before accepting live payments."
          : "Payments are not ready. Complete the missing configuration above.",
      );
      if (!result.ready) process.exitCode = 1;
    }
  } catch {
    // Provider error bodies can contain confidential configuration. Leave those
    // out of console output and keep setup failures actionable without keys.
    console.error(
      command === "setup"
        ? "Stripe test setup could not finish. Set a test-mode STRIPE_SECRET_KEY and a valid APP_ORIGIN in .env.local, then check the configured prices and portal in Stripe. No live-mode setup is supported by this command."
        : "Billing checks could not finish. Verify the configuration in .env.local and retry.",
    );
    process.exitCode = 1;
  }
}
