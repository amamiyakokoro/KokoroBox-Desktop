import { tr } from '../../../../shared/i18n'
import { Card, Switch } from '@heroui-v3/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { mihomoRulesDisable } from '@renderer/utils/ipc'
import RuleDetailTooltip from './rule-detail-tooltip'

import relativeTime from 'dayjs/plugin/relativeTime'
import dayjs from 'dayjs'

dayjs.extend(relativeTime)

interface Props {
  index: number
  rule: ControllerRulesDetail
}

const RuleItem: React.FC<Props> = ({ rule, index }) => {
  const [isEnabled, setIsEnabled] = useState(!rule.extra.disabled)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)

  const { hitCount, missCount } = rule.extra

  const totalCount = hitCount + missCount
  const hitRate = totalCount > 0 ? (hitCount / totalCount) * 100 : 0

  const hasStats = totalCount > 0
  const hasHits = hitCount > 0

  useEffect(() => {
    setIsEnabled(!rule.extra.disabled)
  }, [rule, rule.extra.disabled])

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => setShowTooltip(true), 600)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setShowTooltip(false)
  }, [])

  useEffect(() => {
    if (!showTooltip) return
    const handleMouseMove = (e: MouseEvent): void => {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        setShowTooltip(false)
      }
    }
    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [showTooltip])

  const handleToggle = async (v: boolean): Promise<void> => {
    setIsEnabled(v)
    try {
      await mihomoRulesDisable({ [rule.index]: !v })
    } catch {
      setIsEnabled(!v)
    }
  }

  return (
    <div className={`w-full px-2 pb-1.5 ${index === 0 ? 'pt-1.5' : ''}`}>
      <Card variant="secondary" className="w-full p-3">
        <Card.Content className="w-full">
          <div className="flex min-h-10 items-center gap-3">
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-sm font-medium text-foreground"
                title={rule.payload || 'Match'}
              >
                {rule.payload || 'Match'}
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-foreground-500">
                <span className="shrink-0">{rule.type}</span>
                <span aria-hidden="true" className="text-foreground-300">
                  →
                </span>
                <span className="truncate" title={rule.proxy}>
                  {rule.proxy}
                </span>
              </div>
            </div>
            {hasStats && (
              <div
                ref={wrapperRef}
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${
                  hasHits ? 'bg-primary/10 font-medium text-primary' : 'text-foreground-400'
                }`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                {hitRate.toFixed(1)}%
              </div>
            )}
            <Switch
              size="sm"
              aria-label={`${tr('Enable rule')}: ${rule.payload || rule.type}`}
              isSelected={isEnabled}
              onChange={handleToggle}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>
        </Card.Content>
      </Card>
      <RuleDetailTooltip
        rule={rule}
        anchorEl={showTooltip ? wrapperRef.current : null}
        visible={showTooltip}
      />
    </div>
  )
}

export default RuleItem
