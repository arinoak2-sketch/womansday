import { useMemo, useState } from 'react'
import { useAppStore } from '../store/AppStore'
import { useRouter } from '../router/router'
import { buildAnalytics, buildMonthlyFlow } from '../domain/analytics'
import { buildDailySeries } from '../domain/selectors'
import { formatMoney } from '../lib/money'
import { formatDate } from '../lib/date'
import { PageHeader } from '../components/AppShell'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { EmptyState, Section, Segmented } from '../components/ui/Misc'
import { SavingsCurve } from '../components/charts/SavingsCurve'
import { FlowChart } from '../components/charts/FlowChart'
import { DistributionBars } from '../components/charts/DistributionBars'
import './Analytics.css'

type Range = '30' | '90' | '365'

const RANGES = [
  { value: '30' as const, label: '30 days' },
  { value: '90' as const, label: '90 days' },
  { value: '365' as const, label: '1 year' },
]

export function Analytics() {
  const { data, portfolio } = useAppStore()
  const { navigate } = useRouter()
  const [range, setRange] = useState<Range>('90')

  const summary = useMemo(
    () =>
      buildAnalytics(data, {
        active: portfolio.activeGoals,
        completed: portfolio.completedGoals,
        archived: portfolio.archivedGoals,
      }),
    [data, portfolio],
  )

  const series = useMemo(
    () => buildDailySeries(data.transactions, Number(range)),
    [data.transactions, range],
  )

  const months = useMemo(() => buildMonthlyFlow(data.transactions, 6), [data.transactions])

  const allViews = useMemo(
    () => [...portfolio.activeGoals, ...portfolio.completedGoals],
    [portfolio],
  )

  const currency = portfolio.currency

  if (data.transactions.length === 0) {
    return (
      <div className="analytics">
        <PageHeader
          title="Insights"
          eyebrow="Analytics"
          description="Patterns in how you save, once there's something to look at."
        />
        <EmptyState
          icon="chart"
          title="No history to chart yet"
          message="Once you've recorded a few contributions, this page fills in with your savings curve, your monthly rhythm, and where your money sits."
          action={
            <Button variant="primary" icon="plus" onClick={() => navigate({ name: 'new-goal' })}>
              Create a goal
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="analytics">
      <PageHeader
        title="Insights"
        eyebrow="Analytics"
        description="Patterns in how you save. Everything here is worked out from your own entries."
      />

      {/* ── Headline figures ───────────────────────────────────────── */}

      <ul className="an-kpis">
        <Kpi label="Total put aside" value={formatMoney(summary.totalAddedMinor, currency)} />
        <Kpi
          label="Spent from savings"
          value={formatMoney(summary.totalSpentMinor, currency)}
        />
        <Kpi
          label="Average per week"
          value={
            summary.averageWeeklyMinor === null
              ? '—'
              : formatMoney(summary.averageWeeklyMinor, currency)
          }
          hint={summary.averageWeeklyMinor === null ? 'Needs a week of history' : undefined}
        />
        <Kpi
          label="Goals achieved"
          value={String(summary.completedCount)}
          hint={`${summary.activeCount} still active`}
        />
      </ul>

      {/* ── Savings curve ──────────────────────────────────────────── */}

      <Section
        title="Savings over time"
        description="Your total balance across every goal, day by day."
        action={
          <Segmented
            label="Time range"
            options={RANGES}
            value={range}
            onChange={setRange}
            size="sm"
          />
        }
        id="curve"
      >
        <div className="panel an-chart">
          <SavingsCurve points={series} currency={currency} />

          <details className="chart-table">
            <summary>
              View as a table
              <Icon name="chevron-down" size={14} />
            </summary>
            <div className="chart-table__scroll">
              <table>
                <caption className="sr-only">
                  Daily balance and net change over the last {range} days
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Change</th>
                    <th scope="col">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {series
                    .filter((point) => point.netMinor !== 0)
                    .reverse()
                    .map((point) => (
                      <tr key={point.date.toISOString()}>
                        <th scope="row">{formatDate(point.date)}</th>
                        <td>{formatMoney(point.netMinor, currency, { signed: true })}</td>
                        <td>{formatMoney(point.cumulativeMinor, currency)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </Section>

      {/* ── Monthly flow ───────────────────────────────────────────── */}

      <Section
        title="Money in and out"
        description="The last six months. Contributions rise above the line, spends fall below it."
        id="flow"
      >
        <div className="panel an-chart">
          <FlowChart months={months} currency={currency} />

          <details className="chart-table">
            <summary>
              View as a table
              <Icon name="chevron-down" size={14} />
            </summary>
            <div className="chart-table__scroll">
              <table>
                <caption className="sr-only">Money added and spent per month</caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">In</th>
                    <th scope="col">Out</th>
                    <th scope="col">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {[...months].reverse().map((month) => (
                    <tr key={month.start.toISOString()}>
                      <th scope="row">
                        {month.start.toLocaleDateString(undefined, {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </th>
                      <td>{formatMoney(month.addedMinor, currency)}</td>
                      <td>{formatMoney(month.spentMinor, currency)}</td>
                      <td>{formatMoney(month.netMinor, currency, { signed: month.netMinor !== 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </Section>

      {/* ── Distribution ───────────────────────────────────────────── */}

      <Section
        title="Where your savings sit"
        description="Balance held against each goal right now."
        id="distribution"
      >
        <div className="panel an-chart">
          <DistributionBars views={allViews} currency={currency} />
        </div>
      </Section>

      {/* ── Highlights ─────────────────────────────────────────────── */}

      <Section title="Highlights" id="highlights">
        <ul className="an-highlights">
          {summary.bestWeek && (
            <Highlight
              icon="sparkle"
              label="Best saving week"
              value={formatMoney(summary.bestWeek.netMinor, currency)}
              detail={`Week of ${formatDate(summary.bestWeek.start)}`}
            />
          )}
          {summary.mostActiveGoal && (
            <Highlight
              icon="flag"
              label="Most active goal"
              value={summary.mostActiveGoal.view.goal.name}
              detail={`${summary.mostActiveGoal.transactionCount} entries recorded`}
            />
          )}
          {summary.closestGoal && (
            <Highlight
              icon="target"
              label="Closest to done"
              value={summary.closestGoal.goal.name}
              detail={`${summary.closestGoal.percent}% — ${formatMoney(
                summary.closestGoal.remainingMinor,
                currency,
              )} to go`}
            />
          )}
          {summary.averageMonthlyMinor !== null && (
            <Highlight
              icon="calendar"
              label="Average per month"
              value={formatMoney(summary.averageMonthlyMinor, currency)}
              detail={`Across ${summary.savingDays} ${summary.savingDays === 1 ? 'day' : 'days'} of saving`}
            />
          )}
        </ul>
      </Section>
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <li className="an-kpi">
      <p className="overline">{label}</p>
      <p className="an-kpi__value numeric">{value}</p>
      {hint && <p className="an-kpi__hint">{hint}</p>}
    </li>
  )
}

function Highlight({
  icon,
  label,
  value,
  detail,
}: {
  icon: 'sparkle' | 'flag' | 'target' | 'calendar'
  label: string
  value: string
  detail: string
}) {
  return (
    <li className="an-highlight">
      <span className="an-highlight__icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <div>
        <p className="overline">{label}</p>
        <p className="an-highlight__value">{value}</p>
        <p className="an-highlight__detail">{detail}</p>
      </div>
    </li>
  )
}
