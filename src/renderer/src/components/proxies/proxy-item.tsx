import { tr } from '../../../../shared/i18n'
import { Button, Card } from '@heroui/react'
import { mihomoUnfixedProxy } from '@renderer/utils/ipc'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FaMapPin } from 'react-icons/fa6'
import ProxyDetailTooltip from './proxy-detail-tooltip'
import { formatProxyType } from './proxy-display'

interface Props {
  mutateProxies: () => void
  onProxyDelay: (
    proxy: ControllerProxiesDetail | ControllerGroupDetail,
    group?: ControllerMixedGroup
  ) => Promise<ControllerProxiesDelay>
  proxyDisplayLayout: 'hidden' | 'single' | 'double'
  showGroupSelectedProxy: boolean
  showProxyDetailTooltip: boolean
  proxy: ControllerProxiesDetail | ControllerGroupDetail
  group: ControllerMixedGroup
  onSelect: (group: string, proxy: string) => void
  selected: boolean
}

const isGroup = (
  proxy: ControllerProxiesDetail | ControllerGroupDetail
): proxy is ControllerGroupDetail => {
  return 'now' in proxy && typeof (proxy as ControllerGroupDetail).now === 'string'
}

const ProxyItem: React.FC<Props> = (props) => {
  const {
    mutateProxies,
    proxyDisplayLayout,
    showGroupSelectedProxy,
    showProxyDetailTooltip,
    group,
    proxy,
    selected,
    onSelect,
    onProxyDelay
  } = props
  const shouldShowGroupSelectedProxy =
    showGroupSelectedProxy && isGroup(proxy) && Boolean(proxy.now)

  const delay = useMemo(() => {
    if (proxy.history.length > 0) {
      return proxy.history[proxy.history.length - 1].delay
    }
    return -1
  }, [proxy])

  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)
  const touchTriggeredRef = useRef(false)
  const lastTouchTime = useRef(0)
  const [showTooltip, setShowTooltip] = useState(false)

  const handleMouseEnter = useCallback(() => {
    if (Date.now() - lastTouchTime.current < 1000) return
    hoverTimerRef.current = setTimeout(() => {
      setShowTooltip(true)
    }, 600)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    if (!touchTriggeredRef.current) {
      setShowTooltip(false)
    }
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    lastTouchTime.current = Date.now()
    const touch = e.touches[0]
    touchStartPos.current = { x: touch.clientX, y: touch.clientY }
    touchTriggeredRef.current = false
    touchTimerRef.current = setTimeout(() => {
      touchTriggeredRef.current = true
      setShowTooltip(true)
    }, 600)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartPos.current) return
    const touch = e.touches[0]
    const dx = Math.abs(touch.clientX - touchStartPos.current.x)
    const dy = Math.abs(touch.clientY - touchStartPos.current.y)
    if (dx > 8 || dy > 8) {
      if (touchTimerRef.current !== null) {
        clearTimeout(touchTimerRef.current)
        touchTimerRef.current = null
      }
      if (touchTriggeredRef.current) {
        setShowTooltip(false)
        touchTriggeredRef.current = false
      }
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (touchTimerRef.current !== null) {
      clearTimeout(touchTimerRef.current)
      touchTimerRef.current = null
    }
    touchStartPos.current = null
  }, [])

  useEffect(() => {
    if (!showTooltip) return
    const handleOutsideTouch = (e: TouchEvent): void => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowTooltip(false)
        touchTriggeredRef.current = false
      }
    }
    document.addEventListener('touchstart', handleOutsideTouch, { passive: true })
    return () => document.removeEventListener('touchstart', handleOutsideTouch)
  }, [showTooltip])

  useEffect(() => {
    if (!showTooltip || touchTriggeredRef.current) return
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
  function delayText(delay: number): string {
    if (delay === -1) return tr('Test')
    if (delay === 0) return tr('Timeout')
    return `${delay} ms`
  }

  const onDelay = (): void => {
    setLoading(true)
    onProxyDelay(proxy, group).finally(() => {
      mutateProxies()
      setLoading(false)
    })
  }

  const fixed = group.fixed && group.fixed === proxy.name

  const selectProxy = (): void => {
    if (touchTriggeredRef.current) {
      touchTriggeredRef.current = false
      return
    }
    onSelect(group.name, proxy.name)
  }

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={showProxyDetailTooltip ? handleMouseEnter : undefined}
      onMouseLeave={showProxyDetailTooltip ? handleMouseLeave : undefined}
      onTouchStart={showProxyDetailTooltip ? handleTouchStart : undefined}
      onTouchMove={showProxyDetailTooltip ? handleTouchMove : undefined}
      onTouchEnd={showProxyDetailTooltip ? handleTouchEnd : undefined}
    >
      <Card
        variant="secondary"
        className={`group/proxy-node w-full min-w-0 gap-0 overflow-hidden border p-0 transition-[background-color,border-color] duration-150 ${
          selected
            ? 'border-accent/45 bg-accent-soft/40'
            : fixed
              ? 'border-separator/70 bg-surface-secondary/60'
              : 'border-separator/60 bg-surface hover:border-accent/25 hover:bg-accent-soft/15'
        }`}
        data-selected={selected || undefined}
      >
        <Card.Content className="p-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              className={`min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                proxyDisplayLayout === 'double' ? 'flex flex-col' : 'flex items-center'
              }`}
              aria-pressed={selected}
              onClick={selectProxy}
            >
              <span className="flex min-w-0 items-center">
                <span
                  aria-hidden="true"
                  className={`mr-2 size-1.5 shrink-0 rounded-full ${
                    selected ? 'bg-accent' : 'bg-transparent'
                  }`}
                />
                <span className="flag-emoji min-w-0 truncate text-sm font-medium text-foreground">
                  {proxy.name}
                </span>
                {proxyDisplayLayout === 'single' ? (
                  <span className="ml-2 min-w-0 truncate text-xs text-muted">
                    {formatProxyType(proxy.type)}
                    {shouldShowGroupSelectedProxy ? ` → ${proxy.now}` : ''}
                  </span>
                ) : null}
              </span>
              {proxyDisplayLayout === 'double' ? (
                <span className="ml-3.5 mt-0.5 min-w-0 truncate text-xs leading-4 text-muted">
                  {formatProxyType(proxy.type)}
                  {proxy.udp !== undefined && !shouldShowGroupSelectedProxy ? (
                    <span className="ml-1 opacity-70">· UDP</span>
                  ) : null}
                  {shouldShowGroupSelectedProxy ? (
                    <>
                      <span className="mx-1 text-accent-soft-foreground/70">→</span>
                      <span className="flag-emoji">{proxy.now}</span>
                    </>
                  ) : null}
                </span>
              ) : null}
            </button>
            <div className="flex shrink-0 items-center gap-0.5">
              {fixed ? (
                <Button
                  aria-label={`${tr('Cancel')}: ${tr('Fixed selection')}`}
                  className="h-7 w-7 min-w-7 p-0 text-xs text-danger"
                  isIconOnly
                  variant="ghost"
                  onPress={async () => {
                    await mihomoUnfixedProxy(group.name)
                    mutateProxies()
                  }}
                >
                  <FaMapPin className="text-xs" />
                </Button>
              ) : null}
              <Button
                className={`h-7 min-w-12 px-1.5 text-xs tabular-nums transition-opacity group-hover/proxy-node:opacity-100 group-focus-within/proxy-node:opacity-100 ${
                  delay === 0 ? '' : 'text-muted opacity-75'
                }`}
                isPending={loading}
                variant={delay === 0 ? 'danger-soft' : 'ghost'}
                onPress={onDelay}
              >
                {delayText(delay)}
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>
      {showProxyDetailTooltip && (
        <ProxyDetailTooltip
          proxy={proxy}
          anchorEl={showTooltip ? wrapperRef.current : null}
          visible={showTooltip}
        />
      )}
    </div>
  )
}

export default React.memo(ProxyItem)
