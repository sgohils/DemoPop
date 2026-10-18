begin;
alter table public.projects add column deleted_at timestamptz;
alter table public.render_jobs add column output_expired_at timestamptz;
alter table public.render_jobs alter column template_version set default 'studio-2';
create index projects_trash on public.projects(owner_id,deleted_at);

create table public.brand_kits (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
 name text not null check(length(name) between 1 and 60), settings jsonb not null, logo_asset text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index brand_kit_owner on public.brand_kits(owner_id);
create trigger touch_brand_kit before update on public.brand_kits for each row execute function public.touch_updated();
alter table public.brand_kits enable row level security;
create policy brand_kits_owner_read on public.brand_kits for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.brand_kits from anon,authenticated;
grant select on public.brand_kits to authenticated;
grant all on public.brand_kits to service_role;

-- Lock registered assets while references are written. Cleanup cannot race a save
-- or remove a logo shared by a kit, project, duplicate, or immutable job snapshot.
create function public.check_asset_references() returns trigger language plpgsql security definer set search_path='' as $$
declare a text; refs text[];
begin
 if tg_table_name='brand_kits' then refs=array[new.logo_asset];
 else refs=array[new.before_asset,new.after_asset,new.logo_asset];end if;
 for a in select distinct unnest(refs) order by 1 loop
  if a is null or a in ('sample-before','sample-after') then continue;end if;
  perform 1 from public.assets where id::text=a and owner_id=new.owner_id for key share;
  if not found then raise exception 'Asset unavailable';end if;
 end loop;
 return new;
end$$;
create trigger project_assets before insert or update of before_asset,after_asset,logo_asset,owner_id on public.projects for each row execute function public.check_asset_references();
create trigger brand_kit_assets before insert or update of logo_asset,owner_id on public.brand_kits for each row execute function public.check_asset_references();

create function public.manage_project(p_owner uuid,p_project uuid,p_action text) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.projects; result_id uuid; copy_name text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into p from public.projects where id=p_project and owner_id=p_owner for update;
 if not found then raise exception 'Not found';end if;
 if p_action='restore' then
  update public.projects set deleted_at=null where id=p_project;
  return p_project;
 end if;
 if p.deleted_at is not null then raise exception 'Not found';end if;
 if p_action='trash' then
  if exists(select 1 from public.render_jobs where project_id=p_project and status in ('queued','rendering')) then raise exception 'Active export';end if;
  update public.projects set deleted_at=now() where id=p_project;
  return p_project;
 elsif p_action='duplicate' then
  copy_name=left(p.name,53)||' (copy)';
  insert into public.projects(owner_id,name,settings,before_asset,after_asset,logo_asset)
  values(p_owner,copy_name,jsonb_set(p.settings,'{name}',to_jsonb(copy_name)),p.before_asset,p.after_asset,p.logo_asset) returning id into result_id;
  return result_id;
 end if;
 raise exception 'Unsupported project action';
end$$;
revoke all on function public.manage_project(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.manage_project(uuid,uuid,text) to service_role;

-- Keep the atomic queue behavior; prevent exports of projects in the trash.
create or replace function public.enqueue_render_with_result(p_owner uuid,p_project uuid,p_settings jsonb,p_daily_cap integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job_id uuid; a text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 perform 1 from public.projects where id=p_project and owner_id=p_owner and deleted_at is null for update;
 if not found then raise exception 'Not found';end if;
 for a in select jsonb_array_elements_text(jsonb_build_array(p_settings->>'before',p_settings->>'after',p_settings->>'logo')) loop
  if a is not null and a not in ('sample-before','sample-after') and not exists(select 1 from public.assets where id::text=a and owner_id=p_owner) then raise exception 'Asset unavailable';end if;
 end loop;
 update public.projects set settings=p_settings,name=p_settings->>'name',before_asset=p_settings->>'before',after_asset=p_settings->>'after',logo_asset=p_settings->>'logo' where id=p_project;
 select id into job_id from public.render_jobs where project_id=p_project and status in ('queued','rendering');
 if job_id is not null then return jsonb_build_object('id',job_id,'reused',true);end if;
 if (select count(*) from public.render_jobs where owner_id=p_owner and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=greatest(1,p_daily_cap) then raise exception 'Daily export limit';end if;
 insert into public.render_jobs(owner_id,project_id,snapshot) values(p_owner,p_project,p_settings) returning id into job_id;
 return jsonb_build_object('id',job_id,'reused',false);
end$$;

create table public.storage_deletions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 bucket text not null check(bucket in ('inputs','exports')), path text not null,
 created_at timestamptz not null default now(), unique(bucket,path),
 check(path like owner_id::text||'/%')
);
alter table public.storage_deletions enable row level security;
revoke all on public.storage_deletions from anon,authenticated;
grant all on public.storage_deletions to service_role;

create function public.queue_storage_cleanup(p_before timestamptz,p_apply boolean default false) returns jsonb
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
   insert into public.storage_deletions(owner_id,bucket,path)
    select owner_id,'exports',output_path from public.render_jobs where project_id=p.id and output_path is not null on conflict do nothing;
   delete from public.projects where id=p.id;
  end if;
 end loop;
 for j in select * from public.render_jobs where status='completed' and output_path is not null and updated_at<p_before order by id for update skip locked loop
  output_count=output_count+1;
  if p_apply then
   insert into public.storage_deletions(owner_id,bucket,path) values(j.owner_id,'exports',j.output_path) on conflict do nothing;
   update public.render_jobs set output_path=null,output_expired_at=now() where id=j.id;
  end if;
 end loop;
 for a in select * from public.assets x where x.created_at<p_before
  and not exists(select 1 from public.projects refs where x.id::text in (refs.before_asset,refs.after_asset,refs.logo_asset))
  and not exists(select 1 from public.brand_kits b where b.logo_asset=x.id::text)
  and not exists(select 1 from public.render_jobs r where x.id::text in (r.snapshot->>'before',r.snapshot->>'after',r.snapshot->>'logo'))
  order by x.id for update skip locked loop
  -- Recheck after taking the asset lock, with a fresh READ COMMITTED snapshot.
  -- A reference may have committed between the candidate scan and this lock.
  if exists(select 1 from public.projects refs where a.id::text in (refs.before_asset,refs.after_asset,refs.logo_asset))
   or exists(select 1 from public.brand_kits b where b.logo_asset=a.id::text)
   or exists(select 1 from public.render_jobs r where a.id::text in (r.snapshot->>'before',r.snapshot->>'after',r.snapshot->>'logo')) then continue;end if;
  asset_count=asset_count+1;
  if p_apply then
   insert into public.storage_deletions(owner_id,bucket,path) values(a.owner_id,'inputs',a.path) on conflict do nothing;
   delete from public.assets where id=a.id;
  end if;
 end loop;
 return jsonb_build_object('projects',project_count,'outputs',output_count,'assets',asset_count,'applied',p_apply);
end$$;
revoke all on function public.queue_storage_cleanup(timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.queue_storage_cleanup(timestamptz,boolean) to service_role;

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
 if not public.consume_request_limit(p_owner,'daily-retries',greatest(1,p_daily_cap),86400) then raise exception 'Daily retry limit';end if;
 update public.render_jobs set status='queued',progress=0,error=null,lease_token=null,lease_until=null where id=p_job;
 return p_job;
end$$;
commit;
