import React from "react";
import { Composition, registerRoot, staticFile } from "remotion";
import { Showcase } from "./Showcase";
import {
  VIDEO,
  launchProject,
  launchMedia,
  videoSettings,
  projectSchema,
} from "../shared/project";
function Root() {
  const media = launchMedia();
  return (
    <Composition
      id="Reveal"
      component={Showcase}
      {...VIDEO}
      calculateMetadata={({ props }) => {
        const project = projectSchema.parse(props.project);
        return {
          ...videoSettings(project),
          props: { ...props, project },
        };
      }}
      defaultProps={{
        project: launchProject,
        before: {
          ...media.before,
          src: staticFile("sample/launch-before.png"),
        },
        after: { ...media.after, src: staticFile("sample/launch-after.png") },
        logo: null,
      }}
    />
  );
}
registerRoot(Root);
