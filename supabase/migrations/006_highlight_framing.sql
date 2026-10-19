begin;
-- New workers understand independent highlight framing. Older workers reject
-- this version instead of silently ignoring the selected feature shots.
-- Existing queued jobs and immutable snapshots keep their original version.
alter table public.render_jobs alter column template_version set default 'launch-5';
commit;
