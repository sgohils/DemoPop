begin;
alter table public.render_jobs alter column template_version set default 'launch-3';

create function public.is_sample_asset(p_id text) returns boolean
language sql immutable set search_path='' as $$
 select p_id in ('sample-before','sample-after','sample-launch-before','sample-launch-after')
$$;
revoke all on function public.is_sample_asset(text) from public,anon,authenticated;
grant execute on function public.is_sample_asset(text) to service_role;

create or replace function public.check_asset_references() returns trigger language plpgsql security definer set search_path='' as $$
declare a text; refs text[];
begin
 if tg_table_name='brand_kits' then refs=array[new.logo_asset];
 else refs=array[new.before_asset,new.after_asset,new.logo_asset];end if;
 for a in select distinct unnest(refs) order by 1 loop
  if a is null or public.is_sample_asset(a) then continue;end if;
  perform 1 from public.assets where id::text=a and owner_id=new.owner_id for key share;
  if not found then raise exception 'Asset unavailable';end if;
 end loop;
 return new;
end$$;

create or replace function public.enqueue_render_with_result(p_owner uuid,p_project uuid,p_settings jsonb,p_daily_cap integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job_id uuid; a text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 perform 1 from public.projects where id=p_project and owner_id=p_owner and deleted_at is null for update;
 if not found then raise exception 'Not found';end if;
 for a in select jsonb_array_elements_text(jsonb_build_array(p_settings->>'before',p_settings->>'after',p_settings->>'logo')) loop
  if a is not null and not public.is_sample_asset(a) and not exists(select 1 from public.assets where id::text=a and owner_id=p_owner) then raise exception 'Asset unavailable';end if;
 end loop;
 update public.projects set settings=p_settings,name=p_settings->>'name',before_asset=p_settings->>'before',after_asset=p_settings->>'after',logo_asset=p_settings->>'logo' where id=p_project;
 select id into job_id from public.render_jobs where project_id=p_project and status in ('queued','rendering');
 if job_id is not null then return jsonb_build_object('id',job_id,'reused',true);end if;
 if (select count(*) from public.render_jobs where owner_id=p_owner and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=greatest(1,p_daily_cap) then raise exception 'Daily export limit';end if;
 insert into public.render_jobs(owner_id,project_id,snapshot) values(p_owner,p_project,p_settings) returning id into job_id;
 return jsonb_build_object('id',job_id,'reused',false);
end$$;
commit;
