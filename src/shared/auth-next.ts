import {
  billingPath,
  pricingPath,
  safeBillingProject,
  safeCheckoutSession,
} from "./billing-context";
import { isOffer } from "./billing";

export function safeAuthNext(value: string | undefined) {
  // Parse only fixed local routes and allowlisted, typed parameters. This also
  // protects sign-up email links and the auth-confirmation cookie.
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 500 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s]/.test(value)
  )
    return "/projects";
  try {
    const url = new URL(value, "https://demopop.invalid");
    if (
      url.origin !== "https://demopop.invalid" ||
      url.hash ||
      url.pathname !== value.split("?")[0]
    )
      return "/projects";
    if (["/create", "/projects"].includes(url.pathname) && !url.search)
      return url.pathname;
    const editor = url.pathname.match(/^\/editor\/([^/]+)$/);
    if (editor && !url.search && safeBillingProject(editor[1]))
      return `/editor/${safeBillingProject(editor[1])}`;
    const allowed =
      url.pathname === "/pricing"
        ? ["plan", "project"]
        : url.pathname === "/billing"
          ? ["session_id", "project"]
          : [];
    if (!allowed.length) return "/projects";
    for (const key of url.searchParams.keys()) {
      if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
        return "/projects";
    }
    const projectId = url.searchParams.get("project");
    if (projectId !== null && !safeBillingProject(projectId))
      return "/projects";
    if (url.pathname === "/pricing") {
      const plan = url.searchParams.get("plan");
      if (plan !== null && !isOffer(plan)) return "/projects";
      return pricingPath({ plan: plan ?? undefined, projectId });
    }
    const sessionId = url.searchParams.get("session_id");
    if (sessionId !== null && !safeCheckoutSession(sessionId))
      return "/projects";
    return billingPath({
      sessionId: sessionId ?? undefined,
      projectId: projectId ?? undefined,
    });
  } catch {
    return "/projects";
  }
}
