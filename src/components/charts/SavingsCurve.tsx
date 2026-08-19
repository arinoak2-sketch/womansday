import { useMemo, useState } from 'react'
import type { DailyPoint } from '../../domain/selectors'
import type { CurrencyCode } from '../../domain/types'
import { formatMoney, formatMoneyCompact } from '../../lib/money'
import { formatDate } from '../../lib/date'
import { useElementWidth } from '../../hooks/useElementWidth'
import './charts.css'

interface SavingsCurveProps {
  points: DailyPoint[]
  currency: CurrencyCode
  height?: number
}

const PADDING = { top: 16, right: 16, bottom: 26, left: 52 }

/**
 * Cumulative savings over time.
 *
 * One series, so there is no legend — the section heading says what's plotted.
 * The value is direct-labelled at the endpoint only; every other value is
 * available through the crosshair or the table view beneath the chart.
 */
export function SavingsCurve({ points, currency, height = 220 }: SavingsCurveProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const geometry = useMemo(() => {
    const plotWidth = Math.max(1, width - PADDING.left - PADDING.right)
    const plotHeight = Math.max(1, height - PADDING.top - PADDING.bottom)

    const values = points.map((point) => point.cumulativeMinor)
    const maxValue = Math.max(1, ...values)
    // The axis always starts at zero: a truncated baseline exaggerates growth,
    // which would be flattering and wrong in a savings app.
    const ticks = niceTicks(maxValue, 4)
    const domainMax = Math.max(maxValue, ticks[ticks.length - 1] ?? maxValue)

    const x = (index: number) =>
      PADDING.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
    const y = (value: number) => PADDING.top + plotHeight - (value / domainMax) * plotHeight

    const line = points.map((point, index) => `${x(index)},${y(point.cumulativeMinor)}`).join(' ')
    const baseline = PADDING.top + plotHeight
    const area =
      points.length > 0
        ? `M ${x(0)},${baseline} L ${line.split(' ').join(' L ')} L ${x(points.length - 1)},${baseline} Z`
        : ''

    return { x, y, line, area, ticks, domainMax, plotWidth, plotHeight, baseline }
  }, [points, width, height])

  if (points.length === 0) return null

  const last = points[points.length - 1]
  const active = hoverIndex === null ? null : points[hoverIndex]

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const relative = event.clientX - bounds.left - PADDING.left
    const ratio = relative / Math.max(1, geometry.plotWidth)
    const index = Math.round(ratio * (points.length - 1))
    setHoverIndex(Math.min(points.length - 1, Math.max(0, index)))
  }

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={height}
        className="chart__svg"
        role="img"
        aria-label={`Total savings over the last ${points.length} days, ending at ${formatMoney(last.cumulativeMinor, currency)}`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {/* Gridlines: hairline, solid, one step off the surface. */}
        {geometry.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={geometry.y(tick)}
              y2={geometry.y(tick)}
              className="chart__grid"
            />
            <text x={PADDING.left - 8} y={geometry.y(tick)} className="chart__tick" textAnchor="end">
              {formatMoneyCompact(tick, currency)}
            </text>
          </g>
        ))}

        <path d={geometry.area} className="chart__area" />
        <polyline points={geometry.line} className="chart__line" />

        {active && hoverIndex !== null && (
          <g className="chart__crosshair">
            <line
              x1={geometry.x(hoverIndex)}
              x2={geometry.x(hoverIndex)}
              y1={PADDING.top}
              y2={geometry.baseline}
              className="chart__crosshair-line"
            />
            {/* 2px surface ring keeps the dot legible where it crosses the line. */}
            <circle
              cx={geometry.x(hoverIndex)}
              cy={geometry.y(active.cumulativeMinor)}
              r={5}
              className="chart__dot"
            />
          </g>
        )}

        <circle
          cx={geometry.x(points.length - 1)}
          cy={geometry.y(last.cumulativeMinor)}
          r={4.5}
          className="chart__dot chart__dot--end"
        />

        {/* x-axis labels only at the ends — a tick per day would be unreadable. */}
        <text x={PADDING.left} y={height - 6} className="chart__tick" textAnchor="start">
          {formatDate(points[0].date, { omitYear: true })}
        </text>
        <text x={width - PADDING.right} y={height - 6} className="chart__tick" textAnchor="end">
          {formatDate(last.date, { omitYear: true })}
        </text>
      </svg>

      {active && hoverIndex !== null && (
        <div
          className="chart__tooltip"
          style={{
            left: `${clamp(geometry.x(hoverIndex), 70, Math.max(70, width - 70))}px`,
          }}
          role="status"
        >
          <p className="chart__tooltip-date">{formatDate(active.date)}</p>
          <p className="chart__tooltip-value numeric">
            {formatMoney(active.cumulativeMinor, currency)}
          </p>
          {active.netMinor !== 0 && (
            <p className="chart__tooltip-delta">
              {formatMoney(active.netMinor, currency, { signed: true })} that day
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Round axis maximums to clean numbers so ticks read 0 / 5,000 / 10,000. */
function niceTicks(max: number, count: number): number[] {
  if (max <= 0) return [0]
  const rawStep = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude

  const ticks: number[] = []
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(Math.round(value))
  return ticks
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
