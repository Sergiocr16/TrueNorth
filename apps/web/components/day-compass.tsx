'use client';

import { usePreferences } from '../lib/preferences';

/**
 * The day as a compass.
 *
 * The needle starts pointing south and swings north as the plan gets done, so
 * the whole day reads as one shape: where the needle is, is how far you are.
 * At north it turns green. The rotation is a CSS transition, which the
 * reduced-motion preference turns off in globals.css.
 */
export function DayCompass({
  done,
  total,
  size = 132,
}: {
  done: number;
  total: number;
  size?: number;
}) {
  const { t } = usePreferences();
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const arrived = total > 0 && done >= total;
  // 180° is south; 0° is north. The needle goes the short way, clockwise.
  const angle = 180 - ratio * 180;
  const needle = arrived ? 'var(--green)' : 'var(--accent)';

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={t.today.progress(done, total)}
    >
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="29" fill="var(--surface)" stroke="var(--compass-ring)" strokeWidth="1.5" />
        {/* Tick marks: the four points strong, the rest faint. */}
        {Array.from({ length: 24 }, (_, i) => {
          const major = i % 6 === 0;
          return (
            <line
              key={i}
              x1="32"
              y1={major ? 5 : 6}
              x2="32"
              y2={major ? 10 : 8}
              stroke={major ? 'var(--ter)' : 'var(--hair)'}
              strokeWidth={major ? 1.6 : 1}
              strokeLinecap="round"
              transform={`rotate(${i * 15} 32 32)`}
            />
          );
        })}
        <text x="32" y="16.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--ter)">
          N
        </text>
        {/* The arc already travelled, from south towards north. */}
        {ratio > 0 ? (
          <path
            d={arc(ratio)}
            fill="none"
            stroke={needle}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.35"
            className="tn-needle"
          />
        ) : null}
        <g className="tn-needle" style={{ transform: `rotate(${angle}deg)`, transformOrigin: '32px 32px' }}>
          <polygon points="32,9 36,32 32,30 28,32" fill={needle} className="tn-needle" />
          <polygon points="32,55 36,32 32,34 28,32" fill="var(--compass-ring)" />
        </g>
        <circle cx="32" cy="32" r="3.2" fill="var(--ink)" />
      </svg>
      <div
        className="tn-tabular absolute inset-x-0 bottom-[14%] text-center text-[13px] font-semibold"
        style={{ color: arrived ? 'var(--green)' : 'var(--sec)' }}
      >
        {done}/{total}
      </div>
    </div>
  );
}

/** Arc from south (180°) clockwise through west up to the needle's angle. */
function arc(ratio: number): string {
  const r = 25;
  const start = 180;
  const end = 180 + ratio * 180;
  const p = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${32 + r * Math.cos(rad)} ${32 + r * Math.sin(rad)}`;
  };
  const large = end - start > 180 ? 1 : 0;
  return `M ${p(start)} A ${r} ${r} 0 ${large} 1 ${p(end)}`;
}

/**
 * The same needle, small enough for a calendar cell: no ticks, no caption,
 * just where the day ended up. South is an empty day; north, a finished one.
 */
export function CompassNeedle({
  done,
  total,
  size = 18,
}: {
  done: number;
  total: number;
  size?: number;
}) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const arrived = total > 0 && done >= total;
  const angle = 180 - ratio * 180;
  const needle = arrived ? 'var(--green)' : 'var(--accent)';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="28" fill="none" stroke="var(--compass-ring)" strokeWidth="4" />
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '32px 32px' }}>
        <polygon points="32,6 39,32 32,29 25,32" fill={needle} />
        <polygon points="32,58 39,32 32,35 25,32" fill="var(--compass-ring)" />
      </g>
      <circle cx="32" cy="32" r="4" fill="var(--ink)" />
    </svg>
  );
}
