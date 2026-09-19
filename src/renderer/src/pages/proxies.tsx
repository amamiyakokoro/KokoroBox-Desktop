import { tr } from '../../../shared/i18n'
import { Avatar, Card } from '@heroui-v3/react'
import BasePage from '@renderer/components/base/base-page'
import { KokoButton as Button } from '@renderer/components/base/koko-form'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  getImageDataURL,
  mihomoChangeProxy,
  mihomoCloseConnections,
  mihomoGroupDelay,
  mihomoProxyDelay
} from '@renderer/utils/ipc'
import { FaLocationCrosshairs } from 'react-icons/fa6'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { GroupedVirtuoso, GroupedVirtuosoHandle } from 'react-virtuoso'
import ProxyItem from '@renderer/components/proxies/proxy-item'
import ProxySettingDrawer from '@renderer/components/proxies/proxy-setting-drawer'
import { IoIosArrowBack } from 'react-icons/io'
import { MdDoubleArrow, MdOutlineSpeed, MdTune } from 'react-icons/md'
import { useGroups } from '@renderer/hooks/use-groups'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { runDelayTestsWithConcurrency } from '@renderer/utils/delay-test'

type ProxyLike = ControllerProxiesDetail | ControllerGroupDetail

const EMPTY_PROXIES: ProxyLike[] = []

function getProxyDelay(proxy: ProxyLike): number {
  return proxy.history.length > 0 ? proxy.history[proxy.history.length - 1].delay : -1
}

function compareProxyDelay(a: ProxyLike, b: ProxyLike): number {
  const delayA = getProxyDelay(a)
  const delayB = getProxyDelay(b)
  if (delayA === -1) return -1
  if (delayB === -1) return 1
  if (delayA === 0) return 1
  if (delayB === 0) return -1
  return delayA - delayB
}

function getProviderName(proxy: ProxyLike): string | undefined {
  return 'provider-name' in proxy ? proxy['provider-name'] : undefined
}

function getGroupTypeLabel(type: MihomoProxyType): string {
  const labels: Partial<Record<MihomoProxyType, string>> = {
    Selector: tr('Selector'),
    Fallback: tr('Fallback'),
    URLTest: tr('URL test'),
    LoadBalance: tr('Load balance'),
    Relay: tr('Relay')
  }
  return labels[type] ?? type
}

function GroupMetadata({
  group,
  className = ''
}: {
  group: ControllerMixedGroup
  className?: string
}) {
  const showsSelectedTarget =
    Boolean(group.now) && ['Selector', 'Fallback', 'URLTest'].includes(group.type)

  return (
    <span className={`flex min-w-0 items-center gap-1 text-xs text-foreground-500 ${className}`}>
      <span className="shrink-0">{getGroupTypeLabel(group.type)}</span>
      {showsSelectedTarget && (
        <>
          <span aria-hidden="true" className="shrink-0">
            →
          </span>
          <span className="flag-emoji min-w-0 truncate" title={group.now}>
            {group.now}
          </span>
        </>
      )}
      <span className="shrink-0">· {tr('{0} nodes', [group.all.length])}</span>
    </span>
  )
}

interface GroupHeaderProps {
  index: number
  group: ControllerMixedGroup
  isOpen: boolean
  isLast: boolean
  groupDisplayLayout: 'hidden' | 'single' | 'double'
  delaying: boolean
  isRelevant: boolean
  onToggle: (index: number, currentlyOpen: boolean) => void
  onScrollToProxy: (index: number) => void
  onGroupDelay: (index: number) => void
}

const GroupHeader = memo(function GroupHeader({
  index,
  group,
  isOpen,
  isLast,
  groupDisplayLayout,
  delaying,
  isRelevant,
  onToggle,
  onScrollToProxy,
  onGroupDelay
}: GroupHeaderProps) {
  return (
    <div className={`w-full px-2 pt-1.5 ${isLast && !isOpen ? 'pb-1.5' : ''}`}>
      <Card
        aria-expanded={isOpen}
        role="button"
        tabIndex={0}
        className={`w-full cursor-pointer border shadow-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/45 ${
          isRelevant
            ? 'border-primary/25 bg-primary/8'
            : 'border-divider/80 bg-content1/90 hover:bg-default-50'
        }`}
        onClick={() => onToggle(index, isOpen)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onToggle(index, isOpen)
        }}
      >
        <Card.Content className="min-h-14 w-full px-3 py-2">
          <div className="flex min-h-10 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap">
              {group.icon ? (
                <Avatar
                  className="mr-2 size-8 shrink-0 overflow-visible! rounded-none! bg-transparent"
                  size="sm"
                >
                  <Avatar.Image
                    className="object-contain"
                    src={
                      group.icon.startsWith('<svg')
                        ? `data:image/svg+xml;utf8,${group.icon}`
                        : localStorage.getItem(group.icon) || group.icon
                    }
                  />
                </Avatar>
              ) : null}
              <div
                className={`flex min-w-0 flex-1 flex-col ${groupDisplayLayout === 'double' ? 'gap-0.5' : 'justify-center'}`}
              >
                <div className="flex min-w-0 items-center leading-tight">
                  <span
                    className="flag-emoji min-w-0 truncate text-sm font-semibold"
                    title={group.name}
                  >
                    {group.name}
                  </span>
                  {groupDisplayLayout === 'single' && (
                    <GroupMetadata group={group} className="ml-2 max-w-[60%]" />
                  )}
                </div>
                {groupDisplayLayout === 'double' && <GroupMetadata group={group} />}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <div
                className="flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Button
                  variant="light"
                  isLoading={delaying}
                  size="sm"
                  isIconOnly
                  aria-label={tr('Test group latency')}
                  onPress={() => onGroupDelay(index)}
                >
                  <MdOutlineSpeed className="text-lg text-foreground-500" />
                </Button>
                <Button
                  variant="light"
                  size="sm"
                  isIconOnly
                  aria-label={tr('Show selected proxy')}
                  onPress={() => onScrollToProxy(index)}
                >
                  <FaLocationCrosshairs className="text-base text-foreground-500" />
                </Button>
              </div>
              <IoIosArrowBack
                className={`ml-1 flex h-8 items-center text-base text-foreground-400 transition duration-200 ${
                  isOpen ? '-rotate-90' : ''
                }`}
              />
            </div>
          </div>
        </Card.Content>
      </Card>
    </div>
  )
})

interface ProxyGroupPageCache {
  isOpen: Record<string, boolean>
  scrollTop: number
}

const proxyGroupPageCache: ProxyGroupPageCache = {
  isOpen: {},
  scrollTop: 0
}

const Proxies: React.FC = () => {
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { mode = 'rule' } = controledMihomoConfig || {}
  const { groups = [], mutate } = useGroups()
  const { appConfig } = useAppConfig()
  const {
    proxyDisplayLayout = 'double',
    groupDisplayLayout = 'double',
    showGroupSelectedProxy = false,
    showProxyDetailTooltip = false,
    proxyDisplayOrder = 'default',
    autoCloseConnection = true,
    closeMode = 'all',
    proxyCols = 'auto',
    delayTestUrlScope = 'group',
    delayTestUseGroupApi = false,
    delayTestConcurrency,
    rememberProxyGroupOpenState = false
  } = appConfig || {}
  const [cols, setCols] = useState(1)
  const [isOpen, setIsOpen] = useState<boolean[]>(() => {
    if (
      rememberProxyGroupOpenState &&
      groups.length > 0 &&
      Object.keys(proxyGroupPageCache.isOpen).length > 0
    ) {
      return groups.map((group) => proxyGroupPageCache.isOpen[group.name] ?? false)
    }
    return Array(groups.length).fill(false)
  })
  const [isOpenContent, setIsOpenContent] = useState<boolean[]>(isOpen)
  const isOpenContentRef = useRef<boolean[]>(isOpen)
  isOpenContentRef.current = isOpenContent
  const [delaying, setDelaying] = useState(Array(groups.length).fill(false))
  const [isSettingDrawerOpen, setIsSettingDrawerOpen] = useState(false)
  const [settingDrawerReopenSignal, setSettingDrawerReopenSignal] = useState(0)
  const [initialScrollTop] = useState(() =>
    rememberProxyGroupOpenState ? proxyGroupPageCache.scrollTop : 0
  )
  const virtuosoRef = useRef<GroupedVirtuosoHandle>(null)
  const pendingScrollRef = useRef<number | null>(null)
  const scrollerElRef = useRef<HTMLElement | null>(null)
  const rememberProxyGroupOpenStateRef = useRef(rememberProxyGroupOpenState)
  rememberProxyGroupOpenStateRef.current = rememberProxyGroupOpenState
  const previousGroupsRef = useRef(groups)

  const scrollerRef = useCallback((el: Window | HTMLElement | null) => {
    if (scrollerElRef.current) {
      if (rememberProxyGroupOpenStateRef.current && scrollerElRef.current.isConnected) {
        proxyGroupPageCache.scrollTop = scrollerElRef.current.scrollTop
      }
      scrollerElRef.current.onscroll = null
    }
    scrollerElRef.current = el instanceof HTMLElement ? el : null
    if (scrollerElRef.current) {
      const htmlEl = scrollerElRef.current
      htmlEl.onscroll = () => {
        if (rememberProxyGroupOpenStateRef.current) {
          proxyGroupPageCache.scrollTop = htmlEl.scrollTop
        }
      }
    }
  }, [])

  useLayoutEffect(() => {
    const previousGroups = previousGroupsRef.current
    previousGroupsRef.current = groups
    if (
      previousGroups.length === groups.length &&
      previousGroups.every((group, index) => group.name === groups[index].name)
    ) {
      return
    }

    const remapByGroupName = <T,>(
      prev: T[],
      getFallback: (group: ControllerMixedGroup) => T
    ): T[] => {
      const previousValues = new Map(
        previousGroups.map((group, index) => [group.name, prev[index]] as const)
      )
      return groups.map((group) => previousValues.get(group.name) ?? getFallback(group))
    }

    const getOpenFallback = (group: ControllerMixedGroup): boolean =>
      rememberProxyGroupOpenStateRef.current
        ? (proxyGroupPageCache.isOpen[group.name] ?? false)
        : false
    setIsOpen((prev) => remapByGroupName(prev, getOpenFallback))
    setIsOpenContent((prev) => remapByGroupName(prev, getOpenFallback))
    setDelaying((prev) => remapByGroupName(prev, () => false))
  }, [groups])

  const { groupCounts, allProxies } = useMemo(() => {
    const groupCounts: number[] = []
    const allProxies: ProxyLike[][] = []
    groups.forEach((group, index) => {
      if (isOpenContent[index]) {
        let groupProxies = group.all as ProxyLike[]

        if (proxyDisplayOrder === 'delay') {
          groupProxies = [...groupProxies].sort(compareProxyDelay)
        }
        if (proxyDisplayOrder === 'name') {
          groupProxies = [...groupProxies].sort((a, b) => a.name.localeCompare(b.name))
        }

        groupCounts.push(Math.ceil(groupProxies.length / cols))
        allProxies.push(groupProxies)
      } else {
        groupCounts.push(0)
        allProxies.push(EMPTY_PROXIES)
      }
    })
    return { groupCounts, allProxies }
  }, [groups, isOpenContent, proxyDisplayOrder, cols])

  const onChangeProxy = useCallback(
    async (group: string, proxy: string): Promise<void> => {
      await mihomoChangeProxy(group, proxy)
      if (autoCloseConnection) {
        if (closeMode === 'all') {
          await mihomoCloseConnections()
        } else if (closeMode === 'group') {
          await mihomoCloseConnections(group)
        }
      }
      mutate()
    },
    [autoCloseConnection, closeMode, mutate]
  )

  const getDelayTestUrl = useCallback(
    (group?: ControllerMixedGroup): string | undefined => {
      if (delayTestUrlScope === 'global') return undefined
      return group?.testUrl
    },
    [delayTestUrlScope]
  )

  const onProxyDelay = useCallback(
    async (proxy: ProxyLike, group?: ControllerMixedGroup): Promise<ControllerProxiesDelay> => {
      return await mihomoProxyDelay(proxy.name, getDelayTestUrl(group), getProviderName(proxy))
    },
    [getDelayTestUrl]
  )

  const setGroupDelaying = useCallback((index: number, value: boolean): void => {
    setDelaying((prev) => {
      const newDelaying = [...prev]
      newDelaying[index] = value
      return newDelaying
    })
  }, [])

  const onGroupDelay = useCallback(
    async (index: number): Promise<void> => {
      const group = groups[index]
      if (!group) return

      const openedProxies = allProxies[index] || EMPTY_PROXIES
      const proxies = openedProxies.length > 0 ? openedProxies : group.all
      if (proxies.length === 0) return

      if (openedProxies.length === 0) {
        if (rememberProxyGroupOpenStateRef.current) {
          proxyGroupPageCache.isOpen[group.name] = true
        }
        setIsOpen((prev) => {
          const newOpen = [...prev]
          newOpen[index] = true
          return newOpen
        })
        setTimeout(() => {
          setIsOpenContent((prev) => {
            const newOpen = [...prev]
            newOpen[index] = true
            return newOpen
          })
        }, 0)
      }

      const testUrl = getDelayTestUrl(group)
      setGroupDelaying(index, true)

      try {
        if (delayTestUseGroupApi) {
          await mihomoGroupDelay(group.name, testUrl)
          return
        }

        await runDelayTestsWithConcurrency(proxies, delayTestConcurrency, async (proxy) => {
          try {
            await mihomoProxyDelay(proxy.name, testUrl, getProviderName(proxy))
          } catch {
            // ignore
          }
        })
      } catch {
        // ignore
      } finally {
        mutate()
        setGroupDelaying(index, false)
      }
    },
    [
      allProxies,
      groups,
      delayTestUseGroupApi,
      delayTestConcurrency,
      mutate,
      getDelayTestUrl,
      setGroupDelaying
    ]
  )

  const calcCols = useCallback((): number => {
    if (window.matchMedia('(min-width: 1536px)').matches) {
      return 5
    } else if (window.matchMedia('(min-width: 1280px)').matches) {
      return 4
    } else if (window.matchMedia('(min-width: 1024px)').matches) {
      return 3
    } else {
      return 2
    }
  }, [])

  const toggleOpen = useCallback((index: number, currentlyOpen: boolean) => {
    const newVal = !currentlyOpen
    if (rememberProxyGroupOpenStateRef.current) {
      const groupName = groupsRef.current[index]?.name
      if (groupName) proxyGroupPageCache.isOpen[groupName] = newVal
    }
    setIsOpen((prev) => {
      const newOpen = [...prev]
      newOpen[index] = newVal
      return newOpen
    })
    if (currentlyOpen) {
      setIsOpenContent((prev) => {
        const newOpen = [...prev]
        newOpen[index] = false
        return newOpen
      })
    } else {
      setTimeout(() => {
        setIsOpenContent((prev) => {
          const newOpen = [...prev]
          newOpen[index] = true
          return newOpen
        })
      }, 0)
    }
  }, [])

  const doScrollToCurrentProxy = useCallback(
    (index: number) => {
      let i = 0
      for (let j = 0; j < index; j++) {
        i += groupCounts[j]
      }
      const proxies = allProxies[index].length > 0 ? allProxies[index] : groups[index].all
      i += Math.floor(proxies.findIndex((proxy) => proxy.name === groups[index].now) / cols)
      virtuosoRef.current?.scrollToIndex({
        index: Math.floor(i),
        align: 'start',
        behavior: 'smooth'
      })
    },
    [groupCounts, allProxies, groups, cols]
  )

  useEffect(() => {
    if (pendingScrollRef.current !== null && isOpenContent[pendingScrollRef.current]) {
      const index = pendingScrollRef.current
      pendingScrollRef.current = null
      setTimeout(() => doScrollToCurrentProxy(index), 150)
    }
  }, [isOpenContent, doScrollToCurrentProxy])

  const scrollToCurrentProxy = useCallback(
    (index: number) => {
      if (!isOpenContentRef.current[index]) {
        pendingScrollRef.current = index
        setIsOpen((prev) => {
          const newOpen = [...prev]
          newOpen[index] = true
          return newOpen
        })
        setTimeout(() => {
          setIsOpenContent((prev) => {
            const newOpen = [...prev]
            newOpen[index] = true
            return newOpen
          })
        }, 0)
      } else {
        doScrollToCurrentProxy(index)
      }
    },
    [doScrollToCurrentProxy]
  )

  const onGroupDelayRef = useRef(onGroupDelay)
  onGroupDelayRef.current = onGroupDelay
  const onGroupDelayStable = useCallback((i: number) => {
    onGroupDelayRef.current(i)
  }, [])

  const scrollToCurrentProxyRef = useRef(scrollToCurrentProxy)
  scrollToCurrentProxyRef.current = scrollToCurrentProxy
  const scrollToCurrentProxyStable = useCallback((i: number) => {
    scrollToCurrentProxyRef.current(i)
  }, [])

  // stable refs for Virtuoso callbacks
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  const groupDisplayLayoutRef = useRef(groupDisplayLayout)
  groupDisplayLayoutRef.current = groupDisplayLayout
  const delayingRef = useRef(delaying)
  delayingRef.current = delaying
  const groupCountsRef = useRef(groupCounts)
  groupCountsRef.current = groupCounts
  const allProxiesRef = useRef(allProxies)
  allProxiesRef.current = allProxies
  const colsRef = useRef(cols)
  colsRef.current = cols
  const mutateRef = useRef(mutate)
  mutateRef.current = mutate
  const onProxyDelayRef = useRef(onProxyDelay)
  onProxyDelayRef.current = onProxyDelay
  const onChangeProxyRef = useRef(onChangeProxy)
  onChangeProxyRef.current = onChangeProxy
  const proxyDisplayLayoutRef = useRef(proxyDisplayLayout)
  proxyDisplayLayoutRef.current = proxyDisplayLayout
  const showGroupSelectedProxyRef = useRef(showGroupSelectedProxy)
  showGroupSelectedProxyRef.current = showGroupSelectedProxy
  const showProxyDetailTooltipRef = useRef(showProxyDetailTooltip)
  showProxyDetailTooltipRef.current = showProxyDetailTooltip
  const proxyCols2Ref = useRef(proxyCols)
  proxyCols2Ref.current = proxyCols
  const toggleOpenRef = useRef(toggleOpen)
  toggleOpenRef.current = toggleOpen

  useEffect(() => {
    groups.forEach((group) => {
      if (group.icon && group.icon.startsWith('http') && !localStorage.getItem(group.icon)) {
        getImageDataURL(group.icon).then((dataURL) => {
          localStorage.setItem(group.icon, dataURL)
          mutate()
        })
      }
    })
  }, [groups, mutate])

  useEffect(() => {
    if (proxyCols !== 'auto') {
      setCols(parseInt(proxyCols))
      return
    }
    setCols(calcCols())
    const handleResize = (): void => {
      setCols(calcCols())
    }
    window.addEventListener('resize', handleResize)
    return (): void => {
      window.removeEventListener('resize', handleResize)
    }
  }, [proxyCols, calcCols])

  const groupContent = useCallback(
    (index: number) => {
      const g = groupsRef.current
      return g[index] ? (
        <GroupHeader
          index={index}
          group={g[index]}
          isOpen={isOpen[index]}
          isLast={index === g.length - 1}
          groupDisplayLayout={groupDisplayLayoutRef.current}
          delaying={delayingRef.current[index]}
          isRelevant={mode === 'global' && g[index].name.toUpperCase() === 'GLOBAL'}
          onToggle={toggleOpenRef.current}
          onScrollToProxy={scrollToCurrentProxyStable}
          onGroupDelay={onGroupDelayStable}
        />
      ) : (
        <div>Never See This</div>
      )
    },
    [isOpen, mode, scrollToCurrentProxyStable, onGroupDelayStable]
  )

  const itemContent = useCallback((index: number, groupIndex: number) => {
    const gc = groupCountsRef.current
    const ap = allProxiesRef.current
    const grps = groupsRef.current
    const c = colsRef.current
    const pCols = proxyCols2Ref.current
    const pLayout = proxyDisplayLayoutRef.current
    const showGroupSelected = showGroupSelectedProxyRef.current
    const showTooltip = showProxyDetailTooltipRef.current
    let innerIndex = index
    for (let i = 0; i < groupIndex; i++) {
      innerIndex -= gc[i]
    }
    const proxies = ap[groupIndex]
    const items: ReactNode[] = []
    for (let i = 0; i < c; i++) {
      const proxy = proxies[innerIndex * c + i]
      if (!proxy) continue
      items.push(
        <ProxyItem
          key={proxy.name}
          mutateProxies={mutateRef.current}
          onProxyDelay={onProxyDelayRef.current}
          onSelect={onChangeProxyRef.current}
          proxy={proxy}
          group={grps[groupIndex]}
          proxyDisplayLayout={pLayout}
          showGroupSelectedProxy={showGroupSelected}
          showProxyDetailTooltip={showTooltip}
          selected={proxy.name === grps[groupIndex].now}
        />
      )
    }
    return proxies ? (
      <div
        style={{
          animation: 'proxy-row-in 0.15s ease both',
          ...(pCols !== 'auto' ? { gridTemplateColumns: `repeat(${pCols}, minmax(0, 1fr))` } : {})
        }}
        className={`grid ${
          pCols === 'auto'
            ? 'sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
            : ''
        } ${
          groupIndex === gc.length - 1 && innerIndex === gc[groupIndex] - 1 ? 'pb-2' : ''
        } gap-2 pt-2 mx-3`}
      >
        {items}
      </div>
    ) : (
      <div>Never See This</div>
    )
  }, [])

  return (
    <BasePage
      title={tr('Proxy groups')}
      header={
        <Button
          size="sm"
          isIconOnly
          variant="light"
          className="app-nodrag"
          aria-label={tr('Proxy group settings')}
          onPress={() => {
            setIsSettingDrawerOpen(true)
            setSettingDrawerReopenSignal((signal) => signal + 1)
          }}
        >
          <MdTune className="text-lg" />
        </Button>
      }
    >
      {isSettingDrawerOpen && (
        <ProxySettingDrawer
          reopenSignal={settingDrawerReopenSignal}
          onClose={() => setIsSettingDrawerOpen(false)}
        />
      )}
      {mode === 'direct' ? (
        <div className="h-full w-full flex justify-center items-center">
          <div className="flex flex-col items-center">
            <MdDoubleArrow className="text-foreground-500 text-[100px]" />
            <h2 className="text-foreground-500 text-[20px]">{tr('Direct mode')}</h2>
          </div>
        </div>
      ) : (
        <div className="h-[calc(100vh-50px)]">
          <GroupedVirtuoso
            ref={virtuosoRef}
            scrollerRef={scrollerRef}
            initialScrollTop={initialScrollTop}
            groupCounts={groupCounts}
            groupContent={groupContent}
            itemContent={itemContent}
            defaultItemHeight={72}
            overscan={200}
          />
        </div>
      )}
    </BasePage>
  )
}

export default Proxies
