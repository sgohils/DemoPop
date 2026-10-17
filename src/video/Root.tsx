import React from "react";
import { Composition, registerRoot, staticFile } from "remotion";
import { Reveal } from "./Reveal";
import { VIDEO, sampleProject, sampleMedia } from "../shared/project";
function Root() {
  const media = sampleMedia();
  return (
    <Composition
      id="Reveal"
      component={Reveal}
      {...VIDEO}
      defaultProps={{
        project: sampleProject,
        before: { ...media.before, src: staticFile("sample/before.png") },
        after: { ...media.after, src: staticFile("sample/after.png") },
        logo: null,
      }}
    />
  );
}
registerRoot(Root);
