import { tr } from '../../../shared/i18n'
import { Button, Input } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
import { IoLogoGithub } from 'react-icons/io5'
import {
  findSettingsEntry,
  getSettingsCategories,
  legacyCategoryAliases,
  type SettingsCategory
} from '@renderer/components/settings/settings-registry'
import { SettingCardModeProvider } from '@renderer/components/base/base-setting-card'
import { SettingItemModeProvider } from '@renderer/components/base/base-setting-item'
import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LuChevronRight, LuSearch } from 'react-icons/lu'

const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
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
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const searchResults = useMemo(
    () =>
      normalizedSearch
        ? categories.flatMap((item) =>
            item.entries
              .filter((entry) => {
                const searchableText = [entry.label, ...(entry.keywords ?? []), item.label]
                  .join(' ')
                  .toLocaleLowerCase()
                return searchableText.includes(normalizedSearch)
              })
              .map((entry) => ({ category: item, entry }))
          )
        : [],
    [categories, normalizedSearch]
  )

  const selectCategory = (nextCategory: SettingsCategory, settingId?: string): void => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', nextCategory)
    if (settingId) nextParams.set('setting', settingId)
    else nextParams.delete('setting')
    setSearchParams(nextParams)
  }

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
      header={
        <Button
          isIconOnly
          size="sm"
          variant="light"
          className="app-nodrag"
          aria-label="GitHub"
          onPress={() => window.open('https://github.com/amamiyakokoro/KokoroBox-Desktop')}
        >
          <IoLogoGithub className="text-lg" />
        </Button>
      }
    >
      <div className="settings-layout grid min-h-full">
        <nav
          aria-label={tr('Settings categories')}
          className="settings-navigation sticky top-0 z-10 flex h-[calc(100vh-49px)] flex-col border-r border-divider bg-background/95 p-3 backdrop-blur"
        >
          <Input
            size="sm"
            isClearable
            value={search}
            aria-label={tr('Search settings')}
            placeholder={tr('Search settings')}
            startContent={<LuSearch className="shrink-0 text-foreground-400" />}
            className="settings-navigation-search mb-2 shrink-0"
            onValueChange={setSearch}
            onClear={() => setSearch('')}
          />
          <div className="flex flex-col gap-1 overflow-y-auto">
            {categories.map((item) => {
              const Icon = item.icon
              const active = category === item.key && !normalizedSearch
              return (
                <Button
                  key={item.key}
                  size="sm"
                  variant={active ? 'flat' : 'light'}
                  color={active ? 'primary' : 'default'}
                  className="settings-category-button app-nodrag w-full shrink-0 justify-start px-3"
                  aria-label={item.label}
                  title={item.label}
                  startContent={<Icon className="text-base" />}
                  onPress={() => {
                    setSearch('')
                    selectCategory(item.key)
                  }}
                >
                  <span className="settings-category-label">{item.label}</span>
                </Button>
              )
            })}
          </div>
        </nav>
        <main className="min-w-0 px-4 pb-4">
          <div className="mx-auto w-full max-w-[1040px]">
            <div className="flex items-center gap-4 px-3 pb-1 pt-3">
              <h1 className="min-w-0 flex-1 text-xl font-semibold tracking-tight">
                {normalizedSearch ? tr('Search settings') : selected.label}
              </h1>
              <Input
                size="sm"
                isClearable
                value={search}
                aria-label={tr('Search settings')}
                placeholder={tr('Search settings')}
                startContent={<LuSearch className="shrink-0 text-foreground-400" />}
                className="settings-content-search w-60 shrink-0"
                onValueChange={setSearch}
                onClear={() => setSearch('')}
              />
            </div>
            {normalizedSearch ? (
              <div className="mx-3 mt-2 border-y border-divider">
                {searchResults.length ? (
                  searchResults.map(({ category: resultCategory, entry }) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="flex w-full items-center gap-3 border-b border-divider px-2 py-2 text-left transition-colors last:border-b-0 hover:bg-default-100 focus-visible:outline-2 focus-visible:outline-primary"
                      onClick={() => {
                        selectCategory(resultCategory.key, entry.id)
                        setSearch('')
                      }}
                    >
                      <resultCategory.icon className="shrink-0 text-lg text-foreground-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{entry.label}</span>
                        <span className="block text-xs text-foreground-500">
                          {resultCategory.label}
                        </span>
                      </span>
                      <LuChevronRight className="shrink-0 text-foreground-400" />
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-6 text-center text-sm text-foreground-500">
                    {tr('No settings found')}
                  </div>
                )}
              </div>
            ) : (
              <SettingCardModeProvider value={false}>
                <SettingItemModeProvider value={false}>
                  {selected.content()}
                </SettingItemModeProvider>
              </SettingCardModeProvider>
            )}
          </div>
        </main>
      </div>
    </BasePage>
  )
}

export default Settings
