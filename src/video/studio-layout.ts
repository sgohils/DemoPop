/** Typography is wrapped before rendering so long copy never pushes into a shot. */
export function fitStudioText(
  text: string,
  width: number,
  height: number,
  preferredSize: number,
  lineHeight = 1.12,
) {
  const paragraphs = text
    .split(/\r?\n/)
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  // A pasted block with many hard returns should still behave like a caption.
  const copy = paragraphs.length > 3 ? [paragraphs.join(" ")] : paragraphs;
  const units = (character: string) => {
    if (/\s/.test(character)) return 0.34;
    if (/[ilI1.,'!:;|]/.test(character)) return 0.34;
    if (/[WM@%]/.test(character)) return 1.06;
    if (/[mw&]/.test(character)) return 0.94;
    if (/[A-Z]/.test(character)) return 0.78;
    if (/[\u0000-\u007f]/.test(character)) return 0.66;
    return 1.12;
  };
  const measure = (part: string) =>
    Array.from(part).reduce((total, character) => total + units(character), 0);
  const wrap = (size: number) => {
    const lines: string[] = [];
    const limit = width / size;
    for (const paragraph of copy) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        if (line && measure(`${line} ${word}`) > limit) {
          lines.push(line.trim());
          line = "";
        }
        for (const character of Array.from(word)) {
          if (line && measure(line + character) > limit) {
            lines.push(line.trim());
            line = "";
          }
          line += character;
        }
        line += " ";
      }
      if (line.trim()) lines.push(line.trim());
    }
    return lines;
  };
  for (let size = preferredSize; size >= 14; size--) {
    const lines = wrap(size);
    if (lines.length * size * lineHeight <= height)
      return { text: lines.join("\n"), fontSize: size, lineHeight };
  }
  return { text: wrap(14).join("\n"), fontSize: 14, lineHeight };
}

/** A continuous expansion of the after panel, with no layout swap at the join. */
export function splitPanelGeometry(width: number, progress: number) {
  const amount = Math.max(0, Math.min(1, progress));
  const left = (width / 2) * (1 - amount);
  return { left, width: width - left, beforeWidth: left };
}
