import { useEffect, useState } from "react";
import {
  delayRender,
  continueRender,
  cancelRender,
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
        if (active)
          cancelRender(new Error("The video font could not be loaded."));
      });
    return () => {
      active = false;
      continueRender(handle);
    };
  }, [font, handle]);
  return null;
}
