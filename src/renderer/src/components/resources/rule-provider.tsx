/* eslint-disable react/prop-types */
import { tr } from '../../../../shared/i18n'
import { getRuntimeConfig } from '@renderer/utils/ipc'
import { getHash } from '@renderer/utils/hash'
import Viewer from './viewer'
import { useEffect, useMemo, useState } from 'react'
import { Button, Spinner, Surface } from '@heroui/react'
import { LuRefreshCw } from 'react-icons/lu'
import { CgLoadbarDoc } from 'react-icons/cg'
import { MdEditDocument } from 'react-icons/md'
import dayjs from 'dayjs'
import { ResourceProviderRow } from './resource-surfaces'
import { includesIgnoreCase } from '@renderer/utils/includes'
import type { RuleProvidersModel } from '@renderer/hooks/use-rule-providers'

interface RuleProviderProps {
  filter: string
  model: RuleProvidersModel
}

const RuleProvider: React.FC<RuleProviderProps> = ({ filter, model }) => {
  const { data, providers, updating, onUpdate } = model
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

  const filteredProviders = useMemo(() => {
    const query = filter.trim()
    if (!query) return providers
    return providers.filter((provider) =>
      [provider.name, provider.vehicleType, provider.behavior, provider.format].some((value) =>
        includesIgnoreCase(value || '', query)
      )
    )
  }, [filter, providers])

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
