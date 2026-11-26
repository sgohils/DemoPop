# DemoPop paid launch workspace

Implemented October 20, 2026, from the [commercial research](DEMOPOP_COMMERCIAL_RESEARCH.md).

## Customer experience

The homepage now leads with client websites becoming launch campaigns. The existing film, sample package, motion gallery, and client workflow remain. Pricing appears on the homepage and at `/pricing`; Projects and the editor link to `/billing`.

The manual studio previews customer media without an account. Public website capture requires an account and now opens an editable motion preview before payment. Export requires an available project package. A user without access receives a clear plan link after the reviewed project is saved. The creation flow and editor both save edits before requesting an export, so a payment prompt does not discard them. See [competitor-driven improvements](DEMOPOP_COMPETITIVE_IMPROVEMENTS.md) for the new preview and recovery behavior.

Payment prompts carry the saved project through pricing, sign-in and Checkout. Cancellation returns to the selected plan and the pending attempt's original project. A confirmed purchase offers **Continue to export**, using the owned project returned by server confirmation; the customer reviews the edit and starts the export explicitly. A signed-out Checkout return retains its confirmation context through sign-in. Query parameters never prove payment, initiate Checkout or automatically export a project.

| Offer          | USD price | Access                                                                                                       |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| Launch package | $29 once  | One new project activation; unused package never expires                                                     |
| Studio         | $79/month | Five new project activations after each successful billing-period payment; unused monthly activations expire |

An initial export activates 30 days for that project and consumes one package. A project supports ten nonfailed exports during its window. An export can be one MP4 or one complete nine-video package. Revisions use the same access. Failed jobs are excluded from the ten-export count; retrying a failed job does not consume another package. The existing bounded retry and resource controls still apply. At ten exports, start another project; after the access window expires, another available package can activate the same saved project again.

Activated project access retains its own 30-day window after a monthly subscription's billing period ends. Canceling future renewals does not remove already purchased access. Full refunds and disputes revoke the associated grant and its project access; partial refunds keep access. Export files already downloaded cannot be recalled. Expired storage is subject to the existing retention policy, so the package is not a promise of permanent hosted storage.

Client review links retain their existing 14-day expiry. Client folder labels are not multi-seat workspaces. The offer adds no claim of automatic publishing, ad measurement, or improved conversion rates.

## Enable purchases

The repeatable test-mode setup and read-only configuration check are documented in [Stripe setup](DEMOPOP_STRIPE_SETUP.md): `npm run billing:setup` and `npm run billing:check`. Apply migrations through **010_checkout_context.sql** for the current implementation. Migration 008 provides the base billing schema, migration 009 adds safe interrupted-checkout recovery, and migration 010 retains immutable saved-project return context. An optional `STRIPE_PORTAL_CONFIGURATION_ID` selects the app's dedicated customer portal configuration.

1. Apply every migration through `010_checkout_context.sql` to the hosted Supabase project. Deploy the web application and updated worker together. Migration 008 adds service-only billing tables, transaction-safe grant/queue functions, and render funnel triggers; migrations 009 and 010 add checkout recovery and return context. A running old server may still use the deliberate free-beta queue, so coordinate the rollout before opening checkout.
2. Configure the existing Supabase account, private storage, and worker services. Paid plans are enabled by default; `DEMOPOP_BILLING_ENABLED=0` explicitly retains free-beta exports. Do not use that override on an installation intended to charge for exports.
3. In Stripe, create an active **$29 USD one-time price** and an active **$79 USD recurring monthly price** with quantity one. Configure `STRIPE_PACKAGE_PRICE_ID`, `STRIPE_STUDIO_PRICE_ID`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` server-side. Checkout verifies the configured prices before redirecting. Do not configure trials, coupons, alternative quantities, or plan upgrades for this initial catalog.
4. Set `APP_ORIGIN` to the exact canonical HTTPS application origin. HTTP is accepted only for local development. Checkout return URLs and portal URLs use this configured origin, never a client-supplied return address. Supabase's permitted Auth redirects must include the application's `/auth/confirm` callback with encoded local pricing/billing return context, alongside existing create/recovery callbacks. The app accepts only fixed local destinations and typed return parameters.
5. Configure Stripe's customer portal for payment-method updates, invoice history, and canceling at the end of the billing period. Leave subscription product switching and quantity changes disabled. Configure public business/support information and receipt settings in Stripe before launch. One-time Checkout enables invoice creation so that its receipt/invoice is available alongside subscription invoices.
6. Create a webhook at `https://YOUR-ORIGIN/api/billing/webhook` and subscribe to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `invoice.paid`
   - `customer.subscription.created`, `.updated`, `.deleted`
   - `charge.refunded`
   - `charge.dispute.created`
7. Start in Stripe test mode and run the hosted acceptance checks below. Switch to live keys, live price IDs, live endpoint signing secret, and the live portal configuration only after those checks succeed. No real card data belongs in the repository or chat.

Stripe API requests pin `2025-06-30.basil`. Webhook objects are used only to identify the canonical Stripe resource; fulfillment rereads Checkout, invoices, or subscriptions from Stripe. An invoice grants five activations only when it is a paid initial/cycle invoice for the configured Studio price, customer, and recorded checkout. The unique subscription/period grant key prevents duplicate monthly allowances.

The app does not implement automatic tax calculation or geographic tax registration. Set the business's tax treatment before collecting live payments; do not infer it from the displayed USD catalog. No tax advice or tax configuration was performed here.

Official integration references: [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [invoice objects for the pinned API](https://docs.stripe.com/api/invoices/object?api-version=2025-06-30.basil), [webhook delivery/signature handling](https://docs.stripe.com/events/manage-webhook-endpoints), and [customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal).

## Enforcement and recovery

- Only the service role can write billing records or invoke grant functions. Authenticated browser clients cannot mint access, submit a price, choose a customer ID, or change an allowance.
- Signature verification uses the unmodified body, HMAC-SHA256, constant-time digest comparison, rotating signatures, and a five-minute timestamp tolerance. Payload size is bounded. Processing failures remain retryable; event receipt and grant changes commit atomically.
- Checkout attempts reuse a persisted idempotency key and session, with a one-hour expiry. Existing Studio subscriptions are routed to billing management. The signed-in user owns the Stripe customer and checkout attempt.
- A return project is validated as owned and active before starting checkout. The first pending attempt for an account and offer retains its original project even when reused from another project. Its return context is an immutable navigation snapshot, so later project deletion cannot change the Stripe retry payload. Existing context-free attempts keep their original URLs.
- The `/billing?session_id=...` page never treats the URL as proof of payment. An authenticated confirmation call verifies the purchase independently; grant keys make it safe alongside webhook processing. Pending payments remain pending and the customer can refresh without purchasing again.
- Confirmed return navigation uses the persisted checkout's project only after checking current ownership and Trash status. URL hints cannot substitute another project after confirmation. Deleted or unavailable destinations do not remove purchased account packages; the customer can choose another saved project.
- Invoice-first delivery works before Checkout completion. Subscription state is fetched from Stripe, and a canceled older subscription cannot overwrite a different active subscription. Renewal allowance is driven by paid invoices rather than a subscription `active` flag.
- Refund/dispute revocations have a durable payment-reference tombstone. A late paid event cannot recreate refunded access. Disputes are treated conservatively as revocations; a won dispute needs operator reconciliation before restoring service.
- The queue serializes per-owner checks. Grant use, project activation, queue insertion and export association share a database transaction. Duplicate active jobs do not consume additional packages. Failed retries remain capped and cannot bypass the ten-export limit after replacement exports have filled it.
- Paid installations default to a resource ceiling of 100 render units/day via `PAID_DAILY_EXPORT_CAP`; full packages use nine render units. This ceiling is separate from purchased project allowances. Free-beta controls retain `DAILY_EXPORT_CAP`.
- Payment configuration errors fail closed. The local website explains that purchases are unavailable and offers a real free preview. No fake successful payment or customer balance is shown.

## First-party funnel evidence

`funnel_events` stores only owner IDs, optional project IDs, an allowlisted event name, and a timestamp. It contains no website URLs, captions, screenshots, reviewer names, card details, or media. It is service-only. Preview telemetry is account-only and bounded; anonymous previews are not tracked. This is operational product instrumentation, not an ad analytics platform or an audited revenue ledger.

Events cover creation/capture, preview readiness, checkout start, grant creation, queueing, render completion/failure, download requests, review links, and approval. A download request shows intent, not that the customer published a video. Approval events lack project attribution when emitted from bearer review links.

Example operator queries in Supabase SQL:

```sql
select event, count(*) as events, count(distinct owner_id) as accounts
from public.funnel_events
where created_at >= now() - interval '30 days'
group by event order by event;

-- Accounts that successfully exported more than one distinct paid project.
select j.owner_id, count(distinct j.project_id) as paid_projects
from public.render_jobs j
where j.status = 'completed' and j.access_id is not null
group by j.owner_id
having count(distinct j.project_id) > 1;
```

## Verification

Local automated verification includes the actual migrations in embedded Postgres, canonical Stripe HTTP fixtures, signature/body limits, forged/foreign purchases, pending payments, wrong price/amount, invoice-first renewals, duplicate grants, atomic queue rollback, revision caps, expiry, owner isolation, and refunds delivered before purchase fulfillment.

Browser coverage includes pricing and unavailable checkout, small screens, selected-plan sign-in return, checkout error recovery, pending-to-confirmed billing, portal navigation, and preserving saved edits at a payment prompt. Stripe destinations in these browser tests are intercepted fixtures. The existing editor and rendering regression suites remain applicable.

Executed checks: **57 unit/integration tests passed**, including the new billing and canonical HTTP fixtures; **43 local browser tests passed**; **19 configured-account browser tests passed** with intercepted API/provider responses. TypeScript, ESLint and whitespace checks passed. Both browser suites built isolated production applications successfully. Saved homepage, pricing and billing screenshots are in `out/qa/commercial/`. Visual review also corrected the new payment buttons' contrast against the application's global button reset.

No Stripe account credentials are configured in this workspace. No hosted migration, production deployment, Stripe test-mode transaction against an actual account, or live payment has been performed. Existing documentation records earlier renderer QA; no new renderer behavior was introduced by this change.

Before accepting live customers, verify with two real hosted test accounts: purchase/save/export/download, cross-account denial, one-time invoice, monthly renewal, failed renewal, cancel-at-period-end, portal receipt/payment update, full refund, webhook redelivery, concurrent clicks, expired access, retry after renderer failure, and actual client review. Measure package cost, wait time, publication and repeat purchase with the first paid pilots.
