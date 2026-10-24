"use client";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  Upload,
  Loader2,
} from "lucide-react";
import {
  coverGeometry,
  defaultCrop,
  sampleAsset,
  type Media,
  type ProjectInput,
  type Story,
  type StoryScene,
} from "../shared/project";
import {
  starterStory,
  storyTimeline,
  storyViewport,
  storyCrop,
} from "../shared/launch-kit";

export function StoryEditor({
  project,
  media,
  onChange,
  onUpload,
  onSeek,
}: {
  project: ProjectInput;
  media: Record<string, Media>;
  onChange: (
    story: Story | null | ((current: Story | null | undefined) => Story | null),
  ) => void;
  onUpload: (file: File) => Promise<{ id: string; media: Media }>;
  onSeek: (frame: number) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const story = project.story;
  const timeline = storyTimeline(project);
  const edit = (
    id: string,
    changes: Partial<StoryScene> | ((scene: StoryScene) => Partial<StoryScene>),
  ) => {
    if (!story) return;
    onChange((current) =>
      current
        ? {
            ...current,
            scenes: current.scenes.map((scene) =>
              scene.id === id
                ? {
                    ...scene,
                    ...(typeof changes === "function"
                      ? changes(scene)
                      : changes),
                  }
                : scene,
            ),
          }
        : null,
    );
  };
  const upload = async (id: string, file?: File) => {
    if (!file || !story) return;
    setBusy(id);
    setError("");
    try {
      const result = await onUpload(file);
      edit(id, { asset: result.id, trimStart: 0 });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const viewport = storyViewport(project.format);
  const formatName =
    project.format === "vertical"
      ? "Vertical"
      : project.format === "landscape"
        ? "Landscape"
        : "Square";
  return (
    <div className="story-builder">
      <div className="kit-segment" role="group" aria-label="Story structure">
        <button
          type="button"
          aria-pressed={!story}
          onClick={() => onChange(null)}
        >
          Reveal film
        </button>
        <button
          type="button"
          aria-pressed={!!story}
          onClick={() => {
            if (!story)
              onChange(
                starterStory(project, [
                  crypto.randomUUID(),
                  crypto.randomUUID(),
                  crypto.randomUUID(),
                ]),
              );
          }}
        >
          Product story
        </button>
      </div>
      <p className="section-hint">
        {story
          ? "Build a real product story with 3–6 screenshots or short clips. Replacing media keeps its caption, framing, and timing."
          : "A before-and-after reveal. Switch to Product story for multiple features and longer videos."}
      </p>
      {story && (
        <>
          <label className="field">
            <span>Story duration</span>
            <select
              value={story.duration}
              onChange={(event) =>
                onChange({
                  ...story,
                  duration: Number(event.target.value) as Story["duration"],
                })
              }
            >
              {[15, 30, 60].map((duration) => (
                <option key={duration} value={duration}>
                  {duration} seconds
                </option>
              ))}
            </select>
          </label>
          <div className="story-cards">
            {story.scenes.map((scene, index) => {
              const source = media[scene.asset] ?? sampleAsset(scene.asset);
              const crop = storyCrop(scene, project.format);
              const geometry = source
                ? coverGeometry(source, crop, viewport.width, viewport.height)
                : null;
              const seek = () => onSeek(timeline.beats[index].preview);
              return (
                <fieldset
                  key={scene.id}
                  className="story-card"
                  aria-label={`Story scene ${index + 1}`}
                  onFocusCapture={seek}
                >
                  <div className="story-card-heading">
                    <button type="button" className="text-link" onClick={seek}>
                      Scene {String(index + 1).padStart(2, "0")}
                    </button>
                    <span>
                      {(
                        (timeline.beats[index].end -
                          timeline.beats[index].start) /
                        30
                      ).toFixed(1)}
                      s
                    </span>
                    <div>
                      <button
                        type="button"
                        aria-label={`Move scene ${index + 1} up`}
                        disabled={index === 0 || !!busy}
                        onClick={() => {
                          const scenes = [...story.scenes];
                          [scenes[index - 1], scenes[index]] = [
                            scenes[index],
                            scenes[index - 1],
                          ];
                          onChange({ ...story, scenes });
                        }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move scene ${index + 1} down`}
                        disabled={index === story.scenes.length - 1 || !!busy}
                        onClick={() => {
                          const scenes = [...story.scenes];
                          [scenes[index + 1], scenes[index]] = [
                            scenes[index],
                            scenes[index + 1],
                          ];
                          onChange({ ...story, scenes });
                        }}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove scene ${index + 1}`}
                        disabled={story.scenes.length <= 3 || !!busy}
                        onClick={() =>
                          onChange({
                            ...story,
                            scenes: story.scenes.filter(
                              (item) => item.id !== scene.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {scene.caption.trim().split(/\s+/).length /
                    ((timeline.beats[index].end - timeline.beats[index].start) /
                      30) >
                    4 && (
                    <p className="section-hint">
                      This caption may read quickly. Shorten the copy or choose
                      a longer story.
                    </p>
                  )}
                  <div
                    className="story-media"
                    style={{
                      aspectRatio: `${viewport.width} / ${viewport.height}`,
                    }}
                  >
                    {source &&
                      geometry &&
                      (source.kind === "video" ? (
                        <video
                          src={source.src}
                          aria-label={`Scene ${index + 1} clip`}
                          ref={(element) => {
                            if (element && element.readyState >= 1)
                              element.currentTime = Math.min(
                                scene.trimStart,
                                Math.max(0, element.duration - 0.1),
                              );
                          }}
                          onLoadedMetadata={(event) => {
                            event.currentTarget.currentTime = Math.min(
                              scene.trimStart,
                              Math.max(0, event.currentTarget.duration - 0.1),
                            );
                          }}
                          muted
                          playsInline
                          preload="metadata"
                          style={{
                            width: `${(geometry.width / viewport.width) * 100}%`,
                            height: `${(geometry.height / viewport.height) * 100}%`,
                            left: `${(geometry.left / viewport.width) * 100}%`,
                            top: `${(geometry.top / viewport.height) * 100}%`,
                          }}
                        />
                      ) : (
                        <img
                          src={source.src}
                          alt={`Scene ${index + 1} screenshot`}
                          style={{
                            width: `${(geometry.width / viewport.width) * 100}%`,
                            height: `${(geometry.height / viewport.height) * 100}%`,
                            left: `${(geometry.left / viewport.width) * 100}%`,
                            top: `${(geometry.top / viewport.height) * 100}%`,
                          }}
                        />
                      ))}
                    <label className="story-replace">
                      {busy === scene.id ? (
                        <Loader2 size={13} className="spin" />
                      ) : (
                        <Upload size={13} />
                      )}{" "}
                      Replace media
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,video/mp4"
                        aria-label={`Replace scene ${index + 1} media`}
                        disabled={!!busy}
                        onChange={(event) => {
                          void upload(scene.id, event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>
                      Scene caption <small>{scene.caption.length}/70</small>
                    </span>
                    <textarea
                      rows={2}
                      maxLength={70}
                      value={scene.caption}
                      aria-label={`Scene ${index + 1} caption`}
                      onChange={(event) =>
                        edit(scene.id, { caption: event.target.value })
                      }
                    />
                  </label>
                  <div className="story-inline-fields">
                    <label className="field">
                      <span>Screen</span>
                      <select
                        value={scene.asset}
                        aria-label={`Scene ${index + 1} screen`}
                        onChange={(event) =>
                          edit(scene.id, {
                            asset: event.target.value,
                            trimStart: 0,
                          })
                        }
                      >
                        {[
                          ...new Set([
                            project.before,
                            project.after,
                            ...story.scenes.map((item) => item.asset),
                          ]),
                        ].map((id, option) => (
                          <option key={id} value={id}>
                            {id === project.after
                              ? "Main after screen"
                              : id === project.before
                                ? "Main before screen"
                                : `Uploaded media ${option - 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Hold</span>
                      <select
                        value={scene.weight}
                        aria-label={`Scene ${index + 1} hold`}
                        onChange={(event) =>
                          edit(scene.id, { weight: Number(event.target.value) })
                        }
                      >
                        {[1, 2, 3, 4, 5].map((weight) => (
                          <option key={weight} value={weight}>
                            {
                              [
                                "Brief",
                                "Short",
                                "Balanced",
                                "Long",
                                "Extra long",
                              ][weight - 1]
                            }
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <details>
                    <summary>
                      Framing{source?.kind === "video" ? " & clip start" : ""}
                    </summary>
                    <p className="section-hint">
                      {formatName} framing
                      {scene.formatCrops?.[project.format]
                        ? " · custom for this format."
                        : " · using shared framing."}{" "}
                      Adjustments here change only the {project.format} video.
                    </p>
                    <div className="crop-controls">
                      {(["x", "y", "zoom"] as const).map((axis) => (
                        <label key={axis}>
                          <span>
                            {axis === "x"
                              ? "Horizontal"
                              : axis === "y"
                                ? "Vertical"
                                : "Zoom"}
                            <small>{Math.round(crop[axis] * 100)}%</small>
                          </span>
                          <input
                            type="range"
                            min={axis === "zoom" ? 1 : 0}
                            max={axis === "zoom" ? 2 : 1}
                            step={0.01}
                            value={crop[axis]}
                            aria-label={`Scene ${index + 1} ${axis}`}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              edit(scene.id, (current) => ({
                                formatCrops: {
                                  ...current.formatCrops,
                                  [project.format]: {
                                    ...storyCrop(current, project.format),
                                    [axis]: value,
                                  },
                                },
                              }));
                            }}
                          />
                        </label>
                      ))}
                      {source?.kind === "video" && (
                        <label>
                          <span>
                            Clip start{" "}
                            <small>{scene.trimStart.toFixed(1)}s</small>
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(0, (source.duration ?? 30) - 0.1)}
                            step={0.1}
                            value={scene.trimStart}
                            aria-label={`Scene ${index + 1} clip start`}
                            onChange={(event) =>
                              edit(scene.id, {
                                trimStart: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                    <div className="kit-actions">
                      <button
                        type="button"
                        className="text-link"
                        aria-label={`Reset scene ${index + 1} ${project.format} framing`}
                        disabled={!scene.formatCrops?.[project.format]}
                        onClick={() =>
                          edit(scene.id, (current) => {
                            const formatCrops = { ...current.formatCrops };
                            delete formatCrops[project.format];
                            return {
                              formatCrops: Object.keys(formatCrops).length
                                ? formatCrops
                                : undefined,
                            };
                          })
                        }
                      >
                        Use shared framing
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        aria-label={`Apply scene ${index + 1} framing to every format`}
                        onClick={() =>
                          edit(scene.id, (current) => ({
                            crop: { ...storyCrop(current, project.format) },
                            formatCrops: undefined,
                          }))
                        }
                      >
                        Apply framing to every format
                      </button>
                    </div>
                  </details>
                </fieldset>
              );
            })}
          </div>
          <button
            type="button"
            className="button secondary small"
            disabled={story.scenes.length >= 6 || !!busy}
            onClick={() =>
              onChange({
                ...story,
                scenes: [
                  ...story.scenes,
                  {
                    id: crypto.randomUUID(),
                    asset: project.after,
                    caption: "A detail worth showing.",
                    crop: { ...defaultCrop },
                    weight: 3,
                    trimStart: 0,
                  },
                ],
              })
            }
          >
            <Plus size={14} /> Add scene
          </button>
          <p className="section-hint">
            PNG, JPEG, WebP or H.264 MP4 · 10 MB each · clips up to 30s. Clip
            sound is muted; the soundtrack is controlled above.
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
