/** Breakout: the approved mark, kept identical to draft 04 at every size. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 84 84"
      fill="none"
      stroke="currentColor"
      strokeWidth="12"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-brand-mark="breakout"
    >
      <path d="M34 17H25c-10 0-15 5-15 15v21c0 11 5 16 16 16h21c11 0 16-5 16-16V42" />
      <path d="M47 7h15c9 0 13 4 13 13v13" />
    </svg>
  );
}
