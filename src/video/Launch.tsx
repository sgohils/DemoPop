import { useMemo, type CSSProperties } from "react";
import {
  AbsoluteFill,
  Img,
  cancelRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  FONTS,
  type Media,
  type ProjectInput,
  type VideoProps,
} from "../shared/project";
import { fitStudioText } from "./studio-layout";
import { VideoFont } from "./VideoFont";
import {
  LAUNCH_BEATS as BEATS,
  fitLaunchText,
  launchAccent,
  launchProgress as move,
  launchAfterGeometry,
  launchDetailZoom,
  launchShotGeometry,
  displayVideoUrl,
} from "./launch-motion";

const BLACK = "#08090c";
const WHITE = "#f4f4f6";
const LIGHT = "#e9eaee";
const INK = "#14161c";
const copyStyle: CSSProperties = {
  whiteSpace: "pre-line",
  overflowWrap: "anywhere",
};

const imageFailure = () => {
  try {
    cancelRender(
      new Error("A video image could not load. Retry image access."),
    );
  } catch {
    // Remotion records the sanitized error. Its default retry log includes src.
  }
};

type CameraPose = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  zoom: number;
  anchorX: number;
  anchorY: number;
};
type CameraKey = CameraPose & { frame: number };

function cameraAt(frame: number, keys: CameraKey[]): CameraPose {
  // Finish the outgoing caption before moving its product object into the next
  // composition. The drift before each hold is retained in both format tracks.
  const holdUntil: Record<number, number> = {
    43: BEATS.before,
    166: BEATS.highlight1,
    250: BEATS.highlight2,
    346: BEATS.closing,
  };
  const timeline = keys.flatMap((key) =>
    holdUntil[key.frame]
      ? [key, { ...key, frame: holdUntil[key.frame] }]
      : [key],
  );
  const last = timeline[timeline.length - 1];
  if (frame >= last.frame) return last;
  const right = timeline.findIndex((key) => key.frame > frame);
  if (right <= 0) return timeline[0];
  const from = timeline[right - 1];
  const to = timeline[right];
  const progress = move(frame, from.frame, to.frame);
  const pose = { ...from };
  for (const key of Object.keys(from) as (keyof CameraKey)[]) {
    pose[key] = from[key] + (to[key] - from[key]) * progress;
  }
  return pose;
}

/** One physical object carries the edit, including the before/after match cut. */
function ProductScreen({
  before,
  after,
  project,
  pose,
  frame,
  accent,
}: {
  before: Media;
  after: Media;
  project: ProjectInput;
  pose: CameraPose;
  frame: number;
  accent: string;
}) {
  const bezel = 5;
  const width = pose.width - bezel * 2;
  const height = pose.height - bezel * 2;
  const reveal = move(frame, BEATS.reveal, BEATS.reveal + 18);
  const showBefore = frame >= BEATS.before && frame < BEATS.reveal + 18;
  const image = (
    media: Media,
    crop: ProjectInput["afterCrop"],
    isBefore = false,
  ) => {
    const geometry = isBefore
      ? launchShotGeometry(
          media,
          crop,
          width,
          height,
          launchDetailZoom(media, pose.zoom),
          pose.anchorX,
          pose.anchorY,
        )
      : launchAfterGeometry(
          media,
          project,
          width,
          height,
          frame,
          pose.zoom,
          pose.anchorX,
          pose.anchorY,
        );
    return (
      <Img
        src={media.src}
        maxRetries={0}
        onImageError={imageFailure}
        style={{
          position: "absolute",
          maxWidth: "none",
          ...geometry,
          filter: isBefore ? "saturate(0.12) contrast(0.94)" : undefined,
        }}
      />
    );
  };
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 2100 }}>
      <div
        data-launch-screen
        style={{
          position: "absolute",
          left: pose.x,
          top: pose.y,
          width: pose.width,
          height: pose.height,
          borderRadius: 26,
          background:
            "linear-gradient(135deg, #d5d7df 0%, #696c78 9%, #242630 34%, #0b0d13 58%, #787d8b 85%, #b7bdc9 100%)",
          padding: bezel,
          boxSizing: "border-box",
          boxShadow:
            "0 48px 80px -24px #000000b0, 0 1px 1px #ffffff90 inset, 0 -2px 1px #000000 inset",
          transform: `rotateX(${pose.rotateX}deg) rotateY(${pose.rotateY}deg) rotateZ(${pose.rotateZ}deg)`,
          transformOrigin: "center center",
        }}
      >
        <div
          style={{
            position: "relative",
            width,
            height,
            borderRadius: 21,
            overflow: "hidden",
            background: "#111318",
          }}
        >
          {showBefore ? (
            <>
              {image(before, project.beforeCrop, true)}
              <AbsoluteFill
                style={{ clipPath: `inset(0 ${100 - reveal * 100}% 0 0)` }}
              >
                {image(after, project.afterCrop)}
              </AbsoluteFill>
              {frame >= BEATS.reveal && (
                <div
                  style={{
                    position: "absolute",
                    left: `${reveal * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    background: WHITE,
                    boxShadow: `0 0 22px ${accent}`,
                  }}
                />
              )}
            </>
          ) : (
            image(after, project.afterCrop)
          )}
          <AbsoluteFill
            style={{
              borderRadius: 21,
              boxShadow: "0 0 0 1px #ffffff24 inset",
              pointerEvents: "none",
            }}
          />
          <AbsoluteFill
            style={{
              background: `linear-gradient(${116 + pose.rotateY * 2}deg, #ffffff0d, transparent 24%, transparent 77%, #ffffff08)`,
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function KineticCopy({
  text,
  width,
  height,
  size,
  frame,
  start,
  font,
  align = "left",
  style,
}: {
  text: string;
  width: number;
  height: number;
  size: number;
  frame: number;
  start: number;
  font: ProjectInput["font"];
  align?: "left" | "center";
  style?: CSSProperties;
}) {
  const fitted = useMemo(
    () => fitLaunchText(text, width, height, size, 1.04, font),
    [text, width, height, size, font],
  );
  return (
    <div
      data-launch-copy
      data-settled={
        frame >= start + 14 + (fitted.text.split("\n").length - 1) * 2
      }
      style={{
        ...copyStyle,
        width,
        fontSize: fitted.fontSize,
        lineHeight: fitted.lineHeight,
        fontWeight: 680,
        letterSpacing: -fitted.fontSize * 0.035,
        textAlign: align,
        ...style,
      }}
    >
      {fitted.text.split("\n").map((line, index) => {
        const enter = move(frame, start + index * 2, start + 14 + index * 2);
        return (
          <div
            key={index}
            style={{
              overflow: "hidden",
              paddingBottom: "0.09em",
              marginBottom: "-0.09em",
            }}
          >
            <div
              data-launch-line
              style={{
                transform: `translateY(${(1 - enter) * 105}%)`,
                opacity: enter,
              }}
            >
              {line}{" "}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Arrow({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path
        d="M10 38 38 10M10 10h28v28"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DetailLabel({ number, color }: { number: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        color,
        fontSize: 24,
        fontWeight: 550,
        letterSpacing: 1.5,
        marginBottom: 32,
      }}
    >
      <span>{number}</span>
      <span
        style={{ width: 58, height: 1, background: color, opacity: 0.75 }}
      />
    </div>
  );
}

/** One 15-second camera move, two real detail views, and a decisive brand resolve. */
export function Launch({ project: p, before, after, logo }: VideoProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const wide = width > height;
  const accent = launchAccent(p.color);
  const scene =
    frame < BEATS.before
      ? "opening"
      : frame < BEATS.reveal
        ? "before"
        : frame < BEATS.highlight1
          ? "reveal"
          : frame < BEATS.highlight2
            ? "first"
            : frame < BEATS.closing
              ? "second"
              : "closing";
  const lightStage = move(frame, BEATS.highlight2, BEATS.highlight2 + 9);
  const closingMatte = move(frame, BEATS.closing, BEATS.closing + 16);
  const closingEnter = move(frame, BEATS.closing + 6, BEATS.closing + 28);
  const pose = cameraAt(
    frame,
    wide
      ? [
          {
            frame: 0,
            x: 846,
            y: 118,
            width: 1160,
            height: 815,
            rotateX: 4,
            rotateY: -11,
            rotateZ: -2.5,
            zoom: 1.01,
            anchorX: 0.55,
            anchorY: 0.4,
          },
          {
            frame: 43,
            x: 820,
            y: 105,
            width: 1160,
            height: 815,
            rotateX: 3,
            rotateY: -8,
            rotateZ: -1.6,
            zoom: 1.035,
            anchorX: 0.55,
            anchorY: 0.4,
          },
          {
            frame: 66,
            x: 810,
            y: 150,
            width: 1010,
            height: 760,
            rotateX: 0,
            rotateY: 0,
            rotateZ: 0,
            zoom: 1.025,
            anchorX: 0.55,
            anchorY: 0.4,
          },
          {
            frame: 105,
            x: 810,
            y: 145,
            width: 1010,
            height: 760,
            rotateX: 0,
            rotateY: 0,
            rotateZ: 0,
            zoom: 1.04,
            anchorX: 0.55,
            anchorY: 0.4,
          },
          {
            frame: 137,
            x: 250,
            y: 365,
            width: 1420,
            height: 975,
            rotateX: 1,
            rotateY: 0,
            rotateZ: 0,
            zoom: 1,
            anchorX: 0.55,
            anchorY: 0.4,
          },
          {
            frame: 166,
            x: 238,
            y: 355,
            width: 1444,
            height: 990,
            rotateX: 0,
            rotateY: 0,
            rotateZ: 0,
            zoom: 1.01,
            anchorX: 0.55,
            anchorY: 0.4,
          },
          {
            frame: 193,
            x: 808,
            y: 205,
            width: 1130,
            height: 700,
            rotateX: 0,
            rotateY: -3,
            rotateZ: -1,
            zoom: 1.72,
            anchorX: 0.63,
            anchorY: 0.68,
          },
          {
            frame: 250,
            x: 790,
            y: 196,
            width: 1148,
            height: 710,
            rotateX: 0,
            rotateY: -2,
            rotateZ: -0.6,
            zoom: 1.9,
            anchorX: 0.63,
            anchorY: 0.68,
          },
          {
            frame: 275,
            x: 72,
            y: 154,
            width: 1050,
            height: 780,
            rotateX: 0,
            rotateY: 3,
            rotateZ: 0.8,
            zoom: 2.03,
            anchorX: 0.79,
            anchorY: 0.99,
          },
          {
            frame: 346,
            x: 82,
            y: 147,
            width: 1050,
            height: 780,
            rotateX: 0,
            rotateY: 2,
            rotateZ: 0.3,
            zoom: 1.94,
            anchorX: 0.79,
            anchorY: 0.99,
          },
          {
            frame: 373,
            x: 650,
            y: 1000,
            width: 620,
            height: 430,
            rotateX: 25,
            rotateY: 0,
            rotateZ: 0,
            zoom: 1.94,
            anchorX: 0.79,
            anchorY: 0.99,
          },
        ]
      : [
          {
            frame: 0,
            x: 50,
            y: 1050,
            width: 1020,
            height: 800,
            rotateX: 10,
            rotateY: -5,
            rotateZ: -2,
            zoom: 1.015,
            anchorX: 0.56,
            anchorY: 0.4,
          },
          {
            frame: 43,
            x: 48,
            y: 1020,
            width: 1020,
            height: 800,
            rotateX: 7,
            rotateY: -3,
            rotateZ: -1,
            zoom: 1.04,
            anchorX: 0.56,
            anchorY: 0.4,
          },
          {
            frame: 66,
            x: 74,
            y: 742,
            width: 932,
            height: 905,
            rotateX: 0,
            rotateY: 0,
            rotateZ: 0,
            zoom: 1.025,
            anchorX: 0.56,
            anchorY: 0.4,
          },
          {
            frame: 105,
            x: 74,
            y: 736,
            width: 932,
            height: 905,
            rotateX: 0,
            rotateY: 0,
            rotateZ: 0,
            zoom: 1.04,
            anchorX: 0.56,
            anchorY: 0.4,
          },
          {
            frame: 137,
            x: 40,
            y: 666,
            width: 1000,
            height: 990,
            rotateX: 0,
            rotateY: 0,
            rotateZ: 0,
            zoom: 1,
            anchorX: 0.56,
            anchorY: 0.4,
          },
          {
            frame: 166,
            x: 34,
            y: 660,
            width: 1012,
            height: 1002,
            rotateX: 0,
            rotateY: 0,
            rotateZ: 0,
            zoom: 1.01,
            anchorX: 0.56,
            anchorY: 0.4,
          },
          {
            frame: 193,
            x: 62,
            y: 827,
            width: 956,
            height: 604,
            rotateX: 0,
            rotateY: -2,
            rotateZ: -0.6,
            zoom: 1.72,
            anchorX: 0.63,
            anchorY: 0.68,
          },
          {
            frame: 250,
            x: 46,
            y: 813,
            width: 988,
            height: 620,
            rotateX: 0,
            rotateY: -1,
            rotateZ: -0.3,
            zoom: 1.8,
            anchorX: 0.64,
            anchorY: 0.68,
          },
          {
            frame: 275,
            x: 62,
            y: 210,
            width: 956,
            height: 820,
            rotateX: 0,
            rotateY: 3,
            rotateZ: 0.8,
            zoom: 2.02,
            anchorX: 0.82,
            anchorY: 0.99,
          },
          {
            frame: 346,
            x: 70,
            y: 203,
            width: 948,
            height: 820,
            rotateX: 0,
            rotateY: 1,
            rotateZ: 0.3,
            zoom: 1.93,
            anchorX: 0.82,
            anchorY: 0.99,
          },
          {
            frame: 373,
            x: 300,
            y: 1800,
            width: 480,
            height: 360,
            rotateX: 25,
            rotateY: 0,
            rotateZ: 0,
            zoom: 1.93,
            anchorX: 0.82,
            anchorY: 0.99,
          },
        ],
  );
  const closingName = fitLaunchText(
    p.name,
    wide ? 1640 : 810,
    wide ? 280 : 420,
    wide ? 258 : 220,
    1.02,
    p.font,
  );
  const closingCta = fitLaunchText(
    p.cta,
    wide ? 1480 : 810,
    wide ? 125 : 180,
    wide ? 54 : 58,
    1.08,
    p.font,
  );
  const closingUrl = fitStudioText(
    displayVideoUrl(p.url),
    wide ? 1360 : 680,
    wide ? 120 : 160,
    wide ? 36 : 38,
    1.18,
  );
  const brand = fitLaunchText(p.name, wide ? 680 : 810, 80, 25, 1.08, p.font);

  return (
    <AbsoluteFill
      data-launch-frame={frame}
      style={{
        background: BLACK,
        color: WHITE,
        fontFamily: `${FONTS[p.font].name}, Arial, sans-serif`,
        overflow: "hidden",
      }}
    >
      <VideoFont key={p.font} font={p.font} />
      <AbsoluteFill
        style={{
          background: "linear-gradient(145deg, #151720, #08090c 58%, #0d1018)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: height * 0.6,
          left: -width * 0.15,
          width: width * 1.3,
          height: height * 0.7,
          borderRadius: "50%",
          borderTop: "1px solid #ffffff0b",
          background: "linear-gradient(#ffffff03, transparent)",
          transform: "rotate(-8deg)",
        }}
      />

      {/* A mineral matte replaces the dark stage through a clean editorial wipe. */}
      <AbsoluteFill
        style={{
          background: LIGHT,
          clipPath: `inset(0 ${100 - lightStage * 100}% 0 0)`,
        }}
      >
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse at 12% 75%, #ffffff, transparent 68%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: wide ? -430 : -530,
            top: wide ? -540 : -380,
            width: 1540,
            height: 1540,
            borderRadius: "50%",
            border: "1px solid #c4c7d2",
            transform: `rotate(-16deg) translateX(${move(frame, 255, 354) * 20}px)`,
          }}
        />
      </AbsoluteFill>

      {/* The slab keeps its physical continuity while the camera changes focus. */}
      {frame < 374 && (
        <ProductScreen
          before={before}
          after={after}
          project={p}
          pose={pose}
          frame={frame}
          accent={accent}
        />
      )}

      {scene === "opening" && (
        <>
          <div
            style={{
              position: "absolute",
              left: wide ? 104 : 90,
              top: wide ? 84 : 190,
              ...copyStyle,
              color: "#d2d4dd",
              fontSize: brand.fontSize,
              lineHeight: brand.lineHeight,
              fontWeight: 550,
              letterSpacing: -0.3,
            }}
          >
            {brand.text}
          </div>
          <div
            style={{
              position: "absolute",
              left: wide ? 104 : 90,
              top: wide ? 274 : 330,
            }}
          >
            <KineticCopy
              text={p.opening}
              width={wide ? 740 : 810}
              height={wide ? 525 : 600}
              size={wide ? 143 : 166}
              frame={frame}
              start={-15}
              font={p.font}
              style={{ textShadow: "0 5px 36px #08090c55" }}
            />
            <div
              style={{
                marginTop: wide ? 45 : 44,
                width: wide ? 94 : 100,
                height: 2,
                background: accent,
                transformOrigin: "left",
                transform: `scaleX(${0.6 + move(frame, 0, 28) * 0.4})`,
              }}
            />
          </div>
        </>
      )}

      {scene === "before" && (
        <div
          style={{
            position: "absolute",
            left: wide ? 104 : 90,
            top: wide ? 338 : 294,
          }}
        >
          <div
            style={{
              color: "#a5a8b3",
              fontSize: wide ? 21 : 24,
              fontWeight: 500,
              letterSpacing: 1.7,
              marginBottom: 34,
            }}
          >
            THE STARTING POINT
          </div>
          <KineticCopy
            text="Before."
            width={wide ? 640 : 810}
            height={wide ? 240 : 240}
            size={wide ? 182 : 180}
            frame={frame}
            start={50}
            font={p.font}
            style={{ fontWeight: 620 }}
          />
          <div
            style={{
              width: 80,
              height: 1,
              background: "#d3d5dd60",
              marginTop: 42,
            }}
          />
        </div>
      )}

      {scene === "reveal" && (
        <div
          style={{
            position: "absolute",
            left: wide ? 140 : 90,
            top: wide ? 70 : 220,
            width: wide ? 1640 : 810,
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: accent,
              fontSize: wide ? 20 : 25,
              letterSpacing: 1.8,
              fontWeight: 500,
              marginBottom: wide ? 19 : 28,
            }}
          >
            MEET
          </div>
          <KineticCopy
            text={p.name}
            width={wide ? 1640 : 810}
            height={wide ? 230 : 300}
            size={wide ? 210 : 190}
            frame={frame}
            start={wide ? BEATS.reveal + 14 : BEATS.reveal}
            font={p.font}
            align="center"
            style={{ fontWeight: 640 }}
          />
        </div>
      )}

      {scene === "first" && (
        <div
          style={{
            position: "absolute",
            left: wide ? 104 : 90,
            top: wide ? 278 : 225,
          }}
        >
          <DetailLabel number="01" color={accent} />
          <KineticCopy
            text={p.highlight1}
            width={wide ? 650 : 810}
            height={wide ? 480 : 430}
            size={wide ? 122 : 140}
            frame={frame}
            start={wide ? 182 : BEATS.highlight1}
            font={p.font}
          />
        </div>
      )}

      {scene === "second" && (
        <div
          style={{
            position: "absolute",
            left: wide ? 1160 : 90,
            top: wide ? 286 : 1134,
            color: INK,
          }}
        >
          <div
            style={{
              visibility:
                frame >= BEATS.highlight2 + (wide ? 12 : 7)
                  ? "visible"
                  : "hidden",
            }}
          >
            <DetailLabel number="02" color="#626774" />
          </div>
          <KineticCopy
            text={p.highlight2}
            width={wide ? 680 : 810}
            height={wide ? 460 : 340}
            size={wide ? 108 : 128}
            frame={frame}
            start={BEATS.highlight2 + (wide ? 11 : 6)}
            font={p.font}
          />
        </div>
      )}

      {/* A rising matte takes the product into a large, clean brand resolve. */}
      <AbsoluteFill
        style={{
          background: BLACK,
          clipPath: `inset(0 0 ${100 - closingMatte * 100}% 0)`,
        }}
      >
        <AbsoluteFill
          style={{
            background: "linear-gradient(145deg, #171a24, #08090c 64%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: wide ? 64 : 54,
            top: wide ? 62 : 126,
            right: wide ? 64 : 54,
            bottom: wide ? 62 : 126,
            border: "1px solid #ffffff0d",
            borderRadius: 18,
          }}
        />
      </AbsoluteFill>
      {scene === "closing" && frame >= BEATS.closing + 6 && (
        <div
          style={{
            position: "absolute",
            left: wide ? 140 : 90,
            top: wide ? (logo ? 122 : 220) : logo ? 288 : 420,
            width: wide ? 1640 : 810,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            transform: `translateY(${(1 - closingEnter) * 48}px)`,
            opacity: 0.5 + closingEnter * 0.5,
          }}
        >
          {logo && (
            <div
              style={{
                width: wide ? 104 : 132,
                height: wide ? 104 : 132,
                padding: wide ? 15 : 18,
                boxSizing: "border-box",
                borderRadius: wide ? 24 : 30,
                background: WHITE,
                marginBottom: wide ? 30 : 42,
              }}
            >
              <Img
                src={logo.src}
                maxRetries={0}
                onImageError={imageFailure}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          )}
          <div
            style={{
              ...copyStyle,
              width: "100%",
              fontSize: closingName.fontSize,
              lineHeight: closingName.lineHeight,
              fontWeight: 650,
              letterSpacing: -closingName.fontSize * 0.045,
            }}
          >
            {closingName.text}
          </div>
          <div
            style={{
              ...copyStyle,
              width: wide ? 1480 : 810,
              fontSize: closingCta.fontSize,
              lineHeight: closingCta.lineHeight,
              fontWeight: 450,
              letterSpacing: -closingCta.fontSize * 0.025,
              marginTop: wide ? 34 : 48,
              color: "#b5b9c8",
            }}
          >
            {closingCta.text}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: wide ? 25 : 27,
              maxWidth: "100%",
              marginTop: wide ? 53 : 58,
              paddingBottom: 18,
              borderBottom: `1px solid ${accent}80`,
            }}
          >
            <div
              style={{
                ...copyStyle,
                fontSize: closingUrl.fontSize,
                lineHeight: closingUrl.lineHeight,
                fontWeight: 500,
                letterSpacing: -0.5,
              }}
            >
              {closingUrl.text}
            </div>
            <span style={{ color: accent, display: "flex", flexShrink: 0 }}>
              <Arrow size={wide ? 34 : 38} />
            </span>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
}
