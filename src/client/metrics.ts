export function trackPreview(projectId?: string) {
  // First-party, account-only event. Never include URLs, captions or media.
  void fetch("/api/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "preview_ready",
      ...(projectId ? { projectId } : {}),
    }),
    keepalive: true,
  }).catch(() => {});
}
