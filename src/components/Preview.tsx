"use client";
import { Player, type PlayerRef } from "@remotion/player";
import { useRef, useState, useEffect, type CSSProperties } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Maximize,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Showcase } from "../video/Showcase";
import { videoScenes } from "../shared/scenes";
import {
  VIDEO,
  FONTS,
  videoSettings,
  type VideoProps,
} from "../shared/project";
export function Preview({
  input,
  compact = false,
  onRetry,
  scenes = false,
  focusFrame,
  pauseWhenOffscreen = false,
  onReady,
}: {
  input: VideoProps;
  compact?: boolean;
  onRetry?: () => void;
  scenes?: boolean;
  focusFrame?: { frame: number; request: number };
  pauseWhenOffscreen?: boolean;
  onReady?: () => void;
}) {
  const ref = useRef<PlayerRef>(null);
  const surface = useRef<HTMLDivElement>(null);
  const initialFrame = input.project.template === "launch" ? 217 : 250;
  const [frame, setFrame] = useState(initialFrame);
  const [muted, setMuted] = useState(false);
  const poster = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const notifiedReady = useRef(false);
  useEffect(() => {
    if (ready && !notifiedReady.current) {
      notifiedReady.current = true;
      onReady?.();
    }
  }, [ready, onReady]);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const dimensions = videoSettings(input.project);
  const duration = dimensions.durationInFrames / VIDEO.fps;
  const handledSceneRequest = useRef<number | undefined>(undefined);
  const timeline = videoScenes(input.project);
  const activeScene = timeline.findIndex(
    (scene) => frame >= scene.start && frame < scene.end,
  );
  useEffect(() => {
    const element = surface.current;
    if (!pauseWhenOffscreen || !element) return;
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) ref.current?.pause();
          })
        : undefined;
    const visibility = () => {
      if (document.hidden) ref.current?.pause();
    };
    observer?.observe(element);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [pauseWhenOffscreen]);
  useEffect(() => {
    if (
      !focusFrame ||
      !ready ||
      handledSceneRequest.current === focusFrame.request
    )
      return;
    handledSceneRequest.current = focusFrame.request;
    poster.current = false;
    ref.current?.pause();
    ref.current?.seekTo(focusFrame.frame);
  }, [focusFrame, ready]);
  useEffect(() => {
    let live = true;
    setReady(false);
    setError("");
    ref.current?.pause();
    const images = [
      input.before.src,
      input.after.src,
      input.logo?.src,
      ...Object.values(input.sceneMedia ?? {})
        .filter((media) => media.kind !== "video")
        .map((media) => media.src),
    ].filter(Boolean) as string[];
    Promise.all([
      ...images.map(
        (src) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () =>
              reject(
                new Error(
                  "A preview image could not be loaded. Try again to refresh it; your edits are still here.",
                ),
              );
            img.src = src;
          }),
      ),
      document.fonts.load(`600 16px "${FONTS[input.project.font].name}"`),
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
  }, [
    input.before.src,
    input.after.src,
    input.logo?.src,
    input.project.font,
    input.sceneMedia,
    retryCount,
  ]);
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
  function togglePlayback() {
    if (
      !playing &&
      (poster.current || frame >= dimensions.durationInFrames - 1)
    ) {
      ref.current?.seekTo(0);
    }
    poster.current = false;
    ref.current?.toggle();
  }
  return (
    <div
      ref={surface}
      className={`preview-unit ${compact ? "compact" : ""} ${input.project.format}`}
      tabIndex={scenes ? 0 : undefined}
      aria-label={
        scenes ? "Video preview. Press Space to play or pause." : undefined
      }
      onKeyDown={(event) => {
        if (
          event.code === "Space" &&
          event.target === event.currentTarget &&
          ready
        ) {
          event.preventDefault();
          togglePlayback();
        }
      }}
    >
      <div
        className="video-shell"
        style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
      >
        <Player
          ref={ref}
          component={Showcase}
          inputProps={input}
          durationInFrames={dimensions.durationInFrames}
          fps={VIDEO.fps}
          compositionWidth={dimensions.width}
          compositionHeight={dimensions.height}
          style={{ width: "100%", height: "100%" }}
          initialFrame={initialFrame}
          clickToPlay={false}
          controls={false}
          loop={false}
          acknowledgeRemotionLicense
        />
        {!ready && (
          <div className="preview-loading" role={error ? "alert" : "status"}>
            <div>
              {error || "Loading your preview…"}
              {error && (
                <button
                  className="button secondary small"
                  onClick={() => {
                    onRetry?.();
                    setRetryCount((value) => value + 1);
                  }}
                >
                  Retry preview
                </button>
              )}
            </div>
          </div>
        )}
        <button
          className="fullscreen"
          disabled={!ready}
          onClick={() => ref.current?.requestFullscreen()}
          aria-label="Full-screen preview"
        >
          <Maximize size={16} />
        </button>
      </div>
      <div className="transport">
        <button
          disabled={!ready}
          onClick={() => {
            poster.current = false;
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
          onClick={togglePlayback}
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
          max={dimensions.durationInFrames - 1}
          value={Math.min(frame, dimensions.durationInFrames - 1)}
          onChange={(e) => {
            poster.current = false;
            ref.current?.pause();
            ref.current?.seekTo(Number(e.target.value));
          }}
        />
        <span>
          {(Math.min(frame, dimensions.durationInFrames - 1) / 30).toFixed(1)}{" "}
          <b>/ {duration}s</b>
        </span>
        {input.project.template === "launch" &&
          input.project.sound === "pulse" && (
            <button
              aria-label={muted ? "Unmute preview" : "Mute preview"}
              title="Preview volume only; exports use the soundtrack setting"
              disabled={!ready}
              onClick={() => {
                if (muted) ref.current?.unmute();
                else ref.current?.mute();
                setMuted(!muted);
              }}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          )}
      </div>
      {scenes && (
        <div className="story-timeline" aria-label="Video scenes">
          <div className="timeline-heading">
            <span>Your story</span>
            <span>
              {timeline[activeScene]?.name || "Closing"}{" "}
              <b>· {duration} seconds</b>
            </span>
          </div>
          <div
            className="scene-track"
            style={{ "--scene-count": timeline.length } as CSSProperties}
          >
            {timeline.map((scene, index) => (
              <button
                key={scene.name}
                disabled={!ready}
                aria-label={`Jump to ${scene.name}`}
                aria-pressed={index === activeScene}
                onClick={() => {
                  poster.current = false;
                  ref.current?.pause();
                  ref.current?.seekTo(scene.preview);
                }}
              >
                <span
                  className={`scene-art scene-art-${index}`}
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                </span>
                <span className="scene-name">{scene.name}</span>
                <span className="scene-time">
                  {(scene.start / 30).toFixed(1).replace(/\.0$/, "")}s
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
