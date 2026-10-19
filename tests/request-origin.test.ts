import test from "node:test";
import assert from "node:assert/strict";
import {
  isSameOriginRequest,
  requestOrigin,
} from "../src/server/request-origin";

function request(url: string, host: string, origin?: string) {
  const headers = new Headers({ host });
  if (origin) headers.set("origin", origin);
  return { headers, nextUrl: new URL(url) };
}

test("same-origin checks preserve the actual loopback host after Next normalization", () => {
  for (const host of ["localhost:3001", "127.0.0.1:3001", "[::1]:3001"]) {
    const origin = `http://${host}`;
    const req = request(
      "http://localhost:3001/api/website-import",
      host,
      origin,
    );
    assert.equal(requestOrigin(req), origin);
    assert.equal(isSameOriginRequest(req), true);
    req.headers.set("origin", "https://unrelated.example");
    assert.equal(isSameOriginRequest(req), false);
    req.headers.set("origin", "http://localhost:3002");
    assert.equal(isSameOriginRequest(req), false);
    req.headers.delete("origin");
    assert.equal(isSameOriginRequest(req), false);
  }
  const req = request(
    "http://localhost:3001/api",
    "127.0.0.1:3001",
    "http://localhost:3001",
  );
  assert.equal(isSameOriginRequest(req), false);
});

test("origin checks do not trust unrelated hosts or forwarding headers", () => {
  for (const host of [
    "evil.example",
    "localhost:9000",
    "localhost:3001@evil.example",
    "localhost:3001/path",
    "127.999.0.1:3001",
  ]) {
    const req = request(
      "http://localhost:3001/api",
      host,
      "https://evil.example",
    );
    req.headers.set("x-forwarded-host", "evil.example");
    assert.equal(requestOrigin(req), "http://localhost:3001");
    assert.equal(isSameOriginRequest(req), false);
  }
  const req = request(
    "https://demopop.example/api",
    "127.0.0.1:3001",
    "https://demopop.example",
  );
  assert.equal(isSameOriginRequest(req), true);
  assert.equal(requestOrigin(req), "https://demopop.example");
});
