import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

/** A successful bundle is shared; a failed build can be retried by the next job. */
export function createBundleCache(
  build: (directory: string) => Promise<string>,
  rootDirectory = process.cwd(),
) {
  // This is a runtime temporary-output parent, not a directory to deploy.
  const root = path.resolve(/* turbopackIgnore: true */ rootDirectory);
  const prefix = ".render-bundle-";
  const createdDirectories = new Set<string>();
  let current: Promise<string> | undefined;
  let cleaning: Promise<void> | undefined;

  async function removeDirectory(directory: string) {
    const target = path.resolve(directory);
    if (
      !createdDirectories.has(target) ||
      path.dirname(target) !== root ||
      !path.basename(target).startsWith(prefix)
    )
      throw new Error("Unexpected bundle cleanup path");
    await rm(target, { recursive: true, force: true });
    createdDirectories.delete(target);
  }

  function get(): Promise<string> {
    if (cleaning) return cleaning.then(get);
    if (current) return current;
    const attempt = (async () => {
      let directory: string | undefined;
      try {
        directory = await mkdtemp(path.join(root, prefix));
        createdDirectories.add(path.resolve(directory));
        return await build(directory);
      } catch (error) {
        if (directory) {
          try {
            await removeDirectory(directory);
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              "Bundle failed and its temporary output could not be removed.",
              { cause: error },
            );
          }
        }
        throw error;
      }
    })();
    current = attempt;
    // Preserve successful bundles while allowing the next job to retry a failure.
    void attempt.catch(() => {
      if (current === attempt) current = undefined;
    });
    return attempt;
  }

  function cleanup(): Promise<void> {
    if (cleaning) return cleaning;
    const active = current;
    cleaning = (async () => {
      try {
        // Do not remove an output directory while the bundler is writing it.
        await active?.catch(() => {});
        for (const directory of createdDirectories)
          await removeDirectory(directory);
      } finally {
        if (current === active) current = undefined;
        cleaning = undefined;
      }
    })();
    return cleaning;
  }

  return { get, cleanup };
}
