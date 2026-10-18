begin;

-- Report reuse while holding the same lock that chooses or creates the job.
-- Later settings remain saved even when an earlier immutable snapshot is active.
create function public.enqueue_render_with_result(p_owner uuid,p_project uuid,p_settings jsonb,p_daily_cap integer)
returns jsonb language plpgsql security definer set search_path='' as $$
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
 if job_id is not null then return jsonb_build_object('id',job_id,'reused',true);end if;
 if (select count(*) from public.render_jobs where owner_id=p_owner and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=greatest(1,p_daily_cap) then raise exception 'Daily export limit';end if;
 insert into public.render_jobs(owner_id,project_id,snapshot) values(p_owner,p_project,p_settings) returning id into job_id;
 return jsonb_build_object('id',job_id,'reused',false);
end$$;

-- Preserve the original RPC for older callers and rolling deployments.
create or replace function public.enqueue_render(p_owner uuid,p_project uuid,p_settings jsonb,p_daily_cap integer)
returns uuid language sql security definer set search_path='' as $$
 select (public.enqueue_render_with_result(p_owner,p_project,p_settings,p_daily_cap)->>'id')::uuid;
$$;

revoke all on function public.enqueue_render_with_result(uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.enqueue_render_with_result(uuid,uuid,jsonb,integer) to service_role;
commit;
