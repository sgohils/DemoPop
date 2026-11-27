begin;

alter table public.render_jobs add column is_free boolean not null default false;

-- A separate receipt survives project/job cleanup. Deleting a completed export
-- must not replenish an account's monthly allowance. Failed jobs release theirs.
create table public.free_export_usage (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users on delete cascade,
 job_id uuid unique references public.render_jobs on delete set null,
 period_start timestamptz not null,
 failed boolean not null default false,
 created_at timestamptz not null default now(),
 check(period_start = date_trunc('month',period_start at time zone 'UTC') at time zone 'UTC')
);
create index free_export_owner_month on public.free_export_usage(owner_id,period_start) where not failed;
alter table public.free_export_usage enable row level security;
revoke all on public.free_export_usage from public,anon,authenticated;
grant all on public.free_export_usage to service_role;

create or replace function public.enqueue_commercial_output(p_owner uuid,p_project uuid,p_settings jsonb,p_daily_cap integer,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; access public.project_access; grant_row public.billing_grants; n integer;
 month_start timestamptz = date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 -- Ownership, immutable media snapshots, one active job and daily resource caps
 -- are still enforced by the existing queue. Any denial rolls this insert back.
 result=public.enqueue_output_with_result(p_owner,p_project,p_settings,p_daily_cap,p_kind);
 if (result->>'reused')::boolean then return result;end if;
 select a.* into access from public.project_access a join public.billing_grants g on g.id=a.grant_id
  where a.owner_id=p_owner and a.project_id=p_project and a.expires_at>now() and g.revoked_at is null
  order by a.created_at desc limit 1 for update of a;
 if not found then
  select * into grant_row from public.billing_grants where owner_id=p_owner and revoked_at is null
   and used<allowance and starts_at<=now() and (expires_at is null or expires_at>now())
   order by expires_at asc nulls last,created_at limit 1 for update;
  if not found then
   if p_kind<>'video' then raise exception 'Payment required';end if;
   select count(*) into n from public.free_export_usage
    where owner_id=p_owner and period_start=month_start and not failed;
   if n>=2 then raise exception 'Free export allowance reached';end if;
   update public.render_jobs set is_free=true where id=(result->>'id')::uuid;
   insert into public.free_export_usage(owner_id,job_id,period_start)
    values(p_owner,(result->>'id')::uuid,month_start);
   return result;
  end if;
  update public.billing_grants set used=used+1 where id=grant_row.id;
  insert into public.project_access(owner_id,project_id,grant_id) values(p_owner,p_project,grant_row.id) returning * into access;
 end if;
 select count(*) into n from public.render_jobs where access_id=access.id and status<>'failed';
 -- Existing paid project access keeps its ten-export policy; free allowance
 -- never silently changes how a paid project consumes its revision allowance.
 if n>=10 then raise exception 'Project export allowance reached';end if;
 update public.render_jobs set access_id=access.id where id=(result->>'id')::uuid;
 return result;
end$$;

create function public.check_free_retry() returns trigger language plpgsql security definer set search_path='' as $$
declare n integer; month_start timestamptz = date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
begin
 if not new.is_free or new.status is not distinct from old.status then return new;end if;
 if new.status='failed' then
  -- Releasing capacity needs no owner lock. This also avoids reversing the
  -- owner-then-job lock order used by enqueue/retry while a worker fails a job.
  update public.free_export_usage set failed=true where job_id=new.id;
 elsif old.status='failed' then
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,0));
  -- Retrying an old failed job reserves the month in which it is retried,
  -- including when later replacement exports already used that allowance.
  select count(*) into n from public.free_export_usage
   where owner_id=new.owner_id and period_start=month_start and not failed and job_id is distinct from new.id;
  if n>=2 then raise exception 'Free export allowance reached';end if;
  update public.free_export_usage set failed=false,period_start=month_start where job_id=new.id;
  if not found then raise exception 'Free export reservation unavailable';end if;
 end if;
 return new;
end$$;
create trigger free_retry before update of status on public.render_jobs for each row execute function public.check_free_retry();

revoke all on function public.check_free_retry() from public,anon,authenticated;
-- CREATE OR REPLACE preserves the existing service-role-only queue privileges.
commit;
