// A reviewable production preview without replacing an app's active .next build.
// Uses the normal .env.local configuration, never the browser suite's dummy keys.
process.env.DEMOPOP_LOCAL_PREVIEW = "1";
await import("./browser-server.mjs");
