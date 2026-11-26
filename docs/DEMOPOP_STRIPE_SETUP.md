# Connect Stripe payments

DemoPop uses Stripe-hosted Checkout for the $29 one-time launch package and $79/month Studio plan, plus a dedicated customer portal for invoices, payment methods and cancellation. The app verifies paid resources server-side and grants export access transactionally. A success URL alone never grants access.

## Local test setup

1. If `.env.local` does not exist, copy `.env.example` to it. Set `STRIPE_SECRET_KEY` to your Stripe **test-mode** secret or restricted key, the three Supabase connection variables, and `APP_ORIGIN=http://127.0.0.1:3001`. Keep credentials in private environment files. Stripe-hosted Checkout does not require a browser publishable key in this integration.
2. Apply Supabase migrations through `010_checkout_context.sql`. The app requires existing authentication, private storage and the export worker as well as billing tables. Restart the web app and worker after upgrading their source. Supabase's permitted Auth redirects must include the application's `/auth/confirm` callback with encoded local pricing/billing return context, alongside the existing create and password-recovery callbacks.
3. Run:

   ```powershell
   npm run billing:setup
   ```

   This command provisions **test-mode objects only**: the two product prices and a DemoPop customer portal configuration. It validates/reuses existing configured IDs and lookup keys. It leaves existing prices and the account's default portal configuration unchanged. Generated configuration is saved to ignored `.env.local`; secret values are never displayed. Rerunning reuses matching objects. Live keys are refused by the provisioning command.

4. Install/login to the [Stripe CLI](https://docs.stripe.com/stripe-cli), then forward supported events:

   ```powershell
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,invoice.paid,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,charge.refunded,charge.dispute.created --forward-to http://127.0.0.1:3001/api/billing/webhook
   ```

   Put the listener's signing secret in `STRIPE_WEBHOOK_SECRET` in `.env.local`. Keep the listener running. Its secret differs from a hosted endpoint's signing secret.

5. Run `npm run billing:check`, then restart `npm run preview`. The check reads Stripe prices/portal/endpoint configuration and queries empty Supabase results to verify billing tables and migration 010 columns. It performs no writes or payments and prints no credentials. If a dependency is missing it exits unsuccessfully and identifies the setting. A passed configuration check does not prove webhook delivery or completed payment.
6. Sign in to DemoPop, save a project, and use its payment prompt to choose a plan. Complete Checkout with a [Stripe test payment method](https://docs.stripe.com/testing). Confirm the package balance at `/billing`, use **Continue to export** to return to the saved project, then explicitly start its export. Also cancel Checkout and confirm that the selected plan and original project remain available. Verify the webhook arrives successfully and that refreshing confirmation or replaying the event does not duplicate access. Open Manage billing & receipts to test the dedicated portal.

## Hosted endpoint and live activation

When `APP_ORIGIN` is a public HTTPS origin, `billing:setup` can create a pinned-version **test webhook endpoint** at `/api/billing/webhook` and save its signing secret privately. If an endpoint already targets that URL, the command reuses it and asks for its existing secret from Stripe Dashboard rather than creating a duplicate or rotating it. A preconfigured signing secret is preserved. `STRIPE_WEBHOOK_ENDPOINT_ID` allows `billing:check` to verify its URL, mode, enabled state and event selection.

For live activation, configure live prices with the same catalog amounts, live server credentials, the live signing secret, and the intended live portal configuration in the deployment environment. Use the canonical HTTPS `APP_ORIGIN` and all eight supported webhook events. Validate the real account, webhook delivery and worker against the acceptance checklist in [commercial implementation](DEMOPOP_COMMERCIAL_IMPLEMENTATION.md). The setup command deliberately does not create live products, accept charges, apply hosted migrations or deploy the app.

Optional environment variables:

| Variable                         | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Use the dedicated portal rather than the account default. |
| `STRIPE_WEBHOOK_ENDPOINT_ID`     | Let the read-only check verify the hosted endpoint.       |

## Checkout recovery

Checkout retains one-hour expiry and a stable idempotency key per persisted attempt. An interrupted request is replayed unchanged first. Only an explicit Stripe rejection of an elapsed `expires_at` permits one atomic restart of a still-sessionless attempt. Migration 009 retains retired rows for reconciliation, isolates owners and makes concurrent recovery converge on one replacement. Network failures, provider errors and unrelated validation failures retain the original attempt.

## Returning to a saved project

Migration 010 stores the owned saved project's ID on the checkout attempt as navigation context. A payment prompt carries it to pricing and through sign-in. Canceling Checkout returns to pricing with the selected plan and that attempt's original project. Returning from Checkout while signed out preserves the session and project in the sign-in destination, so confirmation can resume in the purchasing account.

The first pending attempt for an account and offer keeps its original destination when reused, including when checkout is later opened from a different project. Its stored context is immutable so retries send the same Stripe payload under the same idempotency key. Older attempts without a project keep their original context-free return URLs. A deleted project does not alter an existing attempt's payload.

After payment confirmation, the server returns the persisted project only if it still belongs to the signed-in customer and is not in Trash. That result takes precedence over URL parameters. **Continue to export** opens the project for review; it does not start an export. Neither a `project` parameter nor a `session_id` parameter grants access, initiates a payment or automatically queues a render. Checkout still requires a deliberate plan-button action, and the export endpoint checks purchased access.

Implementation references: [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment), [idempotent requests](https://docs.stripe.com/api/idempotent_requests), [customer portal configuration](https://docs.stripe.com/api/customer_portal/configurations/create), and [webhook endpoints](https://docs.stripe.com/api/webhook_endpoints/create). The integration pins `2025-06-30.basil` rather than inheriting the Stripe account default.

No Stripe account credentials are configured in this workspace as of this implementation. Automated tests use intercepted Stripe/Supabase services and embedded Postgres; actual account activation remains a separate setup step.

Validation: 79 unit/integration tests and four configured-account billing browser checks passed. TypeScript and ESLint passed. Running `billing:check` in this unconfigured workspace reported the missing settings and exited unsuccessfully; `billing:setup` refused to proceed without a test key. No credentials, Stripe account objects, hosted migrations or charges were created by that verification.

Saved-project follow-up validation: **81 unit/integration tests and all 31 configured-account browser checks passed**, with TypeScript and ESLint passing. The browser journey covers a saved edit, payment prompt, contextual plan selection, expired sign-in, Checkout return, delayed confirmation, and an explicit export of the same edit. Additional checks reject unrecognized auth return parameters at the real HTTP endpoint, prefer server-confirmed project context over a changed URL, retain canceled-checkout navigation, and fit the return action at 320px. SQL/HTTP regressions verify immutable context across retries and safe recovery after trashing or deleting the original project. UI artifacts are in ignored `out/qa/payments/`. Stripe/account calls remain intercepted; no real charges or hosted migration were performed.
