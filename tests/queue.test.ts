import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { sampleProject } from "../src/shared/project";
test("real migration enforces queue deduplication, RLS, immutable snapshots, leases and bounded retries", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,service_role;
   create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   create function storage.foldername(name text) returns text[] language sql as $$select string_to_array(name,'/')$$;
   grant usage on schema storage to authenticated; grant select on storage.objects to authenticated;`);
    const migration = (
      await readFile("supabase/migrations/001_demopop.sql", "utf8")
    ).replace("create extension if not exists pgcrypto;", "");
    await db.exec(migration);
    await db.exec(
      await readFile("supabase/migrations/002_export_reuse_result.sql", "utf8"),
    );
    const alice = "11111111-1111-4111-8111-111111111111",
      bob = "22222222-2222-4222-8222-222222222222",
      project = "33333333-3333-4333-8333-333333333333";
    await db.query("insert into auth.users values ($1),($2)", [alice, bob]);
    await db.query(
      "insert into public.projects(id,owner_id,name,settings,before_asset,after_asset) values($1,$2,$3,$4,$5,$6)",
      [
        project,
        alice,
        sampleProject.name,
        sampleProject,
        "sample-before",
        "sample-after",
      ],
    );
    await db.exec(
      `set role authenticated; set "request.jwt.claim.sub"='${bob}'`,
    );
    assert.equal(
      (await db.query("select * from public.projects")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query("update public.projects set name=$1 returning id", [
          "hijacked",
        ])
      ).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.render_jobs(owner_id,project_id,snapshot) values($1,$2,$3)",
          [bob, project, sampleProject],
        ),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query("select public.enqueue_render($1,$2,$3,10)", [
          bob,
          project,
          sampleProject,
        ]),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query("select public.enqueue_render_with_result($1,$2,$3,10)", [
          bob,
          project,
          sampleProject,
        ]),
      /permission denied/,
    );
    await db.exec("reset role; set role service_role");
    await assert.rejects(
      () =>
        db.query("select public.enqueue_render($1,$2,$3,10)", [
          bob,
          project,
          sampleProject,
        ]),
      /Not found/,
    );
    const enqueue = () =>
      db.query<{ result: { id: string; reused: boolean } }>(
        "select public.enqueue_render_with_result($1,$2,$3,10) as result",
        [alice, project, sampleProject],
      );
    const [first, second] = await Promise.all([enqueue(), enqueue()]);
    assert.equal(first.rows[0].result.id, second.rows[0].result.id);
    assert.deepEqual(
      [first.rows[0].result.reused, second.rows[0].result.reused].sort(),
      [false, true],
    );
    const jobId = first.rows[0].result.id;
    const changed = { ...sampleProject, opening: "Changed after starting" };
    const reused = await db.query<{
      result: { id: string; reused: boolean };
    }>("select public.enqueue_render_with_result($1,$2,$3,10) as result", [
      alice,
      project,
      changed,
    ]);
    assert.deepEqual(reused.rows[0].result, { id: jobId, reused: true });
    const compatible = await db.query<{ id: string }>(
      "select public.enqueue_render($1,$2,$3,10) as id",
      [alice, project, changed],
    );
    assert.equal(compatible.rows[0].id, jobId);
    assert.equal(
      (
        await db.query<{ settings: typeof sampleProject }>(
          "select settings from public.projects where id=$1",
          [project],
        )
      ).rows[0].settings.opening,
      changed.opening,
      "later edits stay saved without replacing the running snapshot",
    );
    assert.equal(
      (
        await db.query<{ snapshot: typeof sampleProject }>(
          "select snapshot from public.render_jobs where id=$1",
          [jobId],
        )
      ).rows[0].snapshot.opening,
      sampleProject.opening,
    );
    await assert.rejects(
      () =>
        db.query("update public.render_jobs set snapshot=$1 where id=$2", [
          changed,
          jobId,
        ]),
      /Immutable/,
    );
    const claim = await db.query<{
      id: string;
      lease_token: string;
      attempt_count: number;
    }>("select * from public.claim_render()");
    assert.equal(claim.rows[0].id, jobId);
    assert.equal(claim.rows[0].attempt_count, 1);
    const renderingReuse = await db.query<{
      result: { id: string; reused: boolean };
    }>("select public.enqueue_render_with_result($1,$2,$3,10) as result", [
      alice,
      project,
      changed,
    ]);
    assert.deepEqual(renderingReuse.rows[0].result, {
      id: jobId,
      reused: true,
    });
    assert.equal(
      (await db.query("select * from public.claim_render()")).rows.length,
      0,
    );
    const token = claim.rows[0].lease_token;
    await db.query(
      "update public.render_jobs set lease_until=now()-interval '1 minute' where id=$1",
      [jobId],
    );
    const reclaim = await db.query<{
      lease_token: string;
      attempt_count: number;
    }>("select * from public.claim_render()");
    assert.equal(reclaim.rows[0].attempt_count, 2);
    assert.notEqual(reclaim.rows[0].lease_token, token);
    assert.equal(
      (
        await db.query(
          "update public.render_jobs set progress=.9 where id=$1 and lease_token=$2 returning id",
          [jobId, token],
        )
      ).rows.length,
      0,
    );
    await db.query(
      "update public.render_jobs set status='failed' where id=$1",
      [jobId],
    );
    await assert.rejects(
      () => db.query("select public.retry_render($1,$2,10)", [bob, jobId]),
      /Cannot retry/,
    );
    await db.query("select public.retry_render($1,$2,10)", [alice, jobId]);
    assert.equal(
      (
        await db.query<{ attempt_count: number }>(
          "select * from public.claim_render()",
        )
      ).rows[0].attempt_count,
      3,
    );
    await db.query(
      "update public.render_jobs set lease_until=now()-interval '1 minute' where id=$1",
      [jobId],
    );
    assert.equal(
      (await db.query("select * from public.claim_render()")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.render_jobs where id=$1",
          [jobId],
        )
      ).rows[0].status,
      "failed",
    );
    await assert.rejects(
      () => db.query("select public.retry_render($1,$2,10)", [alice, jobId]),
      /Cannot retry/,
    );
    const fresh = await db.query<{ result: { id: string; reused: boolean } }>(
      "select public.enqueue_render_with_result($1,$2,$3,10) as result",
      [alice, project, changed],
    );
    assert.equal(fresh.rows[0].result.reused, false);
    assert.notEqual(fresh.rows[0].result.id, jobId);
    assert.equal(
      (
        await db.query<{ snapshot: typeof sampleProject }>(
          "select snapshot from public.render_jobs where id=$1",
          [fresh.rows[0].result.id],
        )
      ).rows[0].snapshot.opening,
      changed.opening,
    );
    await db.query(
      "update public.render_jobs set status='completed' where id=$1",
      [fresh.rows[0].result.id],
    );
    await assert.rejects(
      () =>
        db.query("select public.enqueue_render($1,$2,$3,1)", [
          alice,
          project,
          sampleProject,
        ]),
      /Daily/,
    );
    await db.exec(
      `reset role; set role authenticated; set "request.jwt.claim.sub"='${bob}'`,
    );
    assert.equal(
      (await db.query("select * from public.render_jobs")).rows.length,
      0,
    );
    await db.exec(`set "request.jwt.claim.sub"='${alice}'`);
    assert.equal(
      (await db.query("select * from public.render_jobs")).rows.length,
      2,
    );
  } finally {
    await db.close();
  }
});
