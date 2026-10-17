"use client";
import { Player, type PlayerRef } from "@remotion/player";
import { useRef, useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Maximize } from "lucide-react";
import { Reveal } from "../video/Reveal";
import { VIDEO, type VideoProps } from "../shared/project";
export function Preview({
  input,
  compact = false,
}: {
  input: VideoProps;
  compact?: boolean;
}) {
  const ref = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(210);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setReady(false);
    setError("");
    ref.current?.pause();
    const images = [input.before.src, input.after.src, input.logo?.src].filter(
      Boolean,
    ) as string[];
    Promise.all([
      ...images.map(
        (src) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () =>
              reject(
                new Error(
                  "A preview image could not load. Reopen the project to refresh private image access.",
                ),
              );
            img.src = src;
          }),
      ),
      document.fonts.load("600 16px Manrope"),
    ])
      .then(() => {
        if (live) setReady(true);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [input.before.src, input.after.src, input.logo?.src]);
  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const update = ({ detail }: { detail: { frame: number } }) =>
      setFrame(detail.frame);
    const play = () => setPlaying(true),
      pause = () => setPlaying(false);
    player.addEventListener("frameupdate", update);
    player.addEventListener("play", play);
    player.addEventListener("pause", pause);
    player.addEventListener("ended", pause);
    return () => {
      player.removeEventListener("frameupdate", update);
      player.removeEventListener("play", play);
      player.removeEventListener("pause", pause);
      player.removeEventListener("ended", pause);
    };
  }, []);
  return (
    <div className={`preview-unit ${compact ? "compact" : ""}`}>
      <div className="video-shell">
        <Player
          ref={ref}
          component={Reveal}
          inputProps={input}
          durationInFrames={VIDEO.durationInFrames}
          fps={VIDEO.fps}
          compositionWidth={VIDEO.width}
          compositionHeight={VIDEO.height}
          style={{ width: "100%", height: "100%" }}
          initialFrame={210}
          clickToPlay={false}
          controls={false}
          loop={false}
          acknowledgeRemotionLicense
        />
        {!ready && (
          <div className="preview-loading" role={error ? "alert" : "status"}>
            {error || "Loading your preview…"}
          </div>
        )}
        <button
          className="fullscreen"
          disabled={!ready}
          onClick={() => ref.current?.requestFullscreen()}
          aria-label="Full screen preview"
        >
          <Maximize size={16} />
        </button>
      </div>
      <div className="transport">
        <button
          disabled={!ready}
          onClick={() => {
            ref.current?.seekTo(0);
            ref.current?.pause();
          }}
          aria-label="Restart"
        >
          <RotateCcw size={16} />
        </button>
        <button
          disabled={!ready}
          className="play-button"
          onClick={() => ref.current?.toggle()}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
        </button>
        <input
          disabled={!ready}
          aria-label="Video position"
          type="range"
          min={0}
          max={449}
          value={frame}
          onChange={(e) => {
            ref.current?.pause();
            ref.current?.seekTo(Number(e.target.value));
          }}
        />
        <span>
          {(frame / 30).toFixed(1)} <b>/ 15s</b>
        </span>
      </div>
    </div>
  );
}
