begin;
create extension if not exists pgcrypto;
create table public.assets (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
 path text not null unique, width integer not null check(width>0), height integer not null check(height>0), created_at timestamptz not null default now(),
 check(path like owner_id::text || '/%')
);
create table public.projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
 name text not null check(length(name) between 1 and 60), settings jsonb not null,
 before_asset text not null, after_asset text not null, logo_asset text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.render_jobs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
 project_id uuid not null references public.projects on delete cascade,
 snapshot jsonb not null, template_version text not null default 'reveal-1',
 status text not null default 'queued' check(status in ('queued','rendering','completed','failed')),
 progress real not null default 0 check(progress between 0 and 1), attempt_count integer not null default 0 check(attempt_count between 0 and 3),
 lease_token uuid, lease_until timestamptz, output_path text, error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index one_active_render_per_project on public.render_jobs(project_id) where status in ('queued','rendering');
create index job_claim on public.render_jobs(status,created_at);
create index project_owner on public.projects(owner_id);
create index job_owner on public.render_jobs(owner_id,created_at);
create table public.request_limits(owner_id uuid not null references auth.users on delete cascade, key text not null, window_start timestamptz not null, count integer not null, primary key(owner_id,key));
create function public.touch_updated() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
create trigger touch_project before update on public.projects for each row execute function public.touch_updated();
create trigger touch_job before update on public.render_jobs for each row execute function public.touch_updated();
create function public.immutable_render_snapshot() returns trigger language plpgsql set search_path='' as $$begin
 if new.snapshot is distinct from old.snapshot or new.owner_id<>old.owner_id or new.project_id<>old.project_id or new.template_version<>old.template_version then raise exception 'Immutable export snapshot';end if;return new;end$$;
create trigger immutable_snapshot before update on public.render_jobs for each row execute function public.immutable_render_snapshot();
alter table public.assets enable row level security;
alter table public.projects enable row level security;
alter table public.render_jobs enable row level security;
alter table public.request_limits enable row level security;
create policy assets_owner_read on public.assets for select to authenticated using(owner_id=(select auth.uid()));
create policy projects_owner_read on public.projects for select to authenticated using(owner_id=(select auth.uid()));
create policy projects_owner_insert on public.projects for insert to authenticated with check(owner_id=(select auth.uid()));
create policy projects_owner_update on public.projects for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy jobs_owner_read on public.render_jobs for select to authenticated using(owner_id=(select auth.uid()));
-- Job/asset mutations are intentionally available only to verified server operations.
revoke all on public.assets,public.projects,public.render_jobs,public.request_limits from anon;
revoke all on public.assets,public.render_jobs,public.request_limits from authenticated;
grant select on public.assets,public.render_jobs to authenticated;
grant select,insert,update on public.projects to authenticated;
grant all on public.assets,public.projects,public.render_jobs,public.request_limits to service_role;

create function public.consume_request_limit(p_owner uuid,p_key text,p_max integer,p_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.request_limits as l values(p_owner,p_key,now(),1)
 on conflict(owner_id,key) do update set count=case when l.window_start < now()-make_interval(secs=>p_seconds) then 1 else l.count+1 end,
 window_start=case when l.window_start < now()-make_interval(secs=>p_seconds) then now() else l.window_start end returning count into n;
 return n<=p_max;
end$$;
create function public.enqueue_render(p_owner uuid,p_project uuid,p_settings jsonb,p_daily_cap integer) returns uuid language plpgsql security definer set search_path='' as $$
declare job_id uuid; a text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 perform 1 from public.projects where id=p_project and owner_id=p_owner for update;
 if not found then raise exception 'Not found';end if;
 for a in select jsonb_array_elements_text(jsonb_build_array(p_settings->>'before',p_settings->>'after',p_settings->>'logo')) loop
  if a is not null and a not in ('sample-before','sample-after') and not exists(select 1 from public.assets where id::text=a and owner_id=p_owner) then raise exception 'Asset unavailable';end if;
 end loop;
 update public.projects set settings=p_settings,name=p_settings->>'name',before_asset=p_settings->>'before',after_asset=p_settings->>'after',logo_asset=p_settings->>'logo' where id=p_project;
 select id into job_id from public.render_jobs where project_id=p_project and status in ('queued','rendering');
 if job_id is not null then return job_id;end if;
 if (select count(*) from public.render_jobs where owner_id=p_owner and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=greatest(1,p_daily_cap) then raise exception 'Daily export limit';end if;
 insert into public.render_jobs(owner_id,project_id,snapshot) values(p_owner,p_project,p_settings) returning id into job_id;
 return job_id;
end$$;
create function public.claim_render() returns setof public.render_jobs language plpgsql security definer set search_path='' as $$
declare j uuid;
begin
 update public.render_jobs set status='failed',error='The worker stopped repeatedly. Create a new export.',lease_token=null,lease_until=null where status='rendering' and lease_until<now() and attempt_count>=3;
 select id into j from public.render_jobs where (status='queued' or (status='rendering' and lease_until<now())) and attempt_count<3 order by created_at for update skip locked limit 1;
 if j is null then return;end if;
 return query update public.render_jobs set status='rendering',progress=0,error=null,attempt_count=attempt_count+1,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds' where id=j returning *;
end$$;
create function public.retry_render(p_owner uuid,p_job uuid,p_daily_cap integer) returns uuid language plpgsql security definer set search_path='' as $$
declare j public.render_jobs;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into j from public.render_jobs where id=p_job and owner_id=p_owner for update;
 if not found or j.status<>'failed' or j.attempt_count>=3 then raise exception 'Cannot retry';end if;
 if exists(select 1 from public.render_jobs where project_id=j.project_id and status in ('queued','rendering')) then raise exception 'Already active';end if;
 if not public.consume_request_limit(p_owner,'daily-retries',greatest(1,p_daily_cap),86400) then raise exception 'Daily retry limit';end if;
 update public.render_jobs set status='queued',progress=0,error=null,lease_token=null,lease_until=null where id=p_job;
 return p_job;
end$$;
revoke all on function public.consume_request_limit(uuid,text,integer,integer),public.enqueue_render(uuid,uuid,jsonb,integer),public.claim_render(),public.retry_render(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.consume_request_limit(uuid,text,integer,integer),public.enqueue_render(uuid,uuid,jsonb,integer),public.claim_render(),public.retry_render(uuid,uuid,integer) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('inputs','inputs',false,15728640,array['image/webp']),('exports','exports',false,104857600,array['video/mp4']) on conflict(id) do nothing;
create policy input_owner_read on storage.objects for select to authenticated using(bucket_id='inputs' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy export_owner_read on storage.objects for select to authenticated using(bucket_id='exports' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
