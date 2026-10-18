begin;
-- Identify exports produced by the revised camera, typography and score.
-- Existing queued jobs and immutable export snapshots keep their version.
alter table public.render_jobs alter column template_version set default 'launch-4';
commit;
