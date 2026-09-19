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
import { Button } from '@heroui/react'
import { IoMdRefresh } from 'react-icons/io'
import { CgLoadbarDoc } from 'react-icons/cg'
import { MdEditDocument } from 'react-icons/md'
import dayjs from 'dayjs'
import { notify } from '@renderer/utils/notification'
import { ResourceProviderRow, ResourceSection } from './resource-surfaces'

const RuleProvider: React.FC = () => {
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
  const [updating, setUpdating] = useState(Array(providers.length).fill(false))

  const onUpdate = async (name: string, index: number): Promise<void> => {
    setUpdating((prev) => {
      prev[index] = true
      return [...prev]
    })
    try {
      await mihomoUpdateRuleProviders(name)
      mutate()
    } catch (e) {
      notify(tr('Failed to update {0}\n{1}', [name, e]), { variant: 'danger' })
    } finally {
      setUpdating((prev) => {
        prev[index] = false
        return [...prev]
      })
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

  if (!providers.length) {
    return null
  }

  return (
    <>
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
      <ResourceSection
        title={tr('Rule providers')}
        action={
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              providers.forEach((provider, index) => {
                onUpdate(provider.name, index)
              })
            }}
          >
            <IoMdRefresh className={`text-base ${updating.some(Boolean) ? 'animate-spin' : ''}`} />
            {tr('Update all')}
          </Button>
        }
      >
        {providers.map((provider, index) => {
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
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    aria-label={`${tr('Refresh')}: ${provider.name}`}
                    onPress={() => {
                      onUpdate(provider.name, index)
                    }}
                  >
                    <IoMdRefresh className={`text-lg ${updating[index] ? 'animate-spin' : ''}`} />
                  </Button>
                </>
              }
            />
          )
        })}
      </ResourceSection>
    </>
  )
}

export default RuleProvider
