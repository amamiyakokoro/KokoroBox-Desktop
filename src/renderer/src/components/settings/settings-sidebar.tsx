import { tr } from '../../../../shared/i18n'
import { Button, Popover, Separator, cn } from '@heroui/react'
import { KokoSearchField } from '@renderer/components/base/koko-search-field'
import { SiderIconButton } from '@renderer/components/sider/sider-surfaces'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { platform } from '@renderer/utils/init'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuArrowLeft, LuChevronRight, LuSearch } from 'react-icons/lu'
import { useSearchParams } from 'react-router-dom'
import { getSettingsCategories, type SettingsCategory } from './settings-registry'
import {
  resolveSettingsSelection,
  searchSettings,
  type SettingsSearchResult
} from './settings-navigation'

interface SettingsSidebarProps {
  iconOnly?: boolean
  leaveSettings: () => void
}

interface SearchResultsProps {
  results: SettingsSearchResult[]
  search: string
  onSelect: (result: SettingsSearchResult) => void
}

const SearchResults = ({
  results,
  search,
  onSelect
}: SearchResultsProps): React.JSX.Element | null => {
  if (!search.trim()) return null

  return (
    <div className="mt-2 min-h-0 flex-1 overflow-y-auto no-scrollbar" aria-live="polite">
      {results.length ? (
        <div className="flex flex-col gap-1">
          {results.map((result) => {
            const Icon = result.category.icon
            return (
              <Button
                key={result.entry.id}
                variant="ghost"
                className="h-auto min-h-11 w-full justify-start gap-2 px-2 py-1.5 text-left"
                onPress={() => onSelect(result)}
              >
                <Icon className="shrink-0 text-base text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{result.entry.label}</span>
                  <span className="block truncate text-xs text-muted">
                    {result.category.label}
                    {result.panelLabel ? ` · ${result.panelLabel}` : ''}
                  </span>
                </span>
                <LuChevronRight aria-hidden="true" className="shrink-0 text-muted" />
              </Button>
            )
          })}
        </div>
      ) : (
        <div className="px-2 py-6 text-center text-sm text-muted">{tr('No settings found')}</div>
      )}
    </div>
  )
}

const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ iconOnly = false, leaveSettings }) => {
  const { appConfig } = useAppConfig()
  const { useWindowFrame = false } = appConfig || {}
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const categories = useMemo(() => getSettingsCategories(), [])
  const { category } = useMemo(
    () => resolveSettingsSelection(categories, searchParams),
    [categories, searchParams]
  )
  const searchResults = useMemo(() => searchSettings(categories, search), [categories, search])

  const focusSearch = useCallback((): void => {
    if (iconOnly) setSearchOpen(true)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [iconOnly])

  const closeSearch = useCallback((): void => {
    setSearch('')
    setSearchOpen(false)
  }, [])

  const selectCategory = (nextCategory: SettingsCategory): void => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', nextCategory)
    nextParams.delete('setting')
    const nextDefinition = categories.find((item) => item.key === nextCategory)
    const nextPanel = nextDefinition?.panels?.[0]?.key
    if (nextPanel) nextParams.set('panel', nextPanel)
    else nextParams.delete('panel')
    setSearchParams(nextParams)
    closeSearch()
  }

  const selectSearchResult = ({ category: resultCategory, entry }: SettingsSearchResult): void => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', resultCategory.key)
    nextParams.set('setting', entry.id)
    if (entry.panel) nextParams.set('panel', entry.panel)
    else nextParams.delete('panel')
    setSearchParams(nextParams)
    closeSearch()
  }

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        focusSearch()
        return
      }
      if (event.key === 'Escape' && (searchOpen || search)) {
        event.preventDefault()
        closeSearch()
      }
    }

    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [closeSearch, focusSearch, search, searchOpen])

  const categoryNavigation = (
    <nav
      aria-label={tr('Settings categories')}
      className={cn(
        'min-h-0 flex-1 overflow-y-auto no-scrollbar',
        iconOnly ? 'flex flex-col items-center gap-2 px-2 py-2' : 'flex flex-col gap-1 px-3 pb-3'
      )}
    >
      {categories.map((item) => {
        const Icon = item.icon
        const active = category === item.key
        return iconOnly ? (
          <SiderIconButton
            key={item.key}
            active={active}
            label={item.label}
            placement="right"
            onPress={() => selectCategory(item.key)}
          >
            <Icon aria-hidden="true" className="text-[19px]" />
          </SiderIconButton>
        ) : (
          <Button
            key={item.key}
            size="sm"
            variant="ghost"
            className={cn(
              'app-nodrag w-full shrink-0 justify-start px-3 font-medium text-muted',
              active
                ? 'bg-accent-soft/55 text-accent-soft-foreground hover:bg-accent-soft/70'
                : 'hover:bg-surface/75 hover:text-foreground'
            )}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            onPress={() => selectCategory(item.key)}
          >
            <Icon aria-hidden="true" className="text-base" />
            <span className="truncate">{item.label}</span>
          </Button>
        )
      })}
    </nav>
  )

  if (iconOnly) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-surface-secondary/65">
        <div className="app-drag h-12.25 shrink-0" />
        <div className="flex shrink-0 flex-col items-center gap-2 px-2 pb-2">
          <SiderIconButton
            label={tr('Back to application')}
            placement="right"
            onPress={leaveSettings}
          >
            <LuArrowLeft aria-hidden="true" className="text-[20px]" />
          </SiderIconButton>
          <Popover isOpen={searchOpen} onOpenChange={setSearchOpen}>
            <Popover.Trigger className="inline-flex">
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className="app-nodrag"
                aria-label={tr('Search settings')}
              >
                <LuSearch aria-hidden="true" className="text-[19px]" />
              </Button>
            </Popover.Trigger>
            <Popover.Content placement="right top" className="w-80 max-w-[calc(100vw-5rem)]">
              <Popover.Dialog className="flex max-h-[min(28rem,calc(100vh-2rem))] flex-col p-3">
                <KokoSearchField
                  autoFocus
                  inputRef={searchInputRef}
                  value={search}
                  aria-label={tr('Search settings')}
                  placeholder={tr('Search settings')}
                  className="w-full"
                  onChangeValue={setSearch}
                  onClear={() => setSearch('')}
                />
                <SearchResults
                  results={searchResults}
                  search={search}
                  onSelect={selectSearchResult}
                />
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        </div>
        <Separator />
        {categoryNavigation}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-secondary/65">
      <div
        className={cn(
          'app-drag flex h-12.25 shrink-0 items-center px-2',
          !useWindowFrame && platform === 'darwin' && 'pl-18'
        )}
      >
        <Button
          variant="ghost"
          className="app-nodrag min-w-0 justify-start px-2 font-semibold"
          aria-label={tr('Back to application')}
          onPress={leaveSettings}
        >
          <LuArrowLeft aria-hidden="true" className="shrink-0" />
          <span className="truncate">{tr('Application settings')}</span>
        </Button>
      </div>
      <Separator />
      <div className="flex min-h-0 flex-1 flex-col pt-3">
        <div className="shrink-0 px-3 pb-3">
          <KokoSearchField
            inputRef={searchInputRef}
            value={search}
            aria-label={tr('Search settings')}
            placeholder={tr('Search settings')}
            className="w-full"
            onChangeValue={setSearch}
            onClear={() => setSearch('')}
          />
        </div>
        {search.trim() ? (
          <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
            <SearchResults results={searchResults} search={search} onSelect={selectSearchResult} />
          </div>
        ) : (
          categoryNavigation
        )}
      </div>
    </div>
  )
}

export default SettingsSidebar
