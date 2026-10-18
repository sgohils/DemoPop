import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { safeStoragePath } from "../src/server/access";

const apply = process.argv.includes("--apply");
if (process.argv.slice(2).some((arg) => arg !== "--apply"))
  throw new Error("Usage: npm run cleanup [-- --apply]");
const days = Number(process.env.RETENTION_DAYS || 30);
if (!Number.isInteger(days) || days < 1 || days > 3650)
  throw new Error("RETENTION_DAYS must be between 1 and 3650.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error(
    "Configure the Supabase URL and server-only key before checking storage retention.",
  );
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cutoff = new Date(Date.now() - days * 86400000).toISOString();
const plan = await db.rpc("queue_storage_cleanup", {
  p_before: cutoff,
  p_apply: apply,
});
if (plan.error)
  throw new Error(
    "Storage cleanup could not be planned. Verify migrations and service access.",
  );
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    retentionDays: days,
    candidates: plan.data,
  }),
);
if (!apply) {
  console.log(
    "No stored files were deleted. Use --apply to queue eligible cleanup and drain pending deletions.",
  );
} else {
  let removed = 0;
  for (let batch = 0; batch < 100; batch++) {
    const queued = await db
      .from("storage_deletions")
      .select("id,owner_id,bucket,path")
      .order("created_at")
      .limit(100);
    if (queued.error)
      throw new Error("Pending deletion records could not be read.");
    if (!queued.data?.length) break;
    for (const row of queued.data) {
      if (
        !["inputs", "exports"].includes(row.bucket) ||
        !safeStoragePath(row.owner_id, row.path)
      )
        throw new Error("Cleanup refused an invalid registered storage path.");
      const result = await db.storage.from(row.bucket).remove([row.path]);
      if (result.error)
        throw new Error(
          "A storage deletion failed. Its pending record was retained for the next run.",
        );
      const acknowledged = await db
        .from("storage_deletions")
        .delete()
        .eq("id", row.id);
      if (acknowledged.error)
        throw new Error(
          "A deletion acknowledgment failed. The next run can safely retry it.",
        );
      removed++;
    }
  }
  console.log(
    JSON.stringify({
      removed,
      remaining: "Run again if more than 10,000 pending files were queued.",
    }),
  );
}
