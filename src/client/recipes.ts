import {
  projectAssetIds,
  projectSchema,
  type ProjectInput,
} from "../shared/project";
import type { DraftAssets } from "./drafts";
export type LocalRecipe = {
  id: string;
  scope: string;
  name: string;
  project: ProjectInput;
  assets: DraftAssets;
  updatedAt: number;
};
async function database() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("demopop-recipes", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("recipes", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Recipe storage is unavailable in this browser."));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  task: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("recipes", mode),
        request = task(tx.objectStore("recipes"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () =>
        reject(
          new Error(
            "Recipe storage could not finish. Check available browser storage.",
          ),
        );
    });
  } finally {
    db.close();
  }
}
export async function listLocalRecipes(scope: string) {
  const records = (await transaction("readonly", (store) =>
    store.getAll(),
  )) as LocalRecipe[];
  return records
    .filter((record) => record.scope === scope)
    .map((record) => ({
      ...record,
      project: projectSchema.parse(record.project),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function saveLocalRecipe(recipe: LocalRecipe) {
  const project = projectSchema.parse(recipe.project),
    assets = new Set(projectAssetIds(project));
  return transaction("readwrite", (store) =>
    store.put({
      ...recipe,
      project,
      assets: Object.fromEntries(
        Object.entries(recipe.assets).filter(([id]) => assets.has(id)),
      ),
    }),
  );
}
export async function deleteLocalRecipe(id: string, scope: string) {
  const record = (await transaction("readonly", (store) => store.get(id))) as
    LocalRecipe | undefined;
  if (!record || record.scope !== scope) throw new Error("Recipe not found.");
  return transaction("readwrite", (store) => store.delete(id));
}
