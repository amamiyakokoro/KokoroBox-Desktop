import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { tr } from '../../../../shared/i18n'
import { closestCorners, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { useNavigate } from 'react-router-dom'
import { appRoutingSupported } from '../../../../shared/app-routing'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useCardDndSensors } from '@renderer/hooks/use-card-dnd-sensors'
import { markInitialContentPartReady } from '@renderer/utils/startup'
import ConnCard from './conn-card'
import DNSCard from './dns-card'
import LogCard from './log-card'
import KokoroSettingCard from './kokoro-setting-card'
import MihomoCoreCard from './mihomo-core-card'
import OverrideCard from './override-card'
import ProfileCard from './profile-card'
import ProxyCard from './proxy-card'
import RuleCard from './rule-card'
import SniffCard from './sniff-card'
import SysproxySwitcher from './sysproxy-switcher'
import TunSwitcher from './tun-switcher'
import AppRoutingCard from './app-routing-card'
import { SiderIconGroup, SiderSection } from './sider-surfaces'
import {
  accountKeys,
  currentStatusKeys,
  groupForSiderKey,
  navigationKeys,
  normalizeSiderOrder,
  quickControlKeys
} from './sider-order'

const interactiveSelector =
  'button:not(.pointer-events-none), [role="switch"]'

const siderCardRouteMap = {
  'app-routing-card': '/app-routing',
  'profile-card': '/profiles',
  'proxy-card': '/proxies',
  'conn-card': '/connections',
  'kokoro-setting-card': '/kokoro',
  'log-card': '/logs',
  'rule-card': '/rules',
  'override-card': '/override'
} as const

const siderCardSelector = Object.keys(siderCardRouteMap)
  .map((className) => `.${className}`)
  .join(', ')

const componentMap = {
  sysproxy: SysproxySwitcher,
  tun: TunSwitcher,
  'app-routing': AppRoutingCard,
  profile: ProfileCard,
  kokoro: KokoroSettingCard,
  proxy: ProxyCard,
  mihomo: MihomoCoreCard,
  connection: ConnCard,
  dns: DNSCard,
  sniff: SniffCard,
  log: LogCard,
  rule: RuleCard,
  override: OverrideCard
}

interface Props {
  iconOnly?: boolean
}

export default function SiderCards({ iconOnly = false }: Props): React.JSX.Element {
  const { appConfig, patchAppConfig } = useAppConfig()
  const persistedSiderOrder = appConfig?.siderOrder
  const configuredOrder = useMemo(
    () => normalizeSiderOrder(persistedSiderOrder),
    [persistedSiderOrder]
  )
  const supportsAppRouting = appRoutingSupported(window.api.platform, window.api.arch)
  const siderOrder = useMemo(
    () =>
      supportsAppRouting
        ? configuredOrder.includes('app-routing')
          ? configuredOrder
          : [...configuredOrder.slice(0, 2), 'app-routing', ...configuredOrder.slice(2)]
        : configuredOrder.filter((key) => key !== 'app-routing'),
    [configuredOrder, supportsAppRouting]
  )
  const [order, setOrder] = useState(siderOrder)
  const isAccountVisible = (appConfig?.kokoroCardStatus ?? 'col-span-2') !== 'hidden'
  const suppressClickRef = useRef(false)
  const suppressClickTimerRef = useRef<number | undefined>(undefined)
  const navigate = useNavigate()
  const sensors = useCardDndSensors({ mouseDistance: 8, touchDelay: 220, touchTolerance: 10 })

  useEffect(() => {
    setOrder(siderOrder)
  }, [siderOrder])

  useLayoutEffect(() => {
    markInitialContentPartReady('sider')
  }, [])

  useEffect(() => {
    return (): void => {
      if (suppressClickTimerRef.current) {
        window.clearTimeout(suppressClickTimerRef.current)
      }
    }
  }, [])

  const releaseClickSuppression = (): void => {
    if (suppressClickTimerRef.current) {
      window.clearTimeout(suppressClickTimerRef.current)
    }
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false
    }, 160)
  }

  const onDragEnd = async (event: DragEndEvent): Promise<void> => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      if (groupForSiderKey(String(active.id)) !== groupForSiderKey(String(over.id))) return
      const newOrder = order.slice()
      const activeIndex = newOrder.indexOf(active.id as string)
      const overIndex = newOrder.indexOf(over.id as string)
      newOrder.splice(activeIndex, 1)
      newOrder.splice(overIndex, 0, active.id as string)
      setOrder(newOrder)
      await patchAppConfig({ siderOrder: newOrder })
    }
  }

  const onClickCapture = (event: MouseEvent<HTMLDivElement>): void => {
    if (suppressClickRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    const target = event.target as HTMLElement
    if (target.closest(interactiveSelector)) return

    const clickedCard = target.closest(siderCardSelector)
    if (!clickedCard) return

    const route = Object.entries(siderCardRouteMap).find(([className]) =>
      clickedCard.classList.contains(className)
    )?.[1]
    if (route) navigate(route)
  }

  const renderCards = (keys?: Set<string>): React.ReactNode[] =>
    order.flatMap((key: string) => {
      if (keys && !keys.has(key)) return []
      const Component = componentMap[key]
      if (!Component) return []
      return [<Component key={key} iconOnly={iconOnly} />]
    })

  const orderedKeys = (keys: Set<string>): string[] => order.filter((key) => keys.has(key))
  const hasNavigationItems = orderedKeys(navigationKeys).length > 0

  if (iconOnly) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <div className="flex min-h-full w-full flex-col items-center px-2 pb-2">
          <SiderIconGroup label={tr('Quick controls')}>
            {renderCards(quickControlKeys)}
          </SiderIconGroup>
          {isAccountVisible && (
            <SiderIconGroup label="Kokoro" separated>
              {renderCards(accountKeys)}
            </SiderIconGroup>
          )}
          <SiderIconGroup label={tr('Current status')} separated>
            {renderCards(currentStatusKeys)}
          </SiderIconGroup>
          {hasNavigationItems && (
            <SiderIconGroup label={tr('Navigation')} separated>
              {renderCards(navigationKeys)}
            </SiderIconGroup>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'clip' }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={() => {
          suppressClickRef.current = true
        }}
        onDragCancel={releaseClickSuppression}
        onDragEnd={(event) => {
          void onDragEnd(event).finally(releaseClickSuppression)
        }}
      >
        <div className="m-2 flex flex-col gap-3" onClickCapture={onClickCapture}>
          <SortableContext items={orderedKeys(quickControlKeys)}>
            <SiderSection title={tr('Quick controls')} columns={2}>
              {renderCards(quickControlKeys)}
            </SiderSection>
          </SortableContext>
          {isAccountVisible && (
            <SiderSection title="Kokoro">{renderCards(accountKeys)}</SiderSection>
          )}
          <SortableContext items={orderedKeys(currentStatusKeys)}>
            <SiderSection title={tr('Current status')}>
              {renderCards(currentStatusKeys)}
            </SiderSection>
          </SortableContext>
          {hasNavigationItems && (
            <SortableContext items={orderedKeys(navigationKeys)}>
              <SiderSection title={tr('Navigation')}>{renderCards(navigationKeys)}</SiderSection>
            </SortableContext>
          )}
        </div>
      </DndContext>
    </div>
  )
}
