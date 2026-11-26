begin;

-- Keep rejected attempts for payment reconciliation; they are never purchases.
alter table public.billing_checkouts add column retired_at timestamptz;

create or replace function public.begin_billing_checkout(p_owner uuid,p_offer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_checkouts; a public.billing_accounts;
begin
 if p_offer not in ('package','studio') then raise exception 'Invalid offer';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 insert into public.billing_accounts(owner_id) values(p_owner) on conflict do nothing;
 select * into a from public.billing_accounts where owner_id=p_owner;
 if p_offer='studio' and a.subscription_status in ('active','trialing','past_due','unpaid','incomplete','paused') then raise exception 'Subscription already exists';end if;
 select * into c from public.billing_checkouts where owner_id=p_owner and offer=p_offer and not fulfilled and retired_at is null and created_at>now()-interval '60 minutes' order by created_at desc limit 1;
 if not found then insert into public.billing_checkouts(owner_id,offer) values(p_owner,p_offer) returning * into c;end if;
 return to_jsonb(c);
end$$;

-- Called only after Stripe explicitly rejects the unchanged create request's
-- elapsed expires_at. Ambiguous network/provider failures must retain the attempt.
create function public.restart_billing_checkout(p_owner uuid,p_checkout uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_checkouts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into c from public.billing_checkouts where id=p_checkout and owner_id=p_owner for update;
 if not found or c.session_id is not null or c.fulfilled or c.created_at>now()-interval '30 minutes' then raise exception 'Checkout cannot be restarted';end if;
 update public.billing_checkouts set retired_at=coalesce(retired_at,now()) where id=c.id;
 return public.begin_billing_checkout(p_owner,c.offer);
end$$;

revoke all on function public.restart_billing_checkout(uuid,uuid) from public,anon,authenticated;
grant execute on function public.restart_billing_checkout(uuid,uuid) to service_role;
commit;
