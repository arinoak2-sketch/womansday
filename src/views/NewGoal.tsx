import { useEffect, useMemo, useRef, useState } from 'react'
import type { AccentName, CurrencyCode, Priority, Product } from '../domain/types'
import { useAppStore } from '../store/AppStore'
import { useRouter } from '../router/router'
import { useCommands } from '../hooks/useCommands'
import { PageHeader } from '../components/AppShell'
import { Button } from '../components/ui/Button'
import { AmountInput, Field, Select, TextArea, TextInput } from '../components/ui/Field'
import { Icon } from '../components/ui/Icon'
import { Badge, EmptyState, Segmented, Skeleton } from '../components/ui/Misc'
import { ProductImage } from '../components/ProductImage'
import { formatMoney, minorUnitScale, parseAmount } from '../lib/money'
import { formatDate, formatTime, toCalendarDate } from '../lib/date'
import { createId } from '../lib/id'
import {
  getProductSearchProvider,
  isProductSearchAvailable,
  type ProductCandidate,
  type ProductSearchOutcome,
} from '../services/productSearch'
import './NewGoal.css'

type Mode = 'search' | 'custom'

const ACCENTS: { value: AccentName; label: string }[] = [
  { value: 'amber', label: 'Amber' },
  { value: 'jade', label: 'Jade' },
  { value: 'plum', label: 'Plum' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'clay', label: 'Clay' },
  { value: 'slate', label: 'Slate' },
]

export function NewGoal() {
  const { navigate, back } = useRouter()
  const { settings, data } = useAppStore()

  /*
   * With no search provider wired up, looking up a product can only ever end
   * in "not connected". Leading with it would make a working app feel broken
   * on the very first screen a new user reaches, so the whole choice is hidden
   * and goal creation goes straight to entering a target.
   */
  const searchAvailable = isProductSearchAvailable()
  const [mode, setMode] = useState<Mode>(searchAvailable ? 'search' : 'custom')
  const [selected, setSelected] = useState<ProductCandidate | null>(null)

  const currency = settings.currency

  return (
    <div className="new-goal">
      <PageHeader
        title={selected ? "You're saving for" : 'Create a savings goal'}
        eyebrow="New goal"
        description={
          selected
            ? 'Check the target, then make it yours. Every number here can be changed.'
            : searchAvailable
              ? 'Look up something you want, or set your own target from scratch.'
              : 'Name what you\u2019re saving for and set a target.'
        }
        onBack={selected ? () => setSelected(null) : back}
        backLabel={selected ? 'Back to search' : 'Back'}
      />

      {selected ? (
        <GoalForm
          currency={currency}
          candidate={selected}
          goalCount={data.goals.length}
          onCreated={(goalId) => navigate({ name: 'goal', goalId }, { replace: true })}
        />
      ) : (
        <>
          {searchAvailable && (
            <div className="new-goal__modes">
              <Segmented
                label="How would you like to start?"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'search', label: 'Look up a product' },
                  { value: 'custom', label: 'Set my own' },
                ]}
              />
            </div>
          )}

          {mode === 'search' ? (
            <ProductSearch
              currency={currency}
              onSelect={setSelected}
              onSwitchToCustom={() => setMode('custom')}
            />
          ) : (
            <GoalForm
              currency={currency}
              candidate={null}
              goalCount={data.goals.length}
              onCreated={(goalId) => navigate({ name: 'goal', goalId }, { replace: true })}
            />
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Product search                                                      */
/* ------------------------------------------------------------------ */

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; results: ProductCandidate[]; query: string }
  | { status: 'empty'; query: string }
  | { status: 'unconfigured'; reason: string }
  | { status: 'error'; message: string }

function ProductSearch({
  currency,
  onSelect,
  onSwitchToCustom,
}: {
  currency: CurrencyCode
  onSelect: (candidate: ProductCandidate) => void
  onSwitchToCustom: () => void
}) {
  const provider = getProductSearchProvider()
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState>(() =>
    provider.isConfigured()
      ? { status: 'idle' }
      : { status: 'unconfigured', reason: 'Live product search is not connected in this build.' },
  )
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  async function search(event?: React.FormEvent) {
    event?.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length < 2) return

    // Supersede any in-flight request so a slow first search can't overwrite
    // the results of a later one.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setState({ status: 'searching' })

    const outcome: ProductSearchOutcome = await provider.search({
      query: trimmed,
      currency,
      signal: controller.signal,
    })
    if (controller.signal.aborted) return

    switch (outcome.status) {
      case 'ok':
        setState({ status: 'results', results: outcome.results, query: trimmed })
        break
      case 'empty':
        setState({ status: 'empty', query: trimmed })
        break
      case 'unconfigured':
        setState({ status: 'unconfigured', reason: outcome.reason })
        break
      case 'error':
        setState({ status: 'error', message: outcome.message })
        break
    }
  }

  const disabled = state.status === 'unconfigured'

  return (
    <div className="search">
      <form className="search__form" onSubmit={search} role="search">
        <Field label="What are you saving for?" hint={disabled ? undefined : 'Try “PlayStation 5”, “iPhone 17”, or a pair of shoes.'}>
          {({ inputId, describedBy }) => (
            <div className="search__row">
              <div className="search__input-wrap">
                <Icon name="search" size={18} className="search__icon" />
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  type="search"
                  value={query}
                  disabled={disabled}
                  placeholder="Search the web…"
                  autoComplete="off"
                  enterKeyHint="search"
                  className="search__input"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={state.status === 'searching'}
                disabled={disabled || query.trim().length < 2}
              >
                Search
              </Button>
            </div>
          )}
        </Field>
      </form>

      {state.status === 'idle' && (
        <EmptyState
          icon="search"
          title="Find what it actually costs"
          message="Search for a product and Aurum will compare the prices it finds, then suggest a realistic target you can adjust."
        />
      )}

      {state.status === 'searching' && <SearchSkeletons />}

      {state.status === 'results' && (
        <div className="search__results">
          <p className="search__count" role="status">
            {state.results.length} {state.results.length === 1 ? 'match' : 'matches'} for “
            {state.query}”
          </p>
          <ul className="search__list">
            {state.results.map((candidate, index) => (
              <ProductResult
                key={candidate.id}
                candidate={candidate}
                index={index}
                onSelect={() => onSelect(candidate)}
              />
            ))}
          </ul>
          <p className="search__disclaimer">
            <Icon name="info" size={15} />
            Prices come from third-party listings and change constantly. Treat them as a starting
            point — you can set any target you like.
          </p>
        </div>
      )}

      {state.status === 'empty' && (
        <EmptyState
          icon="search"
          title={`Nothing found for “${state.query}”`}
          message="Try a shorter or more common name for the product — or just set your own target."
          action={
            <Button variant="secondary" onClick={onSwitchToCustom}>
              Set my own amount
            </Button>
          }
        />
      )}

      {state.status === 'error' && (
        <EmptyState
          icon="alert"
          title="That search didn't work"
          message={`${state.message} You can try again, or set a target yourself.`}
          action={
            <div className="search__error-actions">
              <Button variant="secondary" icon="refresh" onClick={() => search()}>
                Try again
              </Button>
              <Button variant="ghost" onClick={onSwitchToCustom}>
                Set my own amount
              </Button>
            </div>
          }
        />
      )}

      {state.status === 'unconfigured' && (
        /*
          The honest state. This build has no product-search backend wired up,
          so rather than inventing prices the app says so and hands over to
          manual entry. `services/productSearch.ts` documents the endpoint
          contract needed to switch this on.
        */
        <EmptyState
          icon="info"
          title="Price lookup isn't connected"
          message="This copy of Aurum has no product search service configured, so it can't look up real prices — and it won't guess at them. Set your own target instead; everything else works exactly the same."
          action={
            <Button variant="primary" icon="plus" onClick={onSwitchToCustom}>
              Set my own amount
            </Button>
          }
        />
      )}
    </div>
  )
}

function SearchSkeletons() {
  return (
    <ul className="search__list" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <li key={index} className="search__result search__result--loading">
          <Skeleton width="4.5rem" height="4.5rem" radius="var(--radius-md)" />
          <div className="search__result-body">
            <Skeleton width="60%" height="1.1rem" />
            <Skeleton width="35%" height="0.85rem" />
            <Skeleton width="45%" height="0.85rem" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ProductResult({
  candidate,
  index,
  onSelect,
}: {
  candidate: ProductCandidate
  index: number
  onSelect: () => void
}) {
  const hasPrice = candidate.suggestedMinor > 0

  return (
    <li className="animate-rise" style={{ '--stagger-index': index } as React.CSSProperties}>
      <button type="button" className="search__result" onClick={onSelect}>
        <ProductImage
          src={candidate.imageUrl}
          name={candidate.title}
          accent="slate"
          size={72}
          className="product-image--hero"
        />

        <div className="search__result-body">
          <p className="search__result-title">{candidate.title}</p>
          {candidate.brand && <p className="search__result-brand">{candidate.brand}</p>}

          {hasPrice ? (
            <p className="search__result-price numeric">
              {formatMoney(candidate.suggestedMinor, candidate.currency)}
              <span className="search__result-offers">
                across {candidate.offers.length}{' '}
                {candidate.offers.length === 1 ? 'listing' : 'listings'}
              </span>
            </p>
          ) : (
            <p className="search__result-noprice">
              {candidate.currencyMismatch
                ? `Priced in ${candidate.currencyMismatch.found.join(', ')} only`
                : 'No price found'}
            </p>
          )}
        </div>

        <Icon name="chevron-right" size={18} className="search__result-chevron" />
      </button>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Goal form                                                           */
/* ------------------------------------------------------------------ */

interface GoalFormProps {
  currency: CurrencyCode
  candidate: ProductCandidate | null
  goalCount: number
  onCreated: (goalId: string) => void
}

function GoalForm({ currency, candidate, goalCount, onCreated }: GoalFormProps) {
  const { execute } = useCommands()

  const scale = minorUnitScale(currency)
  const [name, setName] = useState(candidate?.title ?? '')
  const [target, setTarget] = useState(() =>
    candidate && candidate.suggestedMinor > 0 ? String(candidate.suggestedMinor / scale) : '',
  )
  const [targetDate, setTargetDate] = useState('')
  const [starting, setStarting] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [accent, setAccent] = useState<AccentName>(ACCENTS[goalCount % ACCENTS.length].value)
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const today = useMemo(() => toCalendarDate(new Date()), [])

  const product: Product | undefined = useMemo(() => {
    if (!candidate) return undefined
    return {
      id: candidate.id,
      title: candidate.title,
      imageUrl: candidate.imageUrl,
      brand: candidate.brand,
      description: candidate.description,
      url: candidate.url,
      variants: candidate.variants,
      snapshots:
        candidate.suggestedMinor > 0
          ? [
              {
                id: createId('snap'),
                retrievedAt: candidate.retrievedAt,
                amountMinor: candidate.suggestedMinor,
                currency: candidate.currency,
                sources: candidate.offers,
                providerId: candidate.providerId,
              },
            ]
          : [],
    }
  }, [candidate])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}

    if (name.trim() === '') nextErrors.name = 'Give your goal a name.'

    const parsedTarget = parseAmount(target, currency)
    if (!parsedTarget.ok) nextErrors.target = parsedTarget.message

    const parsedStarting =
      starting.trim() === '' ? { ok: true as const, minor: 0 } : parseAmount(starting, currency, { allowZero: true })
    if (!parsedStarting.ok) nextErrors.starting = parsedStarting.message

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    if (!parsedTarget.ok || !parsedStarting.ok) return

    // Routed through `execute` rather than the raw store so a starting amount
    // that already clears a milestone celebrates like any other contribution.
    const outcome = execute(
      {
        type: 'create-goal',
        input: {
          name,
          targetMinor: parsedTarget.minor,
          currency,
          accent,
          priority,
          targetDate: targetDate || undefined,
          note: note.trim() || undefined,
          product,
          startingMinor: parsedStarting.minor,
        },
      },
      { sound: 'success', successMessage: `${name.trim()} is ready`, toastOnError: false },
    )

    if (!outcome.ok) {
      setErrors({ [outcome.error?.field ?? 'name']: outcome.error?.message ?? 'That could not be saved.' })
      return
    }

    if (outcome.createdGoalId) onCreated(outcome.createdGoalId)
  }

  const previewTarget = parseAmount(target, currency)
  const snapshot = candidate && candidate.suggestedMinor > 0 ? candidate : null

  return (
    <form className="goal-form" onSubmit={submit} data-accent={accent} noValidate>
      {candidate && (
        <section className="goal-form__product">
          <ProductImage
            src={candidate.imageUrl}
            name={candidate.title}
            accent={accent}
            size={96}
            className="product-image--hero"
          />
          <div className="goal-form__product-body">
            <h2 className="goal-form__product-title">{candidate.title}</h2>
            {candidate.brand && <p className="subtle">{candidate.brand}</p>}

            {snapshot ? (
              <>
                <p className="goal-form__product-price numeric">
                  {formatMoney(snapshot.suggestedMinor, snapshot.currency)}
                  <span className="goal-form__product-est">estimated</span>
                </p>

                <details className="goal-form__sources">
                  <summary>
                    Where this came from
                    <Icon name="chevron-down" size={15} />
                  </summary>
                  <ul className="goal-form__source-list">
                    {snapshot.offers.map((offer) => (
                      <li key={`${offer.retailer}-${offer.amountMinor}`}>
                        <span>{offer.retailer}</span>
                        <span className="numeric-ui">
                          {formatMoney(offer.amountMinor, offer.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="goal-form__retrieved">
                    Retrieved {formatDate(new Date(snapshot.retrievedAt))} at{' '}
                    {formatTime(new Date(snapshot.retrievedAt))}. Prices change — check before you
                    buy.
                  </p>
                </details>
              </>
            ) : (
              <p className="goal-form__product-noprice">
                <Icon name="info" size={15} />
                No price could be confirmed for this in {currency}. Set your own target below.
              </p>
            )}
          </div>
        </section>
      )}

      <div className="goal-form__grid">
        <Field label="Goal name" error={errors.name}>
          {({ inputId, describedBy, invalid }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              invalid={invalid}
              value={name}
              maxLength={60}
              placeholder="PlayStation 5"
              onChange={(event) => {
                setName(event.target.value)
                setErrors((current) => ({ ...current, name: '' }))
              }}
            />
          )}
        </Field>

        <Field
          label="Target amount"
          error={errors.target}
          hint={candidate ? 'Adjust this to whatever you actually need to save.' : undefined}
        >
          {({ inputId, describedBy, invalid }) => (
            <AmountInput
              id={inputId}
              aria-describedby={describedBy}
              invalid={invalid}
              currency={currency}
              value={target}
              placeholder="50000"
              onChange={(event) => {
                setTarget(event.target.value)
                setErrors((current) => ({ ...current, target: '' }))
              }}
            />
          )}
        </Field>

        <Field
          label="Target date"
          optional
          error={errors.targetDate}
          hint="Aurum works out what you'd need to save each week."
        >
          {({ inputId, describedBy, invalid }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              invalid={invalid}
              type="date"
              min={today}
              value={targetDate}
              onChange={(event) => {
                setTargetDate(event.target.value)
                setErrors((current) => ({ ...current, targetDate: '' }))
              }}
            />
          )}
        </Field>

        <Field
          label="Starting amount"
          optional
          error={errors.starting}
          hint="Already put something aside? Record it now."
        >
          {({ inputId, describedBy, invalid }) => (
            <AmountInput
              id={inputId}
              aria-describedby={describedBy}
              invalid={invalid}
              currency={currency}
              value={starting}
              placeholder="0"
              onChange={(event) => {
                setStarting(event.target.value)
                setErrors((current) => ({ ...current, starting: '' }))
              }}
            />
          )}
        </Field>

        <Field label="Priority">
          {({ inputId }) => (
            <Select
              id={inputId}
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
            >
              <option value="high">High — surface this first</option>
              <option value="medium">Medium</option>
              <option value="low">Low — no rush</option>
            </Select>
          )}
        </Field>

        <Field label="Colour">
          {() => (
            <div className="goal-form__accents" role="radiogroup" aria-label="Goal colour">
              {ACCENTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={accent === option.value}
                  aria-label={option.label}
                  data-accent={option.value}
                  className={['accent-swatch', accent === option.value && 'accent-swatch--selected']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setAccent(option.value)}
                >
                  {accent === option.value && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          )}
        </Field>
      </div>

      <Field label="Notes" optional hint="Why does this matter to you? Worth reading back later.">
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            value={note}
            maxLength={280}
            placeholder="Saving up so I can finally play with friends online."
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>

      {previewTarget.ok && (
        <div className="goal-form__summary" aria-live="polite">
          <Badge tone="goal" icon="target">
            Target
          </Badge>
          <p className="numeric">{formatMoney(previewTarget.minor, currency)}</p>
        </div>
      )}

      <div className="goal-form__actions">
        <Button type="submit" variant="primary" size="lg" block icon="check">
          Create savings goal
        </Button>
      </div>
    </form>
  )
}
