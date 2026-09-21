import { tr } from '../../../shared/i18n'
import { Button } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  getImageDataURL,
  mihomoChangeProxy,
  mihomoCloseConnections,
  mihomoGroupDelay,
  mihomoProxyDelay
} from '@renderer/utils/ipc'
import {
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
import ProxyGroupHeader from '@renderer/components/proxies/proxy-group-header'
import { KokoSearchField } from '@renderer/components/base/koko-search-field'
import { KokoToolbar } from '@renderer/components/base/koko-toolbar'
import { MdDoubleArrow, MdTune } from 'react-icons/md'
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

interface ProxyGroupPageCache {
  isOpen: Record<string, boolean>
  scrollTop: number
}

const proxyGroupPageCache: ProxyGroupPageCache = {
  isOpen: {},
  scrollTop: 0
}

export function getAutoProxyColumns(width: number): number {
  if (width >= 1600) return 5
  if (width >= 1300) return 4
  if (width >= 1000) return 3
  if (width >= 700) return 2
  return 1
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
  const [filter, setFilter] = useState('')
  const [initialScrollTop] = useState(() =>
    rememberProxyGroupOpenState ? proxyGroupPageCache.scrollTop : 0
  )
  const virtuosoRef = useRef<GroupedVirtuosoHandle>(null)
  const pendingScrollRef = useRef<number | null>(null)
  const proxyListRef = useRef<HTMLDivElement>(null)
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
  const normalizedFilter = filter.trim().toLocaleLowerCase()
  const visibleGroupIndices = useMemo(
    () =>
      groups.flatMap((group, index) => {
        const searchableText = [group.name, group.type, group.now].filter(Boolean).join(' ')
        return searchableText.toLocaleLowerCase().includes(normalizedFilter) ? [index] : []
      }),
    [groups, normalizedFilter]
  )
  const visibleGroupCounts = useMemo(
    () => visibleGroupIndices.map((index) => groupCounts[index] ?? 0),
    [groupCounts, visibleGroupIndices]
  )

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
      const visibleIndex = visibleGroupIndices.indexOf(index)
      if (visibleIndex < 0) return
      for (let j = 0; j < visibleIndex; j++) {
        i += visibleGroupCounts[j]
      }
      const proxies = allProxies[index].length > 0 ? allProxies[index] : groups[index].all
      i += Math.floor(proxies.findIndex((proxy) => proxy.name === groups[index].now) / cols)
      virtuosoRef.current?.scrollToIndex({
        index: Math.floor(i),
        align: 'start',
        behavior: 'smooth'
      })
    },
    [allProxies, cols, groups, visibleGroupCounts, visibleGroupIndices]
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
  const visibleGroupIndicesRef = useRef(visibleGroupIndices)
  visibleGroupIndicesRef.current = visibleGroupIndices
  const visibleGroupCountsRef = useRef(visibleGroupCounts)
  visibleGroupCountsRef.current = visibleGroupCounts
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
    const container = proxyListRef.current
    if (!container) return

    const updateColumns = (width: number): void => setCols(getAutoProxyColumns(width))
    updateColumns(container.clientWidth)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) updateColumns(entry.contentRect.width)
    })
    observer.observe(container)
    return (): void => observer.disconnect()
  }, [mode, proxyCols])

  const groupContent = useCallback(
    (visibleIndex: number) => {
      const g = groupsRef.current
      const index = visibleGroupIndicesRef.current[visibleIndex]
      return g[index] ? (
        <ProxyGroupHeader
          index={index}
          group={g[index]}
          isOpen={isOpen[index]}
          isLast={visibleIndex === visibleGroupIndicesRef.current.length - 1}
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

  const itemContent = useCallback((index: number, visibleGroupIndex: number) => {
    const gc = groupCountsRef.current
    const visibleGc = visibleGroupCountsRef.current
    const groupIndex = visibleGroupIndicesRef.current[visibleGroupIndex]
    const ap = allProxiesRef.current
    const grps = groupsRef.current
    const c = colsRef.current
    const pCols = proxyCols2Ref.current
    const pLayout = proxyDisplayLayoutRef.current
    const showGroupSelected = showGroupSelectedProxyRef.current
    const showTooltip = showProxyDetailTooltipRef.current
    let innerIndex = index
    for (let i = 0; i < visibleGroupIndex; i++) {
      innerIndex -= visibleGc[i]
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
          gridTemplateColumns: `repeat(${pCols === 'auto' ? c : pCols}, minmax(0, 1fr))`
        }}
        className={`mx-3 grid gap-2 border-l-2 border-accent/20 bg-accent-soft/15 px-2 pt-2 ${
          innerIndex === gc[groupIndex] - 1 ? 'pb-2' : ''
        }`}
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
          variant="ghost"
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
            <MdDoubleArrow className="text-muted text-[100px]" />
            <h2 className="text-muted text-[20px]">{tr('Direct mode')}</h2>
          </div>
        </div>
      ) : (
        <div className="flex h-[calc(100vh-50px)] min-w-0 flex-col">
          <KokoToolbar
            aria-label={tr('Proxy groups')}
            className="shrink-0 border-b border-separator"
          >
            <KokoSearchField
              value={filter}
              aria-label={tr('Search proxy groups')}
              placeholder={tr('Search proxy groups')}
              className="min-w-0 flex-1"
              onChangeValue={setFilter}
              onClear={() => setFilter('')}
            />
          </KokoToolbar>
          <div ref={proxyListRef} className="min-h-0 min-w-0 flex-1">
            {normalizedFilter && visibleGroupIndices.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-sm text-muted">
                {tr('No proxy groups match this search.')}
              </div>
            ) : (
              <GroupedVirtuoso
                ref={virtuosoRef}
                scrollerRef={scrollerRef}
                initialScrollTop={initialScrollTop}
                groupCounts={visibleGroupCounts}
                groupContent={groupContent}
                itemContent={itemContent}
                defaultItemHeight={64}
                overscan={200}
              />
            )}
          </div>
        </div>
      )}
    </BasePage>
  )
}

export default Proxies
