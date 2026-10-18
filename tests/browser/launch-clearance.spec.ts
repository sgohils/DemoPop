import { expect, test } from "@playwright/test";

test("launch copy clears the moving product across scene entrances and exits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/new");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.waitForFunction(() =>
    Array.from(document.fonts).some(
      (font) => font.family.includes("DM Sans") && font.status === "loaded",
    ),
  );

  const stage = page.locator(".video-shell [data-launch-frame]");
  const position = page.getByRole("slider", { name: "Video position" });
  const heldFrames = [51, 53, 168, 170, 252, 254, 351, 353];
  const entranceFrames = [
    107, 109, 113, 115, 173, 175, 257, 259, 261, 263, 265, 267,
  ];
  const assertClearance = async (frame: number, context: string) => {
    await position.fill(String(frame));
    await expect(stage).toHaveAttribute("data-launch-frame", String(frame));
    const measurements = await stage.evaluate((root) => {
      const screen = root.querySelector("[data-launch-screen]");
      if (!screen) throw new Error("The launch product screen is missing.");
      const screenBox = screen.getBoundingClientRect();
      const lines = Array.from(root.querySelectorAll("[data-launch-line]"))
        .filter((line) => line.textContent?.trim())
        .flatMap((line) => {
          // A block's unused width is not painted copy. Measure its actual text
          // range so this catches visible copy collisions with the moving slab.
          const range = document.createRange();
          range.selectNodeContents(line);
          const rangeBox = range.getBoundingClientRect();
          const textBox = {
            left: rangeBox.left,
            top: rangeBox.top,
            right: rangeBox.right,
            bottom: rangeBox.bottom,
          };
          let ancestor: Element | null = line;
          while (ancestor && root.contains(ancestor)) {
            const style = getComputedStyle(ancestor);
            if (
              Number.parseFloat(style.opacity) === 0 ||
              style.visibility === "hidden" ||
              style.display === "none"
            )
              return [];
            // Masked line entrances are painted only inside their clipping
            // parent. Intersect each clip so hidden entry text is excluded.
            if (/(hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)) {
              const clip = ancestor.getBoundingClientRect();
              textBox.left = Math.max(textBox.left, clip.left);
              textBox.top = Math.max(textBox.top, clip.top);
              textBox.right = Math.min(textBox.right, clip.right);
              textBox.bottom = Math.min(textBox.bottom, clip.bottom);
            }
            ancestor = ancestor.parentElement;
          }
          if (
            textBox.right - textBox.left <= 1 ||
            textBox.bottom - textBox.top <= 1
          )
            return [];
          const width =
            Math.min(textBox.right, screenBox.right) -
            Math.max(textBox.left, screenBox.left);
          const height =
            Math.min(textBox.bottom, screenBox.bottom) -
            Math.max(textBox.top, screenBox.top);
          return [
            {
              text: line.textContent?.trim(),
              overlap: width > 1 && height > 1,
              textBox,
            },
          ];
        });
      return {
        lines,
        screenBox: {
          left: screenBox.left,
          top: screenBox.top,
          right: screenBox.right,
          bottom: screenBox.bottom,
        },
      };
    });
    if (heldFrames.includes(frame))
      expect(
        measurements.lines.length,
        `${context}, frame ${frame}: expected visible copy to be measured`,
      ).toBeGreaterThan(0);
    expect(
      measurements.lines.filter((line) => line.overlap),
      `${context}, frame ${frame}: product bounds ${JSON.stringify(measurements.screenBox)}`,
    ).toEqual([]);
  };

  for (const format of ["Vertical 9:16", "Landscape 16:9"]) {
    await page.getByRole("radio", { name: format, exact: true }).check();
    await page.getByLabel("Project name").fill("Orbit");
    for (const frame of [...heldFrames, ...entranceFrames].sort(
      (a, b) => a - b,
    )) {
      await assertClearance(frame, format);
    }
    await page
      .getByLabel("Project name")
      .fill("Extraordinary system for ambitious creator building tomorrow");
    await assertClearance(170, `${format}, maximum-length name`);
  }
});
