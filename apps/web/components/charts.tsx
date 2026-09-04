'use client';

import { useId, type ReactNode } from 'react';

/**
 * The charts Reports is made of.
 *
 * Three rules they all follow:
 *
 * - **One scale.** Every mark, tick and label is placed by the same scale, and
 *   every label names a value the chart actually reaches. No second y-axis.
 * - **Never colour alone.** Two series are told apart by dash pattern as well
 *   as hue, and each is named in the legend, so the chart survives colourblind
 *   readers, greyscale printing and forced-colours mode.
 * - **Colour from the theme tokens**, so the same component reads correctly on
 *   the light ground and on the black one.
 *
 * Each chart also renders a visually hidden table, which is the accessible
 * alternative and doubles as the thing a screen reader reads out.
 */

export interface Series {
  /** Named in the legend; never identified by colour alone. */
  label: string;
  /** A CSS colour, normally a var(--token). */
  color: string;
  points: { x: number; y: number }[];
  dashed?: boolean;
  /** Draw an emphasised dot on the final point. */
  endpoint?: boolean;
  /** Short label drawn beside the endpoint. */
  endpointLabel?: string;
}

interface LineChartProps {
  series: Series[];
  /** Domain of the shared scale. Both axes are explicit, never inferred. */
  xDomain: [number, number];
  yDomain: [number, number];
  xTicks?: { at: number; label: string }[];
  /** A horizontal reference line, e.g. a target. */
  reference?: { at: number; label: string; color: string };
  /** Vertical connector between two series at one x, e.g. the gap. */
  gapAt?: { x: number; from: number; to: number; label: string; color: string };
  height?: number;
  caption?: ReactNode;
  title: string;
}

const PAD = { top: 20, right: 12, bottom: 20, left: 10 };

export function LineChart({
  series,
  xDomain,
  yDomain,
  xTicks = [],
  reference,
  gapAt,
  height = 132,
  caption,
  title,
}: LineChartProps) {
  const id = useId();
  const width = 340;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const sx = (x: number) =>
    PAD.left + ((x - xDomain[0]) / Math.max(1e-6, xDomain[1] - xDomain[0])) * plotW;
  // Inverted: bigger values sit higher.
  const sy = (y: number) =>
    PAD.top + plotH - ((y - yDomain[0]) / Math.max(1e-6, yDomain[1] - yDomain[0])) * plotH;

  const path = (points: { x: number; y: number }[]) =>
    points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-labelledby={`${id}-title`}
        className="block"
      >
        <title id={`${id}-title`}>{title}</title>

        {/* Baseline, recessive on purpose. */}
        <line
          x1={PAD.left}
          y1={PAD.top + plotH}
          x2={width - PAD.right}
          y2={PAD.top + plotH}
          stroke="var(--hair)"
          strokeWidth="1"
        />

        {reference ? (
          <>
            <line
              x1={PAD.left}
              y1={sy(reference.at)}
              x2={width - PAD.right}
              y2={sy(reference.at)}
              stroke={reference.color}
              strokeWidth="1.5"
              strokeDasharray="5 5"
            />
            <text
              x={width - PAD.right}
              y={sy(reference.at) + 13}
              textAnchor="end"
              fill={reference.color}
              fontSize="11"
              fontWeight="600"
            >
              {reference.label}
            </text>
          </>
        ) : null}

        {gapAt ? (
          <line
            x1={sx(gapAt.x)}
            y1={sy(gapAt.from)}
            x2={sx(gapAt.x)}
            y2={sy(gapAt.to)}
            stroke={gapAt.color}
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : null}

        {series.map((s) => (
          <polyline
            key={s.label}
            points={path(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.dashed ? 2 : 2.5}
            strokeDasharray={s.dashed ? '5 5' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          if (!s.endpoint || !last) return null;
          return (
            <g key={`${s.label}-end`}>
              {/* A surface ring keeps the dot legible where lines overlap. */}
              <circle cx={sx(last.x)} cy={sy(last.y)} r="6" fill="var(--surface)" />
              <circle cx={sx(last.x)} cy={sy(last.y)} r="4" fill={s.color} />
            </g>
          );
        })}

        {gapAt ? (
          <text
            x={Math.min(sx(gapAt.x) + 6, width - PAD.right)}
            y={Math.max(12, sy(Math.max(gapAt.from, gapAt.to)) - 6)}
            textAnchor={sx(gapAt.x) > width * 0.7 ? 'end' : 'start'}
            fill={gapAt.color}
            fontSize="11"
            fontWeight="700"
          >
            {gapAt.label}
          </text>
        ) : null}

        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          if (!s.endpointLabel || !last) return null;
          return (
            <text
              key={`${s.label}-lbl`}
              x={Math.min(sx(last.x) + 8, width - PAD.right)}
              y={sy(last.y) - 8}
              textAnchor="end"
              fill={s.color}
              fontSize="11"
              fontWeight="700"
            >
              {s.endpointLabel}
            </text>
          );
        })}

        {xTicks.map((tick) => (
          <text
            key={tick.label}
            x={sx(tick.at)}
            y={height - 4}
            textAnchor={
              sx(tick.at) < PAD.left + 14
                ? 'start'
                : sx(tick.at) > width - PAD.right - 14
                  ? 'end'
                  : 'middle'
            }
            fill="var(--ter)"
            fontSize="10"
          >
            {tick.label}
          </text>
        ))}
      </svg>

      {series.length > 1 || caption ? (
        <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[12px] text-[var(--faint)]">
          {series.length > 1
            ? series.map((s) => (
                <span key={s.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-0 w-3.5"
                    style={{
                      borderTop: `2.5px ${s.dashed ? 'dashed' : 'solid'} ${s.color}`,
                    }}
                  />
                  {s.label}
                </span>
              ))
            : null}
          {caption}
        </figcaption>
      ) : null}

      <VisuallyHiddenTable title={title} series={series} />
    </figure>
  );
}

/** The accessible alternative to every chart on the screen. */
function VisuallyHiddenTable({ title, series }: { title: string; series: Series[] }) {
  return (
    <table className="sr-only">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">x</th>
          {series.map((s) => (
            <th key={s.label} scope="col">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(series[0]?.points ?? []).map((point, index) => (
          <tr key={index}>
            <th scope="row">{point.x}</th>
            {series.map((s) => (
              <td key={s.label}>{s.points[index]?.y ?? ''}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Workload: one row per person, open tasks with the overdue share marked. A
 * stacked bar rather than two bars, because the parts are of one whole; the
 * overdue segment carries a label so it is never colour alone.
 */
export function WorkloadBars({
  rows,
  scale,
  overdueLabel,
}: {
  rows: { name: string; open: number; overdue: number }[];
  scale: number;
  overdueLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const onTime = Math.max(0, row.open - row.overdue);
        const onTimePct = (onTime / scale) * 100;
        const overduePct = (row.overdue / scale) * 100;
        return (
          <div key={row.name} className="flex items-center gap-2.5">
            <span className="w-[64px] shrink-0 truncate text-[13px] text-[var(--sec)]">
              {row.name}
            </span>
            <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--chip-bg)]">
              <div
                style={{ width: `${onTimePct}%`, background: 'var(--accent)', opacity: 0.55 }}
              />
              {row.overdue > 0 ? (
                // A 2px gap so the two segments never blur into one mark.
                <div
                  style={{
                    width: `${overduePct}%`,
                    background: 'var(--red)',
                    marginLeft: 2,
                  }}
                />
              ) : null}
            </div>
            {/* One line, always: the caption below already says these are open
                tasks, so the count needs no unit of its own. */}
            <span className="tn-tabular w-[72px] shrink-0 whitespace-nowrap text-right text-[12px] text-[var(--faint)]">
              {row.open}
              {row.overdue > 0 ? (
                <>
                  {' · '}
                  <span className="font-semibold text-[var(--red)]">
                    {row.overdue} {overdueLabel}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A row in the weekly report: what a number was, what it is, and the delta. */
export function DeltaRow({
  label,
  from,
  to,
  delta,
  better,
  isLast = false,
}: {
  label: string;
  from: string;
  to: string;
  delta: string;
  /** Whether the movement is the direction you wanted. */
  better: boolean;
  isLast?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 px-4 py-3 ${isLast ? '' : 'tn-hairline'}`}
    >
      <span className="min-w-0 flex-1 text-[15px] text-[var(--ink)]">{label}</span>
      <span className="tn-tabular shrink-0 text-[15px] text-[var(--sec)]">
        {from} → {to}
      </span>
      <span
        className="tn-tabular shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold"
        style={{
          background: better ? 'var(--green-bg)' : 'var(--red-bg)',
          color: better ? 'var(--green)' : 'var(--red)',
        }}
      >
        {delta}
      </span>
    </div>
  );
}
