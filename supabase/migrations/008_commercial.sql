begin;

create table public.billing_accounts (
 owner_id uuid primary key references auth.users on delete cascade,
 customer_id text unique,
 subscription_id text,
 subscription_status text,
 cancel_at_period_end boolean not null default false,
 subscription_event_at bigint not null default 0
);
create table public.billing_checkouts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users on delete cascade,
 offer text not null check(offer in ('package','studio')),
 session_id text unique,
 created_at timestamptz not null default now(),
 fulfilled boolean not null default false
);
create index billing_checkout_owner on public.billing_checkouts(owner_id,created_at);
create table public.billing_grants (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users on delete cascade,
 source text not null unique,
 offer text not null check(offer in ('package','studio')),
 allowance integer not null check(allowance in (1,5)),
 used integer not null default 0 check(used>=0 and used<=allowance),
 starts_at timestamptz not null default now(),
 expires_at timestamptz,
 payment_ref text,
 revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create index billing_grant_owner on public.billing_grants(owner_id,expires_at);
create index billing_grant_payment on public.billing_grants(payment_ref);
create table public.project_access (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users on delete cascade,
 project_id uuid not null references public.projects on delete cascade,
 grant_id uuid not null references public.billing_grants,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 days'
);
create index project_access_owner on public.project_access(owner_id,project_id,expires_at);
alter table public.render_jobs add column access_id uuid references public.project_access on delete set null;
create table public.billing_events (
 id text primary key,
 processed_at timestamptz not null default now()
);
create table public.billing_revocations (
 payment_ref text primary key,
 owner_id uuid not null references auth.users on delete cascade,
 created_at timestamptz not null default now()
);
create table public.funnel_events (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users on delete cascade,
 event text not null check(event in ('creation_started','capture_succeeded','capture_failed','preview_ready','checkout_started','purchase_confirmed','render_queued','render_completed','render_failed','download_requested','review_created','review_approved')),
 project_id uuid references public.projects on delete set null,
 created_at timestamptz not null default now()
);
create index funnel_event_time on public.funnel_events(event,created_at);

alter table public.billing_accounts enable row level security;
alter table public.billing_checkouts enable row level security;
alter table public.billing_grants enable row level security;
alter table public.project_access enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_revocations enable row level security;
alter table public.funnel_events enable row level security;
revoke all on public.billing_accounts,public.billing_checkouts,public.billing_grants,public.project_access,public.billing_events,public.billing_revocations,public.funnel_events from anon,authenticated;
grant all on public.billing_accounts,public.billing_checkouts,public.billing_grants,public.project_access,public.billing_events,public.billing_revocations,public.funnel_events to service_role;

create function public.begin_billing_checkout(p_owner uuid,p_offer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_checkouts; a public.billing_accounts;
begin
 if p_offer not in ('package','studio') then raise exception 'Invalid offer';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 insert into public.billing_accounts(owner_id) values(p_owner) on conflict do nothing;
 select * into a from public.billing_accounts where owner_id=p_owner;
 if p_offer='studio' and a.subscription_status in ('active','trialing','past_due','unpaid','incomplete','paused') then raise exception 'Subscription already exists';end if;
 select * into c from public.billing_checkouts where owner_id=p_owner and offer=p_offer and not fulfilled and created_at>now()-interval '60 minutes' order by created_at desc limit 1;
 if not found then insert into public.billing_checkouts(owner_id,offer) values(p_owner,p_offer) returning * into c;end if;
 return to_jsonb(c);
end$$;

-- All state changes and the event receipt commit together. Grants have a second
-- uniqueness key so browser confirmation and webhook delivery cannot double pay.
create function public.apply_billing_event(p_event text,p_owner uuid,p_data jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare g public.billing_grants; offer text; inserted integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 insert into public.billing_events(id) values(p_event) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return false;end if;
 if p_data ? 'subscriptionId' then
  update public.billing_accounts set subscription_id=p_data->>'subscriptionId',subscription_status=p_data->>'status',
   cancel_at_period_end=coalesce((p_data->>'cancelAtPeriodEnd')::boolean,false),subscription_event_at=(p_data->>'at')::bigint
  where owner_id=p_owner and subscription_event_at<=(p_data->>'at')::bigint
   and (subscription_id is null or subscription_id=p_data->>'subscriptionId' or subscription_status in ('canceled','incomplete_expired'));
 end if;
 if p_data ? 'revoke' then
  insert into public.billing_revocations(payment_ref,owner_id) values(p_data->>'revoke',p_owner) on conflict do nothing;
  update public.billing_grants set revoked_at=now() where owner_id=p_owner and payment_ref=p_data->>'revoke';
 end if;
 if p_data ? 'source' then
  offer=p_data->>'offer';
  if offer not in ('package','studio') then raise exception 'Invalid offer';end if;
  insert into public.billing_grants(owner_id,source,offer,allowance,starts_at,expires_at,payment_ref,revoked_at)
   values(p_owner,p_data->>'source',offer,case when offer='studio' then 5 else 1 end,
    coalesce((p_data->>'startsAt')::timestamptz,now()),(p_data->>'expiresAt')::timestamptz,p_data->>'paymentRef',
    case when exists(select 1 from public.billing_revocations where payment_ref=p_data->>'paymentRef' and owner_id=p_owner) then now() else null end)
   on conflict(source) do nothing returning * into g;
  if found then insert into public.funnel_events(owner_id,event) values(p_owner,'purchase_confirmed');end if;
 end if;
 if p_data ? 'checkoutId' then update public.billing_checkouts set fulfilled=true where id=(p_data->>'checkoutId')::uuid and owner_id=p_owner;end if;
 return true;
end$$;

create function public.enqueue_commercial_output(p_owner uuid,p_project uuid,p_settings jsonb,p_daily_cap integer,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; access public.project_access; grant_row public.billing_grants; n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 -- The underlying queue validates ownership/media and applies its resource cap.
 -- Any entitlement exception rolls back the job and project update as well.
 result=public.enqueue_output_with_result(p_owner,p_project,p_settings,p_daily_cap,p_kind);
 if (result->>'reused')::boolean then return result;end if;
 select a.* into access from public.project_access a join public.billing_grants g on g.id=a.grant_id
  where a.owner_id=p_owner and a.project_id=p_project and a.expires_at>now() and g.revoked_at is null
  order by a.created_at desc limit 1 for update of a;
 if not found then
  select * into grant_row from public.billing_grants where owner_id=p_owner and revoked_at is null
   and used<allowance and starts_at<=now() and (expires_at is null or expires_at>now())
   order by expires_at asc nulls last,created_at limit 1 for update;
  if not found then raise exception 'Payment required';end if;
  update public.billing_grants set used=used+1 where id=grant_row.id;
  insert into public.project_access(owner_id,project_id,grant_id) values(p_owner,p_project,grant_row.id) returning * into access;
 end if;
 select count(*) into n from public.render_jobs where access_id=access.id and status<>'failed';
 if n>=10 then raise exception 'Project export allowance reached';end if;
 update public.render_jobs set access_id=access.id where id=(result->>'id')::uuid;
 return result;
end$$;

-- Failed retries keep their original paid access. They may not bypass the
-- successful/in-flight export cap when a later replacement already filled it.
create function public.check_paid_retry() returns trigger language plpgsql set search_path='' as $$
declare n integer;
begin
 if old.status='failed' and new.status in ('queued','rendering') and new.access_id is not null then
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,0));
  if exists(select 1 from public.project_access a join public.billing_grants g on g.id=a.grant_id where a.id=new.access_id and g.revoked_at is not null) then raise exception 'Purchase refunded';end if;
  select count(*) into n from public.render_jobs where access_id=new.access_id and id<>new.id and status<>'failed';
  if n>=10 then raise exception 'Project export allowance reached';end if;
 end if;
 return new;
end$$;
create trigger paid_retry before update of status on public.render_jobs for each row execute function public.check_paid_retry();

create function public.record_render_funnel() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.funnel_events(owner_id,event,project_id) values(new.owner_id,'render_queued',new.project_id);
 elsif new.status is distinct from old.status and new.status in ('completed','failed') then
  insert into public.funnel_events(owner_id,event,project_id) values(new.owner_id,'render_'||new.status,new.project_id);
 end if;
 return new;
end$$;
create trigger render_funnel after insert or update of status on public.render_jobs for each row execute function public.record_render_funnel();

revoke all on function public.begin_billing_checkout(uuid,text),public.apply_billing_event(text,uuid,jsonb),public.enqueue_commercial_output(uuid,uuid,jsonb,integer,text),public.check_paid_retry(),public.record_render_funnel() from public,anon,authenticated;
grant execute on function public.begin_billing_checkout(uuid,text),public.apply_billing_event(text,uuid,jsonb),public.enqueue_commercial_output(uuid,uuid,jsonb,integer,text) to service_role;
commit;
