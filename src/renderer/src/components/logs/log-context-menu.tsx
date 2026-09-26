import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { tr } from '../../../../shared/i18n'
import { fullLogText, getLogActionDetails, type LogActionDetails } from './log-actions'
import { notify } from '@renderer/utils/notification'

export default function LogContextMenu({
  log,
  x,
  y,
  onClose,
  onRule
}: {
  log: ControllerLog
  x: number
  y: number
  onClose: () => void
  onRule: (details: LogActionDetails) => void
}) {
  const menu = useRef<HTMLDivElement>(null)
  const details = getLogActionDetails(log.payload)
  useLayoutEffect(() => {
    const element = menu.current!
    const previous = document.activeElement as HTMLElement | null
    const bounds = element.getBoundingClientRect()
    element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const dismiss = (event: Event) => {
      if (!element.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', dismiss, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', dismiss, true)
      window.removeEventListener('resize', onClose)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [x, y, onClose])
  const copy = async (value: string) => {
    onClose()
    try {
      await navigator.clipboard.writeText(value)
    } catch (error) {
      notify(error, { variant: 'danger' })
    }
  }
  const items = [
    { label: tr('Copy process name'), value: details.process },
    { label: tr('Copy destination'), value: details.destination },
    { label: tr('Copy full log'), value: fullLogText(log) }
  ]
  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={tr('Log actions')}
      className="app-nodrag fixed z-[100] min-w-52 max-w-[calc(100vw-16px)] rounded-xl border border-separator bg-surface p-1 shadow-xl"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault()
          onClose()
          return
        }
        const buttons = Array.from(
          menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        )
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        let next: number | undefined
        if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
        if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
        if (event.key === 'Home') next = 0
        if (event.key === 'End') next = buttons.length - 1
        if (next !== undefined) {
          event.preventDefault()
          buttons[next]?.focus()
        }
      }}
    >
      {items.map(({ label, value }) => (
        <button
          key={label}
          role="menuitem"
          tabIndex={-1}
          disabled={!value}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-secondary focus:bg-surface-secondary focus:outline-none disabled:opacity-40"
          onClick={() => {
            if (value) void copy(value)
          }}
        >
          {label}
        </button>
      ))}
      <div className="my-1 border-t border-separator" />
      <button
        role="menuitem"
        tabIndex={-1}
        className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-secondary focus:bg-surface-secondary focus:outline-none"
        onClick={() => {
          onClose()
          onRule(details)
        }}
      >
        {tr('Add Kokoro rule')}
      </button>
    </div>,
    document.body
  )
}
