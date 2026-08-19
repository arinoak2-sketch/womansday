import type { GoalView } from '../../domain/selectors'
import type { CurrencyCode } from '../../domain/types'
import { formatMoney } from '../../lib/money'
import './charts.css'

interface DistributionBarsProps {
  views: GoalView[]
  currency: CurrencyCode
  /** Goals past this are folded into a single "Other" row. */
  limit?: number
}

/**
 * Where the money currently sits, one bar per goal.
 *
 * This compares magnitude, so it uses a single hue and lets bar length do the
 * work — the goal accents are identity tints and don't survive a
 * colourblind-separation check when plotted next to each other. Every row is
 * direct-labelled with its goal name and amount, so nothing depends on colour.
 *
 * Built in HTML rather than SVG: it's a list of labelled rows, and as HTML it
 * reflows, wraps long goal names and is read correctly by a screen reader for
 * free.
 */
export function DistributionBars({ views, currency, limit = 6 }: DistributionBarsProps) {
  const withMoney = views
    .filter((view) => view.rawSavedMinor > 0)
    .sort((a, b) => b.rawSavedMinor - a.rawSavedMinor)

  if (withMoney.length === 0) return null

  const head = withMoney.slice(0, limit)
  const tail = withMoney.slice(limit)
  const tailTotal = tail.reduce((sum, view) => sum + view.rawSavedMinor, 0)

  const rows = [
    ...head.map((view) => ({
      key: view.goal.id,
      name: view.goal.name,
      amountMinor: view.rawSavedMinor,
    })),
    ...(tail.length > 0
      ? [{ key: '__other', name: `${tail.length} other goals`, amountMinor: tailTotal }]
      : []),
  ]

  const max = Math.max(...rows.map((row) => row.amountMinor), 1)
  const total = rows.reduce((sum, row) => sum + row.amountMinor, 0)

  return (
    <ul className="dist">
      {rows.map((row) => {
        const share = total > 0 ? Math.round((row.amountMinor / total) * 100) : 0
        return (
          <li key={row.key} className="dist__row">
            <div className="dist__head">
              <span className="dist__name">{row.name}</span>
              <span className="dist__value numeric-ui">
                {formatMoney(row.amountMinor, currency)}
                <span className="dist__share">{share}%</span>
              </span>
            </div>
            <div className="dist__track">
              <span
                className="dist__fill"
                style={{ width: `${(row.amountMinor / max) * 100}%` }}
                // The label above states the value; the bar is decoration for it.
                aria-hidden="true"
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
