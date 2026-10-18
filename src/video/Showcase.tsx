import type { VideoProps } from "../shared/project";
import { Reveal } from "./Reveal";
import { StudioReveal } from "./StudioReveal";
import { Launch } from "./Launch";
import { LaunchAudio } from "./LaunchAudio";

export function Showcase(props: VideoProps) {
  if (props.project.template === "launch")
    return (
      <>
        <Launch {...props} />
        <LaunchAudio project={props.project} />
      </>
    );
  return props.project.format === "vertical" &&
    props.project.template === "reveal" ? (
    <Reveal {...props} />
  ) : (
    <StudioReveal {...props} />
  );
}
