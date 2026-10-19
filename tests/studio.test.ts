import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  projectSchema,
  sampleProject,
  videoSettings,
  brandKitSchema,
  launchProject,
  sampleAsset,
  SUPPORTED_TEMPLATE_VERSIONS,
  TEMPLATE_VERSION,
} from "../src/shared/project";

test("legacy projects retain their original format while creative settings are validated", () => {
  const legacy = Object.fromEntries(
    Object.entries(sampleProject).filter(
      ([key]) => !["template", "format", "font", "sound", "cta"].includes(key),
    ),
  );
  const parsed = projectSchema.parse(legacy);
  assert.equal(parsed.template, "reveal");
  assert.equal(parsed.format, "vertical");
  assert.equal(parsed.font, "manrope");
  assert.equal(parsed.sound, "off");
  assert.equal(parsed.cta, "See it in action.");
  assert.equal(projectSchema.parse(launchProject).sound, "pulse");
  assert.equal(sampleAsset("sample-launch-after")?.width, 2560);
  assert.equal(sampleAsset("sample-unknown"), null);
  assert.equal(sampleAsset("__proto__"), null);
  for (const version of [
    "reveal-1",
    "studio-2",
    "launch-3",
    "launch-4",
    "launch-5",
    "studio-6",
  ])
    assert.ok(SUPPORTED_TEMPLATE_VERSIONS.has(version));
  assert.deepEqual(videoSettings({ ...parsed, format: "landscape" }), {
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: 450,
  });
  for (const invalid of [
    { format: "4k" },
    { template: "unknown" },
    { font: "remote-font" },
    { sound: "remote-track" },
    { cta: "x".repeat(37) },
    { before: "sample-unknown" },
  ])
    assert.equal(
      projectSchema.safeParse({ ...parsed, ...invalid }).success,
      false,
    );
  assert.equal(
    brandKitSchema.safeParse({
      name: "Studio",
      color: "#ffffff",
      font: "dm-sans",
      logo: null,
      url: "",
    }).success,
    true,
  );
});

test("studio migration isolates brands and manages projects and retained storage safely", async () => {
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
    const alice = "11111111-1111-4111-8111-111111111111",
      bob = "22222222-2222-4222-8222-222222222222";
    const asset = "44444444-4444-4444-8444-444444444444",
      orphan = "55555555-5555-4555-8555-555555555555";
    const logoOnly = "99999999-9999-4999-8999-999999999999",
      snapshotOnly = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await db.query("insert into auth.users values($1),($2)", [alice, bob]);
    for (const id of [asset, orphan, logoOnly, snapshotOnly])
      await db.query(
        "insert into public.assets(id,owner_id,path,width,height,created_at) values($1,$2,$3,100,100,now()-interval '60 days')",
        [id, alice, `${alice}/${id}.webp`],
      );
    const kit = {
      name: "Agency",
      color: "#365ddb",
      font: "dm-sans",
      logo: logoOnly,
      url: "agency.example",
    };
    await db.query(
      "insert into public.brand_kits(owner_id,name,settings,logo_asset) values($1,$2,$3,$4)",
      [alice, kit.name, kit, logoOnly],
    );
    await db.exec(
      `set role authenticated;set "request.jwt.claim.sub"='${bob}'`,
    );
    assert.equal(
      (await db.query("select * from public.brand_kits")).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.brand_kits(owner_id,name,settings) values($1,'Forged',$2)",
          [bob, kit],
        ),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.projects(owner_id,name,settings,before_asset,after_asset) values($1,'Foreign asset',$2,$3,'sample-after')",
          [bob, { ...sampleProject, before: asset }, asset],
        ),
      /Asset unavailable/,
    );
    await assert.rejects(
      () =>
        db.query("select public.manage_project($1,gen_random_uuid(),'trash')", [
          alice,
        ]),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select * from public.storage_deletions"),
      /permission denied/,
    );
    await db.exec(
      `reset role;set role authenticated;set "request.jwt.claim.sub"='${alice}'`,
    );
    // Trigger locks must work for an RLS-authenticated project writer without asset mutation rights.
    const project = (
      await db.query<{ id: string }>(
        "insert into public.projects(owner_id,name,settings,before_asset,after_asset) values($1,$2,$3,$4,'sample-after') returning id",
        [alice, sampleProject.name, { ...sampleProject, before: asset }, asset],
      )
    ).rows[0].id;
    const focusedLaunch = {
      ...launchProject,
      highlight1Crop: { x: 0.1, y: 0.8, zoom: 1.7 },
      highlight2Crop: { x: 1, y: 0.1, zoom: 2 },
    };
    const launch = (
      await db.query<{ id: string }>(
        "insert into public.projects(owner_id,name,settings,before_asset,after_asset) values($1,$2,$3,$4,$5) returning id",
        [
          alice,
          launchProject.name,
          focusedLaunch,
          launchProject.before,
          launchProject.after,
        ],
      )
    ).rows[0].id;
    await assert.rejects(
      () =>
        db.query(
          "insert into public.projects(owner_id,name,settings,before_asset,after_asset) values($1,'Forged sample',$2,'sample-unknown','sample-after')",
          [alice, sampleProject],
        ),
      /Asset unavailable/,
    );
    await db.exec("reset role;set role service_role");
    const launchJob = (
      await db.query<{ result: { id: string } }>(
        "select public.enqueue_render_with_result($1,$2,$3,10) as result",
        [alice, launch, focusedLaunch],
      )
    ).rows[0].result.id;
    const launchRow = (
      await db.query<{
        template_version: string;
        snapshot: typeof launchProject;
      }>(
        "select template_version,snapshot from public.render_jobs where id=$1",
        [launchJob],
      )
    ).rows[0];
    assert.equal(launchRow.template_version, "studio-6");
    assert.equal(launchRow.template_version, TEMPLATE_VERSION);
    assert.equal(launchRow.snapshot.sound, "pulse");
    assert.equal(launchRow.snapshot.cta, launchProject.cta);
    assert.deepEqual(
      launchRow.snapshot.highlight1Crop,
      focusedLaunch.highlight1Crop,
    );
    assert.deepEqual(
      launchRow.snapshot.highlight2Crop,
      focusedLaunch.highlight2Crop,
    );
    const revisedLaunch = {
      ...focusedLaunch,
      highlight1Crop: null,
      highlight2Crop: { x: 0.2, y: 0.9, zoom: 1.1 },
    };
    const reusedLaunch = (
      await db.query<{ result: { id: string; reused: boolean } }>(
        "select public.enqueue_render_with_result($1,$2,$3,10) as result",
        [alice, launch, revisedLaunch],
      )
    ).rows[0].result;
    assert.deepEqual(reusedLaunch, { id: launchJob, reused: true });
    assert.deepEqual(
      (
        await db.query<{ settings: typeof revisedLaunch }>(
          "select settings from public.projects where id=$1",
          [launch],
        )
      ).rows[0].settings,
      revisedLaunch,
      "later framing edits save to the project",
    );
    assert.deepEqual(
      (
        await db.query<{ snapshot: typeof focusedLaunch }>(
          "select snapshot from public.render_jobs where id=$1",
          [launchJob],
        )
      ).rows[0].snapshot,
      focusedLaunch,
      "an active export keeps the feature shots captured when it was queued",
    );
    await assert.rejects(
      () =>
        db.query("update public.render_jobs set snapshot=$1 where id=$2", [
          revisedLaunch,
          launchJob,
        ]),
      /Immutable export snapshot/,
    );
    await assert.rejects(
      () =>
        db.query("select public.manage_project($1,$2,'duplicate')", [
          bob,
          project,
        ]),
      /Not found/,
    );
    const copy = (
      await db.query<{ id: string }>(
        "select public.manage_project($1,$2,'duplicate') as id",
        [alice, project],
      )
    ).rows[0].id;
    assert.notEqual(copy, project);
    const job = (
      await db.query<{ result: { id: string } }>(
        "select public.enqueue_render_with_result($1,$2,$3,10) as result",
        [alice, project, { ...sampleProject, before: asset }],
      )
    ).rows[0].result.id;
    await assert.rejects(
      () =>
        db.query("select public.manage_project($1,$2,'trash')", [
          alice,
          project,
        ]),
      /Active export/,
    );
    await db.query(
      "update public.render_jobs set status='failed' where id=$1",
      [job],
    );
    await db.query("select public.manage_project($1,$2,'trash')", [
      alice,
      project,
    ]);
    await assert.rejects(
      () =>
        db.query("select public.enqueue_render_with_result($1,$2,$3,10)", [
          alice,
          project,
          sampleProject,
        ]),
      /Not found/,
    );
    await db.query("select public.manage_project($1,$2,'restore')", [
      alice,
      project,
    ]);
    assert.equal(
      (
        await db.query<{ deleted_at: null }>(
          "select deleted_at from public.projects where id=$1",
          [project],
        )
      ).rows[0].deleted_at,
      null,
    );
    await db.query("select public.manage_project($1,$2,'trash')", [
      alice,
      project,
    ]);
    await db.query(
      "update public.projects set deleted_at=now()-interval '60 days' where id=$1",
      [project],
    );
    await db.query(
      "insert into public.render_jobs(owner_id,project_id,snapshot,status,output_path,updated_at) values($1,$2,$3,'completed',$4,now()-interval '60 days')",
      [alice, copy, sampleProject, `${alice}/retained/video.mp4`],
    );
    await db.query(
      "insert into public.render_jobs(owner_id,project_id,snapshot,status) values($1,$2,$3,'failed')",
      [alice, copy, { ...sampleProject, before: snapshotOnly }],
    );
    const dry = (
      await db.query<{
        result: {
          applied: boolean;
          projects: number;
          outputs: number;
          assets: number;
        };
      }>(
        "select public.queue_storage_cleanup(now()-interval '30 days',false) as result",
      )
    ).rows[0].result;
    assert.deepEqual(dry, {
      projects: 1,
      outputs: 1,
      assets: 1,
      applied: false,
    });
    assert.equal(
      (await db.query("select * from public.storage_deletions")).rows.length,
      0,
    );
    const applied = (
      await db.query<{
        result: {
          applied: boolean;
          projects: number;
          outputs: number;
          assets: number;
        };
      }>(
        "select public.queue_storage_cleanup(now()-interval '30 days',true) as result",
      )
    ).rows[0].result;
    assert.deepEqual(applied, {
      projects: 1,
      outputs: 1,
      assets: 1,
      applied: true,
    });
    assert.equal(
      (await db.query("select * from public.projects where id=$1", [project]))
        .rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.projects where id=$1", [copy])).rows
        .length,
      1,
    );
    assert.equal(
      (await db.query("select * from public.assets where id=$1", [asset])).rows
        .length,
      1,
    );
    for (const id of [logoOnly, snapshotOnly])
      assert.equal(
        (await db.query("select * from public.assets where id=$1", [id])).rows
          .length,
        1,
      );
    assert.equal(
      (await db.query("select * from public.assets where id=$1", [orphan])).rows
        .length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.storage_deletions")).rows.length,
      2,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from public.render_jobs where output_expired_at is not null and output_path is null",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
