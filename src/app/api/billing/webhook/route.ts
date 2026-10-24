import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireBilling, handleStripeEvent } from "../../../../server/billing";
import {
  BillingError,
  boundedBody,
  verifyStripeSignature,
} from "../../../../server/stripe";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    requireBilling();
    const raw = await boundedBody(req);
    if (
      !verifyStripeSignature(
        raw,
        req.headers.get("stripe-signature"),
        process.env.STRIPE_WEBHOOK_SECRET!,
      )
    )
      return NextResponse.json(
        { error: "Invalid signature." },
        { status: 400 },
      );
    const event = z
      .object({
        id: z.string().startsWith("evt_"),
        type: z.string(),
        data: z.object({ object: z.object({ id: z.string() }) }),
      })
      .parse(JSON.parse(raw));
    await handleStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    // Return a retryable status on processing errors; never acknowledge a lost
    // grant. Do not log payloads, payment data, or credentials.
    console.error("Billing webhook could not be processed");
    return NextResponse.json(
      { error: "Webhook could not be processed." },
      {
        status:
          error instanceof BillingError && error.status === 413 ? 413 : 503,
      },
    );
  }
}
