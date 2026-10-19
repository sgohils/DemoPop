"use client";
import { useId } from "react";
import { RotateCcw, Scan } from "lucide-react";
import {
  coverGeometry,
  type Media,
  type ProjectInput,
} from "../shared/project";

type Crop = ProjectInput["afterCrop"];

export function HighlightFocus({
  highlight,
  value,
  baseCrop,
  media,
  format,
  onChange,
  onPreview,
}: {
  highlight: 1 | 2;
  value: Crop | null | undefined;
  baseCrop: Crop;
  media: Media;
  format: ProjectInput["format"];
  onChange: (crop: Crop | null) => void;
  onPreview: () => void;
}) {
  const id = useId();
  const label = highlight === 1 ? "First highlight" : "Second highlight";
  const controlLabel = `Highlight 0${highlight}`;
  // The inset screen at each settled highlight, before its gentle camera drift.
  const wide = format === "landscape";
  const width = highlight === 1 ? (wide ? 1120 : 946) : wide ? 1040 : 946;
  const height = highlight === 1 ? (wide ? 690 : 594) : wide ? 770 : 810;
  const geometry = coverGeometry(media, value || baseCrop, width, height);

  return (
    <fieldset
      className="highlight-focus"
      aria-label={`${controlLabel} framing`}
      onFocusCapture={onPreview}
    >
      <div className="highlight-focus-heading">
        <span>
          <Scan size={13} aria-hidden="true" /> Screenshot focus
        </span>
        <div
          className="highlight-focus-modes"
          role="group"
          aria-label={`${controlLabel} framing mode`}
        >
          <button
            type="button"
            aria-pressed={!value}
            aria-describedby={`${id}-hint`}
            onClick={() => onChange(null)}
          >
            Auto
          </button>
          <button
            type="button"
            aria-pressed={!!value}
            aria-expanded={!!value}
            aria-controls={`${id}-controls`}
            onClick={() => onChange(value || { ...baseCrop })}
          >
            Custom
          </button>
        </div>
      </div>
      <p id={`${id}-hint`} className="highlight-focus-hint">
        {value
          ? "Frame the detail that matches this caption."
          : "Automatic camera framing. Choose Custom to show a specific detail."}
      </p>
      {value && (
        <div id={`${id}-controls`} className="highlight-focus-details">
          <div
            className="highlight-focus-thumbnail"
            style={{ aspectRatio: `${width} / ${height}` }}
          >
            <img
              src={media.src}
              alt={`${label} selected screenshot area`}
              draggable={false}
              style={{
                width: `${(geometry.width / width) * 100}%`,
                height: `${(geometry.height / height) * 100}%`,
                left: `${(geometry.left / width) * 100}%`,
                top: `${(geometry.top / height) * 100}%`,
              }}
            />
            <div className="highlight-focus-guide" aria-hidden="true">
              <span>After screenshot</span>
              <i />
            </div>
          </div>
          <div className="crop-controls highlight-focus-sliders">
            {(["x", "y", "zoom"] as const).map((axis) => {
              const axisLabel =
                axis === "x"
                  ? "Horizontal position"
                  : axis === "y"
                    ? "Vertical position"
                    : "Zoom";
              return (
                <label key={axis}>
                  <span>
                    {axisLabel}
                    <small aria-hidden="true">
                      {Math.round(value[axis] * 100)}%
                    </small>
                  </span>
                  <input
                    type="range"
                    aria-label={`${controlLabel} ${axisLabel.toLowerCase()}`}
                    aria-valuetext={`${Math.round(value[axis] * 100)} percent`}
                    min={axis === "zoom" ? 1 : 0}
                    max={axis === "zoom" ? 2 : 1}
                    step="0.01"
                    value={value[axis]}
                    onChange={(event) =>
                      onChange({ ...value, [axis]: Number(event.target.value) })
                    }
                  />
                </label>
              );
            })}
            <button
              type="button"
              className="text-link"
              onClick={() => onChange(null)}
            >
              <RotateCcw size={12} aria-hidden="true" /> Reset to automatic
            </button>
          </div>
          {geometry.width / media.width > 1.25 && (
            <p className="highlight-focus-quality">
              This crop enlarges your screenshot. Use a larger image or reduce
              zoom for sharper details.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
