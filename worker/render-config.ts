export const PREFERRED_RENDER_CONCURRENCY = 2;

export function resolveRenderConcurrency(
  configuredValue: string | undefined,
  cpuCount: number,
): number {
  const cpuLimit = Number.isFinite(cpuCount) ? Math.max(1, Math.floor(cpuCount)) : 1;
  const preferred = Math.min(PREFERRED_RENDER_CONCURRENCY, cpuLimit);

  if (configuredValue === undefined || configuredValue.trim() === "") {
    return preferred;
  }

  const explicit = Number(configuredValue);
  if (!Number.isInteger(explicit) || explicit < 1) {
    return preferred;
  }

  return Math.min(explicit, cpuLimit);
}
