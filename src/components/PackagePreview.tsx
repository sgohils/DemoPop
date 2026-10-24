"use client";

import {
  Monitor,
  Smartphone,
  Square,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { launchHooks } from "../shared/launch-kit";
import type { ProjectInput } from "../shared/project";

export type PackageSelection = {
  format: ProjectInput["format"];
  hook: number;
};

const formats = [
  { id: "landscape", name: "Landscape", ratio: "16:9", icon: Monitor },
  { id: "vertical", name: "Vertical", ratio: "9:16", icon: Smartphone },
  { id: "square", name: "Square", ratio: "1:1", icon: Square },
] as const;

export function PackagePreview({
  project,
  selection,
  onChange,
  onClose,
  onEditFraming,
}: {
  project: ProjectInput;
  selection: PackageSelection;
  onChange: (selection: PackageSelection) => void;
  onClose: () => void;
  onEditFraming: () => void;
}) {
  const hooks = launchHooks(project);
  return (
    <section className="package-preview" aria-label="Launch package preview">
      <div className="package-preview-heading">
        <div>
          <strong>One campaign. Nine versions.</strong>
          <p>Check each opening and format before you export.</p>
        </div>
        <button type="button" onClick={onClose} className="text-link">
          <X size={13} /> Back to main film
        </button>
      </div>
      <div
        className="package-format-options"
        role="group"
        aria-label="Package preview format"
      >
        {formats.map(({ id, name, ratio, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={selection.format === id}
            aria-label={`Preview ${name.toLowerCase()} package`}
            onClick={() => onChange({ ...selection, format: id })}
          >
            <Icon size={16} /> <span>{name}</span> <small>{ratio}</small>
          </button>
        ))}
      </div>
      <div
        className="package-hook-options"
        role="group"
        aria-label="Package preview opening"
      >
        {hooks.map((hook, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Preview package hook ${index + 1}`}
            aria-pressed={selection.hook === index}
            onClick={() => onChange({ ...selection, hook: index })}
          >
            <small>HOOK 0{index + 1}</small>
            <span>{hook || "Add an opening in Launch kit"}</span>
          </button>
        ))}
      </div>
      <div className="package-preview-footer">
        <span>Live preview · No renders used</span>
        {project.story && (
          <button type="button" className="text-link" onClick={onEditFraming}>
            <SlidersHorizontal size={13} /> Edit {selection.format} framing
          </button>
        )}
      </div>
    </section>
  );
}
