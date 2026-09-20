import { tr } from '../../../shared/i18n'
import { Button, ScrollShadow, Tooltip, cn } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
import { IoLogoGithub } from 'react-icons/io5'
import {
  findSettingsEntry,
  getSettingsCategories,
  legacyCategoryAliases,
  type SettingsCategory
} from '@renderer/components/settings/settings-registry'
import { SettingCardModeProvider } from '@renderer/components/base/base-setting-card'
import { KokoTabs } from '@renderer/components/base/base-controls'
import { KokoSearchField } from '@renderer/components/base/koko-search-field'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LuChevronLeft, LuChevronRight, LuSearch } from 'react-icons/lu'

const emptyCategoryScrollState = {
  hasOverflow: false,
  canScrollLeft: false,
  canScrollRight: false
}

const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [categoryScrollState, setCategoryScrollState] = useState(emptyCategoryScrollState)
  const layoutRef = useRef<HTMLDivElement>(null)
  const categoryNavigationRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const categories = useMemo(() => getSettingsCategories(), [])
  const requestedCategory = searchParams.get('section')
  const requestedSetting = findSettingsEntry(categories, searchParams.get('setting'))
  const isSettingsCategory = (value: string | null): value is SettingsCategory =>
    categories.some((item) => item.key === value)
  const category: SettingsCategory = isSettingsCategory(requestedCategory)
    ? requestedCategory
    : requestedCategory
      ? (legacyCategoryAliases[requestedCategory] ?? 'general')
      : (requestedSetting?.category.key ?? 'general')
  const selected = categories.find((item) => item.key === category) ?? categories[0]
  const requestedPanel = searchParams.get('panel') ?? requestedSetting?.entry.panel
  const selectedPanels = selected.panels ?? []
  const selectedPanel =
    selectedPanels.find((panel) => panel.key === requestedPanel) ?? selectedPanels[0]
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const searchResults = useMemo(
    () =>
      normalizedSearch
        ? categories.flatMap((item) =>
            item.entries
              .filter((entry) => {
                const panelLabel = item.panels?.find((panel) => panel.key === entry.panel)?.label
                const searchableText = [
                  entry.label,
                  entry.fallbackLabel,
                  panelLabel,
                  ...(entry.keywords ?? []),
                  item.label
                ]
                  .filter((value): value is string => Boolean(value))
                  .join(' ')
                  .toLocaleLowerCase()
                return searchableText.includes(normalizedSearch)
              })
              .map((entry) => ({
                category: item,
                entry,
                panelLabel: item.panels?.find((panel) => panel.key === entry.panel)?.label
              }))
          )
        : [],
    [categories, normalizedSearch]
  )

  const openSearch = useCallback((): void => {
    setSearchExpanded(true)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [])

  const updateCategoryScrollState = useCallback((): void => {
    const navigation = categoryNavigationRef.current
    if (!navigation) return

    const maxScrollLeft = Math.max(0, navigation.scrollWidth - navigation.clientWidth)
    const nextState = {
      hasOverflow: maxScrollLeft > 1,
      canScrollLeft: navigation.scrollLeft > 1,
      canScrollRight: navigation.scrollLeft < maxScrollLeft - 1
    }
    setCategoryScrollState((current) =>
      current.hasOverflow === nextState.hasOverflow &&
      current.canScrollLeft === nextState.canScrollLeft &&
      current.canScrollRight === nextState.canScrollRight
        ? current
        : nextState
    )
  }, [])

  const scrollCategories = (direction: -1 | 1): void => {
    const navigation = categoryNavigationRef.current
    if (!navigation) return
    navigation.scrollBy({
      behavior: 'smooth',
      left: direction * Math.max(200, Math.round(navigation.clientWidth * 0.7))
    })
  }

  const resetContentScroll = (): void => {
    requestAnimationFrame(() => {
      layoutRef.current?.closest<HTMLElement>('.content')?.scrollTo({ top: 0, left: 0 })
    })
  }

  const selectCategory = (
    nextCategory: SettingsCategory,
    settingId?: string,
    panelKey?: string
  ): void => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', nextCategory)
    if (settingId) nextParams.set('setting', settingId)
    else nextParams.delete('setting')
    const nextCategoryDefinition = categories.find((item) => item.key === nextCategory)
    const nextPanel = panelKey ?? nextCategoryDefinition?.panels?.[0]?.key
    if (nextPanel) nextParams.set('panel', nextPanel)
    else nextParams.delete('panel')
    setSearchParams(nextParams)
    resetContentScroll()
  }

  const selectPanel = (panelKey: string): void => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', selected.key)
    nextParams.set('panel', panelKey)
    nextParams.delete('setting')
    setSearchParams(nextParams)
    resetContentScroll()
  }

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        openSearch()
        return
      }
      if (event.key === 'Escape' && (searchExpanded || search)) {
        event.preventDefault()
        setSearch('')
        setSearchExpanded(false)
      }
    }

    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [openSearch, search, searchExpanded])

  useEffect(() => {
    const navigation = categoryNavigationRef.current
    if (!navigation) return

    const animationFrame = requestAnimationFrame(updateCategoryScrollState)
    const resizeObserver = new ResizeObserver(updateCategoryScrollState)
    resizeObserver.observe(navigation)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
    }
  }, [updateCategoryScrollState])

  useEffect(() => {
    const navigation = categoryNavigationRef.current
    const activeCategory = navigation?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!navigation || !activeCategory || navigation.scrollWidth <= navigation.clientWidth) return

    const itemStart = activeCategory.offsetLeft
    const itemEnd = itemStart + activeCategory.offsetWidth
    const visibleStart = navigation.scrollLeft
    const visibleEnd = visibleStart + navigation.clientWidth

    if (itemStart < visibleStart) {
      navigation.scrollTo({ left: itemStart })
    } else if (itemEnd > visibleEnd) {
      navigation.scrollTo({ left: itemEnd - navigation.clientWidth })
    }
  }, [category])

  useEffect(() => {
    if (!requestedSetting || requestedSetting.category.key !== category || normalizedSearch) return

    let animationFrame = 0
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const locateSetting = (): void => {
      const labels = [
        requestedSetting.entry.targetLabel ?? requestedSetting.entry.label,
        requestedSetting.entry.fallbackLabel
      ].filter((label): label is string => Boolean(label))
      const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-setting-label]'))
      const target = labels
        .map((label) => targets.find((node) => node.dataset.settingLabel === label))
        .find(Boolean)

      if (!target && attempts < 4) {
        attempts += 1
        animationFrame = requestAnimationFrame(locateSetting)
        return
      }
      if (!target) return

      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.focus({ preventScroll: true })
      target.classList.remove('settings-search-target')
      void target.offsetWidth
      target.classList.add('settings-search-target')
      cleanupTimer = setTimeout(() => target.classList.remove('settings-search-target'), 1800)
    }

    animationFrame = requestAnimationFrame(locateSetting)
    return () => {
      cancelAnimationFrame(animationFrame)
      if (cleanupTimer) clearTimeout(cleanupTimer)
    }
  }, [category, normalizedSearch, requestedSetting])

  return (
    <BasePage
      title={tr('Application settings')}
      contentClassName="overflow-x-clip"
      header={
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          className="app-nodrag"
          aria-label="GitHub"
          onPress={() => window.open('https://github.com/amamiyakokoro/KokoroBox-Desktop')}
        >
          <IoLogoGithub className="text-lg" />
        </Button>
      }
    >
      <div className="settings-container min-h-full">
        <div ref={layoutRef} className="settings-layout grid min-h-full">
          <nav
            aria-label={tr('Settings categories')}
            className="settings-navigation sticky top-0 z-10 flex h-[calc(100vh-49px)] flex-col border-r border-separator/70 bg-surface-secondary/65 p-3"
          >
            <div className="settings-navigation-search mb-3 flex justify-start">
              {searchExpanded || normalizedSearch ? (
                <KokoSearchField
                  inputRef={searchInputRef}
                  value={search}
                  aria-label={tr('Search settings')}
                  placeholder={tr('Search settings')}
                  className="settings-content-search settings-navigation-search-field w-full"
                  onBlur={(event) => {
                    if (!event.currentTarget.value.trim()) setSearchExpanded(false)
                  }}
                  onChangeValue={setSearch}
                  onClear={() => setSearch('')}
                />
              ) : (
                <Tooltip delay={400}>
                  <Tooltip.Trigger>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      className="settings-search-trigger app-nodrag h-9 w-9 min-w-9"
                      aria-label={tr('Search settings')}
                      onPress={openSearch}
                    >
                      <LuSearch aria-hidden="true" />
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>{tr('Search settings')}</Tooltip.Content>
                </Tooltip>
              )}
            </div>
            <div className="settings-navigation-strip">
              {categoryScrollState.hasOverflow && (
                <Tooltip delay={400}>
                  <Tooltip.Trigger>
                    <Button
                      isDisabled={!categoryScrollState.canScrollLeft}
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      className="settings-navigation-scroll-control app-nodrag h-9 w-9 min-w-9 shrink-0"
                      aria-label={tr('Scroll settings categories left')}
                      onPress={() => scrollCategories(-1)}
                    >
                      <LuChevronLeft aria-hidden="true" />
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>{tr('Scroll settings categories left')}</Tooltip.Content>
                </Tooltip>
              )}
              <ScrollShadow
                ref={categoryNavigationRef}
                orientation="horizontal"
                size={28}
                className="settings-navigation-list flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
                onScroll={updateCategoryScrollState}
              >
                {categories.map((item) => {
                  const Icon = item.icon
                  const active = category === item.key && !normalizedSearch
                  return (
                    <Button
                      key={item.key}
                      size="sm"
                      variant="ghost"
                      className={cn(
                        'settings-category-button app-nodrag w-full shrink-0 justify-start px-3 font-medium text-muted',
                        active
                          ? 'bg-accent-soft/55 text-accent-soft-foreground hover:bg-accent-soft/70'
                          : 'hover:bg-surface/75 hover:text-foreground'
                      )}
                      aria-label={item.label}
                      aria-current={active ? 'page' : undefined}
                      onPress={() => {
                        setSearch('')
                        setSearchExpanded(false)
                        selectCategory(item.key)
                      }}
                    >
                      <Icon className="text-base" />
                      <span className="settings-category-label">{item.label}</span>
                    </Button>
                  )
                })}
              </ScrollShadow>
              {categoryScrollState.hasOverflow && (
                <Tooltip delay={400}>
                  <Tooltip.Trigger>
                    <Button
                      isDisabled={!categoryScrollState.canScrollRight}
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      className="settings-navigation-scroll-control app-nodrag h-9 w-9 min-w-9 shrink-0"
                      aria-label={tr('Scroll settings categories right')}
                      onPress={() => scrollCategories(1)}
                    >
                      <LuChevronRight aria-hidden="true" />
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>{tr('Scroll settings categories right')}</Tooltip.Content>
                </Tooltip>
              )}
            </div>
          </nav>
          <main className="min-w-0 pb-4">
            {(normalizedSearch || selectedPanels.length > 1) && (
              <header className="settings-context-header sticky top-0 z-10 w-full bg-surface/95">
                <div className="settings-context-inner w-full max-w-[960px] px-6">
                  {normalizedSearch ? (
                    <h1 className="py-3 text-lg font-semibold tracking-tight">
                      {tr('Search settings')}
                    </h1>
                  ) : (
                    <nav
                      aria-label={tr('Settings panels')}
                      className="settings-panel-navigation no-scrollbar flex min-h-10 min-w-0 items-center overflow-x-auto"
                    >
                      <KokoTabs
                        ariaLabel={tr('Settings panels')}
                        className="app-nodrag w-max max-w-none"
                        density="toolbar"
                        options={selectedPanels.map((panel) => ({
                          id: panel.key,
                          label: panel.label
                        }))}
                        selectionStyle="accent-underline"
                        selectedKey={selectedPanel?.key ?? selectedPanels[0]?.key ?? ''}
                        variant="secondary"
                        onChange={selectPanel}
                      />
                    </nav>
                  )}
                </div>
              </header>
            )}
            <div className="settings-content-inner w-full max-w-[960px] px-6">
              {normalizedSearch ? (
                <div className="mx-3 mt-2 border-y border-separator">
                  {searchResults.length ? (
                    searchResults.map(({ category: resultCategory, entry, panelLabel }) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="flex w-full items-center gap-3 border-b border-separator px-2 py-2 text-left transition-colors last:border-b-0 hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-focus"
                        onClick={() => {
                          selectCategory(resultCategory.key, entry.id, entry.panel)
                          setSearch('')
                          setSearchExpanded(false)
                        }}
                      >
                        <resultCategory.icon className="shrink-0 text-lg text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{entry.label}</span>
                          <span className="block text-xs text-muted">
                            {resultCategory.label}
                            {panelLabel ? ` · ${panelLabel}` : ''}
                          </span>
                        </span>
                        <LuChevronRight className="shrink-0 text-muted" />
                      </button>
                    ))
                  ) : (
                    <div className="px-2 py-6 text-center text-sm text-muted">
                      {tr('No settings found')}
                    </div>
                  )}
                </div>
              ) : (
                <SettingCardModeProvider value={false}>
                  {selectedPanel?.content() ?? selected.content?.()}
                </SettingCardModeProvider>
              )}
            </div>
          </main>
        </div>
      </div>
    </BasePage>
  )
}

export default Settings
