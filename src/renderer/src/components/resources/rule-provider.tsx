import { tr } from '../../../../shared/i18n'
import {
  mihomoRuleProviders,
  mihomoUpdateRuleProviders,
  getRuntimeConfig
} from '@renderer/utils/ipc'
import { getHash } from '@renderer/utils/hash'
import Viewer from './viewer'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Button, Spinner, Surface } from '@heroui/react'
import { LuRefreshCw } from 'react-icons/lu'
import { CgLoadbarDoc } from 'react-icons/cg'
import { MdEditDocument } from 'react-icons/md'
import dayjs from 'dayjs'
import { notify } from '@renderer/utils/notification'
import { ResourceProviderRow } from './resource-surfaces'
import { KokoSearchField } from '../base/koko-search-field'
import { KokoToolbar, KokoToolbarIconButton } from '../base/koko-toolbar'
import { includesIgnoreCase } from '@renderer/utils/includes'

const RuleProvider: React.FC = () => {
  const [filter, setFilter] = useState('')
  const [updating, setUpdating] = useState<Set<string>>(() => new Set())
  const [updatingAll, setUpdatingAll] = useState(false)
  const [showDetails, setShowDetails] = useState({
    show: false,
    path: '',
    type: '',
    title: '',
    format: '',
    providerType: ''
  })
  useEffect(() => {
    if (!showDetails.title) return

    let canceled = false
    const fetchProviderPath = async (name: string): Promise<void> => {
      try {
        const providers = await getRuntimeConfig()
        const provider = providers?.['rule-providers']?.[name] as ProxyProviderConfig
        if (canceled) return
        if (provider) {
          setShowDetails((prev) => ({
            ...prev,
            show: true,
            path: provider?.path || `rules/${getHash(provider?.url || '')}`
          }))
        } else {
          setShowDetails((prev) => ({ ...prev, show: true, path: name }))
        }
      } catch {
        if (canceled) return
        setShowDetails((prev) => ({ ...prev, show: true, path: name }))
      }
    }
    fetchProviderPath(showDetails.title)
    return () => {
      canceled = true
    }
  }, [showDetails.title])

  const { data, mutate } = useSWR('mihomoRuleProviders', mihomoRuleProviders, {
    errorRetryInterval: 200,
    errorRetryCount: 10
  })

  useEffect(() => {
    const unsubscribeCoreStarted = window.electron.ipcRenderer.on('core-started', () => {
      mutate()
    })
    return (): void => {
      unsubscribeCoreStarted()
    }
  }, [])

  const providers = useMemo(() => {
    if (!data) return []
    return Object.values(data.providers).sort((a, b) => {
      const order = { File: 1, Inline: 2, HTTP: 3 }
      return (order[a.vehicleType] || 4) - (order[b.vehicleType] || 4)
    })
  }, [data])
  const filteredProviders = useMemo(() => {
    const query = filter.trim()
    if (!query) return providers
    return providers.filter((provider) =>
      [provider.name, provider.vehicleType, provider.behavior, provider.format].some((value) =>
        includesIgnoreCase(value || '', query)
      )
    )
  }, [filter, providers])

  const onUpdate = async (name: string): Promise<void> => {
    setUpdating((prev) => {
      const next = new Set(prev)
      next.add(name)
      return next
    })
    try {
      await mihomoUpdateRuleProviders(name)
      await mutate()
    } catch (e) {
      notify(tr('Failed to update {0}\n{1}', [name, e]), { variant: 'danger' })
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev)
        next.delete(name)
        return next
      })
    }
  }

  const updateAll = async (): Promise<void> => {
    if (updatingAll || !providers.length) return
    setUpdatingAll(true)
    try {
      await Promise.all(providers.map((provider) => onUpdate(provider.name)))
    } finally {
      setUpdatingAll(false)
    }
  }

  const openProviderDetails = (provider: ControllerRuleProviderDetail): void => {
    setShowDetails({
      show: true,
      providerType: 'rule-providers',
      path: '',
      type: provider.vehicleType,
      title: provider.name,
      format: provider.format
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showDetails.show && (
        <Viewer
          path={showDetails.path}
          type={showDetails.type}
          title={showDetails.title}
          format={showDetails.format}
          providerType={showDetails.providerType}
          onClose={() =>
            setShowDetails({
              show: false,
              path: '',
              type: '',
              title: '',
              format: '',
              providerType: ''
            })
          }
        />
      )}
      <KokoToolbar
        aria-label={tr('Rule collections')}
        className="shrink-0 border-b border-separator"
      >
        <KokoSearchField
          aria-label={tr('Search rule collections')}
          className="min-w-0 flex-1"
          placeholder={tr('Search rule collections')}
          value={filter}
          onClear={() => setFilter('')}
          onValueChange={setFilter}
        />
        <KokoToolbarIconButton
          isDisabled={updatingAll || updating.size > 0 || !providers.length}
          label={tr('Update all')}
          onPress={updateAll}
        >
          <LuRefreshCw
            aria-hidden="true"
            className={`text-base ${updatingAll ? 'animate-spin' : ''}`}
          />
        </KokoToolbarIconButton>
      </KokoToolbar>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <main className="resource-page mx-auto w-full max-w-[68rem] px-5 py-4">
          {!data ? (
            <div className="flex min-h-32 items-center justify-center text-muted">
              <Spinner size="sm" aria-label={tr('Loading')} />
            </div>
          ) : filteredProviders.length ? (
            <Surface className="resource-section__body">
              {filteredProviders.map((provider) => {
                const metadata = `${provider.vehicleType} · ${provider.behavior} · ${provider.format || 'InlineRule'} · ${dayjs(provider.updatedAt).fromNow()}`

                return (
                  <ResourceProviderRow
                    key={provider.name}
                    name={provider.name}
                    count={tr('{0} rules', [provider.ruleCount])}
                    metadata={metadata}
                    metadataTitle={metadata}
                    actions={
                      <>
                        {provider.vehicleType !== 'Inline' && (
                          <Button
                            isIconOnly
                            variant="ghost"
                            size="sm"
                            aria-label={`${tr('View details')}: ${provider.name}`}
                            onPress={() => openProviderDetails(provider)}
                          >
                            {provider.vehicleType == 'File' ? (
                              <MdEditDocument className="text-lg" />
                            ) : (
                              <CgLoadbarDoc className="text-lg" />
                            )}
                          </Button>
                        )}
                        <Button
                          isDisabled={updating.has(provider.name)}
                          isIconOnly
                          variant="ghost"
                          size="sm"
                          aria-label={`${tr('Refresh')}: ${provider.name}`}
                          onPress={() => onUpdate(provider.name)}
                        >
                          <LuRefreshCw
                            className={`text-lg ${updating.has(provider.name) ? 'animate-spin' : ''}`}
                          />
                        </Button>
                      </>
                    }
                  />
                )
              })}
            </Surface>
          ) : (
            <div className="flex min-h-32 items-center justify-center px-4 text-center text-sm text-muted">
              {providers.length
                ? tr('No rule collections match this search.')
                : tr('No rule collections yet')}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default RuleProvider
