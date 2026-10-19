"use client";
import { Monitor, Smartphone, Square, Check } from "lucide-react";
import { TEMPLATES, type ProjectInput } from "../shared/project";

export function MotionControls({
  project,
  onChange,
}: {
  project: ProjectInput;
  onChange: <K extends "template" | "format">(
    key: K,
    value: ProjectInput[K],
  ) => void;
}) {
  return (
    <>
      {!project.story && (
        <fieldset className="motion-choices">
          <legend>Motion template</legend>
          <div className="template-choices">
            {TEMPLATES.map((template) => (
              <label
                key={template.id}
                className={`template-choice ${project.template === template.id ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="template"
                  value={template.id}
                  checked={project.template === template.id}
                  onChange={() => onChange("template", template.id)}
                />
                <span
                  className={`template-art template-art-${template.id}`}
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <b>
                    <Check size={10} />
                  </b>
                </span>
                <span>{template.name}</span>
              </label>
            ))}
          </div>
          <p className="section-hint">
            {
              TEMPLATES.find((template) => template.id === project.template)
                ?.description
            }
          </p>
        </fieldset>
      )}
      <fieldset className="format-choices">
        <legend>Video format</legend>
        <div>
          <label className={project.format === "vertical" ? "selected" : ""}>
            <input
              type="radio"
              name="format"
              value="vertical"
              checked={project.format === "vertical"}
              onChange={() => onChange("format", "vertical")}
            />
            <Smartphone size={18} />
            <span>
              Vertical <small>9:16</small>
            </span>
          </label>
          <label className={project.format === "landscape" ? "selected" : ""}>
            <input
              type="radio"
              name="format"
              value="landscape"
              checked={project.format === "landscape"}
              onChange={() => onChange("format", "landscape")}
            />
            <Monitor size={19} />
            <span>
              Landscape <small>16:9</small>
            </span>
          </label>
          <label className={project.format === "square" ? "selected" : ""}>
            <input
              type="radio"
              name="format"
              value="square"
              checked={project.format === "square"}
              onChange={() => onChange("format", "square")}
            />
            <Square size={18} />
            <span>
              Square <small>1:1</small>
            </span>
          </label>
        </div>
      </fieldset>
    </>
  );
}
