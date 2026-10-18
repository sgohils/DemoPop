"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
const COLORS = [
  "#365DDB",
  "#172C25",
  "#A44B32",
  "#8C4CCE",
  "#12151C",
  "#F1E8D5",
];
export function BrandColor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [hex, setHex] = useState(value.toUpperCase());
  const [error, setError] = useState(false);
  useEffect(() => {
    setHex(value.toUpperCase());
    setError(false);
  }, [value]);
  return (
    <div className="brand-color-control">
      <div className="field">
        <span>Brand color</span>
        <div className="color-field">
          <input
            type="color"
            aria-label="Choose brand color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <input
            aria-label="Hex brand color"
            value={hex}
            maxLength={7}
            spellCheck={false}
            aria-invalid={error}
            onChange={(event) => {
              const next = event.target.value.toUpperCase();
              setHex(next);
              setError(false);
              if (/^#[0-9A-F]{6}$/.test(next)) onChange(next);
            }}
            onBlur={() => {
              if (!/^#[0-9A-F]{6}$/.test(hex)) {
                setError(true);
              }
            }}
          />
          <span className="color-preview" style={{ color: value }}>
            Aa
          </span>
        </div>
      </div>
      <div className="color-swatches" aria-label="Suggested brand colors">
        {COLORS.map((color) => (
          <button
            key={color}
            aria-label={`Use ${color}`}
            aria-pressed={value.toUpperCase() === color}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
          >
            {value.toUpperCase() === color && (
              <Check
                size={13}
                color={color === "#F1E8D5" ? "#172C25" : "white"}
              />
            )}
          </button>
        ))}
      </div>
      {error && (
        <p className="field-error" role="status">
          Use a six-digit hex color, such as #365DDB.
        </p>
      )}
    </div>
  );
}
