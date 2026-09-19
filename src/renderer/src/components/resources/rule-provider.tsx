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
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Button } from '@heroui/react'
import { IoMdRefresh } from 'react-icons/io'
import { CgLoadbarDoc } from 'react-icons/cg'
import { MdEditDocument } from 'react-icons/md'
import dayjs from 'dayjs'
import { notify } from '@renderer/utils/notification'

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
    <SettingCard>
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
      <SettingItem compatKey="legacy" title={tr('Rule providers')} divider>
        <Button
          size="sm"
          variant="primary"
          onPress={() => {
            providers.forEach((provider, index) => {
              onUpdate(provider.name, index)
            })
          }}
        >
          {tr('Update all')}
        </Button>
      </SettingItem>
      {providers.map((provider, index) => (
        <div
          key={provider.name}
          className={`flex min-h-14 items-center gap-3 px-1 py-2 ${
            index !== providers.length - 1 ? 'border-b border-divider' : ''
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-sm font-medium text-foreground" title={provider.name}>
                {provider.name}
              </span>
              <span className="shrink-0 text-xs font-medium text-foreground-600 tabular-nums">
                {tr('{0} rules', [provider.ruleCount])}
              </span>
            </div>
            <div
              className="mt-0.5 truncate text-xs text-foreground-500"
              title={`${provider.vehicleType}::${provider.behavior} · ${provider.format || 'InlineRule'} · ${dayjs(provider.updatedAt).fromNow()}`}
            >
              {provider.vehicleType}::{provider.behavior} · {provider.format || 'InlineRule'} ·{' '}
              {dayjs(provider.updatedAt).fromNow()}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
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
          </div>
        </div>
      ))}
    </SettingCard>
  )
}

export default RuleProvider
