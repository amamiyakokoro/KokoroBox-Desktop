import { tr } from '../../../shared/i18n'
import { Button } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
import { SettingCardModeProvider } from '@renderer/components/base/base-setting-card'
import { KokoTabs } from '@renderer/components/base/base-controls'
import { resolveSettingsSelection } from '@renderer/components/settings/settings-navigation'
import { getSettingsCategories } from '@renderer/components/settings/settings-registry'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { IoLogoGithub } from 'react-icons/io5'
import { useSearchParams } from 'react-router-dom'

const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const contentRef = useRef<HTMLElement>(null)
  const categories = useMemo(() => getSettingsCategories(), [])
  const { category, requestedSetting, selected, selectedPanel, selectedPanels } = useMemo(
    () => resolveSettingsSelection(categories, searchParams),
    [categories, searchParams]
  )

  const resetContentScroll = useCallback((): void => {
    requestAnimationFrame(() => {
      contentRef.current?.closest<HTMLElement>('.content')?.scrollTo({ top: 0, left: 0 })
    })
  }, [])

  const selectPanel = (panelKey: string): void => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', selected.key)
    nextParams.set('panel', panelKey)
    nextParams.delete('setting')
    setSearchParams(nextParams)
    resetContentScroll()
  }

  useEffect(() => {
    resetContentScroll()
  }, [category, resetContentScroll])

  useEffect(() => {
    if (!requestedSetting || requestedSetting.category.key !== category) return

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
  }, [category, requestedSetting])

  return (
    <BasePage
      title={selected.label}
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
      <main ref={contentRef} className="settings-page min-h-full min-w-0 pb-4">
        {selectedPanels.length > 1 && (
          <header className="settings-context-header sticky top-0 z-10 w-full bg-surface/95">
            <div className="settings-context-inner w-full max-w-[960px] px-6">
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
            </div>
          </header>
        )}
        <div className="settings-content-inner w-full max-w-[960px] px-6">
          <SettingCardModeProvider value={false}>
            {selectedPanel?.content() ?? selected.content?.()}
          </SettingCardModeProvider>
        </div>
      </main>
    </BasePage>
  )
}

export default Settings
