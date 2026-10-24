import test from "node:test";
import assert from "node:assert/strict";
import {
  billingPath,
  pricingPath,
  safeBillingProject,
  safeCheckoutSession,
} from "../src/shared/billing-context";
import { safeAuthNext } from "../src/shared/auth-next";

const project = "33333333-3333-4333-8333-333333333333";
test("checkout navigation retains only typed local project, plan and session context", () => {
  assert.equal(
    pricingPath({ plan: "studio", projectId: project }),
    `/pricing?plan=studio&project=${project}`,
  );
  assert.equal(
    pricingPath({ plan: "package", projectId: project, canceled: true }),
    `/pricing?canceled=1&plan=package&project=${project}`,
  );
  assert.equal(
    billingPath({ sessionId: "cs_test_purchase", projectId: project }),
    `/billing?session_id=cs_test_purchase&project=${project}`,
  );
  assert.equal(
    pricingPath({ plan: "anything", projectId: "https://foreign.example" }),
    "/pricing",
  );
  assert.equal(
    billingPath({
      sessionId: "https://foreign.example",
      projectId: "../../../private",
    }),
    "/billing",
  );
  for (const invalid of [
    null,
    "",
    "not-a-uuid",
    [project],
    project + "/private",
  ])
    assert.equal(safeBillingProject(invalid), undefined);
  for (const invalid of [
    null,
    "",
    "cs_",
    "cs_test_a?next=https://foreign.example",
    "cs_" + "a".repeat(254),
  ])
    assert.equal(safeCheckoutSession(invalid), undefined);
});

test("auth returns preserve payment confirmation context while rejecting foreign paths and unrecognized parameters", () => {
  const allowed = [
    "/create",
    "/billing",
    "/pricing",
    "/projects",
    `/editor/${project}`,
    pricingPath({ plan: "studio", projectId: project }),
    billingPath({ sessionId: "cs_test_pending", projectId: project }),
  ];
  for (const path of allowed) assert.equal(safeAuthNext(path), path);
  for (const path of [
    "https://foreign.example/billing",
    "//foreign.example/billing",
    "/\\foreign.example/billing",
    "/billing#https://foreign.example",
    "/billing?next=https://foreign.example",
    "/pricing?plan=studio&next=/create",
    "/billing?session_id=cs_test_one&session_id=cs_test_two",
    `/pricing?project=${project}&project=${project}`,
    "/pricing?plan=enterprise",
    "/billing?project=not-a-uuid",
    "/billing?session_id=bad",
    "/editor/new",
    `/editor/${project}?next=bad`,
    "/create?next=/billing",
    "/billing/",
    "/foo/../billing",
    "/%62illing",
    "/billing\n",
    "/billing?project=",
  ])
    assert.equal(safeAuthNext(path), "/projects", path);
  assert.equal(safeAuthNext(undefined), "/projects");
  assert.equal(
    safeAuthNext(["/billing", "/pricing"] as unknown as string),
    "/projects",
  );
});
