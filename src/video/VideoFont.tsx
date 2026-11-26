import { useEffect, useState } from "react";
import {
  delayRender,
  continueRender,
  staticFile,
} from "remotion";
import { FONTS, type ProjectInput } from "../shared/project";

export function VideoFont({ font: key }: { font: ProjectInput["font"] }) {
  const font = FONTS[key];
  const [handle] = useState(() => delayRender("Loading bundled video font"));
  useEffect(() => {
    let active = true;
    const face = new FontFace(font.name, `url(${staticFile(font.file)})`, {
      weight: font.weight,
    });
    face
      .load()
      .then((loaded) => {
        if (!active) return;
        document.fonts.add(loaded);
        continueRender(handle);
      })
      .catch(() => {
        // The composition always declares a system fallback in its font
        // stack. A missing optional local font should not strand an export.
        if (active) continueRender(handle);
      });
    return () => {
      active = false;
      continueRender(handle);
    };
  }, [font, handle]);
  return null;
}
