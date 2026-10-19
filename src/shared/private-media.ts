import type { Media } from "./project";

export type MediaSlot = "before" | "after" | "logo";

// A lifecycle-scoped refresher: disposing invalidates even fetches that ignore
// AbortSignal, so an old asset response can never replace the current image.
export function createMediaRefresher<Slot extends string = MediaSlot>({
  assets,
  fetchMedia,
  onMedia,
  onError,
  onSuccess,
}: {
  assets: Record<Slot, string | null>;
  fetchMedia: (id: string, signal: AbortSignal) => Promise<Media>;
  onMedia: (slot: Slot, id: string, media: Media) => void;
  onError: (error: unknown) => void;
  onSuccess: () => void;
}) {
  const controller = new AbortController();
  let disposed = false;
  let pending: Promise<void> | null = null;
  return {
    refresh() {
      if (disposed) return Promise.resolve();
      if (pending) return pending;
      pending = (async () => {
        const results = await Promise.allSettled(
          (Object.entries(assets) as [Slot, string | null][])
            .filter(([, id]) => id && !id.startsWith("sample-"))
            .map(async ([slot, id]) => {
              const media = await fetchMedia(id!, controller.signal);
              if (!disposed) onMedia(slot, id!, media);
            }),
        );
        if (disposed) return;
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") onError(failure.reason);
        else onSuccess();
      })().finally(() => {
        pending = null;
      });
      return pending;
    },
    dispose() {
      disposed = true;
      controller.abort();
    },
  };
}
