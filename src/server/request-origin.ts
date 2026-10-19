type OriginRequest = {
  headers: Pick<Headers, "get">;
  nextUrl: Pick<URL, "origin" | "hostname" | "port" | "protocol">;
};

export function requestOrigin(req: OriginRequest) {
  // NextURL normalizes loopback IPs to localhost. Preserve the browser's exact
  // loopback host so same-origin writes and generated links also work over IPs.
  const host = req.headers.get("host");
  if (
    req.nextUrl.hostname === "localhost" &&
    host &&
    /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d{1,5})?$/i.test(host)
  ) {
    try {
      const origin = new URL(`${req.nextUrl.protocol}//${host}`);
      if (origin.port === req.nextUrl.port) return origin.origin;
    } catch {
      // A malformed Host must never broaden the allowed origin.
    }
  }
  return req.nextUrl.origin;
}

export function isSameOriginRequest(req: OriginRequest) {
  return req.headers.get("origin") === requestOrigin(req);
}
