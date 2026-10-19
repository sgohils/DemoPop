import test from "node:test";
import assert from "node:assert/strict";
import { prepareVideoMedia } from "../worker/private-clips";
import {
  launchProject,
  launchMedia,
  type VideoProps,
} from "../src/shared/project";

test("private video inputs use gated loopback URLs with correct byte ranges and cleanup", async () => {
  const bytes = Buffer.from("a verified clip fixture"),
    source = {
      src: `data:video/mp4;base64,${bytes.toString("base64")}`,
      width: 100,
      height: 100,
      kind: "video" as const,
      duration: 2,
    };
  const input: VideoProps = {
    project: launchProject,
    ...launchMedia(),
    sceneMedia: { clip: source, duplicate: source },
  };
  const prepared = await prepareVideoMedia(input),
    url = prepared.props.sceneMedia!.clip.src;
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{48}\/clip-0.mp4$/);
    assert.equal(prepared.props.sceneMedia!.duplicate.src, url);
    const full = await fetch(url);
    assert.equal(full.status, 200);
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
    const range = await fetch(url, { headers: { Range: "bytes=2-7" } });
    assert.equal(range.status, 206);
    assert.equal(
      range.headers.get("Content-Range"),
      `bytes 2-7/${bytes.length}`,
    );
    assert.deepEqual(
      Buffer.from(await range.arrayBuffer()),
      bytes.subarray(2, 8),
    );
    const suffix = await fetch(url, { headers: { Range: "bytes=-4" } });
    assert.deepEqual(
      Buffer.from(await suffix.arrayBuffer()),
      bytes.subarray(-4),
    );
    assert.equal(
      (await fetch(url, { headers: { Range: "bytes=99999-" } })).status,
      416,
    );
    const wrong = new URL(url);
    wrong.pathname = "/wrong/clip-0.mp4";
    assert.equal((await fetch(wrong)).status, 404);
    assert.equal(
      (await fetch(url, { method: "HEAD" })).headers.get("Content-Length"),
      String(bytes.length),
    );
    assert.equal(
      input.sceneMedia!.clip.src,
      source.src,
      "original snapshot media is unchanged",
    );
  } finally {
    await prepared.cleanup();
  }
  await assert.rejects(() => fetch(url));
});
