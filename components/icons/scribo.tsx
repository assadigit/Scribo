export function Scribo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {/* Brand mark — a long, gently curved quill shape tapering to a point */}
        <path
          d="M12 60C8 42 14 26 38 16C48 10 58 8 62 9C58 20 56 32 46 44C38 54 22 60 12 60Z"
          strokeWidth="1.5"
          fill="currentColor"
          fillOpacity="0.06"
        />
        {/* Rachis — the smooth central shaft running from the quill to the tip */}
        <path d="M12 60C26 48 38 28 60 10" strokeWidth="1.6" />
        {/* fine barbs along the lower vane */}
        <path d="M20 50c6-1.4 13-1.6 19 .8" strokeWidth="0.85" />
        <path d="M26 38c7-2 15-2.4 21 .6" strokeWidth="0.85" />
      </g>
    </svg>
  );
}
