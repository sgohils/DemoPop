import { createHmac, timingSafeEqual } from "node:crypto";

export const STRIPE_API_VERSION = "2025-06-30.basil";

export class BillingError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Keep only the fields needed for narrowly scoped recovery. Provider messages,
// request bodies and credentials must never reach browser responses or logs.
export class StripeRequestError extends BillingError {
  constructor(
    public stripeStatus: number,
    public stripeType?: string,
    public stripeParam?: string,
  ) {
    super(
      503,
      "The payment service could not complete this request. Please try again.",
    );
  }
}
export function billingEnabled() {
  return process.env.DEMOPOP_BILLING_ENABLED !== "0";
}
export function stripeConfigured() {
  return Boolean(
    billingEnabled() &&
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PACKAGE_PRICE_ID &&
    process.env.STRIPE_STUDIO_PRICE_ID &&
    process.env.APP_ORIGIN,
  );
}
export function appOrigin() {
  const url = new URL(process.env.APP_ORIGIN || "");
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new BillingError(
      503,
      "Checkout is temporarily unavailable. Please try again later.",
    );
  return url.origin;
}
// The API version is fixed so Stripe account-default changes do not change
// invoice/subscription shapes beneath an installed application.
export async function stripeRequest(
  path: string,
  fields?: URLSearchParams,
  idempotencyKey?: string,
) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: fields ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(fields
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: fields,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok)
    throw new StripeRequestError(
      response.status,
      typeof body?.error?.type === "string" ? body.error.type : undefined,
      typeof body?.error?.param === "string" ? body.error.param : undefined,
    );
  return body;
}
export function verifyStripeSignature(
  raw: string,
  header: string | null,
  secret: string,
  now = Date.now(),
) {
  if (!header || header.length > 2000) return false;
  const parts = header.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest();
  return parts.some(
    ([key, value]) =>
      key === "v1" &&
      /^[a-f0-9]{64}$/i.test(value || "") &&
      timingSafeEqual(expected, Buffer.from(value, "hex")),
  );
}
export function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string"
  )
    return value.id;
  return null;
}
export async function boundedBody(req: Request, maximum = 1024 * 1024) {
  if (Number(req.headers.get("content-length")) > maximum)
    throw new BillingError(413, "Request too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new BillingError(400, "Request body required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new BillingError(413, "Request too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
