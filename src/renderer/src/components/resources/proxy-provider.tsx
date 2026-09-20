import { tr } from '../../../../shared/i18n'
import {
  mihomoProxyProviders,
  mihomoUpdateProxyProviders,
  getRuntimeConfig
} from '@renderer/utils/ipc'
import { useEffect, useMemo, useState } from 'react'
import Viewer from './viewer'
import useSWR from 'swr'
import { IoMdRefresh } from 'react-icons/io'
import { CgLoadbarDoc } from 'react-icons/cg'
import { MdEditDocument, MdQrCode2 } from 'react-icons/md'
import QRCodeModal from '../base/base-qrcode-modal'
import dayjs from 'dayjs'
import { calcTraffic } from '@renderer/utils/calc'
import { getHash } from '@renderer/utils/hash'
import { Button, Meter } from '@heroui/react'
import { notify } from '@renderer/utils/notification'
import { ResourceProviderRow, ResourceSection } from './resource-surfaces'

const ProxyProvider: React.FC = () => {
  const [showDetails, setShowDetails] = useState({
    show: false,
    path: '',
    type: '',
    title: '',
    providerType: '',
    ageSecretKey: ''
  })
  const [qrCode, setQrCode] = useState<{ name: string; url: string } | null>(null)
  useEffect(() => {
    if (showDetails.title) {
      const fetchProviderPath = async (name: string): Promise<void> => {
        try {
          const providers = await getRuntimeConfig()
          const provider = providers?.['proxy-providers']?.[name] as ProxyProviderConfig
          if (provider) {
            setShowDetails((prev) => ({
              ...prev,
              show: true,
              path: provider.path || `proxies/${getHash(provider.url || '')}`,
              ageSecretKey: provider['age-secret-key'] || ''
            }))
          }
        } catch {
          setShowDetails((prev) => ({ ...prev, path: '', ageSecretKey: '' }))
        }
      }
      fetchProviderPath(showDetails.title)
    }
  }, [showDetails.title])

  const { data, mutate } = useSWR('mihomoProxyProviders', mihomoProxyProviders, {
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
    return Object.values(data.providers)
      .filter((provider) => provider.vehicleType !== 'Compatible')
      .sort((a, b) => {
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
      await mihomoUpdateProxyProviders(name)
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

  if (!providers.length) {
    return null
  }

  const onShowQrCode = async (name: string): Promise<void> => {
    try {
      const config = await getRuntimeConfig()
      const provider = config?.['proxy-providers']?.[name] as ProxyProviderConfig
      if (provider?.url) {
        setQrCode({ name, url: provider.url })
      }
    } catch {
      // ignore
    }
  }

  return (
    <>
      {qrCode && (
        <QRCodeModal title={qrCode.name} url={qrCode.url} onClose={() => setQrCode(null)} />
      )}
      {showDetails.show && (
        <Viewer
          path={showDetails.path}
          type={showDetails.type}
          title={showDetails.title}
          providerType={showDetails.providerType}
          ageSecretKey={showDetails.ageSecretKey || undefined}
          onClose={() =>
            setShowDetails({
              show: false,
              path: '',
              type: '',
              title: '',
              providerType: '',
              ageSecretKey: ''
            })
          }
        />
      )}
      <ResourceSection
        title={tr('Proxy providers')}
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
          const metadata = `${provider.vehicleType} · ${dayjs(provider.updatedAt).fromNow()}`

          return (
            <ResourceProviderRow
              key={provider.name}
              name={provider.name}
              count={tr('{0} proxies', [provider.proxies?.length || 0])}
              metadata={metadata}
              metadataTitle={metadata}
              actions={
                <>
                  {provider.vehicleType === 'HTTP' && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label={`${tr('QR code')}: ${provider.name}`}
                      onPress={() => onShowQrCode(provider.name)}
                    >
                      <MdQrCode2 className="text-lg" />
                    </Button>
                  )}
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={`${tr('View details')}: ${provider.name}`}
                    onPress={() => {
                      setShowDetails({
                        show: false,
                        providerType: 'proxy-providers',
                        path: provider.name,
                        type: provider.vehicleType,
                        title: provider.name,
                        ageSecretKey: ''
                      })
                    }}
                  >
                    {provider.vehicleType == 'File' ? (
                      <MdEditDocument className="text-lg" />
                    ) : (
                      <CgLoadbarDoc className="text-lg" />
                    )}
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={`${tr('Refresh')}: ${provider.name}`}
                    onPress={() => {
                      onUpdate(provider.name, index)
                    }}
                  >
                    <IoMdRefresh className={`text-lg ${updating[index] ? 'animate-spin' : ''}`} />
                  </Button>
                </>
              }
              details={
                provider.subscriptionInfo ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between gap-4 text-xs leading-4 text-muted">
                      <span className="tabular-nums">
                        {`${calcTraffic(
                          provider.subscriptionInfo.Upload + provider.subscriptionInfo.Download
                        )} / ${calcTraffic(provider.subscriptionInfo.Total)}`}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {provider.subscriptionInfo.Expire
                          ? dayjs.unix(provider.subscriptionInfo.Expire).format('YYYY-MM-DD')
                          : tr('No expiration')}
                      </span>
                    </div>
                    <Meter
                      aria-label={tr('{0} traffic usage', [provider.name])}
                      className="w-full"
                      maxValue={provider.subscriptionInfo.Total}
                      value={provider.subscriptionInfo.Upload + provider.subscriptionInfo.Download}
                    >
                      <Meter.Track>
                        <Meter.Fill />
                      </Meter.Track>
                    </Meter>
                  </div>
                ) : undefined
              }
            />
          )
        })}
      </ResourceSection>
    </>
  )
}

export default ProxyProvider
