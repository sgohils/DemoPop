import {
  AbsoluteFill,
  Img,
  Easing,
  interpolate,
  useCurrentFrame,
  cancelRender,
} from "remotion";
import { coverGeometry, FONTS, type VideoProps } from "../shared/project";
import { VideoFont } from "./VideoFont";
import {
  highlightGeometry,
  mixColor,
  readableTextColor,
  REVEAL_BACKGROUND,
  revealColors,
} from "../shared/video-style";
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const imageFailure = () => {
  try {
    cancelRender(
      new Error(
        "A video image could not be loaded. Refresh its access and try again.",
      ),
    );
  } catch {
    // Remotion stores this sanitized render error before throwing. Avoid logging
    // its default source-bearing retries, which can include private link tokens.
  }
};
const tween = (f: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(f, [a, b], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
export function Reveal({ project: p, before, after, logo }: VideoProps) {
  const f = useCurrentFrame();
  const wipe = tween(f, 150, 210);
  const outro = tween(f, 360, 382);
  const colors = revealColors(p.color);
  const image = (
    media: typeof before,
    crop: typeof p.beforeCrop,
    isAfter = false,
  ) => (
    <Img
      src={media.src}
      maxRetries={0}
      onImageError={imageFailure}
      style={{
        position: "absolute",
        ...(isAfter
          ? highlightGeometry(media, crop, 936, 1050, f)
          : coverGeometry(media, crop, 936, 1050, tween(f, 60, 150, 1, 1.018))),
        maxWidth: "none",
      }}
    />
  );
  const caption = f < 285 ? p.highlight1 : p.highlight2;
  const capStart = f < 285 ? 212 : 287;
  return (
    <AbsoluteFill
      style={{
        fontFamily: `${FONTS[p.font].name}, Arial, sans-serif`,
        background: REVEAL_BACKGROUND,
        color: "#172126",
        overflow: "hidden",
      }}
    >
      <VideoFont key={p.font} font={p.font} />
      <div
        style={{
          position: "absolute",
          top: 72,
          left: 72,
          right: 72,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 23,
          fontWeight: 700,
          letterSpacing: 3,
        }}
      >
        <span>THE REDESIGN</span>
        <span style={{ color: colors.accent }}>01 / REVEAL</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 224,
          opacity: 1 - tween(f, 44, 64),
          transform: `translateY(${tween(f, 0, 22, 35, 0)}px)`,
        }}
      >
        <div
          style={{
            fontSize: 27,
            fontWeight: 650,
            color: colors.accent,
            marginBottom: 35,
            overflowWrap: "anywhere",
          }}
        >
          {p.name}
        </div>
        <div
          style={{
            fontSize: 82,
            fontWeight: 650,
            lineHeight: 1.12,
            letterSpacing: -4,
            whiteSpace: "pre-line",
            overflowWrap: "anywhere",
          }}
        >
          {p.opening}
        </div>
        <div
          style={{
            width: 88,
            height: 7,
            background: p.color,
            marginTop: 55,
            transformOrigin: "left",
            transform: `scaleX(${tween(f, 10, 34)})`,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 229,
          opacity: tween(f, 48, 66) * (1 - outro),
          transform: `translateY(${tween(f, 48, 76, 90, 0)}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 30,
          }}
        >
          <span style={{ fontSize: 48, fontWeight: 650, letterSpacing: -2 }}>
            {f < 150
              ? "The starting point."
              : f < 210
                ? "Make room for change."
                : "A new perspective."}
          </span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              padding: "12px 22px",
              borderRadius: 50,
              color: f < 180 ? "#555" : colors.badgeText,
              background: f < 180 ? "#e7e5df" : colors.badgeBackground,
            }}
          >
            {f < 180 ? "BEFORE" : "AFTER"}
          </span>
        </div>
        <div
          style={{
            borderRadius: 20,
            overflow: "hidden",
            background: "white",
            boxShadow: "0 32px 65px #17212620",
            border: "2px solid #deded7",
          }}
        >
          <div
            style={{
              height: 64,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              padding: "0 23px",
              gap: 9,
              borderBottom: "1px solid #eee",
            }}
          >
            {["#e7b4ab", "#e5d4a0", "#b7cdb4"].map((c) => (
              <i
                key={c}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 20,
                  background: c,
                }}
              />
            ))}
            <span
              style={{
                fontSize: 18,
                color: "#65716f",
                margin: "auto",
                paddingRight: 60,
              }}
            >
              A website, reimagined
            </span>
          </div>
          <div
            style={{
              height: 1050,
              width: 936,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {image(before, p.beforeCrop)}
            <div
              style={{
                position: "absolute",
                inset: 0,
                clipPath: `inset(0 ${100 - wipe * 100}% 0 0)`,
              }}
            >
              {image(after, p.afterCrop, true)}
            </div>
            {f >= 150 && f < 210 && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${wipe * 100}%`,
                  width: 5,
                  background: p.color,
                  boxShadow: `0 0 30px ${p.color}80`,
                }}
              />
            )}
          </div>
        </div>
        <div
          style={{
            marginTop: 50,
            minHeight: 160,
            opacity: f >= 210 ? tween(f, capStart, capStart + 16) : 0.65,
            transform: `translateY(${f >= 210 ? tween(f, capStart, capStart + 18, 16, 0) : 0}px)`,
          }}
        >
          <div
            style={{
              fontSize: 20,
              letterSpacing: 3,
              color: colors.accent,
              fontWeight: 700,
              marginBottom: 17,
            }}
          >
            {f < 210
              ? "A FAMILIAR START"
              : f < 285
                ? "01 / CLARITY"
                : "02 / CONNECTION"}
          </div>
          <div
            style={{
              fontSize: 49,
              lineHeight: 1.2,
              letterSpacing: -1.5,
              fontWeight: 600,
              overflowWrap: "anywhere",
            }}
          >
            {f < 210 ? "Good work deserves a great website." : caption}
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: p.color,
          opacity: outro,
          color: colors.outroText,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 90,
          transform: `translateY(${(1 - outro) * 70}px)`,
        }}
      >
        {logo && (
          <Img
            src={logo.src}
            maxRetries={0}
            onImageError={imageFailure}
            style={{
              width: 140,
              height: 140,
              objectFit: "contain",
              marginBottom: 45,
            }}
          />
        )}
        <div
          style={{
            fontSize: 23,
            letterSpacing: 4,
            marginBottom: 44,
          }}
        >
          A NEW CHAPTER FOR
        </div>
        <div
          style={{
            fontSize: p.name.length > 30 ? 70 : 100,
            lineHeight: 1.08,
            letterSpacing: -4,
            fontWeight: 650,
            overflowWrap: "anywhere",
          }}
        >
          {p.name}
        </div>
        <div
          style={{
            height: 2,
            background: `${colors.outroText}55`,
            margin: "64px 0 35px",
          }}
        />
        <div
          style={{ fontSize: 36, lineHeight: 1.4, overflowWrap: "anywhere" }}
        >
          {p.url}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 72,
          right: 72,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 20,
          letterSpacing: 2,
          color:
            outro > 0.5
              ? readableTextColor(mixColor(REVEAL_BACKGROUND, p.color, outro))
              : "#6b7574",
        }}
      >
        <span>THOUGHTFULLY REDESIGNED.</span>
        <span>BEFORE → AFTER</span>
      </div>
    </AbsoluteFill>
  );
}
