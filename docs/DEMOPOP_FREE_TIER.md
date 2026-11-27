# Free tier

Free accounts receive **two single-video MP4 exports per calendar month**, resetting on the first day at 00:00 UTC. Sign-in is required; a card and Stripe account setup are not. Previews and editing remain free. Each format exported separately counts as one export. Free outputs retain full resolution, available templates and durations, and have no watermark.

Queued, rendering and completed jobs reserve an export. Failed jobs do not use the monthly allowance; retrying reserves an available export in the month of the retry. Duplicate requests reuse the active job. Deleting a project or job does not restore an already used export. Existing daily render limits, active-job rules, bounded retries and storage retention continue to apply. Unused monthly exports do not roll over.

Nine-video campaign ZIPs require a $29 launch package or Studio. Purchased project access and available paid packages are used before the free allowance, retaining the existing ten-export, 30-day revision window. An active paid project that has used its ten exports retains its existing limit. Free exports do not activate paid project access or consume a purchased package. Billing shows free exports separately from purchased project packages.

Apply every migration through **011_free_tier.sql** before deploying the updated web app and worker. The migration adds durable free usage records, service-only access, atomic queue enforcement and retry protection. Free exports require configured Supabase Auth, private storage and a running render worker. The deliberate `DEMOPOP_BILLING_ENABLED=0` development/free-beta override retains its existing daily-cap behavior; leave billing enabled for the normal free and paid plans.

Pricing, the homepage, creation hints and Billing explain the allowance. At the free limit, edits stay saved and the customer can wait for the reset or choose a paid plan. Payments always require an explicit Checkout action.
