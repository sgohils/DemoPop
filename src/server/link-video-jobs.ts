import { randomBytes } from "node:crypto";

export type LinkVideoStatus =
  "queued" | "capturing" | "preparing" | "rendering" | "completed" | "failed";

export class LinkVideoError extends Error {
  constructor(
    public status: number,
    message: string,
    public projectId?: string,
  ) {
    super(message);
  }
}

export type LocalLinkVideoJob = {
  id: string;
  status: LinkVideoStatus;
  progress: number;
  createdAt: number;
  expiresAt: number;
  directory?: string;
  output?: string;
  error?: string;
};

/** Local previews have one render and a bounded, short-lived output collection. */
export function createLinkVideoJobStore(options?: {
  now?: () => number;
  retention?: number;
  cooldown?: number;
  maxRetained?: number;
  onDrop?: (job: LocalLinkVideoJob) => Promise<void>;
}) {
  const now = options?.now ?? Date.now;
  const retention = options?.retention ?? 45 * 60_000;
  const jobs = new Map<string, LocalLinkVideoJob>();
  let active: string | undefined;
  let reserving = false;
  let requestedAt = -Infinity;

  async function drop(job: LocalLinkVideoJob) {
    jobs.delete(job.id);
    await options?.onDrop?.(job);
  }
  async function prune() {
    for (const job of jobs.values()) {
      if (job.id !== active && job.expiresAt <= now()) await drop(job);
    }
  }
  return {
    prune,
    async reserve() {
      // Reserve synchronously before cleanup yields, so simultaneous requests
      // cannot both enter while an old output is being removed.
      if (active || reserving)
        throw new LinkVideoError(
          429,
          "A video is already being created. Wait for it to finish, then try again.",
        );
      reserving = true;
      try {
        await prune();
        if (now() - requestedAt < (options?.cooldown ?? 15_000))
          throw new LinkVideoError(
            429,
            "Wait a few seconds before creating another video.",
          );
        while (jobs.size >= (options?.maxRetained ?? 4)) {
          const oldest = jobs.values().next().value;
          if (oldest) await drop(oldest);
          else break;
        }
        const job: LocalLinkVideoJob = {
          id: randomBytes(32).toString("hex"),
          status: "queued",
          progress: 0,
          createdAt: now(),
          expiresAt: now() + retention,
        };
        active = job.id;
        requestedAt = now();
        jobs.set(job.id, job);
        return job;
      } finally {
        reserving = false;
      }
    },
    async get(id: string) {
      await prune();
      return /^[a-f0-9]{64}$/.test(id) ? jobs.get(id) : undefined;
    },
    finish(job: LocalLinkVideoJob, error?: string) {
      if (jobs.get(job.id) !== job || active !== job.id) return;
      job.status = error ? "failed" : "completed";
      job.error = error;
      job.progress = error ? job.progress : 1;
      job.expiresAt = now() + retention;
      active = undefined;
    },
  };
}

/** A single HTTP byte range, including suffix ranges used by native players. */
export function videoByteRange(value: string | null, size: number) {
  if (!value) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end = match[1]
    ? match[2]
      ? Math.min(Number(match[2]), size - 1)
      : size - 1
    : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    return null;
  return { start, end, partial: true };
}
