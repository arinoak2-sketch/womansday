import { useCallback } from 'react'
import { useAppStore } from '../store/AppStore'
import { useToast } from '../components/ui/Toast'
import { useCelebration } from '../components/Celebration'
import type { Command, CommandError, CommandOutcome } from '../store/commands'
import { computeBalance } from '../domain/selectors'
import { playSound } from '../services/sound'
import { vibrate } from '../services/haptics'

export interface RunOptions {
  /** Toast shown on success. Omit for changes the UI already makes obvious. */
  successMessage?: string
  /** Cue to play on success. Defaults to none. */
  sound?: 'add' | 'spend' | 'success'
  /**
   * Show failures as a toast. Turn this off for form submissions, which
   * display the error inline against the offending field instead.
   */
  toastOnError?: boolean
}

export interface RunResult {
  ok: boolean
  error?: CommandError
  /** Present when the command created a goal, so the caller can navigate to it. */
  createdGoalId?: string
  createdTransactionId?: string
}

/**
 * The bridge between pure commands and everything the user hears, feels and
 * sees.
 *
 * Centralising it means feedback is consistent no matter which screen fired
 * the command, and — more importantly — that milestone celebrations can never
 * be forgotten at a call site: any command that clears a milestone celebrates
 * it and records it as celebrated in the same pass.
 */
export function useCommands() {
  const { run, data } = useAppStore()
  const { toast } = useToast()
  const { celebrate } = useCelebration()

  const execute = useCallback(
    (command: Command, options: RunOptions = {}): RunResult => {
      const { successMessage, sound, toastOnError = true } = options
      const outcome: CommandOutcome = run(command)

      if (!outcome.ok) {
        playSound('error')
        vibrate('warn')
        if (toastOnError) toast({ message: outcome.error.message, tone: 'negative' })
        return { ok: false, error: outcome.error }
      }

      if (sound) playSound(sound)
      if (successMessage) toast({ message: successMessage, tone: 'positive' })

      const { goal, milestones } = outcome.celebrations
      if (goal && milestones.length > 0) {
        const savedMinor = Math.max(
          0,
          computeBalance(outcome.data.transactions.filter((tx) => tx.goalId === goal.id)).savedMinor,
        )
        celebrate(goal, milestones, savedMinor)
        // Recorded immediately, so a refresh mid-celebration doesn't replay it.
        run({
          type: 'celebrate-milestones',
          goalId: goal.id,
          milestoneIds: milestones.map((m) => m.id),
        })
      }

      return {
        ok: true,
        createdGoalId: outcome.createdGoalId,
        createdTransactionId: outcome.createdTransactionId,
      }
    },
    [run, toast, celebrate],
  )

  return { execute, data }
}
