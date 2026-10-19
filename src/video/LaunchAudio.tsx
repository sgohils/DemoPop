import { Html5Audio, Loop, staticFile } from "remotion";
import type { ProjectInput } from "../shared/project";

/** A locally synthesized score with fixed cue points matching the launch edit. */
export function LaunchAudio({ project }: { project: ProjectInput }) {
  if (project.template !== "launch" || project.sound !== "pulse") return null;
  return (
    <Loop durationInFrames={450}>
      <Html5Audio
        src={staticFile("audio/launch-pulse.wav")}
        durationInFrames={450}
        name="Original launch sound design"
        volume={1}
      />
    </Loop>
  );
}
