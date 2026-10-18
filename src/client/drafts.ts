import { z } from "zod";
import { projectSchema, type ProjectInput } from "../shared/project";

export const draftProjectSchema = projectSchema.extend({
  name: z.string().max(60),
  opening: z.string().max(70),
  highlight1: z.string().max(48),
  highlight2: z.string().max(48),
  url: z.string().max(80),
  cta: z.string().max(36).default("See it in action."),
});
export type DraftAssets = Record<
  string,
  { blob: Blob; width: number; height: number }
>;
export type Draft = {
  key: string;
  project: ProjectInput;
  assets: DraftAssets;
  updatedAt: number;
};
let database: Promise<IDBDatabase> | undefined;
function open() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("demopop-drafts", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("drafts", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(new Error("Browser draft storage is unavailable."));
    };
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  }));
}
async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("drafts", mode);
    const request = action(tx.objectStore("drafts"));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () =>
      reject(
        new Error(
          "Draft storage could not finish. Your current edits are still here.",
        ),
      );
  });
}
export async function readDraft(key: string): Promise<Draft | null> {
  const value = (await transact("readonly", (s) => s.get(key))) as
    Draft | undefined;
  if (!value) return null;
  const parsed = draftProjectSchema.safeParse(value.project);
  if (!parsed.success || !Number.isFinite(value.updatedAt))
    throw new Error("This browser draft could not be opened.");
  return { ...value, project: parsed.data };
}
export function writeDraft(draft: Draft) {
  // Persist IDs and local image blobs only: never signed URLs or credentials.
  const ids = new Set([
    draft.project.before,
    draft.project.after,
    draft.project.logo,
  ]);
  const assets = Object.fromEntries(
    Object.entries(draft.assets).filter(([id]) => ids.has(id)),
  );
  return transact("readwrite", (s) =>
    s.put({
      ...draft,
      assets,
      project: draftProjectSchema.parse(draft.project),
    }),
  );
}
export function removeDraft(key: string) {
  return transact("readwrite", (s) => s.delete(key));
}
