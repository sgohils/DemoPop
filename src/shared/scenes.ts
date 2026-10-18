export const SCENES = [
  { name: "Opening", start: 0, end: 90, preview: 35, detail: "Set the scene" },
  {
    name: "Before",
    start: 90,
    end: 150,
    preview: 120,
    detail: "The starting point",
  },
  {
    name: "Reveal",
    start: 150,
    end: 210,
    preview: 180,
    detail: "Make the change",
  },
  {
    name: "Highlight 01",
    start: 210,
    end: 285,
    preview: 250,
    detail: "Your first detail",
  },
  {
    name: "Highlight 02",
    start: 285,
    end: 375,
    preview: 335,
    detail: "Your second detail",
  },
  {
    name: "Closing",
    start: 375,
    end: 450,
    preview: 410,
    detail: "Leave your mark",
  },
] as const;
export const LAUNCH_SCENES = [
  { name: "Opening", start: 0, end: 54, preview: 24, detail: "The hook" },
  {
    name: "Before",
    start: 54,
    end: 105,
    preview: 77,
    detail: "Break the old pattern",
  },
  {
    name: "Reveal",
    start: 105,
    end: 171,
    preview: 145,
    detail: "Meet the product",
  },
  {
    name: "Highlight 01",
    start: 171,
    end: 255,
    preview: 217,
    detail: "Show the first benefit",
  },
  {
    name: "Highlight 02",
    start: 255,
    end: 354,
    preview: 302,
    detail: "Prove the difference",
  },
  {
    name: "Closing",
    start: 354,
    end: 450,
    preview: 405,
    detail: "Give a clear next step",
  },
] as const;
export function videoScenes(template: string) {
  return template === "launch" ? LAUNCH_SCENES : SCENES;
}
