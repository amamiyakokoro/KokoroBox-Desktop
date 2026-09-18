import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState } from 'react'
import { formatLogTimestamp } from './log-display'

const levelTone: Record<LogLevel, string> = {
  error: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning-600 dark:text-warning',
  info: 'bg-primary/10 text-primary',
  debug: 'bg-default-100 text-foreground-500',
  silent: 'bg-default-100 text-foreground-500'
}

function getLevelLabel(type: LogLevel): string {
  switch (type) {
    case 'error':
      return tr('Error')
    case 'warning':
      return tr('Warning')
    case 'info':
      return tr('Info')
    case 'debug':
      return tr('Debug')
    case 'silent':
      return tr('Silent')
  }
}

interface Props extends ControllerLog {
  index: number
  animateOnMount?: boolean
}

const LogItemComponent: React.FC<Props> = (props) => {
  const { type, payload, time, index, animateOnMount = false } = props
  const [entered, setEntered] = useState(!animateOnMount)
  const displayTime = formatLogTimestamp(time)

  useEffect(() => {
    if (!animateOnMount) {
      setEntered(true)
      return
    }

    setEntered(false)
    const frame = window.requestAnimationFrame(() => {
      setEntered(true)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [animateOnMount])

  return (
    <div
      className={`mx-2 grid grid-cols-[5.25rem_4.5rem_minmax(0,1fr)] items-start gap-2 border-b border-divider/70 px-2 py-1.5 transition-[background-color,opacity,transform] duration-300 ease-out hover:bg-content2/60 ${
        entered ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
      } ${index === 0 ? 'border-t' : ''} ${animateOnMount ? 'bg-primary/5' : ''}`}
    >
      <time
        className="pt-0.5 font-mono text-[11px] leading-5 text-foreground-400 tabular-nums"
        dateTime={time}
        title={time}
      >
        {displayTime}
      </time>
      <span
        className={`mt-0.5 w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-4 ${levelTone[type]}`}
      >
        {getLevelLabel(type)}
      </span>
      <div className="min-w-0 select-text whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">
        {payload}
      </div>
    </div>
  )
}

const LogItem = React.memo(LogItemComponent)

export default LogItem
