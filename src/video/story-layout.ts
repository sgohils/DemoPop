/** Fit the opening shot into the remaining canvas with a real edge inset. */
export function storyOpeningShotBox(width: number, height: number) {
  const wide = width > height;
  const square = width === height;
  const margin = wide ? 96 : 72;
  const target = wide
    ? { left: 980, top: 220, width: 970, height: 680 }
    : square
      ? { left: margin, top: 590, width: 936, height: 540 }
      : { left: margin, top: 1050, width: 936, height: 650 };
  const availableWidth = Math.max(0, width - target.left - margin);
  const availableHeight = Math.max(0, height - target.top - margin);
  const scale = Math.min(
    1,
    availableWidth / target.width,
    availableHeight / target.height,
  );
  const fittedWidth = target.width * scale;
  return {
    left: wide ? target.left : (width - fittedWidth) / 2,
    top: target.top,
    width: fittedWidth,
    height: target.height * scale,
  };
}
