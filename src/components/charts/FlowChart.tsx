import { useMemo, useState } from 'react'
import type { MonthBucket } from '../../domain/analytics'
import type { CurrencyCode } from '../../domain/types'
import { formatMoney, formatMoneyCompact } from '../../lib/money'
import { useElementWidth } from '../../hooks/useElementWidth'
import './charts.css'

interface FlowChartProps {
  months: MonthBucket[]
  currency: CurrencyCode
  height?: number
}

const PADDING = { top: 18, right: 12, bottom: 30, left: 52 }
/** Bars are capped rather than filling their slot — the leftover band is air. */
const MAX_BAR_WIDTH = 24
/** 2px of surface separates the two bars in a month. */
const BAR_GAP = 2

/**
 * Money in and money out per month, as a diverging column chart.
 *
 * Contributions rise from the baseline, spends drop below it — so the polarity
 * is carried by *position* first. Colour is redundant reinforcement, which is
 * what makes this readable for anyone who can't separate the two hues.
 */
export function FlowChart({ months, currency, height = 240 }: FlowChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const geometry = useMemo(() => {
    const plotWidth = Math.max(1, width - PADDING.left - PADDING.right)
    const plotHeight = Math.max(1, height - PADDING.top - PADDING.bottom)

    const maxAdded = Math.max(0, ...months.map((m) => m.addedMinor))
    const maxSpent = Math.max(0, ...months.map((m) => m.spentMinor))
    const domain = Math.max(1, maxAdded, maxSpent)

    /**
     * One shared scale for both directions.
     *
     * The plot height is divided by the *combined* range, and the zero line is
     * then placed wherever that puts it. This is what makes a ₹5,000 spend and
     * a ₹5,000 contribution draw the same length — scaling each side to its own
     * half independently would silently exaggerate the smaller one, which is
     * the classic dual-axis mistake in disguise.
     */
    const range = maxAdded + maxSpent
    const pxPerUnit = range > 0 ? plotHeight / range : 0
    const zeroY = PADDING.top + maxAdded * pxPerUnit
    const scale = (value: number) => value * pxPerUnit

    const slot = plotWidth / Math.max(1, months.length)
    const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(6, (slot - BAR_GAP) / 2 - 6))

    return { plotWidth, plotHeight, domain, zeroY, scale, maxAdded, maxSpent, slot, barWidth }
  }, [months, width, height])

  if (months.length === 0) return null

  const slotCenter = (index: number) => PADDING.left + geometry.slot * (index + 0.5)
  const activeMonth = hover === null ? null : months[hover]

  return (
    <div className="chart" ref={ref}>
      {/* Two series, so a legend is always present. */}
      <ul className="chart__legend">
        <li>
          <span className="chart__swatch chart__swatch--in" aria-hidden="true" />
          Money in
        </li>
        <li>
          <span className="chart__swatch chart__swatch--out" aria-hidden="true" />
          Money out
        </li>
      </ul>

      <svg
        width={width}
        height={height}
        className="chart__svg"
        role="img"
        aria-label={`Money added and spent per month over the last ${months.length} months`}
        onPointerLeave={() => setHover(null)}
      >
        <line
          x1={PADDING.left}
          x2={width - PADDING.right}
          y1={geometry.zeroY}
          y2={geometry.zeroY}
          className="chart__grid chart__grid--zero"
        />

        <text x={PADDING.left - 8} y={geometry.zeroY} className="chart__tick" textAnchor="end">
          0
        </text>
        {geometry.maxAdded > 0 && (
          <text x={PADDING.left - 8} y={PADDING.top + 4} className="chart__tick" textAnchor="end">
            {formatMoneyCompact(geometry.maxAdded, currency)}
          </text>
        )}
        {geometry.maxSpent > 0 && (
          <text
            x={PADDING.left - 8}
            y={PADDING.top + geometry.plotHeight - 4}
            className="chart__tick"
            textAnchor="end"
          >
            {formatMoneyCompact(geometry.maxSpent, currency)}
          </text>
        )}

        {months.map((month, index) => {
          const center = slotCenter(index)
          const addedHeight = geometry.scale(month.addedMinor)
          const spentHeight = geometry.scale(month.spentMinor)
          const isActive = hover === index

          return (
            <g
              key={month.start.toISOString()}
              onPointerEnter={() => setHover(index)}
              className={isActive ? 'chart__group chart__group--active' : 'chart__group'}
            >
              {/* Full-height hit area: hovering a 3px bar is otherwise fiddly. */}
              <rect
                x={center - geometry.slot / 2}
                y={PADDING.top}
                width={geometry.slot}
                height={geometry.plotHeight}
                className="chart__hit"
              />

              {month.addedMinor > 0 && (
                <rect
                  x={center - geometry.barWidth - BAR_GAP / 2}
                  y={geometry.zeroY - addedHeight}
                  width={geometry.barWidth}
                  height={Math.max(2, addedHeight)}
                  className="chart__bar chart__bar--in"
                  // Rounded at the data end, square at the baseline.
                  rx={3}
                />
              )}

              {month.spentMinor > 0 && (
                <rect
                  x={center + BAR_GAP / 2}
                  y={geometry.zeroY}
                  width={geometry.barWidth}
                  height={Math.max(2, spentHeight)}
                  className="chart__bar chart__bar--out"
                  rx={3}
                />
              )}

              <text x={center} y={height - 8} className="chart__tick" textAnchor="middle">
                {month.label}
              </text>
            </g>
          )
        })}
      </svg>

      {activeMonth && hover !== null && (
        <div
          className="chart__tooltip"
          style={{ left: `${clamp(slotCenter(hover), 80, Math.max(80, width - 80))}px` }}
          role="status"
        >
          <p className="chart__tooltip-date">
            {activeMonth.start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </p>
          <p className="chart__tooltip-row">
            <span className="chart__swatch chart__swatch--in" aria-hidden="true" />
            In
            <strong className="numeric-ui">{formatMoney(activeMonth.addedMinor, currency)}</strong>
          </p>
          <p className="chart__tooltip-row">
            <span className="chart__swatch chart__swatch--out" aria-hidden="true" />
            Out
            <strong className="numeric-ui">{formatMoney(activeMonth.spentMinor, currency)}</strong>
          </p>
        </div>
      )}
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
