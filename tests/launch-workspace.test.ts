import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { launchProject } from "../src/shared/project";
import { starterStory } from "../src/shared/launch-kit";

test("launch workspace isolates assets and recipes, snapshots packages, meters renders and fences review access", async () => {
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
    for (const file of [
      "001_demopop.sql",
      "002_export_reuse_result.sql",
      "003_studio_workflows.sql",
      "004_launch_films.sql",
      "005_launch_quality.sql",
      "006_highlight_framing.sql",
      "007_launch_workspace.sql",
    ])
      await db.exec(
        (await readFile(`supabase/migrations/${file}`, "utf8")).replace(
          "create extension if not exists pgcrypto;",
          "",
        ),
      );
    const alice = randomUUID(),
      bob = randomUUID(),
      screen = randomUUID(),
      clip = randomUUID(),
      recipeOnly = randomUUID(),
      orphan = randomUUID();
    await db.query("insert into auth.users values($1),($2)", [alice, bob]);
    for (const id of [screen, recipeOnly, orphan])
      await db.query(
        "insert into public.assets(id,owner_id,path,width,height,created_at) values($1,$2,$3,1440,1000,now()-interval '60 days')",
        [id, alice, `${alice}/${id}.webp`],
      );
    await db.query(
      "insert into public.assets(id,owner_id,path,width,height,kind,duration,created_at) values($1,$2,$3,1280,720,'video',2,now()-interval '60 days')",
      [clip, alice, `${alice}/${clip}.mp4`],
    );
    const story = starterStory(launchProject, [
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ]);
    story.scenes[0].asset = screen;
    story.scenes[1].asset = clip;
    const project = { ...launchProject, client: "Acme", story };
    await db.exec(
      `set role authenticated;set "request.jwt.claim.sub"='${bob}'`,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.projects(owner_id,name,settings,before_asset,after_asset) values($1,'Foreign story',$2,$3,$4)",
          [bob, project, project.before, project.after],
        ),
      /Asset unavailable/,
    );
    await db.exec(
      `reset role;set role authenticated;set "request.jwt.claim.sub"='${alice}'`,
    );
    const pid = (
      await db.query<{ id: string }>(
        "insert into public.projects(owner_id,name,settings,before_asset,after_asset) values($1,$2,$3,$4,$5) returning id",
        [alice, project.name, project, project.before, project.after],
      )
    ).rows[0].id;
    await assert.rejects(
      () =>
        db.query(
          "insert into public.launch_recipes(owner_id,name,settings) values($1,'Forged',$2)",
          [alice, project],
        ),
      /permission denied/,
    );
    await db.exec("reset role;set role service_role");
    const recipeProject = {
      ...project,
      story: {
        ...story,
        scenes: story.scenes.map((scene, index) =>
          index === 0 ? { ...scene, asset: recipeOnly } : scene,
        ),
      },
    };
    const rid = (
      await db.query<{ id: string }>(
        "insert into public.launch_recipes(owner_id,name,settings) values($1,'Client launch',$2) returning id",
        [alice, recipeProject],
      )
    ).rows[0].id;
    const result = (
      await db.query<{
        result: { id: string; reused: boolean; outputKind: string };
      }>(
        "select public.enqueue_output_with_result($1,$2,$3,10,'launch-pack') as result",
        [alice, pid, project],
      )
    ).rows[0].result;
    assert.equal(result.outputKind, "launch-pack");
    assert.equal(result.reused, false);
    const revised = {
      ...project,
      story: {
        ...story,
        scenes: story.scenes.map((scene) => ({
          ...scene,
          caption: "Later caption",
        })),
      },
    };
    const reused = (
      await db.query<{
        result: { id: string; reused: boolean; outputKind: string };
      }>(
        "select public.enqueue_output_with_result($1,$2,$3,10,'video') as result",
        [alice, pid, revised],
      )
    ).rows[0].result;
    assert.deepEqual(reused, {
      id: result.id,
      reused: true,
      outputKind: "launch-pack",
    });
    const snapshot = (
      await db.query<{ snapshot: typeof project; template_version: string }>(
        "select snapshot,template_version from public.render_jobs where id=$1",
        [result.id],
      )
    ).rows[0];
    assert.deepEqual(snapshot.snapshot, project);
    assert.equal(snapshot.template_version, "studio-6");
    const retryProject = (
      await db.query<{ id: string }>(
        "insert into public.projects(owner_id,name,settings,before_asset,after_asset) values($1,'Retry fixture',$2,$3,$4) returning id",
        [bob, launchProject, launchProject.before, launchProject.after],
      )
    ).rows[0].id;
    const retryJob = (
      await db.query<{ result: { id: string } }>(
        "select public.enqueue_output_with_result($1,$2,$3,10,'launch-pack') as result",
        [bob, retryProject, launchProject],
      )
    ).rows[0].result.id;
    await db.query(
      "update public.render_jobs set status='failed' where id=$1",
      [retryJob],
    );
    await db.query("select public.retry_render($1,$2,10)", [bob, retryJob]);
    await db.query(
      "update public.render_jobs set status='failed' where id=$1",
      [retryJob],
    );
    await assert.rejects(
      () => db.query("select public.retry_render($1,$2,10)", [bob, retryJob]),
      /Daily retry limit/,
    );
    await assert.rejects(
      () =>
        db.query(
          "update public.render_jobs set output_kind='video' where id=$1",
          [result.id],
        ),
      /Immutable/,
    );
    const another = (
      await db.query<{ id: string }>(
        "insert into public.projects(owner_id,name,settings,before_asset,after_asset) values($1,'Another',$2,$3,$4) returning id",
        [alice, project, project.before, project.after],
      )
    ).rows[0].id;
    await assert.rejects(
      () =>
        db.query(
          "select public.enqueue_output_with_result($1,$2,$3,10,'launch-pack')",
          [alice, another, project],
        ),
      /Daily export/,
    );
    await db.query(
      "select public.enqueue_output_with_result($1,$2,$3,10,'video')",
      [alice, another, project],
    );
    await db.query(
      "update public.render_jobs set status='completed',output_path=$1,preview_path=$2,progress=1 where id=$3",
      [
        `${alice}/${result.id}/pack.zip`,
        `${alice}/${result.id}/preview.mp4`,
        result.id,
      ],
    );
    const oldJob = (
      await db.query<{ id: string }>(
        "insert into public.render_jobs(owner_id,project_id,snapshot,status,output_path,preview_path,output_kind,updated_at) values($1,$2,$3,'completed',$4,$5,'launch-pack',now()-interval '60 days') returning id",
        [
          alice,
          pid,
          project,
          `${alice}/old/package.zip`,
          `${alice}/old/preview.mp4`,
        ],
      )
    ).rows[0].id;
    const token = "1".repeat(64),
      hash = createHash("sha256").update(token).digest("hex");
    const review = (
      await db.query<{ id: string }>(
        "insert into public.review_links(owner_id,job_id,token,token_hash,agency_name,allow_download) values($1,$2,$3,$4,'Acme Studio',true) returning id",
        [alice, oldJob, token, hash],
      )
    ).rows[0].id;
    await assert.rejects(
      () =>
        db.query(
          "insert into public.review_links(owner_id,job_id,token,token_hash,agency_name) values($1,$2,$3,$4,'Foreign')",
          [bob, oldJob, "2".repeat(64), "3".repeat(64)],
        ),
      /Export unavailable/,
    );
    await db.query(
      "select public.submit_review_feedback($1,'Client','Tighten this scene',12.5,false)",
      [hash],
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.review_links where id=$1",
          [review],
        )
      ).rows[0].status,
      "changes_requested",
    );
    await db.query(
      "select public.submit_review_feedback($1,'Client','',12.5,true)",
      [hash],
    );
    assert.deepEqual(
      (
        await db.query(
          "select status,approved_by from public.review_links where id=$1",
          [review],
        )
      ).rows[0],
      { status: "approved", approved_by: "Client" },
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.submit_review_feedback($1,'Client','Past the end',31,false)",
          [hash],
        ),
      /Invalid feedback/,
    );
    await db.exec(
      `reset role;set role authenticated;set "request.jwt.claim.sub"='${bob}'`,
    );
    for (const table of ["launch_recipes", "review_links", "review_comments"])
      assert.equal(
        (await db.query(`select * from public.${table}`)).rows.length,
        0,
      );
    await assert.rejects(
      () =>
        db.query(
          "select public.submit_review_feedback($1,'Client','Hijack',1,false)",
          [hash],
        ),
      /permission denied/,
    );
    await db.exec(
      `reset role;set role authenticated;set "request.jwt.claim.sub"='${alice}'`,
    );
    assert.equal(
      (await db.query("select * from public.launch_recipes")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from public.review_comments")).rows.length,
      1,
    );
    await db.exec("reset role;set role service_role");
    const plan = async () =>
      (
        await db.query<{ result: { assets: number; outputs: number } }>(
          "select public.queue_storage_cleanup(now()-interval '30 days',false) as result",
        )
      ).rows[0].result;
    assert.equal(
      (await plan()).assets,
      1,
      "story, clip and recipe-only assets stay protected",
    );
    assert.equal(
      (await plan()).outputs,
      0,
      "active review access protects the old ZIP and preview",
    );
    await db.query(
      "update public.review_links set revoked_at=now() where id=$1",
      [review],
    );
    await assert.rejects(
      () =>
        db.query(
          "select public.submit_review_feedback($1,'Client','Revoked',1,false)",
          [hash],
        ),
      /Review unavailable/,
    );
    assert.equal((await plan()).outputs, 1);
    await db.query("delete from public.launch_recipes where id=$1", [rid]);
    assert.equal((await plan()).assets, 2);
    await db.query(
      "select public.queue_storage_cleanup(now()-interval '30 days',true)",
    );
    const pending = (
      await db.query<{ path: string }>(
        "select path from public.storage_deletions where bucket='exports'",
      )
    ).rows
      .map((row) => row.path)
      .sort();
    assert.deepEqual(
      pending,
      [`${alice}/old/package.zip`, `${alice}/old/preview.mp4`].sort(),
    );
    assert.equal(
      (await db.query("select * from public.assets where id=$1", [screen])).rows
        .length,
      1,
    );
    assert.equal(
      (await db.query("select * from public.assets where id=$1", [clip])).rows
        .length,
      1,
    );
  } finally {
    await db.close();
  }
});
