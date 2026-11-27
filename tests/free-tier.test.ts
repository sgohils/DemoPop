import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { FREE_EXPORT_LIMIT, freeExportPeriod } from "../src/shared/billing";
import { sampleProject } from "../src/shared/project";

test("free allowance follows UTC calendar months including year and leap-day boundaries", () => {
  assert.equal(FREE_EXPORT_LIMIT, 2);
  assert.deepEqual(freeExportPeriod(new Date("2026-12-31T23:59:59Z")), {
    startsAt: "2026-12-01T00:00:00.000Z",
    resetsAt: "2027-01-01T00:00:00.000Z",
  });
  assert.deepEqual(freeExportPeriod(new Date("2028-02-29T18:30:00-05:00")), {
    startsAt: "2028-02-01T00:00:00.000Z",
    resetsAt: "2028-03-01T00:00:00.000Z",
  });
  assert.deepEqual(freeExportPeriod(new Date("2026-10-31T23:30:00-04:00")), {
    startsAt: "2026-11-01T00:00:00.000Z",
    resetsAt: "2026-12-01T00:00:00.000Z",
  });
});

test("free exports reserve two monthly single videos atomically, survive deletion and safely handle failures, retries and upgrades", async () => {
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
      .filter((file) => file.endsWith(".sql"))
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
    const project = async (owner = alice) =>
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
    const queue = async (
      id: string,
      owner = alice,
      kind = "video",
      cap = 1000,
    ) =>
      (
        await db.query<{
          result: { id: string; reused: boolean; outputKind: string };
        }>("select public.enqueue_commercial_output($1,$2,$3,$4,$5) result", [
          owner,
          id,
          sampleProject,
          cap,
          kind,
        ])
      ).rows[0].result;
    const finish = (id: string, status = "completed") =>
      db.query("update public.render_jobs set status=$2 where id=$1", [
        id,
        status,
      ]);
    const used = async (owner = alice) =>
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.free_export_usage where owner_id=$1 and not failed and period_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'",
          [owner],
        )
      ).rows[0].n;
    const retry = (id: string, owner = alice) =>
      db.query("select public.retry_render($1,$2,1000)", [owner, id]);
    const grant = (source: string) =>
      db.query("select public.apply_billing_event($1,$2,$3)", [
        `event:${source}`,
        alice,
        { source, offer: "package", paymentRef: `payment:${source}` },
      ]);

    const firstProject = await project(),
      secondProject = await project(),
      thirdProject = await project(),
      foreignProject = await project(bob);
    await assert.rejects(
      queue(firstProject, alice, "launch-pack"),
      /Payment required/,
    );
    assert.equal(
      await used(),
      0,
      "paid-only kinds cannot reserve free allowance",
    );
    await assert.rejects(queue(foreignProject), /Not found/);
    await assert.rejects(queue(firstProject, bob), /Not found/);
    const initial = await queue(firstProject);
    assert.equal(initial.outputKind, "video");
    assert.equal((await queue(firstProject)).id, initial.id);
    assert.equal((await queue(firstProject)).reused, true);
    assert.equal(await used(), 1);
    await finish(initial.id);
    await assert.rejects(
      queue(secondProject, alice, "video", 1),
      /Daily export limit/,
    );
    assert.equal(await used(), 1);
    const raced = await Promise.allSettled([
      queue(secondProject),
      queue(thirdProject),
    ]);
    assert.equal(
      raced.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const denied = raced.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    assert.match(String(denied.reason), /Free export allowance reached/);
    assert.equal(await used(), 2);
    const second = (
      raced.find(
        (result) => result.status === "fulfilled",
      ) as PromiseFulfilledResult<Awaited<ReturnType<typeof queue>>>
    ).value;
    await finish(second.id);
    assert.equal(
      (
        await db.query("select * from public.render_jobs where owner_id=$1", [
          alice,
        ])
      ).rows.length,
      2,
      "quota rejection rolls back the underlying job insert",
    );
    assert.equal(await used(bob), 0);
    const bobsJob = await queue(foreignProject, bob);
    assert.equal(
      await used(bob),
      1,
      "different accounts have independent allowances",
    );
    await finish(bobsJob.id);

    await finish(initial.id, "failed");
    assert.equal(await used(), 1);
    const replacementProject = await project();
    const replacement = await queue(replacementProject);
    await finish(replacement.id);
    await assert.rejects(retry(initial.id), /Free export allowance reached/);
    await assert.rejects(
      db.query("update public.render_jobs set status='rendering' where id=$1", [
        initial.id,
      ]),
      /Free export allowance reached/,
      "direct worker updates cannot bypass the failed-retry reservation",
    );
    await assert.rejects(retry(initial.id, bob), /Cannot retry/);
    await finish(replacement.id, "failed");
    await retry(initial.id);
    assert.equal(await used(), 2);
    await finish(initial.id);
    await assert.rejects(
      db.query("update public.render_jobs set snapshot=$2 where id=$1", [
        initial.id,
        { ...sampleProject, name: "Changed" },
      ]),
      /Immutable export snapshot/,
    );

    await db.query("delete from public.projects where id=$1", [firstProject]);
    assert.equal(
      await used(),
      2,
      "deleting a completed export keeps its durable receipt",
    );
    const receipt = await db.query<{ job_id: string | null }>(
      "select job_id from public.free_export_usage where owner_id=$1 and job_id is null",
      [alice],
    );
    assert.equal(receipt.rows.length, 1);
    await assert.rejects(
      queue(await project()),
      /Free export allowance reached/,
    );

    // A past month's successful exports are retained but do not consume this
    // month's slots; failed retries reserve this month rather than their age.
    await db.query(
      "update public.free_export_usage set period_start=(date_trunc('month',now() at time zone 'UTC')-interval '1 month') at time zone 'UTC' where owner_id=$1",
      [alice],
    );
    assert.equal(await used(), 0);
    await retry(replacement.id);
    assert.equal(await used(), 1);
    await finish(replacement.id);
    const newMonth = await queue(await project());
    await finish(newMonth.id);
    assert.equal(await used(), 2);

    await grant("upgrade");
    const paidProject = await project();
    const paid = await queue(paidProject, alice, "launch-pack");
    assert.equal(
      await used(),
      2,
      "upgrading uses paid access without changing the free ledger",
    );
    const paidRow = await db.query<{
      is_free: boolean;
      access_id: string | null;
    }>("select is_free,access_id from public.render_jobs where id=$1", [
      paid.id,
    ]);
    assert.equal(paidRow.rows[0].is_free, false);
    assert.ok(paidRow.rows[0].access_id);
    await finish(paid.id);
    for (let index = 0; index < 9; index++) {
      const next = await queue(paidProject);
      await finish(next.id);
    }
    await assert.rejects(
      queue(paidProject),
      /Project export allowance reached/,
    );
    // Paid access is still preferred after the free allowance resets.
    await db.query(
      "update public.free_export_usage set period_start=(date_trunc('month',now() at time zone 'UTC')-interval '1 month') at time zone 'UTC' where owner_id=$1",
      [alice],
    );
    await grant("paid-first");
    const paidFirst = await queue(await project());
    assert.equal(await used(), 0);
    assert.equal(
      (
        await db.query<{ is_free: boolean }>(
          "select is_free from public.render_jobs where id=$1",
          [paidFirst.id],
        )
      ).rows[0].is_free,
      false,
    );
    await assert.rejects(
      queue(paidProject),
      /Project export allowance reached/,
      "an exhausted active paid project does not spill into free slots",
    );

    await db.exec(
      `set role authenticated;set "request.jwt.claim.sub"='${alice}'`,
    );
    await assert.rejects(
      db.query("select * from public.free_export_usage"),
      /permission denied/,
    );
    await assert.rejects(queue(foreignProject), /permission denied/);
    await assert.rejects(
      db.query("update public.render_jobs set is_free=false"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.check_free_retry()"),
      /permission denied/,
    );
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
