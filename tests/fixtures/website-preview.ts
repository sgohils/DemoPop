import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createCloudLinkVideo } from "../../src/server/link-video";
import { projectAssetIds, projectSchema } from "../../src/shared/project";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fixture";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture";
process.env.DEMOPOP_BILLING_ENABLED = "1";
const owner = randomUUID(),
  projectId = randomUUID();
const requests: string[] = [];
const assets: { id: string; owner_id: string; path: string }[] = [];
let saved: { owner_id: string; settings: unknown } | undefined;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  requests.push(url.pathname);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  if (url.pathname === "/rest/v1/rpc/consume_request_limit") return json(true);
  if (url.pathname === "/rest/v1/funnel_events")
    return new Response(null, { status: 201 });
  if (url.pathname.startsWith("/storage/v1/object/inputs/"))
    return json({ Key: url.pathname });
  if (url.pathname === "/rest/v1/assets") {
    assets.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 201 });
  }
  if (url.pathname === "/rest/v1/projects") {
    saved = JSON.parse(String(init?.body));
    return json({ id: projectId }, 201);
  }
  throw new Error(`Unexpected service request: ${url.pathname}`);
};
const png = await sharp({
  create: { width: 600, height: 800, channels: 3, background: "#445566" },
})
  .png()
  .toBuffer();
let captures = 0;
const services = {
  owner: async () => owner,
  capture: async () => {
    captures++;
    return {
      url: "https://example.com",
      name: "Example",
      opening: "A useful product.",
      color: "#445566",
      font: "manrope" as const,
      cta: "Try it",
      logo: null,
      captures: ["Desktop", "Feature", "Mobile"].map((name) => ({
        name,
        caption: name,
        image: `data:image/png;base64,${png.toString("base64")}`,
      })),
    };
  },
};
const result = await createCloudLinkVideo(
  {
    url: "https://example.com",
    format: "vertical",
    duration: 30,
    previewOnly: true,
    goal: "feature",
  },
  services,
);
assert.equal(result.status, "draft");
assert.equal(result.projectId, projectId);
assert.equal(captures, 1);
assert.equal(saved?.owner_id, owner);
const project = projectSchema.parse(saved?.settings);
assert.equal(project.format, "vertical");
assert.equal(project.opening, "Example. A closer look.");
assert.equal(assets.length, 3);
assert.deepEqual(
  new Set(projectAssetIds(project)),
  new Set(assets.map((asset) => asset.id)),
);
assert.ok(
  assets.every(
    (asset) => asset.owner_id === owner && asset.path.startsWith(`${owner}/`),
  ),
);
assert.ok(
  !requests.some((path) => /billing_|project_access|enqueue/.test(path)),
  "A preview must not read or consume purchased access or queue a render",
);
await assert.rejects(
  createCloudLinkVideo(
    {
      url: "https://example.com",
      format: "landscape",
      duration: 30,
      previewOnly: true,
    },
    {
      ...services,
      owner: async () => {
        throw new Error("Sign in required");
      },
    },
  ),
);
assert.equal(captures, 1, "Authentication happens before capture");
