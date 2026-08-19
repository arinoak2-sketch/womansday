import { useState } from 'react'
import type { CurrencyCode } from '../domain/types'
import { CURRENCY_LIST } from '../lib/money'
import { useAppStore } from '../store/AppStore'
import { useRouter } from '../router/router'
import { Button } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import { Icon } from '../components/ui/Icon'
import { primeAudio } from '../services/sound'
import './Onboarding.css'

/** Shown first, and never again once dismissed. */
const CURRENCY_SHORTLIST: CurrencyCode[] = ['INR', 'USD', 'EUR', 'GBP']

/**
 * First-run setup.
 *
 * Three questions, all skippable, no account. The only one that genuinely
 * matters is currency, because it decides how every figure in the app is
 * stored and displayed — and changing it later doesn't retroactively convert
 * amounts, so it's worth one screen up front.
 */
export function Onboarding() {
  const { run } = useAppStore()
  const { navigate } = useRouter()
  const [step, setStep] = useState<0 | 1>(0)
  const [currency, setCurrency] = useState<CurrencyCode>('INR')
  const [name, setName] = useState('')

  function finish(destination: 'new-goal' | 'dashboard') {
    // The first tap is also the gesture that unlocks audio.
    primeAudio()
    run({
      type: 'update-settings',
      input: {
        currency,
        displayName: name.trim() || undefined,
        onboardedAt: new Date().toISOString(),
      },
    })
    navigate({ name: destination === 'new-goal' ? 'new-goal' : 'dashboard' }, { replace: true })
  }

  return (
    <div className="onboarding">
      <div className="onboarding__panel">
        <header className="onboarding__head">
          <span className="onboarding__mark" aria-hidden="true">
            <Icon name="wallet" size={22} />
          </span>
          <p className="onboarding__wordmark">Aurum</p>
        </header>

        {step === 0 ? (
          <section className="onboarding__step" aria-labelledby="onboarding-step-1">
            <h1 className="onboarding__title" id="onboarding-step-1">
              Let's set up your currency
            </h1>
            <p className="onboarding__body">
              Every goal, contribution and total is stored in this currency. You can change it in
              settings later, though existing amounts won't be converted.
            </p>

            <div className="onboarding__currencies" role="radiogroup" aria-label="Currency">
              {CURRENCY_SHORTLIST.map((code) => {
                const meta = CURRENCY_LIST.find((item) => item.code === code)
                if (!meta) return null
                const selected = currency === code
                return (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={['currency-option', selected && 'currency-option--selected']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setCurrency(code)}
                  >
                    <span className="currency-option__symbol">{meta.symbol}</span>
                    <span className="currency-option__code">{meta.code}</span>
                    <span className="currency-option__name">{meta.name}</span>
                    {selected && (
                      <span className="currency-option__check" aria-hidden="true">
                        <Icon name="check" size={14} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <Field label="Or pick another currency" hideLabel>
              {({ inputId }) => (
                <div className="onboarding__more">
                  <label className="field__label" htmlFor={inputId}>
                    Another currency
                  </label>
                  <select
                    id={inputId}
                    className="input"
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                  >
                    {CURRENCY_LIST.map((meta) => (
                      <option key={meta.code} value={meta.code}>
                        {meta.code} — {meta.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </Field>

            <div className="onboarding__actions">
              <Button variant="primary" size="lg" block iconAfter="arrow-right" onClick={() => setStep(1)}>
                Continue
              </Button>
            </div>
          </section>
        ) : (
          <section className="onboarding__step" aria-labelledby="onboarding-step-2">
            <h1 className="onboarding__title" id="onboarding-step-2">
              What are you saving for?
            </h1>
            <p className="onboarding__body">
              You can look up a real product to get a realistic target, or set your own amount.
              Either way, you can add as many goals as you like.
            </p>

            <Field label="Your name" optional hint="Only used to greet you. It never leaves this device.">
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  value={name}
                  maxLength={40}
                  placeholder="Optional"
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>

            <div className="onboarding__actions onboarding__actions--stack">
              <Button variant="primary" size="lg" block icon="plus" onClick={() => finish('new-goal')}>
                Create my first goal
              </Button>
              <Button variant="quiet" block onClick={() => finish('dashboard')}>
                I'll do this later
              </Button>
            </div>

            <button type="button" className="onboarding__back" onClick={() => setStep(0)}>
              <Icon name="arrow-left" size={15} />
              Back to currency
            </button>
          </section>
        )}

        <ol className="onboarding__dots" aria-label={`Step ${step + 1} of 2`}>
          {[0, 1].map((index) => (
            <li
              key={index}
              className={['onboarding__dot', index === step && 'onboarding__dot--active']
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            />
          ))}
        </ol>
      </div>
    </div>
  )
}
