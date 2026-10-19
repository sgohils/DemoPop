"use client";
import { useEffect, useState } from "react";
import {
  BookmarkPlus,
  Loader2,
  Trash2,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { projectSchema, type ProjectInput } from "../shared/project";
import type { Draft, DraftAssets } from "../client/drafts";
import {
  deleteLocalRecipe,
  listLocalRecipes,
  saveLocalRecipe,
  type LocalRecipe,
} from "../client/recipes";
type Recipe = {
  id: string;
  name: string;
  project: ProjectInput;
  assets: DraftAssets;
  updatedAt: number;
};
export function RecipeLibrary({
  project,
  assets,
  scope,
  cloud,
  onApply,
}: {
  project: ProjectInput;
  assets: DraftAssets;
  scope: string | null;
  cloud: boolean;
  onApply: (draft: Draft) => Promise<void>;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>([]),
    [name, setName] = useState(project.name),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    setError("");
    setRecipes([]);
    if (!scope) return;
    const load = cloud
      ? fetch("/api/recipes", { cache: "no-store" }).then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);
          return body.recipes.map(
            (recipe: {
              id: string;
              name: string;
              settings: unknown;
              updated_at: string;
            }) => ({
              id: recipe.id,
              name: recipe.name,
              project: projectSchema.parse(recipe.settings),
              assets: {},
              updatedAt: Date.parse(recipe.updated_at),
            }),
          );
        })
      : listLocalRecipes(scope);
    void load
      .then((records) => {
        if (live) setRecipes(records);
      })
      .catch((error) => {
        if (live) setError(error.message);
      });
    return () => {
      live = false;
    };
  }, [scope, cloud, revision]);
  async function mutate(action: "save" | "update" | "delete", id?: string) {
    if (!scope) return;
    setBusy(id || "save");
    setError("");
    setNotice("");
    try {
      const recipeName =
        action === "update"
          ? recipes.find((recipe) => recipe.id === id)?.name || name.trim()
          : name.trim();
      if (action !== "delete" && !recipeName)
        throw new Error("Give your recipe a name.");
      if (action !== "delete") projectSchema.parse(project);
      if (cloud) {
        const response = await fetch(`/api/recipes${id ? `/${id}` : ""}`, {
          method: action === "delete" ? "DELETE" : id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          ...(action !== "delete"
            ? { body: JSON.stringify({ name: recipeName, project }) }
            : {}),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
      } else if (action === "delete") await deleteLocalRecipe(id!, scope);
      else {
        if (!id && recipes.length >= 50)
          throw new Error(
            "This browser can keep up to 50 launch recipes. Remove one first.",
          );
        await saveLocalRecipe({
          id: id || crypto.randomUUID(),
          scope,
          name: recipeName,
          project,
          assets,
          updatedAt: Date.now(),
        } satisfies LocalRecipe);
      }
      setRevision((value) => value + 1);
      setNotice(
        action === "delete"
          ? "Recipe removed."
          : "Recipe saved with its media, story, and framing.",
      );
    } catch (error) {
      setError(
        error instanceof Error && error.name === "ZodError"
          ? "Complete your captions before saving a recipe."
          : (error as Error).message,
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="recipe-library">
      <p className="section-hint">
        Save a repeatable launch. Apply it to this edit, then replace individual
        screens while keeping their captions, framing, and timing.{" "}
        {cloud
          ? "Recipes stay in your account."
          : "Recipes and selected media stay in this browser."}
      </p>
      <label className="field">
        <span>Recipe name</span>
        <input
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!scope}
        />
      </label>
      <button
        className="button secondary small"
        disabled={!scope || !!busy}
        onClick={() => void mutate("save")}
      >
        {busy === "save" ? (
          <Loader2 size={14} className="spin" />
        ) : (
          <BookmarkPlus size={14} />
        )}{" "}
        Save launch recipe
      </button>
      {!scope && (
        <p className="section-hint">Sign in to use account recipes.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="section-hint" role="status">
          {notice}
        </p>
      )}
      <ul className="recipe-list">
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <div>
              <strong>{recipe.name}</strong>
              <small>
                {recipe.project.story?.duration ?? 15}s ·{" "}
                {recipe.project.story
                  ? `${recipe.project.story.scenes.length} scenes`
                  : "Reveal film"}
              </small>
            </div>
            <button
              className="text-link"
              disabled={!!busy}
              aria-label={`Apply recipe ${recipe.name}`}
              onClick={async () => {
                setBusy(recipe.id);
                setError("");
                try {
                  await onApply({
                    key: `recipe:${recipe.id}`,
                    project: recipe.project,
                    assets: recipe.assets,
                    updatedAt: recipe.updatedAt,
                  });
                  setNotice(
                    "Recipe applied. Use Undo to return to your previous edit.",
                  );
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              <ArrowRight size={14} /> Apply
            </button>
            <button
              aria-label={`Update recipe ${recipe.name}`}
              title="Replace with this edit"
              disabled={!!busy}
              onClick={() => void mutate("update", recipe.id)}
            >
              <RefreshCw size={14} />
            </button>
            <button
              aria-label={`Delete recipe ${recipe.name}`}
              disabled={!!busy}
              onClick={() => void mutate("delete", recipe.id)}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
