import { useRef, useState, type ReactNode } from 'react'
import type { CurrencyCode, MotionPreference, ThemePreference } from '../domain/types'
import { useAppStore } from '../store/AppStore'
import { useToast } from '../components/ui/Toast'
import { PageHeader } from '../components/AppShell'
import { Button } from '../components/ui/Button'
import { Field, Select, TextInput } from '../components/ui/Field'
import { Icon } from '../components/ui/Icon'
import { ConfirmDialog } from '../components/ui/Dialog'
import { Segmented } from '../components/ui/Misc'
import { CURRENCY_LIST } from '../lib/money'
import { clearStorage, emptyData, parseImport, serializeForExport } from '../store/persistence'
import { isSoundAvailable, playSound } from '../services/sound'
import { getProductSearchProvider } from '../services/productSearch'
import './Settings.css'

export function Settings() {
  const { data, settings, run, replace } = useAppStore()
  const { toast } = useToast()
  const [confirmReset, setConfirmReset] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const provider = getProductSearchProvider()
  const soundAvailable = isSoundAvailable()

  function update(input: Parameters<typeof run>[0] extends never ? never : Partial<typeof settings>) {
    run({ type: 'update-settings', input })
  }

  function exportData() {
    try {
      const blob = new Blob([serializeForExport(data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `aurum-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(link)
      link.click()
      link.remove()
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast({ message: 'Backup downloaded', tone: 'positive' })
    } catch {
      toast({ message: "The backup file couldn't be created.", tone: 'negative' })
    }
  }

  async function importData(file: File) {
    try {
      const text = await file.text()
      const result = parseImport(text)
      if (!result.ok) {
        toast({ message: result.message, tone: 'negative' })
        return
      }
      // Preserve the current onboarding state so importing can't drop the user
      // back into first-run setup.
      replace({
        ...result.data,
        settings: { ...result.data.settings, onboardedAt: settings.onboardedAt },
      })
      toast({
        message: `Restored ${result.goalCount} goals and ${result.transactionCount} entries`,
        tone: 'positive',
      })
    } catch {
      toast({ message: "That file couldn't be read.", tone: 'negative' })
    }
  }

  function resetEverything() {
    clearStorage()
    replace({ ...emptyData(), settings: { ...settings, onboardedAt: settings.onboardedAt } })
    setConfirmReset(false)
    toast({ message: 'All goals and history deleted', tone: 'positive' })
  }

  return (
    <div className="settings">
      <PageHeader
        title="Settings"
        eyebrow="Preferences"
        description="Everything here is stored on this device only."
      />

      {/* ── Money ──────────────────────────────────────────────────── */}

      <SettingsGroup title="Money" icon="wallet">
        <SettingsRow
          label="Currency"
          description="New goals use this. Existing goals keep the currency they were created with — amounts are never converted behind your back."
        >
          <Field label="Currency" hideLabel>
            {({ inputId }) => (
              <Select
                id={inputId}
                value={settings.currency}
                onChange={(event) => update({ currency: event.target.value as CurrencyCode })}
              >
                {CURRENCY_LIST.map((meta) => (
                  <option key={meta.code} value={meta.code}>
                    {meta.symbol} {meta.code} — {meta.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </SettingsRow>

        <SettingsRow label="Your name" description="Optional, and only used inside this app.">
          <Field label="Display name" hideLabel>
            {({ inputId }) => (
              <TextInput
                id={inputId}
                value={settings.displayName ?? ''}
                maxLength={40}
                placeholder="Not set"
                onChange={(event) => update({ displayName: event.target.value || undefined })}
              />
            )}
          </Field>
        </SettingsRow>
      </SettingsGroup>

      {/* ── Appearance ─────────────────────────────────────────────── */}

      <SettingsGroup title="Appearance" icon="display">
        <SettingsRow label="Theme" description="Follow your device, or pick one.">
          <Segmented
            label="Theme"
            value={settings.theme}
            onChange={(theme: ThemePreference) => update({ theme })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          label="Motion"
          description="Reduced motion keeps every transition but removes the movement. Set to system, Aurum follows your device's accessibility setting."
        >
          <Segmented
            label="Motion"
            value={settings.motion}
            onChange={(motion: MotionPreference) => update({ motion })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'full', label: 'Full' },
              { value: 'reduced', label: 'Reduced' },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>

      {/* ── Feedback ───────────────────────────────────────────────── */}

      <SettingsGroup title="Feedback" icon="sparkle">
        <SettingsToggle
          label="Sound effects"
          description={
            soundAvailable
              ? 'Short cues when you add money, spend, and reach a milestone.'
              : "This browser doesn't support the audio Aurum uses, so cues stay silent."
          }
          checked={settings.sound && soundAvailable}
          disabled={!soundAvailable}
          onChange={(sound) => {
            update({ sound })
            // Play the cue as confirmation the moment it's switched on.
            if (sound) setTimeout(() => playSound('success'), 60)
          }}
        />

        <SettingsToggle
          label="Celebrations"
          description="The full-screen moment when you reach a milestone or finish a goal. Milestones are still tracked either way."
          checked={settings.celebrations}
          onChange={(celebrations) => update({ celebrations })}
        />
      </SettingsGroup>

      {/* ── Product search ─────────────────────────────────────────── */}

      <SettingsGroup title="Product search" icon="search">
        <div className="settings__status">
          <span
            className={[
              'settings__status-dot',
              provider.isConfigured() ? 'settings__status-dot--on' : 'settings__status-dot--off',
            ].join(' ')}
            aria-hidden="true"
          />
          <div>
            <p className="settings__status-label">
              {provider.isConfigured() ? `Connected — ${provider.label}` : 'Not connected'}
            </p>
            <p className="settings__status-body">
              {provider.isConfigured()
                ? 'Aurum can look up product prices to suggest targets. Retrieved prices are always shown with the date they were fetched, and you can override any of them.'
                : "This build has no product search service configured. Aurum won't invent prices, so goals are created with targets you set yourself. A search provider can be added without changing anything else in the app."}
            </p>
          </div>
        </div>
      </SettingsGroup>

      {/* ── Data ───────────────────────────────────────────────────── */}

      <SettingsGroup title="Your data" icon="archive">
        <SettingsRow
          label="Export"
          description={`Download all ${data.goals.length} goals and ${data.transactions.length} entries as a JSON file.`}
        >
          <Button variant="secondary" icon="download" onClick={exportData}>
            Download backup
          </Button>
        </SettingsRow>

        <SettingsRow
          label="Import"
          description="Restore from a backup file. This replaces everything currently in the app."
        >
          <>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importData(file)
                // Reset so re-picking the same file fires `change` again.
                event.target.value = ''
              }}
            />
            <Button variant="secondary" icon="upload" onClick={() => fileInput.current?.click()}>
              Choose a file
            </Button>
          </>
        </SettingsRow>

        <SettingsRow
          label="Delete everything"
          description="Removes every goal and entry from this device. Your settings are kept."
        >
          <Button variant="danger" icon="trash" onClick={() => setConfirmReset(true)}>
            Delete all data
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <p className="settings__footer">
        Aurum keeps everything in this browser's local storage. There's no account and no server, so
        clearing your browser data removes it — export a backup first if that matters to you.
      </p>

      <ConfirmDialog
        open={confirmReset}
        title="Delete everything?"
        message={
          <>
            This permanently removes <strong>{data.goals.length} goals</strong> and{' '}
            <strong>{data.transactions.length} entries</strong> from this device. There's no undo,
            and no copy anywhere else. Export a backup first if you might want any of it back.
          </>
        }
        confirmLabel="Delete everything"
        destructive
        onConfirm={resetEverything}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Layout pieces                                                       */
/* ------------------------------------------------------------------ */

function SettingsGroup({
  title,
  icon,
  children,
}: {
  title: string
  icon: 'wallet' | 'display' | 'sparkle' | 'search' | 'archive'
  children: ReactNode
}) {
  return (
    <section className="settings__group" aria-labelledby={`settings-${title}`}>
      <h2 className="settings__group-title" id={`settings-${title}`}>
        <Icon name={icon} size={17} />
        {title}
      </h2>
      <div className="panel settings__panel">{children}</div>
    </section>
  )
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="settings__row">
      <div className="settings__row-text">
        <p className="settings__row-label">{label}</p>
        <p className="settings__row-description">{description}</p>
      </div>
      <div className="settings__row-control">{children}</div>
    </div>
  )
}

/**
 * A real checkbox behind a switch-shaped label: keyboard, screen-reader and
 * forced-colors behaviour all come from the platform rather than being
 * reimplemented on a div.
 */
function SettingsToggle({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="settings__row">
      <div className="settings__row-text">
        <p className="settings__row-label">{label}</p>
        <p className="settings__row-description">{description}</p>
      </div>
      <label className="switch">
        <input
          type="checkbox"
          className="switch__input"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch__track" aria-hidden="true">
          <span className="switch__thumb" />
        </span>
        <span className="sr-only">{label}</span>
      </label>
    </div>
  )
}
