import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { sampleProject } from "../src/shared/project";
import { boundedBody, verifyStripeSignature } from "../src/server/stripe";
import { safeAuthNext } from "../src/shared/auth-next";

test("payment signatures require the exact raw body, a recent timestamp and a matching rotating secret", async () => {
  const now = 1800000000000,
    time = now / 1000,
    raw = '{"id":"evt_123","data": {"amount":2900}}';
  const digest = createHmac("sha256", "whsec_test")
    .update(`${time}.${raw}`)
    .digest("hex");
  const header = `t=${time},v1=${"a".repeat(64)},v1=${digest}`;
  assert.equal(verifyStripeSignature(raw, header, "whsec_test", now), true);
  assert.equal(
    verifyStripeSignature(raw.replace("2900", "1"), header, "whsec_test", now),
    false,
  );
  assert.equal(verifyStripeSignature(raw, header, "whsec_wrong", now), false);
  assert.equal(
    verifyStripeSignature(raw, header, "whsec_test", now + 301000),
    false,
  );
  assert.equal(
    verifyStripeSignature(raw, header, "whsec_test", now - 301000),
    false,
  );
  assert.equal(
    verifyStripeSignature(raw, `t=${time},v1=zz`, "whsec_test", now),
    false,
  );
  await assert.rejects(
    boundedBody(
      new Request("http://localhost", {
        method: "POST",
        body: "a".repeat(100),
      }),
      50,
    ),
    /too large/,
  );
  assert.equal(safeAuthNext("/pricing?plan=studio"), "/pricing?plan=studio");
  assert.equal(safeAuthNext("/billing"), "/billing");
  assert.equal(
    safeAuthNext("/pricing?plan=studio&next=https://evil.example"),
    "/projects",
  );
});

test("paid migrations atomically enforce project allowances, revision limits, renewal deduplication, refunds and ownership", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql as $$select string_to_array(name,'/')$$;
      grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;`);
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(
        (await readFile(`supabase/migrations/${file}`, "utf8")).replace(
          "create extension if not exists pgcrypto;",
          "",
        ),
      );
    const alice = randomUUID(),
      bob = randomUUID();
    await db.query("insert into auth.users values($1),($2)", [alice, bob]);
    const beginCheckout = () =>
      db.query<{ attempt: { id: string } }>(
        "select public.begin_billing_checkout($1,'studio') attempt",
        [alice],
      );
    const staleAttempt = (await beginCheckout()).rows[0].attempt.id;
    await db.query(
      "update public.billing_checkouts set created_at=now()-interval '40 minutes' where id=$1",
      [staleAttempt],
    );
    const restartCheckout = (id: string, owner = alice) =>
      db.query<{ attempt: { id: string } }>(
        "select public.restart_billing_checkout($1,$2) attempt",
        [owner, id],
      );
    const replacements = await Promise.all([
      restartCheckout(staleAttempt),
      restartCheckout(staleAttempt),
    ]);
    const replacementAttempt = replacements[0].rows[0].attempt.id;
    assert.notEqual(replacementAttempt, staleAttempt);
    assert.equal(replacements[1].rows[0].attempt.id, replacementAttempt);
    assert.equal(
      (await beginCheckout()).rows[0].attempt.id,
      replacementAttempt,
    );
    const retired = await db.query<{ retired: boolean; fulfilled: boolean }>(
      "select retired_at is not null retired,fulfilled from public.billing_checkouts where id=$1",
      [staleAttempt],
    );
    assert.deepEqual(retired.rows[0], { retired: true, fulfilled: false });
    await assert.rejects(
      restartCheckout(staleAttempt, bob),
      /cannot be restarted/,
    );
    await assert.rejects(
      restartCheckout(replacementAttempt),
      /cannot be restarted/,
    );
    await db.query(
      "update public.billing_checkouts set created_at=now()-interval '40 minutes',session_id='cs_existing' where id=$1",
      [replacementAttempt],
    );
    await assert.rejects(
      restartCheckout(replacementAttempt),
      /cannot be restarted/,
    );
    const makeProject = async (owner = alice) =>
      (
        await db.query<{ id: string }>(
          "insert into public.projects(owner_id,name,settings,before_asset,after_asset) values($1,$2,$3,$4,$5) returning id",
          [
            owner,
            sampleProject.name,
            sampleProject,
            sampleProject.before,
            sampleProject.after,
          ],
        )
      ).rows[0].id;
    const project = await makeProject(),
      other = await makeProject(),
      foreign = await makeProject(bob);
    const contextProject = await makeProject();
    const contextualCheckout = (projectId: string, owner = alice) =>
      db.query<{
        attempt: { id: string; return_project_id: string | null };
      }>("select public.begin_billing_checkout($1,'package',$2) attempt", [
        owner,
        projectId,
      ]);
    await assert.rejects(
      contextualCheckout(contextProject, bob),
      /Project not found/,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.billing_accounts where owner_id=$1",
          [bob],
        )
      ).rows.length,
      0,
      "a foreign project fails before creating a billing account",
    );
    assert.equal(
      (
        await db.query(
          "select * from public.billing_checkouts where owner_id=$1",
          [bob],
        )
      ).rows.length,
      0,
    );
    const contextualAttempt = (await contextualCheckout(contextProject)).rows[0]
      .attempt;
    assert.equal(contextualAttempt.return_project_id, contextProject);
    const reusedContext = (await contextualCheckout(other)).rows[0].attempt;
    assert.deepEqual(reusedContext, contextualAttempt);
    const legacyContext = await db.query<{
      attempt: { id: string; return_project_id: string | null };
    }>("select public.begin_billing_checkout($1,'package') attempt", [alice]);
    assert.deepEqual(legacyContext.rows[0].attempt, contextualAttempt);
    await assert.rejects(contextualCheckout(foreign), /Project not found/);
    const trashedContext = await makeProject();
    await db.query("update public.projects set deleted_at=now() where id=$1", [
      trashedContext,
    ]);
    await assert.rejects(
      contextualCheckout(trashedContext),
      /Project not found/,
    );
    await db.query(
      "update public.billing_checkouts set created_at=now()-interval '40 minutes' where id=$1",
      [contextualAttempt.id],
    );
    await db.query("update public.projects set deleted_at=now() where id=$1", [
      contextProject,
    ]);
    const retryFromAnotherProject = (await contextualCheckout(other)).rows[0]
      .attempt;
    assert.equal(retryFromAnotherProject.id, contextualAttempt.id);
    assert.equal(retryFromAnotherProject.return_project_id, contextProject);
    const recoveredContext = await db.query<{
      attempt: { id: string; return_project_id: string | null };
    }>("select public.restart_billing_checkout($1,$2) attempt", [
      alice,
      contextualAttempt.id,
    ]);
    assert.notEqual(recoveredContext.rows[0].attempt.id, contextualAttempt.id);
    assert.equal(
      recoveredContext.rows[0].attempt.return_project_id,
      contextProject,
      "expiry recovery preserves the original snapshot even after it is trashed",
    );
    await db.query("delete from public.projects where id=$1", [contextProject]);
    const retainedContext = await db.query<{ return_project_id: string }>(
      "select return_project_id from public.billing_checkouts where id=$1",
      [recoveredContext.rows[0].attempt.id],
    );
    assert.equal(
      retainedContext.rows[0].return_project_id,
      contextProject,
      "project deletion cannot change a persisted Stripe idempotency payload",
    );
    await db.query(
      "update public.billing_checkouts set created_at=now()-interval '40 minutes' where id=$1",
      [recoveredContext.rows[0].attempt.id],
    );
    const recoveredAfterDeletion = await db.query<{
      attempt: { id: string; return_project_id: string | null };
    }>("select public.restart_billing_checkout($1,$2) attempt", [
      alice,
      recoveredContext.rows[0].attempt.id,
    ]);
    assert.notEqual(
      recoveredAfterDeletion.rows[0].attempt.id,
      recoveredContext.rows[0].attempt.id,
    );
    assert.equal(
      recoveredAfterDeletion.rows[0].attempt.return_project_id,
      contextProject,
      "a removed original destination does not prevent recovery into a new attempt",
    );
    const queue = (id: string, owner = alice, kind = "launch-pack") =>
      db.query<{ result: { id: string; reused: boolean } }>(
        "select public.enqueue_commercial_output($1,$2,$3,1000,$4) result",
        [owner, id, sampleProject, kind],
      );
    const grant = (
      event: string,
      source: string,
      data: Record<string, unknown> = {},
    ) =>
      db.query("select public.apply_billing_event($1,$2,$3)", [
        event,
        alice,
        { source, offer: "package", paymentRef: "pi_one", ...data },
      ]);
    await assert.rejects(queue(project), /Payment required/);
    assert.equal(
      (await db.query("select * from public.render_jobs")).rows.length,
      0,
      "failed entitlement check rolls back the queue insert",
    );
    await grant("evt_paid", "package:one");
    await grant("evt_paid", "package:one");
    await grant("confirm:one", "package:one");
    assert.equal(
      (await db.query("select * from public.billing_grants")).rows.length,
      1,
    );
    const [first, duplicate] = await Promise.all([
      queue(project),
      queue(project),
    ]);
    const job = first.rows[0].result.id;
    assert.equal(job, duplicate.rows[0].result.id);
    assert.equal(duplicate.rows[0].result.reused, true);
    assert.equal(
      (
        await db.query<{ used: number }>(
          "select used from public.billing_grants",
        )
      ).rows[0].used,
      1,
    );
    await assert.rejects(queue(other), /Payment required/);
    await assert.rejects(queue(foreign), /Not found/);
    await assert.rejects(queue(project, bob), /Not found/);
    await db.query(
      "update public.render_jobs set status='failed' where id=$1",
      [job],
    );
    const replacement = (await queue(project)).rows[0].result.id;
    await db.query(
      "update public.render_jobs set status='completed' where id=$1",
      [replacement],
    );
    await db.query("select public.retry_render($1,$2,1000)", [alice, job]);
    await db.query(
      "update public.render_jobs set status='completed' where id=$1",
      [job],
    );
    for (let index = 0; index < 8; index++) {
      const queued = (await queue(project, alice, "video")).rows[0].result.id;
      await db.query(
        "update public.render_jobs set status='completed' where id=$1",
        [queued],
      );
    }
    await assert.rejects(queue(project), /Project export allowance reached/);
    assert.equal(
      (await db.query("select * from public.render_jobs where status='queued'"))
        .rows.length,
      0,
    );
    await db.query(
      "update public.project_access set expires_at=now()-interval '1 day' where project_id=$1",
      [project],
    );
    await assert.rejects(queue(project), /Payment required/);
    const expired = new Date(Date.now() - 86400000).toISOString();
    await grant("evt_old_month", "studio:old", {
      offer: "studio",
      expiresAt: expired,
    });
    await assert.rejects(queue(other), /Payment required/);
    await grant("evt_cycle", "studio:current", {
      offer: "studio",
      paymentRef: "pi_cycle",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await grant("confirm:cycle", "studio:current", { offer: "studio" });
    const renewals = await db.query<{ allowance: number }>(
      "select allowance from public.billing_grants where source='studio:current'",
    );
    assert.equal(renewals.rows[0].allowance, 5);
    for (let index = 0; index < 5; index++)
      await queue(index === 0 ? other : await makeProject());
    await assert.rejects(queue(await makeProject()), /Payment required/);
    await db.query("select public.apply_billing_event($1,$2,$3)", [
      "evt_refund_first",
      alice,
      { revoke: "pi_late" },
    ]);
    await grant("evt_delayed_paid", "package:late", { paymentRef: "pi_late" });
    await assert.rejects(
      queue(await makeProject()),
      /Payment required/,
      "late paid webhook cannot resurrect a refunded grant",
    );
    await db.query("select public.apply_billing_event($1,$2,$3)", [
      "evt_refund",
      alice,
      { revoke: "pi_cycle" },
    ]);
    const active = (
      await db.query<{ id: string }>(
        "select id from public.render_jobs where project_id=$1",
        [other],
      )
    ).rows[0].id;
    await db.query(
      "update public.render_jobs set status='failed' where id=$1",
      [active],
    );
    await assert.rejects(
      db.query("select public.retry_render($1,$2,1000)", [alice, active]),
      /Purchase refunded/,
    );
    await assert.rejects(queue(other), /Payment required/);
    await db.exec(
      `set role authenticated;set "request.jwt.claim.sub"='${alice}'`,
    );
    await assert.rejects(
      db.query("select * from public.billing_grants"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.apply_billing_event($1,$2,$3)", [
        "fake",
        alice,
        { source: "fraud", offer: "studio" },
      ]),
      /permission denied/,
    );
    await assert.rejects(queue(project), /permission denied/);
    await assert.rejects(restartCheckout(staleAttempt), /permission denied/);
    await assert.rejects(contextualCheckout(project), /permission denied/);
    await assert.rejects(beginCheckout(), /permission denied/);
  } finally {
    await db.close();
  }
});
