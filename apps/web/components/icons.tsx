/**
 * Line icons in the spirit of SF Symbols: 1.5-2px strokes, rounded caps, drawn
 * on a 24 grid. They inherit colour from `currentColor` so a single icon works
 * on both themes and inside pills.
 */

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  'aria-hidden': true,
});

export function CompassMark({ size = 64, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="none"
        stroke="var(--compass-ring)"
        strokeWidth="2"
      />
      <circle cx="32" cy="32" r="3" fill="var(--ink)" />
      <polygon points="32,6 37,32 32,30 27,32" fill="var(--accent)" />
      <polygon points="32,58 37,32 32,34 27,32" fill="var(--compass-ring)" />
      <polygon points="6,32 32,27 30,32 32,37" fill="var(--compass-ring)" />
      <polygon points="58,32 32,27 34,32 32,37" fill="var(--compass-ring)" />
    </svg>
  );
}

/** Compact monochrome variant for the tab bar and the sidebar. */
export function CompassGlyph({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="32" cy="32" r="4.5" fill="currentColor" />
      <polygon points="32,6 37,32 32,30 27,32" fill="currentColor" />
    </svg>
  );
}

export function BriefingIcon({ size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="5" y="3.5" width="14" height="17" rx="3" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"
        stroke="currentColor"
        strokeWidth={strokeWidth - 0.2}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CompanyIcon({ size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="6" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        d="M8 6V4.5a2 2 0 012-2h4a2 2 0 012 2V6"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

export function ObjectiveIcon({ size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

export function ProjectIcon({ size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M3.5 7a2 2 0 012-2h4l2 2.5h7a2 2 0 012 2V17a2 2 0 01-2 2h-13a2 2 0 01-2-2z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TeamIcon({ size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="16.5" cy="10" r="2.6" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        d="M3.5 19a5.5 5.5 0 0111 0M14.5 19a4.5 4.5 0 016 0"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RiskIcon({ size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 4L21 19.5H3z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M12 10v4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <circle cx="12" cy="16.7" r="1" fill="currentColor" />
    </svg>
  );
}

export function ReportIcon({ size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M4 19V11M10 19V5M16 19v-8M21 19H3"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IntegrationIcon({ size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="6" y="8" width="12" height="10" rx="3" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M9 8V4M15 8V4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon({ size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M4 8h10M18 8h2M4 16h2M10 16h10"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <circle cx="16" cy="8" r="2" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="8" cy="16" r="2" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

export function MoreIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="6" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="18" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function MicIcon({ size = 26, strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={(size * 26) / 22} viewBox="0 0 22 26" fill="none" aria-hidden>
      <rect x="7" y="2" width="8" height="13" rx="4" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        d="M3.5 12a7.5 7.5 0 0015 0"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M11 19.5V23M7.5 23h7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ClockIcon({ size = 12, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M6 3.5V6l1.8 1.2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function WarningTriangle({ size = 16, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={(size * 15) / 16} viewBox="0 0 16 15" fill="none" aria-hidden>
      <path d="M8 1.5L15 13.5H1z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M8 6v3.2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <circle cx="8" cy="11.2" r=".9" fill="currentColor" />
    </svg>
  );
}

export function SmallTriangle({ size = 11 }: IconProps) {
  return (
    <svg width={size} height={(size * 10) / 11} viewBox="0 0 11 10" fill="none" aria-hidden>
      <path d="M5.5 1L10 9H1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Chevron({ size = 14 }: IconProps) {
  return (
    <svg width={(size * 8) / 14} height={size} viewBox="0 0 8 14" fill="none" aria-hidden>
      <path
        d="M1 1l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronDown({ size = 10 }: IconProps) {
  return (
    <svg width={size} height={(size * 6) / 10} viewBox="0 0 10 6" fill="none" aria-hidden>
      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronLeft({ size = 18 }: IconProps) {
  return (
    <svg width={(size * 12) / 20} height={size} viewBox="0 0 12 20" fill="none" aria-hidden>
      <path
        d="M10 2L2 10l8 8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 7.5l3.2 3.2L12 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OfflineIcon({ size = 16, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3.5 8.5a9 9 0 0113 0M6.2 11.4a5.2 5.2 0 017.6 0"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <circle cx="10" cy="14.8" r="1.1" fill="currentColor" />
      <path d="M3 3l14 14" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function GoogleMark({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path
        d="M19.6 10.23c0-.7-.06-1.36-.18-2H10v3.79h5.38a4.6 4.6 0 01-2 3.02v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.31z"
        fill="#4285F4"
      />
      <path
        d="M10 20c2.7 0 4.96-.9 6.62-2.43l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H1.06v2.6A10 10 0 0010 20z"
        fill="#34A853"
      />
      <path
        d="M4.41 11.9a6 6 0 010-3.82v-2.6H1.06a10 10 0 000 9.02l3.35-2.6z"
        fill="#FBBC05"
      />
      <path
        d="M10 3.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87C14.95.99 12.7 0 10 0A10 10 0 001.06 5.48l3.35 2.6C5.2 5.72 7.4 3.96 10 3.96z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function NotionMark({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8.5 16V8.5l7 7V8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
