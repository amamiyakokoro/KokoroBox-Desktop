import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState } from 'react'
import { formatLogTimestamp, parseLogMessage, type LogToken } from './log-display'

const levelTone: Record<LogLevel, { badge: string; row: string }> = {
  error: {
    badge: 'border-danger/25 bg-danger/10 text-danger',
    row: 'border-l-danger/70'
  },
  warning: {
    badge: 'border-warning/30 bg-warning/10 text-warning-700 dark:text-warning-300',
    row: 'border-l-warning/70'
  },
  info: {
    badge: 'border-primary/25 bg-primary/10 text-primary',
    row: 'border-l-primary/60'
  },
  debug: {
    badge: 'border-default-300 bg-default-100 text-foreground-500',
    row: 'border-l-default-300'
  },
  silent: {
    badge: 'border-default-300 bg-default-100 text-foreground-500',
    row: 'border-l-default-300'
  }
}

const tokenTone: Record<LogToken['kind'], string> = {
  text: 'text-foreground-600',
  protocol: 'font-semibold text-primary',
  ip: 'font-medium text-success-600 dark:text-success-400',
  domain: 'font-medium text-primary',
  port: 'text-foreground-500',
  process: 'rounded bg-default-100 px-1 font-medium text-foreground',
  rule: 'rounded bg-warning/10 px-1 font-medium text-warning-700 dark:text-warning-300',
  action: 'rounded bg-primary/10 px-1 font-semibold text-primary',
  keyword: 'text-foreground-400'
}

export const KokoLogToken: React.FC<{ token: LogToken }> = ({ token }) => (
  <span className={tokenTone[token.kind]}>{token.value}</span>
)

export const KokoLogLevelBadge: React.FC<{ type: LogLevel }> = ({ type }) => (
  <span
    className={`mt-0.5 w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-4 ${levelTone[type].badge}`}
  >
    {getLevelLabel(type)}
  </span>
)

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
  const message = parseLogMessage(payload)

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
      data-log-level={type}
      className={`mx-2 grid grid-cols-[5.25rem_4.5rem_minmax(0,1fr)] items-start gap-2 border-b border-l-2 border-b-divider/70 px-2 py-1.5 transition-[background-color,opacity,transform] duration-300 ease-out hover:bg-content2/70 ${levelTone[type].row} ${
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
      <KokoLogLevelBadge type={type} />
      <div className="min-w-0 select-text break-words font-mono text-xs leading-5">
        <div className="whitespace-pre-wrap text-foreground">
          {message.primary.map((token, tokenIndex) => (
            <KokoLogToken key={`${tokenIndex}:${token.value}`} token={token} />
          ))}
        </div>
        {message.secondary?.length ? (
          <div className="mt-0.5 whitespace-pre-wrap text-[11px] leading-4 text-foreground-500">
            {message.secondary.map((token, tokenIndex) => (
              <KokoLogToken key={`${tokenIndex}:${token.value}`} token={token} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

const LogItem = React.memo(LogItemComponent)

export default LogItem
