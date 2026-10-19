import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import http from "node:http";
import https from "node:https";

const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked4.addSubnet(ip, prefix, "ipv4");
for (const [ip, prefix] of [
  ["::", 96],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
  ["2001::", 32],
  ["2002::", 16],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["fec0::", 10],
] as const)
  blocked6.addSubnet(ip, prefix, "ipv6");
export function isPublicAddress(address: string) {
  const family = isIP(address);
  return (
    family !== 0 &&
    !(family === 4 ? blocked4 : blocked6).check(
      address,
      family === 4 ? "ipv4" : "ipv6",
    )
  );
}
export function publicWebUrl(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Use a public HTTP or HTTPS website on its standard port.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !hostname ||
    hostname.toLowerCase() === "localhost" ||
    hostname.toLowerCase().endsWith(".localhost") ||
    hostname.toLowerCase().endsWith(".local") ||
    (isIP(hostname) && !isPublicAddress(hostname))
  )
    throw new Error("Private and local addresses cannot be imported.");
  url.hash = "";
  return url;
}
export async function publicWebResponse(value: string, signal?: AbortSignal) {
  const url = publicWebUrl(value),
    hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicAddress(item.address))
  )
    throw new Error("This website resolves to a private or reserved address.");
  const address = addresses.find((item) => item.family === 4) ?? addresses[0];
  return await new Promise<{
    status: number;
    headers: Record<string, string>;
    body: Buffer;
  }>((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        family: address.family,
        // Pin the validated address for the actual connection, retaining TLS name checks.
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DemoPopCapture/1.0)",
          Accept: "*/*",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let length = 0;
        response.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > 8 * 1024 * 1024) {
            request.destroy(new Error("Website resource is too large."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(response.headers)) {
            if (
              value &&
              ![
                "set-cookie",
                "connection",
                "transfer-encoding",
                "content-length",
              ].includes(key)
            )
              headers[key] = Array.isArray(value) ? value.join(", ") : value;
          }
          resolve({
            status: response.statusCode ?? 502,
            headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    request.setTimeout(8000, () =>
      request.destroy(new Error("Website request timed out.")),
    );
    request.on("error", reject);
    request.end();
  });
}
