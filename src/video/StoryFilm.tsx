import {
  AbsoluteFill,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  cancelRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CSSProperties } from "react";
import {
  FONTS,
  VIDEO,
  coverGeometry,
  type Media,
  type VideoProps,
  type ProjectInput,
  resolveStoryMedia,
  hasUsableClipTrim,
  clipPlaybackFrames,
} from "../shared/project";
import { storyTimeline } from "../shared/launch-kit";
import { launchAccent, fitLaunchText, displayVideoUrl } from "./launch-motion";
import { storyOpeningShotBox } from "./story-layout";
import { VideoFont } from "./VideoFont";

const fail = () => {
  try {
    cancelRender(
      new Error(
        "A story asset could not load. Refresh media access and retry.",
      ),
    );
  } catch {}
};
const ease = (frame: number, start: number, end: number) => {
  const t = Math.max(
    0,
    Math.min(1, (frame - start) / Math.max(1, end - start)),
  );
  return t * t * (3 - 2 * t);
};

function Copy({
  text,
  width,
  height,
  size,
  font,
  style,
}: {
  text: string;
  width: number;
  height: number;
  size: number;
  font: ProjectInput["font"];
  style?: CSSProperties;
}) {
  const fit = fitLaunchText(text, width, height, size, 1.06, font);
  return (
    <div
      style={{
        width,
        fontSize: fit.fontSize,
        lineHeight: 1.06,
        fontWeight: 680,
        letterSpacing: -fit.fontSize * 0.035,
        whiteSpace: "pre-line",
        overflowWrap: "anywhere",
        ...style,
      }}
    >
      {fit.text}
    </div>
  );
}

function Shot({
  media,
  crop,
  width,
  height,
  duration,
  trimStart = 0,
}: {
  media: Media;
  crop: ProjectInput["afterCrop"];
  width: number;
  height: number;
  duration: number;
  trimStart?: number;
}) {
  const frame = useCurrentFrame();
  const base = coverGeometry(media, crop, width, height);
  const zoom = 1 + ease(frame, 0, duration) * 0.025;
  const style: CSSProperties = {
    position: "absolute",
    maxWidth: "none",
    width: base.width * zoom,
    height: base.height * zoom,
    left: base.left * zoom + width * 0.5 * (1 - zoom),
    top: base.top * zoom + height * 0.5 * (1 - zoom),
  };
  const clipFrames =
    media.kind === "video"
      ? clipPlaybackFrames(media.duration, trimStart, VIDEO.fps)
      : null;
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        borderRadius: 20,
        background: "#111318",
        boxShadow: "0 35px 90px #00000045, 0 0 0 3px #ffffff38",
        transform: `translateY(${(1 - ease(frame, 0, 16)) * 20}px)`,
      }}
    >
      {media.kind === "video" ? (
        <Loop durationInFrames={clipFrames?.durationInFrames ?? 1}>
          <OffthreadVideo
            src={media.src}
            trimBefore={clipFrames?.trimBefore ?? 0}
            muted
            style={style}
            onError={fail}
          />
        </Loop>
      ) : (
        <Img src={media.src} style={style} maxRetries={0} onImageError={fail} />
      )}
    </div>
  );
}

export function StoryFilm({
  project: p,
  after,
  before,
  logo,
  sceneMedia = {},
}: VideoProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const wide = width > height;
  const square = width === height;
  const margin = wide ? 96 : 72;
  const accent = launchAccent(p.color);
  const timeline = storyTimeline(p);
  const unresolvedScenes = timeline.beats.filter((beat) => {
    const media = resolveStoryMedia(
      beat.asset,
      p.before,
      p.after,
      before,
      after,
      sceneMedia,
    );
    return !media || !hasUsableClipTrim(media, beat.trimStart, VIDEO.fps);
  });
  if (unresolvedScenes.length > 0) fail();
  const resolve = (id: string) => {
    const media = resolveStoryMedia(
      id,
      p.before,
      p.after,
      before,
      after,
      sceneMedia,
    );
    if (!media) {
      fail();
      return after;
    }
    return media;
  };
  const header = (
    <div
      style={{
        position: "absolute",
        top: 44,
        left: margin,
        right: margin,
        display: "flex",
        alignItems: "center",
        gap: 20,
        color: "#c3c7d4",
        fontSize: 23,
        letterSpacing: 0.4,
      }}
    >
      {logo && (
        <Img
          src={logo.src}
          style={{ width: 48, height: 48, objectFit: "contain" }}
          maxRetries={0}
          onImageError={fail}
        />
      )}
      <span>
        {fitLaunchText(
          p.name,
          width - margin * 2 - (logo ? 68 : 0),
          60,
          23,
          1.06,
          p.font,
        ).text.replace(/\n/g, " ")}
      </span>
      <span
        style={{ marginLeft: "auto", width: 32, height: 3, background: accent }}
      />
    </div>
  );
  const entrance = ease(frame, 0, 14);
  const openingShot = storyOpeningShotBox(width, height);
  return (
    <AbsoluteFill
      data-story-frame={frame}
      style={{
        background: "#090b11",
        color: "#f7f8fc",
        fontFamily: `${FONTS[p.font].name}, Arial, sans-serif`,
        overflow: "hidden",
      }}
    >
      <VideoFont key={p.font} font={p.font} />
      {unresolvedScenes.length > 0 && (
        <div
          role="alert"
          style={{
            position: "absolute",
            zIndex: 100,
            top: 104,
            left: "50%",
            transform: "translateX(-50%)",
            width: `min(${width - margin * 2}px, 720px)`,
            padding: "18px 22px",
            border: "1px solid #ffb4a6",
            borderRadius: 12,
            background: "#351b20f2",
            color: "#fff4f1",
            fontSize: 20,
            lineHeight: 1.4,
            boxShadow: "0 14px 44px #0008",
          }}
        >
          <strong style={{ display: "block", marginBottom: 5 }}>
            Some scene media needs attention.
          </strong>
          Restore missing media or move each clip start before its end, then
          preview again.
        </div>
      )}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 90% 100%, ${p.color}28, transparent 60%), linear-gradient(145deg,#171b29,transparent 65%)`,
        }}
      />
      {header}
      {frame < timeline.openingEnd && (
        <AbsoluteFill
          style={{
            padding: `${wide ? 210 : square ? 180 : 300}px ${margin}px 0`,
            opacity: entrance,
          }}
        >
          <div
            style={{
              color: accent,
              fontSize: 20,
              letterSpacing: 4,
              marginBottom: 30,
            }}
          >
            A NEW CHAPTER
          </div>
          <Copy
            text={p.opening}
            width={wide ? 780 : width - margin * 2}
            height={wide ? 430 : square ? 330 : 570}
            size={wide ? 108 : square ? 92 : 118}
            font={p.font}
          />
          <div
            style={{
              position: "absolute",
              left: openingShot.left,
              top: openingShot.top,
            }}
          >
            <Sequence from={0} layout="none">
              <Shot
                media={resolve(timeline.beats[0].asset)}
                crop={timeline.beats[0].crop}
                width={openingShot.width}
                height={openingShot.height}
                duration={timeline.openingEnd}
                trimStart={timeline.beats[0].trimStart}
              />
            </Sequence>
          </div>
        </AbsoluteFill>
      )}
      {timeline.beats.map((beat, index) => (
        <Sequence
          key={beat.id}
          from={beat.start}
          durationInFrames={beat.end - beat.start}
          layout="none"
        >
          <StoryBeat
            caption={beat.caption}
            media={resolve(beat.asset)}
            crop={beat.crop}
            trimStart={beat.trimStart}
            duration={beat.end - beat.start}
            index={index}
            count={timeline.beats.length}
            project={p}
            width={width}
            height={height}
            accent={accent}
          />
        </Sequence>
      ))}
      {frame >= timeline.closingStart && (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            padding: margin,
            textAlign: "center",
            opacity: ease(
              frame,
              timeline.closingStart,
              timeline.closingStart + 18,
            ),
            transform: `translateY(${(1 - ease(frame, timeline.closingStart, timeline.closingStart + 20)) * 20}px)`,
          }}
        >
          <div
            style={{
              color: accent,
              letterSpacing: 4,
              fontSize: 20,
              marginBottom: 36,
            }}
          >
            YOUR NEXT MOVE
          </div>
          <Copy
            text={p.name}
            width={width - margin * 2}
            height={height * 0.32}
            size={wide ? 170 : square ? 130 : 160}
            font={p.font}
          />
          <Copy
            text={p.cta}
            width={width - margin * 2}
            height={height * 0.16}
            size={wide ? 54 : 52}
            font={p.font}
            style={{ color: "#b9bfce", marginTop: 44 }}
          />
          <Copy
            text={displayVideoUrl(p.url)}
            width={width - margin * 2}
            height={100}
            size={32}
            font={p.font}
            style={{ color: accent, marginTop: 34 }}
          />
        </AbsoluteFill>
      )}
      <div
        style={{
          position: "absolute",
          bottom: 32,
          left: margin,
          right: margin,
          height: 2,
          background: "#ffffff18",
        }}
      >
        <div
          style={{
            width: `${Math.min(100, (frame / (timeline.total - 1)) * 100)}%`,
            height: "100%",
            background: accent,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

function StoryBeat({
  caption,
  media,
  crop,
  trimStart,
  duration,
  index,
  count,
  project,
  width,
  height,
  accent,
}: {
  caption: string;
  media: Media;
  crop: ProjectInput["afterCrop"];
  trimStart: number;
  duration: number;
  index: number;
  count: number;
  project: ProjectInput;
  width: number;
  height: number;
  accent: string;
}) {
  const frame = useCurrentFrame();
  const wide = width > height;
  const square = width === height;
  const margin = wide ? 96 : 72;
  const imageWidth = wide ? 1100 : width - margin * 2;
  const imageHeight = wide ? 700 : square ? 530 : 850;
  const opacity = ease(frame, 0, 10);
  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          left: margin,
          top: wide ? 330 : square ? 170 : 275,
          transform: `translateY(${(1 - ease(frame, 0, 16)) * 24}px)`,
        }}
      >
        <div
          style={{
            color: accent,
            fontSize: 22,
            letterSpacing: 3,
            marginBottom: 28,
          }}
        >
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(count).padStart(2, "0")}
        </div>
        <Copy
          text={caption}
          width={wide ? 560 : width - margin * 2}
          height={wide ? 430 : square ? 230 : 430}
          size={wide ? 92 : square ? 76 : 110}
          font={project.font}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: wide ? 745 : margin,
          top: wide ? 210 : square ? 470 : 850,
        }}
      >
        <Shot
          media={media}
          crop={crop}
          width={imageWidth}
          height={imageHeight}
          duration={duration}
          trimStart={trimStart}
        />
      </div>
    </AbsoluteFill>
  );
}
