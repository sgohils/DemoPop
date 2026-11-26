import {
  defaultCrop,
  type ProjectInput,
  type Story,
  type StoryScene,
} from "./project";

export const PACKAGE_FORMATS = ["landscape", "vertical", "square"] as const;
export const PACKAGE_HOOKS = ["original", "product", "benefit"] as const;
export type OutputKind = "video" | "launch-pack";
export function storyViewport(format: ProjectInput["format"]) {
  return format === "landscape"
    ? { width: 1100, height: 700 }
    : { width: 936, height: format === "square" ? 530 : 850 };
}

export function storyCrop(scene: StoryScene, format: ProjectInput["format"]) {
  return scene.formatCrops?.[format] ?? scene.crop;
}

export function launchHooks(project: ProjectInput): string[] {
  // Edited hooks belong to the user and must remain verbatim while typing.
  if (project.hooks) return project.hooks;
  const hooks = [
    project.opening,
    `Meet ${project.name.trim() || "your next big idea"}.`,
    project.story?.scenes.find(
      (scene) => scene.caption.trim() && scene.caption !== project.opening,
    )?.caption || project.highlight1,
  ];
  const alternatives = [
    "A new way forward.",
    "See what happens next.",
    "Your next big move starts here.",
  ];
  const normalize = (hook: string) =>
    hook.trim().replace(/\s+/g, " ").toLowerCase();
  const reserved = new Set(hooks.map(normalize));
  const used = new Set<string>();
  return hooks.map((hook, index) => {
    const key = normalize(hook);
    if (key && !used.has(key)) {
      used.add(key);
      return hook;
    }
    const fallback =
      alternatives.find((copy) => {
        const fallbackKey = normalize(copy);
        const reservedForLater = hooks
          .slice(index + 1)
          .some((later) => normalize(later) === fallbackKey);
        return (
          !used.has(fallbackKey) &&
          (!reserved.has(fallbackKey) || !reservedForLater)
        );
      }) ?? "A fresh perspective starts here.";
    used.add(normalize(fallback));
    return fallback;
  });
}
export function packageVariants(project: ProjectInput) {
  const hooks = launchHooks(project);
  return PACKAGE_FORMATS.flatMap((format) =>
    PACKAGE_HOOKS.map((hook, index) => ({
      name: `${format}-${hook}`,
      project: { ...project, format, opening: hooks[index] },
    })),
  );
}
export function starterStory(
  project: ProjectInput,
  ids: [string, string, string],
): Story {
  return {
    duration: 30,
    scenes: [
      {
        id: ids[0],
        asset: project.after,
        caption: project.highlight1,
        crop: { ...(project.highlight1Crop ?? project.afterCrop) },
        weight: 3,
        trimStart: 0,
      },
      {
        id: ids[1],
        asset: project.after,
        caption: project.highlight2,
        crop: { ...(project.highlight2Crop ?? project.afterCrop) },
        weight: 3,
        trimStart: 0,
      },
      {
        id: ids[2],
        asset: project.after,
        caption: "See the details in action.",
        crop: { ...defaultCrop },
        weight: 3,
        trimStart: 0,
      },
    ],
  };
}
export function storyTimeline(project: ProjectInput) {
  const total = (project.story?.duration ?? 15) * 30;
  const openingEnd = Math.round(total * 0.12);
  const closingStart = Math.round(total * 0.84);
  const scenes: StoryScene[] = project.story?.scenes ?? [
    {
      id: "reveal",
      asset: project.after,
      caption: project.name,
      crop: project.afterCrop,
      weight: 3,
      trimStart: 0,
    },
    {
      id: "highlight1",
      asset: project.after,
      caption: project.highlight1,
      crop: project.highlight1Crop ?? project.afterCrop,
      weight: 3,
      trimStart: 0,
    },
    {
      id: "highlight2",
      asset: project.after,
      caption: project.highlight2,
      crop: project.highlight2Crop ?? project.afterCrop,
      weight: 3,
      trimStart: 0,
    },
  ];
  const weights = scenes.reduce((sum, scene) => sum + scene.weight, 0);
  const minimum = Math.min(
    45,
    Math.floor((closingStart - openingEnd) / scenes.length),
  );
  const flexible = closingStart - openingEnd - minimum * scenes.length;
  let usedWeight = 0;
  const beats = scenes.map((scene, index) => {
    const start =
      openingEnd +
      index * minimum +
      Math.round((flexible * usedWeight) / weights);
    usedWeight += scene.weight;
    const end =
      openingEnd +
      (index + 1) * minimum +
      Math.round((flexible * usedWeight) / weights);
    return {
      ...scene,
      crop: storyCrop(scene, project.format),
      name: `Scene ${String(index + 1).padStart(2, "0")}`,
      start,
      end,
      preview: Math.round((start + end) / 2),
      detail: scene.caption,
    };
  });
  return { total, openingEnd, closingStart, beats };
}
