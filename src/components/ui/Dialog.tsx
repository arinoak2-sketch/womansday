import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Icon } from './Icon'
import { Button } from './Button'
import { playSound } from '../../services/sound'
import './Dialog.css'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  /** Sub-heading under the title. Announced as the dialog's description. */
  description?: ReactNode
  children: ReactNode
  /** Pinned action row at the bottom, outside the scrolling body. */
  footer?: ReactNode
  /** Wider layout for content-heavy dialogs such as goal editing. */
  size?: 'md' | 'lg'
  /** Suppresses the close button for flows that must be resolved explicitly. */
  dismissible?: boolean
}

/**
 * Modal dialog, presented as a bottom sheet on phones and a centred card on
 * larger screens.
 *
 * Built on the native `<dialog>` element deliberately: `showModal()` gives a
 * real focus trap, Escape handling, `inert` background content and top-layer
 * stacking from the platform. Hand-rolled traps get those details wrong, and
 * they are exactly the details screen-reader and keyboard users depend on.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [drag, setDrag] = useState(0)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
      playSound('open')
      // Scroll position persists across openings of the same dialog element.
      bodyRef.current?.scrollTo({ top: 0 })
      setDrag(0)
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // Escape and backdrop-driven closes fire the native `cancel`/`close` events;
  // routing them back through `onClose` keeps React state authoritative.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    function onCancel(event: Event) {
      event.preventDefault()
      if (dismissible) onClose()
    }
    function onNativeClose() {
      if (open) onClose()
    }

    dialog.addEventListener('cancel', onCancel)
    dialog.addEventListener('close', onNativeClose)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('close', onNativeClose)
    }
  }, [open, onClose, dismissible])

  // The page behind a sheet must not scroll — on iOS especially, a scrolling
  // background under a modal is disorienting and can strand the sheet.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  /** Clicking the backdrop (but not the panel) dismisses. */
  const onBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (!dismissible) return
      if (event.target === ref.current) onClose()
    },
    [onClose, dismissible],
  )

  /* ---- Swipe to dismiss (touch only) ------------------------------- */

  const dragState = useRef<{ startY: number; pointerId: number; active: boolean } | null>(null)

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dismissible || event.pointerType === 'mouse') return
    dragState.current = { startY: event.clientY, pointerId: event.pointerId, active: false }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragState.current
    if (!state || event.pointerId !== state.pointerId) return

    const delta = event.clientY - state.startY
    // Only start dragging on a downward pull, and only when the body is
    // already at the top — otherwise this would fight the sheet's own scroll.
    if (!state.active) {
      if (delta < 8) return
      if ((bodyRef.current?.scrollTop ?? 0) > 0) return
      state.active = true
    }
    setDrag(Math.max(0, delta))
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragState.current
    if (!state || event.pointerId !== state.pointerId) return
    dragState.current = null
    if (state.active && drag > 110) onClose()
    else setDrag(0)
  }

  return (
    <dialog
      ref={ref}
      className={['dialog', `dialog--${size}`].join(' ')}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={onBackdropClick}
    >
      <div
        className="dialog__panel"
        style={drag > 0 ? { translate: `0 ${drag}px`, transition: 'none' } : undefined}
      >
        <div
          className="dialog__grip-area"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="dialog__grip" aria-hidden="true" />
        </div>

        <header className="dialog__header">
          <div className="dialog__heading">
            <h2 className="dialog__title" id={titleId}>
              {title}
            </h2>
            {description && (
              <p className="dialog__description" id={descriptionId}>
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <Button variant="quiet" iconOnly icon="close" aria-label="Close" onClick={onClose} />
          )}
        </header>

        <div className="dialog__body" ref={bodyRef}>
          {children}
        </div>

        {footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Confirmation                                                        */
/* ------------------------------------------------------------------ */

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** Say what will actually happen, including what can't be undone. */
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Standard confirmation for destructive actions. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="dialog__actions">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
            {destructive && <Icon name="trash" size={18} />}
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="dialog__message">{message}</p>
    </Dialog>
  )
}
