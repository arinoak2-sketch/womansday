import { useState } from 'react'
import { useAppStore } from '../store/AppStore'
import { Link, useRouter } from '../router/router'
import { formatMoney } from '../lib/money'
import { formatLongDate, parseInstant } from '../lib/date'
import { PageHeader } from '../components/AppShell'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge, EmptyState, Section, Segmented } from '../components/ui/Misc'
import { ProductImage } from '../components/ProductImage'
import type { GoalView } from '../domain/selectors'
import './Achievements.css'

type Tab = 'achieved' | 'archived'

export function Achievements() {
  const { portfolio } = useAppStore()
  const { navigate } = useRouter()
  const [tab, setTab] = useState<Tab>('achieved')

  const achieved = portfolio.completedGoals
  const archived = portfolio.archivedGoals
  const shown = tab === 'achieved' ? achieved : archived

  const totalAchievedMinor = achieved.reduce((sum, view) => sum + view.goal.targetMinor, 0)

  if (achieved.length === 0 && archived.length === 0) {
    return (
      <div className="achievements">
        <PageHeader
          title="Goals achieved"
          eyebrow="Your record"
          description="Everything you've finished saving for lives here."
        />
        <EmptyState
          icon="trophy"
          title="Nothing finished yet"
          message="When a goal reaches 100% it moves here and stays — a record of everything you actually saw through."
          action={
            <Button variant="primary" icon="plus" onClick={() => navigate({ name: 'new-goal' })}>
              Start a goal
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="achievements">
      <PageHeader
        title="Goals achieved"
        eyebrow="Your record"
        description={
          achieved.length > 0
            ? `${achieved.length} ${achieved.length === 1 ? 'goal' : 'goals'} funded in full — ${formatMoney(totalAchievedMinor, portfolio.currency)} saved and spent on purpose.`
            : 'Everything you’ve finished saving for lives here.'
        }
      />

      {archived.length > 0 && (
        <div className="achievements__tabs">
          <Segmented
            label="Which goals to show"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'achieved', label: `Achieved (${achieved.length})` },
              { value: 'archived', label: `Archived (${archived.length})` },
            ]}
          />
        </div>
      )}

      <Section title={tab === 'achieved' ? 'Completed' : 'Archived'} id="achieved-list">
        {shown.length === 0 ? (
          <EmptyState
            icon={tab === 'achieved' ? 'trophy' : 'archive'}
            size="sm"
            title={tab === 'achieved' ? 'Nothing completed yet' : 'Nothing archived'}
            message={
              tab === 'achieved'
                ? 'Reach 100% on a goal and it appears here.'
                : 'Archiving a finished goal tidies it away without deleting anything.'
            }
          />
        ) : (
          <ul className="achievements__list">
            {shown.map((view, index) => (
              <AchievementRow key={view.goal.id} view={view} index={index} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function AchievementRow({ view, index }: { view: GoalView; index: number }) {
  const { goal } = view
  const completedAt = goal.completedAt ? parseInstant(goal.completedAt) : null

  return (
    <li
      className="achievement animate-rise"
      data-accent={goal.accent}
      style={{ '--stagger-index': index } as React.CSSProperties}
    >
      <ProductImage
        product={goal.product}
        name={goal.name}
        accent={goal.accent}
        size={56}
        className="product-image--hero"
      />

      <div className="achievement__body">
        <h3 className="achievement__name">
          <Link to={{ name: 'goal', goalId: goal.id }} className="achievement__link">
            {goal.name}
          </Link>
        </h3>
        <p className="achievement__meta">
          {completedAt ? `Completed ${formatLongDate(completedAt)}` : 'Fully funded'}
        </p>
      </div>

      <div className="achievement__figures">
        <p className="achievement__amount numeric">{formatMoney(goal.targetMinor, goal.currency)}</p>
        {view.isArchived ? (
          <Badge icon="archive">Archived</Badge>
        ) : (
          <Badge tone="goal" icon="trophy">
            Achieved
          </Badge>
        )}
      </div>

      <span className="achievement__seal" aria-hidden="true">
        <Icon name="check" size={16} />
      </span>
    </li>
  )
}
