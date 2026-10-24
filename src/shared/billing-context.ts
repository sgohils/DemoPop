import { z } from "zod";
import { isOffer } from "./billing";

export function safeBillingProject(value: unknown): string | undefined {
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : undefined;
}

export function safeCheckoutSession(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.length <= 256 &&
    /^cs_[A-Za-z0-9_]+$/.test(value)
    ? value
    : undefined;
}

export function pricingPath({
  plan,
  projectId,
  canceled = false,
}: {
  plan?: string;
  projectId?: string | null;
  canceled?: boolean;
} = {}) {
  const query = new URLSearchParams();
  if (canceled) query.set("canceled", "1");
  if (isOffer(plan)) query.set("plan", plan);
  const project = safeBillingProject(projectId);
  if (project) query.set("project", project);
  return `/pricing${query.size ? `?${query}` : ""}`;
}

export function billingPath({
  sessionId,
  projectId,
}: {
  sessionId?: string;
  projectId?: string;
} = {}) {
  const query = new URLSearchParams();
  const session = safeCheckoutSession(sessionId);
  const project = safeBillingProject(projectId);
  if (session) query.set("session_id", session);
  if (project) query.set("project", project);
  return `/billing${query.size ? `?${query}` : ""}`;
}
