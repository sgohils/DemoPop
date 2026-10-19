begin;
alter table public.assets add column kind text not null default 'image' check(kind in ('image','video'));
alter table public.assets add column duration real check(duration > 0 and duration <= 30);
alter table public.assets add constraint asset_media_details check((kind='image' and duration is null) or (kind='video' and duration is not null));
update storage.buckets set allowed_mime_types=array['image/webp','video/mp4'] where id='inputs';
update storage.buckets set allowed_mime_types=array['video/mp4','application/zip'] where id='exports';
alter table public.render_jobs add column output_kind text not null default 'video' check(output_kind in ('video','launch-pack'));
alter table public.render_jobs add column preview_path text check(preview_path like owner_id::text||'/%');
alter table public.render_jobs alter column template_version set default 'studio-6';

create table public.launch_recipes (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
 name text not null check(length(name) between 1 and 60), settings jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index launch_recipe_owner on public.launch_recipes(owner_id);
create trigger touch_launch_recipe before update on public.launch_recipes for each row execute function public.touch_updated();
alter table public.launch_recipes enable row level security;
revoke all on public.launch_recipes from anon,authenticated;
grant select on public.launch_recipes to authenticated;
grant all on public.launch_recipes to service_role;
create policy launch_recipe_owner_read on public.launch_recipes for select to authenticated using(owner_id=(select auth.uid()));

create table public.review_links (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
 job_id uuid not null references public.render_jobs on delete cascade,
 token text not null unique check(token ~ '^[a-f0-9]{64}$'),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 agency_name text not null check(length(agency_name) between 1 and 60), allow_download boolean not null default false,
 status text not null default 'pending' check(status in ('pending','changes_requested','approved')),
 approved_by text check(length(approved_by) between 1 and 80), approved_at timestamptz,
 expires_at timestamptz not null default now()+interval '14 days', revoked_at timestamptz,
 created_at timestamptz not null default now(), check(expires_at<=created_at+interval '90 days')
);
create index review_owner on public.review_links(owner_id,job_id);
create table public.review_comments (
 id uuid primary key default gen_random_uuid(), review_id uuid not null references public.review_links on delete cascade,
 author text not null check(length(author) between 1 and 80), body text not null check(length(body) between 1 and 2000),
 seconds real not null check(seconds>=0 and seconds<=60), created_at timestamptz not null default now()
);
create index review_comment_parent on public.review_comments(review_id,created_at);
alter table public.review_links enable row level security;
alter table public.review_comments enable row level security;
revoke all on public.review_links,public.review_comments from anon,authenticated;
grant select on public.review_links,public.review_comments to authenticated;
grant all on public.review_links,public.review_comments to service_role;
create policy review_owner_read on public.review_links for select to authenticated using(owner_id=(select auth.uid()));
create policy review_comment_owner_read on public.review_comments for select to authenticated using(exists(select 1 from public.review_links r where r.id=review_id and r.owner_id=(select auth.uid())));
create function public.check_review_job() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.render_jobs where id=new.job_id and owner_id=new.owner_id and status='completed' and output_path is not null;
 if not found then raise exception 'Export unavailable';end if;
 return new;
end$$;
create trigger review_job before insert on public.review_links for each row execute function public.check_review_job();

create function public.submit_review_feedback(p_hash text,p_author text,p_body text,p_seconds real,p_approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r public.review_links; j public.render_jobs; duration integer;
begin
 select * into r from public.review_links where token_hash=p_hash and revoked_at is null and expires_at>now() for update;
 if not found then raise exception 'Review unavailable';end if;
 select * into j from public.render_jobs where id=r.job_id and status='completed' and output_path is not null;
 if not found then raise exception 'Review unavailable';end if;
 duration=coalesce((j.snapshot->'story'->>'duration')::integer,15);
 if length(trim(p_author)) not between 1 and 80 or p_seconds<0 or p_seconds>duration or p_seconds='NaN'::real then raise exception 'Invalid feedback';end if;
 if not public.consume_request_limit(r.owner_id,'review-feedback:'||r.id::text,30,3600) then raise exception 'Too many requests';end if;
 if p_approve then
  update public.review_links set status='approved',approved_by=trim(p_author),approved_at=now() where id=r.id;
 else
  if p_body is null or length(trim(p_body)) not between 1 and 2000 then raise exception 'Invalid feedback';end if;
  insert into public.review_comments(review_id,author,body,seconds) values(r.id,trim(p_author),trim(p_body),p_seconds);
  update public.review_links set status='changes_requested',approved_by=null,approved_at=null where id=r.id;
 end if;
end$$;
revoke all on function public.submit_review_feedback(text,text,text,real,boolean) from public,anon,authenticated;
grant execute on function public.submit_review_feedback(text,text,text,real,boolean) to service_role;

create function public.project_asset_ids(p_settings jsonb) returns setof text
language sql immutable set search_path='' as $$
 select distinct a from (
  select jsonb_array_elements_text(jsonb_build_array(p_settings->>'before',p_settings->>'after',p_settings->>'logo')) as a
  union all select value->>'asset' from jsonb_array_elements(coalesce(p_settings->'story'->'scenes','[]'::jsonb))
 ) refs where a is not null
$$;
revoke all on function public.project_asset_ids(jsonb) from public,anon,authenticated;
grant execute on function public.project_asset_ids(jsonb) to service_role;

create or replace function public.check_asset_references() returns trigger language plpgsql security definer set search_path='' as $$
declare a text; refs text[];
begin
 if tg_table_name='brand_kits' then refs=array[new.logo_asset];
 elsif tg_table_name='render_jobs' then select array_agg(id) into refs from public.project_asset_ids(new.snapshot) id;
 else
  if tg_table_name='projects' then
   if new.before_asset is distinct from new.settings->>'before' or new.after_asset is distinct from new.settings->>'after' or new.logo_asset is distinct from new.settings->>'logo' then raise exception 'Asset unavailable';end if;
  end if;
  select array_agg(id) into refs from public.project_asset_ids(new.settings) id;
 end if;
 for a in select distinct unnest(refs) order by 1 loop
  if a is null or public.is_sample_asset(a) then continue;end if;
  perform 1 from public.assets where id::text=a and owner_id=new.owner_id for key share;
  if not found then raise exception 'Asset unavailable';end if;
 end loop;
 return new;
end$$;
drop trigger project_assets on public.projects;
create trigger project_assets before insert or update of settings,before_asset,after_asset,logo_asset,owner_id on public.projects for each row execute function public.check_asset_references();
create trigger recipe_assets before insert or update of settings,owner_id on public.launch_recipes for each row execute function public.check_asset_references();
create trigger render_assets before insert on public.render_jobs for each row execute function public.check_asset_references();

create or replace function public.immutable_render_snapshot() returns trigger language plpgsql set search_path='' as $$begin
 if new.snapshot is distinct from old.snapshot or new.owner_id<>old.owner_id or new.project_id<>old.project_id or new.template_version<>old.template_version or new.output_kind<>old.output_kind then raise exception 'Immutable export snapshot';end if;return new;
end$$;

create function public.enqueue_output_with_result(p_owner uuid,p_project uuid,p_settings jsonb,p_daily_cap integer,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.render_jobs; cost integer; used integer; a text;
begin
 if p_kind not in ('video','launch-pack') then raise exception 'Invalid output kind';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 perform 1 from public.projects where id=p_project and owner_id=p_owner and deleted_at is null for update;
 if not found then raise exception 'Not found';end if;
 for a in select * from public.project_asset_ids(p_settings) loop
  if not public.is_sample_asset(a) then
   perform 1 from public.assets where id::text=a and owner_id=p_owner for key share;
   if not found then raise exception 'Asset unavailable';end if;
  end if;
 end loop;
 update public.projects set settings=p_settings,name=p_settings->>'name',before_asset=p_settings->>'before',after_asset=p_settings->>'after',logo_asset=p_settings->>'logo' where id=p_project;
 select * into j from public.render_jobs where project_id=p_project and status in ('queued','rendering');
 if found then return jsonb_build_object('id',j.id,'reused',true,'outputKind',j.output_kind);end if;
 cost=case when p_kind='launch-pack' then 9 else 1 end;
 select coalesce(sum(case when output_kind='launch-pack' then 9 else 1 end),0) into used from public.render_jobs where owner_id=p_owner and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if used+cost>greatest(1,p_daily_cap) then raise exception 'Daily export limit';end if;
 insert into public.render_jobs(owner_id,project_id,snapshot,output_kind) values(p_owner,p_project,p_settings,p_kind) returning * into j;
 return jsonb_build_object('id',j.id,'reused',false,'outputKind',j.output_kind);
end$$;
revoke all on function public.enqueue_output_with_result(uuid,uuid,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.enqueue_output_with_result(uuid,uuid,jsonb,integer,text) to service_role;
create function public.consume_request_units(p_owner uuid,p_key text,p_amount integer,p_max integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_amount<1 or p_amount>9 then raise exception 'Invalid amount';end if;
 insert into public.request_limits as l values(p_owner,p_key,now(),p_amount)
 on conflict(owner_id,key) do update set count=case when l.window_start<now()-make_interval(secs=>p_seconds) then p_amount else l.count+p_amount end,
 window_start=case when l.window_start<now()-make_interval(secs=>p_seconds) then now() else l.window_start end returning count into n;
 return n<=greatest(1,p_max);
end$$;
revoke all on function public.consume_request_units(uuid,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_request_units(uuid,text,integer,integer,integer) to service_role;
create or replace function public.retry_render(p_owner uuid,p_job uuid,p_daily_cap integer) returns uuid language plpgsql security definer set search_path='' as $$
declare j public.render_jobs; pid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select project_id into pid from public.render_jobs where id=p_job and owner_id=p_owner;
 perform 1 from public.projects where id=pid and owner_id=p_owner and deleted_at is null for update;
 if not found then raise exception 'Cannot retry';end if;
 select * into j from public.render_jobs where id=p_job and owner_id=p_owner for update;
 if not found or j.status<>'failed' or j.attempt_count>=3 then raise exception 'Cannot retry';end if;
 if exists(select 1 from public.render_jobs where project_id=j.project_id and status in ('queued','rendering')) then raise exception 'Already active';end if;
 if not public.consume_request_units(p_owner,'daily-retries',case when j.output_kind='launch-pack' then 9 else 1 end,p_daily_cap,86400) then raise exception 'Daily retry limit';end if;
 update public.render_jobs set status='queued',progress=0,error=null,lease_token=null,lease_until=null where id=p_job;
 return p_job;
end$$;
create or replace function public.enqueue_render_with_result(p_owner uuid,p_project uuid,p_settings jsonb,p_daily_cap integer)
returns jsonb language sql security definer set search_path='' as $$
 select public.enqueue_output_with_result(p_owner,p_project,p_settings,p_daily_cap,'video')-'outputKind'
$$;

create or replace function public.queue_storage_cleanup(p_before timestamptz,p_apply boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects; j public.render_jobs; a public.assets;
 project_count integer=0; output_count integer=0; asset_count integer=0;
begin
 if p_before>now()-interval '1 day' then raise exception 'Retention must be at least one day';end if;
 perform pg_advisory_xact_lock(hashtextextended('demopop-storage-cleanup',0));
 for p in select * from public.projects where deleted_at<p_before order by id for update skip locked loop
  if exists(select 1 from public.render_jobs where project_id=p.id and status in ('queued','rendering')) then continue;end if;
  project_count=project_count+1;
  if p_apply then
   insert into public.storage_deletions(owner_id,bucket,path) select owner_id,'exports',output_path from public.render_jobs where project_id=p.id and output_path is not null on conflict do nothing;
   insert into public.storage_deletions(owner_id,bucket,path) select owner_id,'exports',preview_path from public.render_jobs where project_id=p.id and preview_path is not null on conflict do nothing;
   delete from public.projects where id=p.id;
  end if;
 end loop;
 for j in select * from public.render_jobs r where r.status='completed' and r.output_path is not null and r.updated_at<p_before
  and not exists(select 1 from public.review_links l where l.job_id=r.id and l.revoked_at is null and l.expires_at>now()) order by r.id for update skip locked loop
  output_count=output_count+1;
  if p_apply then
   insert into public.storage_deletions(owner_id,bucket,path) values(j.owner_id,'exports',j.output_path) on conflict do nothing;
   if j.preview_path is not null then insert into public.storage_deletions(owner_id,bucket,path) values(j.owner_id,'exports',j.preview_path) on conflict do nothing;end if;
   update public.render_jobs set output_path=null,preview_path=null,output_expired_at=now() where id=j.id;
  end if;
 end loop;
 for a in select * from public.assets x where x.created_at<p_before
  and not exists(select 1 from public.projects refs where x.id::text in (select public.project_asset_ids(refs.settings)))
  and not exists(select 1 from public.brand_kits b where b.logo_asset=x.id::text)
  and not exists(select 1 from public.launch_recipes l where x.id::text in (select public.project_asset_ids(l.settings)))
  and not exists(select 1 from public.render_jobs r where x.id::text in (select public.project_asset_ids(r.snapshot)))
  order by x.id for update skip locked loop
  if exists(select 1 from public.projects refs where a.id::text in (select public.project_asset_ids(refs.settings)))
   or exists(select 1 from public.brand_kits b where b.logo_asset=a.id::text)
   or exists(select 1 from public.launch_recipes l where a.id::text in (select public.project_asset_ids(l.settings)))
   or exists(select 1 from public.render_jobs r where a.id::text in (select public.project_asset_ids(r.snapshot))) then continue;end if;
  asset_count=asset_count+1;
  if p_apply then
   insert into public.storage_deletions(owner_id,bucket,path) values(a.owner_id,'inputs',a.path) on conflict do nothing;
   delete from public.assets where id=a.id;
  end if;
 end loop;
 return jsonb_build_object('projects',project_count,'outputs',output_count,'assets',asset_count,'applied',p_apply);
end$$;
commit;
