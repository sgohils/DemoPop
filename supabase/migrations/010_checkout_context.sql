begin;

-- This is an immutable navigation snapshot, not entitlement or a live relation.
-- A deleted project must not change a pending Stripe idempotency payload.
alter table public.billing_checkouts add column return_project_id uuid;

create function public.begin_billing_checkout(p_owner uuid,p_offer text,p_project uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_checkouts; a public.billing_accounts;
begin
 if p_offer not in ('package','studio') then raise exception 'Invalid offer';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if p_project is not null then
  perform 1 from public.projects where id=p_project and owner_id=p_owner and deleted_at is null for share;
  if not found then raise exception 'Project not found';end if;
 end if;
 insert into public.billing_accounts(owner_id) values(p_owner) on conflict do nothing;
 select * into a from public.billing_accounts where owner_id=p_owner;
 if p_offer='studio' and a.subscription_status in ('active','trialing','past_due','unpaid','incomplete','paused') then raise exception 'Subscription already exists';end if;
 -- One unpaid attempt per owner/offer. Later project choices never replace its
 -- destination or create another incomplete Studio subscription.
 select * into c from public.billing_checkouts where owner_id=p_owner and offer=p_offer and not fulfilled and retired_at is null and created_at>now()-interval '60 minutes' order by created_at desc limit 1;
 if not found then insert into public.billing_checkouts(owner_id,offer,return_project_id) values(p_owner,p_offer,p_project) returning * into c;end if;
 return to_jsonb(c);
end$$;

-- Retain existing callers and deployed workers without an ambiguous defaulted
-- overload in PostgREST. Context-free attempts retain their original URLs.
create or replace function public.begin_billing_checkout(p_owner uuid,p_offer text) returns jsonb
language sql security definer set search_path='' as $$
 select public.begin_billing_checkout(p_owner,p_offer,null::uuid)
$$;

create or replace function public.restart_billing_checkout(p_owner uuid,p_checkout uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_checkouts; replacement public.billing_checkouts; a public.billing_accounts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into c from public.billing_checkouts where id=p_checkout and owner_id=p_owner for update;
 if not found or c.session_id is not null or c.fulfilled or c.created_at>now()-interval '30 minutes' then raise exception 'Checkout cannot be restarted';end if;
 select * into a from public.billing_accounts where owner_id=p_owner;
 if c.offer='studio' and a.subscription_status in ('active','trialing','past_due','unpaid','incomplete','paused') then raise exception 'Subscription already exists';end if;
 update public.billing_checkouts set retired_at=coalesce(retired_at,now()) where id=c.id;
 -- Copy an already validated snapshot rather than accepting new context. The
 -- original project can have been trashed or removed since the first request;
 -- that must not block payment recovery or rewrite its prior Stripe payload.
 -- Browser confirmation rechecks current project access before exposing it.
 select * into replacement from public.billing_checkouts where owner_id=p_owner and offer=c.offer and not fulfilled and retired_at is null and created_at>now()-interval '60 minutes' order by created_at desc limit 1;
 if not found then insert into public.billing_checkouts(owner_id,offer,return_project_id) values(p_owner,c.offer,c.return_project_id) returning * into replacement;end if;
 return to_jsonb(replacement);
end$$;

revoke all on function public.begin_billing_checkout(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.begin_billing_checkout(uuid,text,uuid) to service_role;
commit;
