import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  cancelRender,
} from "remotion";
import {
  FONTS,
  coverGeometry,
  type VideoProps,
  type Media,
  type ProjectInput,
} from "../shared/project";
import { highlightGeometry, revealColors } from "../shared/video-style";
import { fitStudioText, splitPanelGeometry } from "./studio-layout";
import { VideoFont } from "./VideoFont";

const transition = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
const failImage = () => {
  try {
    cancelRender(new Error("A video image could not be loaded."));
  } catch {}
};
const textStyle: CSSProperties = {
  whiteSpace: "pre-line",
  overflowWrap: "anywhere",
};

export function StudioReveal({ project: p, before, after, logo }: VideoProps) {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const wide = width > 1080;
  const colors = revealColors(p.color);
  const wipe = transition(frame, 150, 210);
  const outro = transition(frame, 360, 388);
  const intro = transition(frame, 0, 25);
  const introExit = transition(frame, 43, 63);
  const entrance = transition(frame, 51, 79);
  const visible = transition(frame, 49, 67) * (1 - outro);
  const box = wide
    ? { x: 704, y: 195, width: 1136, height: 639 }
    : { x: 72, y: 412, width: 936, height: 1000 };
  const panel = splitPanelGeometry(box.width, wipe);
  const opening = fitStudioText(
    p.opening,
    wide ? 1570 : 936,
    wide ? 540 : 860,
    wide ? 112 : 100,
    1.08,
  );
  const name = fitStudioText(
    p.name,
    wide ? 1500 : 900,
    wide ? 320 : 540,
    wide ? 116 : 112,
    1.08,
  );
  const url = fitStudioText(p.url, wide ? 1450 : 780, 140, 38, 1.2);
  const shot = (
    media: Media,
    crop: ProjectInput["afterCrop"],
    shotWidth: number,
    highlight = false,
  ) => (
    <Img
      src={media.src}
      maxRetries={0}
      onImageError={failImage}
      style={{
        position: "absolute",
        maxWidth: "none",
        ...(highlight
          ? highlightGeometry(media, crop, shotWidth, box.height, frame)
          : coverGeometry(media, crop, shotWidth, box.height)),
      }}
    />
  );
  const badge = (isSplit: boolean, afterBadge = false): CSSProperties => ({
    position: "absolute",
    bottom: 24,
    left: 24,
    background: afterBadge ? p.color : "#172126",
    color: afterBadge ? colors.outroText : "#fff",
    padding: "12px 18px",
    borderRadius: 100,
    fontSize: 18,
    fontWeight: 750,
    letterSpacing: 2,
    boxShadow: "0 3px 15px #17212622",
    opacity: isSplit ? 1 - transition(frame, 176, 205) : 1,
  });
  const heading = [
    {
      label: "THE STARTING POINT",
      title: "Before the redesign.",
      opacity: 1 - transition(frame, 143, 160),
      offset: transition(frame, 143, 160) * -14,
    },
    {
      label: "THE TRANSFORMATION",
      title: "A shift in perspective.",
      opacity: transition(frame, 150, 168) * (1 - transition(frame, 204, 222)),
      offset: (1 - transition(frame, 150, 168)) * 16,
    },
    {
      label: "THE NEW EXPERIENCE",
      title: "After, with purpose.",
      opacity: transition(frame, 212, 230),
      offset: (1 - transition(frame, 212, 230)) * 16,
    },
  ];
  const captions = [
    {
      label: "A NEW CHAPTER STARTS HERE",
      copy: "The familiar, ready for a fresh perspective.",
      opacity: (1 - transition(frame, 197, 212)) * 0.78,
      offset: 0,
    },
    {
      label: "01 / THE DETAILS",
      copy: p.highlight1,
      opacity: transition(frame, 216, 234) * (1 - transition(frame, 274, 286)),
      offset: (1 - transition(frame, 216, 234)) * 20,
    },
    {
      label: "02 / THE DIFFERENCE",
      copy: p.highlight2,
      opacity: transition(frame, 285, 303),
      offset: (1 - transition(frame, 285, 303)) * 20,
    },
  ];
  return (
    <AbsoluteFill
      style={{
        background: "#f5f3ed",
        color: "#172126",
        fontFamily: `${FONTS[p.font].name}, Arial, sans-serif`,
        overflow: "hidden",
      }}
    >
      <VideoFont key={p.font} font={p.font} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 90% 30%, ${p.color}0d 0%, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 64,
          height: 48,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          borderBottom: "1px solid #17212624",
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 3,
        }}
      >
        <span>THE REDESIGN</span>
        <span style={{ color: colors.accent }}>BEFORE / AFTER</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: wide ? 92 : 72,
          right: 72,
          top: wide ? 240 : 320,
          opacity: 1 - introExit,
          transform: `translateY(${(1 - intro) * 34 - introExit * 20}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            color: colors.accent,
            fontSize: 24,
            fontWeight: 750,
            marginBottom: wide ? 40 : 52,
            ...textStyle,
          }}
        >
          <span
            style={{ width: 38, height: 3, background: p.color, flexShrink: 0 }}
          />
          {p.name}
        </div>
        <div
          style={{
            ...textStyle,
            fontSize: opening.fontSize,
            lineHeight: opening.lineHeight,
            fontWeight: 650,
            letterSpacing: -4,
          }}
        >
          {opening.text}
        </div>
        <div
          style={{
            marginTop: 52,
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 3,
            color: "#59645f",
          }}
        >
          <span>THE WAY IT WAS</span>
          <span style={{ fontSize: 30, color: colors.accent }}>→</span>
          <span>WHAT COMES NEXT</span>
        </div>
      </div>
      <AbsoluteFill style={{ opacity: visible }}>
        <div
          style={{
            position: "absolute",
            left: wide ? 88 : 72,
            top: wide ? 239 : 219,
            width: wide ? 528 : 936,
          }}
        >
          {heading.map((scene) => (
            <div
              key={scene.label}
              style={{
                position: "absolute",
                inset: "0 0 auto",
                opacity: scene.opacity,
                transform: `translateY(${scene.offset}px)`,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  color: colors.accent,
                  fontWeight: 750,
                  letterSpacing: 3,
                  marginBottom: 22,
                }}
              >
                {scene.label}
              </div>
              <div
                style={{
                  fontSize: wide ? 70 : 60,
                  fontWeight: 650,
                  lineHeight: 1.1,
                  letterSpacing: -2.5,
                }}
              >
                {scene.title}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height + 52,
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid #17212624",
            boxShadow: "0 34px 64px -24px #17212638, 0 3px 10px #1721260a",
            background: "#fff",
            transformOrigin: "center center",
            transform: `translateY(${(1 - entrance) * 42}px) scale(${0.975 + entrance * 0.025})`,
          }}
        >
          <div
            style={{
              height: 52,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 20px",
              background: "#fbfaf7",
              borderBottom: "1px solid #17212612",
              position: "relative",
              zIndex: 2,
            }}
          >
            {["#e5b2a9", "#e2d09e", "#b3c8ad"].map((color) => (
              <i
                key={color}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 20,
                  background: color,
                }}
              />
            ))}
            <span
              style={{
                position: "absolute",
                left: 100,
                right: 100,
                textAlign: "center",
                fontSize: 16,
                color: "#69736b",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {p.name}
            </span>
          </div>
          <div
            style={{
              position: "relative",
              height: box.height,
              width: box.width,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            {p.template === "split" ? (
              <>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: Math.max(1, panel.beforeWidth),
                    height: box.height,
                    overflow: "hidden",
                  }}
                >
                  {shot(before, p.beforeCrop, Math.max(1, panel.beforeWidth))}
                  <span style={badge(true)}>BEFORE</span>
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: panel.left,
                    top: 0,
                    width: panel.width,
                    height: box.height,
                    overflow: "hidden",
                  }}
                >
                  {shot(after, p.afterCrop, panel.width, true)}
                  <span style={badge(true, true)}>AFTER</span>
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: panel.left - 2,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    background: "#f5f3ed",
                    opacity: 1 - transition(frame, 195, 210),
                  }}
                />
              </>
            ) : (
              <>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    transform:
                      p.template === "slide"
                        ? `translateX(${-wipe * box.width * 0.12}px)`
                        : undefined,
                  }}
                >
                  {shot(before, p.beforeCrop, box.width)}
                </div>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    overflow: "hidden",
                    ...(p.template === "slide"
                      ? { transform: `translateX(${(1 - wipe) * 100}%)` }
                      : { clipPath: `inset(0 ${100 - wipe * 100}% 0 0)` }),
                  }}
                >
                  {shot(after, p.afterCrop, box.width, true)}
                </div>
                <span
                  style={{
                    ...badge(false),
                    opacity: 1 - transition(frame, 144, 160),
                  }}
                >
                  BEFORE
                </span>
                <span
                  style={{
                    ...badge(false, true),
                    opacity:
                      transition(frame, 201, 219) *
                      (1 - transition(frame, 240, 260)),
                  }}
                >
                  AFTER
                </span>
              </>
            )}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: wide ? 88 : 72,
            top: wide ? 555 : 1538,
            width: wide ? 520 : 936,
          }}
        >
          {captions.map((caption) => {
            const copy = fitStudioText(
              caption.copy,
              wide ? 520 : 936,
              wide ? 245 : 220,
              wide ? 46 : 56,
              1.2,
            );
            return (
              <div
                key={caption.label}
                style={{
                  position: "absolute",
                  inset: "0 0 auto",
                  opacity: caption.opacity,
                  transform: `translateY(${caption.offset}px)`,
                }}
              >
                <div
                  style={{
                    fontSize: 17,
                    letterSpacing: 2.5,
                    color: colors.accent,
                    fontWeight: 750,
                    marginBottom: 22,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <span style={{ width: 24, height: 2, background: p.color }} />
                  {caption.label}
                </div>
                <div
                  style={{
                    ...textStyle,
                    fontSize: copy.fontSize,
                    lineHeight: copy.lineHeight,
                    letterSpacing: -1.2,
                    fontWeight: 600,
                  }}
                >
                  {copy.text}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: p.color,
          color: colors.outroText,
          opacity: outro,
          justifyContent: "center",
          padding: wide ? "110px 100px" : "180px 90px",
          transform: `translateY(${(1 - outro) * 36}px)`,
        }}
      >
        {logo && (
          <Img
            src={logo.src}
            maxRetries={0}
            onImageError={failImage}
            style={{
              width: wide ? 108 : 130,
              height: wide ? 108 : 130,
              objectFit: "contain",
              marginBottom: 38,
              objectPosition: "left center",
            }}
          />
        )}
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 3.5,
            marginBottom: 34,
          }}
        >
          A NEW CHAPTER FOR
        </div>
        <div
          style={{
            ...textStyle,
            fontSize: name.fontSize,
            lineHeight: name.lineHeight,
            fontWeight: 650,
            letterSpacing: -3.5,
          }}
        >
          {name.text}
        </div>
        <div
          style={{
            height: 1,
            background: `${colors.outroText}55`,
            margin: "46px 0 30px",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 30,
            paddingRight: wide ? 20 : 0,
          }}
        >
          <div
            style={{
              ...textStyle,
              fontSize: url.fontSize,
              lineHeight: url.lineHeight,
            }}
          >
            {url.text}
          </div>
          <span style={{ fontSize: 56, fontWeight: 400, flexShrink: 0 }}>
            ↗
          </span>
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          bottom: 50,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 17,
          letterSpacing: 2,
          color: outro > 0.5 ? colors.outroText : "#59665e",
        }}
      >
        <span>THOUGHTFULLY REDESIGNED.</span>
        <span>BEFORE → AFTER</span>
      </div>
    </AbsoluteFill>
  );
}
