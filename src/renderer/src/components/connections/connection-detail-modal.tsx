import { tr } from '../../../../shared/i18n'
import { Drawer, Surface, Tabs } from '@heroui/react'
import { KokoActionMenu } from '../base/koko-collections'
import type { ReactNode } from 'react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BaseEditor } from '@renderer/components/base/base-editor-lazy'
import { calcTraffic } from '@renderer/utils/calc'
import dayjs from 'dayjs'
import { BiCopy } from 'react-icons/bi'
import { HiChevronDown } from 'react-icons/hi2'

interface Props {
  connection: ControllerConnectionDetail
  onClose: () => void
}

interface CopyProps {
  title: string
  value: string | string[]
  displayName?: string
  prefix?: string[]
  technical?: boolean
}

interface StaticRow {
  kind: 'static'
  title: string
  content: ReactNode
  technical?: boolean
}

interface CopyRow extends CopyProps {
  kind: 'copy'
}

type DetailRow = StaticRow | CopyRow

const DRAWER_CLOSE_ANIMATION_MS = 220

function buildCopyMenuItems(value: string | string[], displayName?: string, prefix: string[] = []) {
  const getSubDomains = (domain: string): string[] =>
    domain.split('.').length <= 2
      ? [domain]
      : domain
          .split('.')
          .map((_, i, parts) => parts.slice(i).join('.'))
          .slice(0, -1)

  const isIPv6 = (ip: string): boolean => ip.includes(':')

  return [
    { key: 'raw', text: displayName || (Array.isArray(value) ? value.join(', ') : value) },
    ...(Array.isArray(value)
      ? value
          .map((v, i) => {
            const p = prefix[i]
            if (!p || !v) return null

            if (p === 'DOMAIN-SUFFIX') {
              return getSubDomains(v).map((subV) => ({
                key: `${p},${subV}`,
                text: `${p},${subV}`
              }))
            }

            if (p === 'IP-ASN' || p === 'SRC-IP-ASN') {
              return {
                key: `${p},${v.split(' ')[0]}`,
                text: `${p},${v.split(' ')[0]}`
              }
            }

            const suffix =
              p === 'IP-CIDR' || p === 'SRC-IP-CIDR' ? (isIPv6(v) ? '/128' : '/32') : ''
            return {
              key: `${p},${v}${suffix}`,
              text: `${p},${v}${suffix}`
            }
          })
          .filter(Boolean)
          .flat()
      : prefix
          .map((p) => {
            const v = value as string
            if (p === 'DOMAIN-SUFFIX') {
              return getSubDomains(v).map((subV) => ({
                key: `${p},${subV}`,
                text: `${p},${subV}`
              }))
            }

            if (p === 'IP-ASN' || p === 'SRC-IP-ASN') {
              return {
                key: `${p},${v.split(' ')[0]}`,
                text: `${p},${v.split(' ')[0]}`
              }
            }

            const suffix =
              p === 'IP-CIDR' || p === 'SRC-IP-CIDR' ? (isIPv6(v) ? '/128' : '/32') : ''
            return {
              key: `${p},${v}${suffix}`,
              text: `${p},${v}${suffix}`
            }
          })
          .flat())
  ]
}

interface DetailSectionProps {
  title: string
  children: ReactNode
}

const DetailSection = ({ title, children }: DetailSectionProps) => {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="pb-3 last:pb-0">
      <h3
        id={headingId}
        className="mb-1 px-1 text-xs font-medium tracking-wide text-foreground-500"
      >
        {title}
      </h3>
      <div>{children}</div>
    </section>
  )
}

const ConnectionDetailModal = ({ connection, onClose }: Props) => {
  const [viewMode, setViewMode] = useState<'detail' | 'raw'>('detail')
  const [isOpen, setIsOpen] = useState(true)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rawJson = useMemo(() => JSON.stringify(connection, null, 2), [connection])

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  const closeWithAnimation = (): void => {
    if (closeTimer.current) return
    setIsOpen(false)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      onClose()
    }, DRAWER_CLOSE_ANIMATION_MS)
  }

  const renderRow = (row: DetailRow) => {
    const content =
      row.kind === 'copy'
        ? row.displayName || (Array.isArray(row.value) ? row.value.join(', ') : row.value)
        : row.content
    const title = typeof content === 'string' ? content : undefined
    const valueClassName = [
      'min-w-0 select-text break-words text-sm leading-5 text-foreground',
      row.technical ? 'font-mono text-[12px]' : ''
    ]
      .filter(Boolean)
      .join(' ')

    const action =
      row.kind === 'copy' ? (
        <KokoActionMenu
          ariaLabel={`${tr('Copy rule')}: ${row.title}`}
          buttonClassName="app-nodrag h-7 min-h-7 w-7 min-w-7 rounded-md text-foreground-400 hover:bg-default/40 hover:text-foreground focus-visible:text-foreground"
          buttonVariant="ghost"
          items={buildCopyMenuItems(row.value, row.displayName, row.prefix)
            .filter((item) => item !== null)
            .map(({ key, text }) => ({ id: key, label: text, textValue: text }))}
          popoverClassName="min-w-55"
          onAction={(id) =>
            navigator.clipboard.writeText(
              id === 'raw' ? (Array.isArray(row.value) ? row.value.join(', ') : row.value) : id
            )
          }
        >
          <BiCopy className="text-base" />
        </KokoActionMenu>
      ) : null

    return (
      <div
        key={row.title}
        className="grid min-h-9 grid-cols-[minmax(104px,0.34fr)_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-separator/60 px-1 py-1.5 first:border-t-0"
      >
        <div className="min-w-0 text-xs leading-5 text-foreground-500">{row.title}</div>
        <div className={valueClassName} title={title}>
          {content}
        </div>
        <div className="flex min-h-7 min-w-7 items-center justify-end">{action}</div>
      </div>
    )
  }

  const renderRows = (rows: DetailRow[]) => rows.map(renderRow)

  const summaryRows: DetailRow[] = [
    {
      kind: 'static',
      title: tr('Connection start time'),
      content: dayjs(connection.start).fromNow()
    },
    {
      kind: 'static',
      title: tr('Rules'),
      content: (
        <>
          {connection.rule ? connection.rule : tr('No matching rule')}
          {connection.rulePayload ? `(${connection.rulePayload})` : ''}
        </>
      ),
      technical: true
    },
    {
      kind: 'static',
      title: tr('Proxy chain'),
      content: [...connection.chains].reverse().join('>>'),
      technical: true
    }
  ]

  const trafficRows: DetailRow[] = [
    {
      kind: 'static',
      title: tr('Upload speed'),
      content: `${calcTraffic(connection.uploadSpeed || 0)}/s`
    },
    {
      kind: 'static',
      title: tr('Download speed'),
      content: `${calcTraffic(connection.downloadSpeed || 0)}/s`
    },
    { kind: 'static', title: tr('Uploaded'), content: calcTraffic(connection.upload) },
    { kind: 'static', title: tr('Downloaded'), content: calcTraffic(connection.download) }
  ]

  const connectionRows: DetailRow[] = [
    {
      kind: 'copy',
      title: tr('Connection type'),
      value: [connection.metadata.type, connection.metadata.network],
      displayName: `${connection.metadata.type}(${connection.metadata.network})`,
      prefix: ['IN-TYPE', 'NETWORK'],
      technical: true
    },
    ...(connection.metadata.host
      ? [
          {
            kind: 'copy' as const,
            title: tr('Host'),
            value: connection.metadata.host,
            prefix: ['DOMAIN', 'DOMAIN-SUFFIX'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.sniffHost
      ? [
          {
            kind: 'copy' as const,
            title: tr('Sniffed host'),
            value: connection.metadata.sniffHost,
            prefix: ['DOMAIN', 'DOMAIN-SUFFIX'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.sourceIP
      ? [
          {
            kind: 'copy' as const,
            title: tr('Source IP'),
            value: connection.metadata.sourceIP,
            prefix: ['SRC-IP-CIDR'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.sourcePort
      ? [
          {
            kind: 'copy' as const,
            title: tr('Source port'),
            value: connection.metadata.sourcePort,
            prefix: ['SRC-PORT'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.destinationIP
      ? [
          {
            kind: 'copy' as const,
            title: tr('Destination IP'),
            value: connection.metadata.destinationIP,
            prefix: ['IP-CIDR'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.destinationPort
      ? [
          {
            kind: 'copy' as const,
            title: tr('Destination port'),
            value: connection.metadata.destinationPort,
            prefix: ['DST-PORT'],
            technical: true
          }
        ]
      : [])
  ]

  const processRows: DetailRow[] = [
    ...(connection.metadata.process && connection.metadata.type != 'Inner'
      ? [
          {
            kind: 'copy' as const,
            title: tr('Process'),
            value: connection.metadata.process,
            prefix: ['PROCESS-NAME'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.processPath && connection.metadata.type != 'Inner'
      ? [
          {
            kind: 'copy' as const,
            title: tr('Process path'),
            value: connection.metadata.processPath,
            prefix: ['PROCESS-PATH'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.uid && connection.metadata.type != 'Inner'
      ? [
          {
            kind: 'copy' as const,
            title: 'UID',
            value: connection.metadata.uid.toString(),
            prefix: ['UID'],
            technical: true
          }
        ]
      : [])
  ]

  const advancedRows: DetailRow[] = [
    ...(connection.metadata.sourceGeoIP && connection.metadata.sourceGeoIP.length > 0
      ? [
          {
            kind: 'copy' as const,
            title: tr('Source GeoIP'),
            value: connection.metadata.sourceGeoIP,
            prefix: ['SRC-GEOIP'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.sourceIPASN
      ? [
          {
            kind: 'copy' as const,
            title: tr('Source ASN'),
            value: connection.metadata.sourceIPASN,
            prefix: ['SRC-IP-ASN'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.destinationGeoIP && connection.metadata.destinationGeoIP.length > 0
      ? [
          {
            kind: 'copy' as const,
            title: tr('Destination GeoIP'),
            value: connection.metadata.destinationGeoIP,
            prefix: ['GEOIP'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.destinationIPASN
      ? [
          {
            kind: 'copy' as const,
            title: tr('Destination ASN'),
            value: connection.metadata.destinationIPASN,
            prefix: ['IP-ASN'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.inboundIP
      ? [
          {
            kind: 'copy' as const,
            title: tr('Inbound IP'),
            value: connection.metadata.inboundIP,
            prefix: ['SRC-IP-CIDR'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.inboundPort && connection.metadata.inboundPort !== '0'
      ? [
          {
            kind: 'copy' as const,
            title: tr('Inbound port'),
            value: connection.metadata.inboundPort,
            prefix: ['SRC-PORT'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.inboundName
      ? [
          {
            kind: 'copy' as const,
            title: tr('Inbound name'),
            value: connection.metadata.inboundName,
            prefix: ['IN-NAME'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.inboundUser
      ? [
          {
            kind: 'copy' as const,
            title: tr('Inbound user'),
            value: connection.metadata.inboundUser,
            prefix: ['IN-USER'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.dscp !== 0
      ? [
          {
            kind: 'copy' as const,
            title: 'DSCP',
            value: connection.metadata.dscp.toString(),
            prefix: ['DSCP'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.remoteDestination
      ? [
          {
            kind: 'copy' as const,
            title: tr('Remote destination'),
            value: connection.metadata.remoteDestination,
            prefix: ['IP-CIDR'],
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.dnsMode
      ? [
          {
            kind: 'static' as const,
            title: tr('DNS mode'),
            content: connection.metadata.dnsMode,
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.specialProxy
      ? [
          {
            kind: 'static' as const,
            title: tr('Special proxies'),
            content: connection.metadata.specialProxy,
            technical: true
          }
        ]
      : []),
    ...(connection.metadata.specialRules
      ? [
          {
            kind: 'static' as const,
            title: tr('Special rules'),
            content: connection.metadata.specialRules,
            technical: true
          }
        ]
      : [])
  ]

  return (
    <Drawer.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) closeWithAnimation()
      }}
      variant="transparent"
      className="page-settings-drawer-backdrop top-12 h-[calc(100%-48px)]"
    >
      <Drawer.Content
        placement="right"
        className="page-settings-drawer-content top-12 h-[calc(100%-48px)] p-2 pl-0"
      >
        <Drawer.Dialog className="connection-detail-modal page-settings-drawer flag-emoji flex h-full w-[min(580px,calc(100vw-16px))] max-w-none flex-col overflow-hidden rounded-xl! border border-separator/80 bg-overlay p-0 shadow-overlay">
          <Drawer.Header className="app-drag shrink-0 border-b border-separator/70 px-5 py-3">
            <Drawer.Heading className="text-base font-semibold">
              {tr('Connection details')}
            </Drawer.Heading>
          </Drawer.Header>
          <Tabs
            aria-label={tr('Connection details view')}
            className="flex min-h-0 flex-1 flex-col"
            selectedKey={viewMode}
            variant="secondary"
            onSelectionChange={(key) => setViewMode(key as 'detail' | 'raw')}
          >
            <div className="app-nodrag shrink-0 border-b border-separator/70 px-5 py-2">
              <Tabs.ListContainer>
                <Tabs.List aria-label={tr('Switch connection details view')}>
                  <Tabs.Tab id="detail">
                    {tr('Details')}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="raw">
                    {tr('Raw data')}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
            </div>
            <Drawer.Body className="min-h-0 flex-1 overflow-hidden p-0">
              <Tabs.Panel
                id="detail"
                className="mt-0! h-full overflow-y-auto px-5 py-3 outline-hidden"
              >
                <DetailSection title={tr('General')}>{renderRows(summaryRows)}</DetailSection>
                <DetailSection title={tr('Traffic usage')}>{renderRows(trafficRows)}</DetailSection>
                <DetailSection title={tr('Connection')}>{renderRows(connectionRows)}</DetailSection>
                {processRows.length > 0 ? (
                  <DetailSection title={tr('Process')}>{renderRows(processRows)}</DetailSection>
                ) : null}
                {advancedRows.length > 0 ? (
                  <details className="group border-t border-separator/70 pt-2">
                    <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded-lg px-1 text-xs font-medium tracking-wide text-foreground-500 outline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
                      <span>{tr('Advanced options')}</span>
                      <HiChevronDown
                        aria-hidden="true"
                        className="text-base transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <div className="pt-1">{renderRows(advancedRows)}</div>
                  </details>
                ) : null}
              </Tabs.Panel>
              <Tabs.Panel id="raw" className="mt-0! h-full overflow-hidden p-3! outline-hidden">
                <Surface
                  variant="secondary"
                  className="app-nodrag h-full overflow-hidden rounded-lg"
                >
                  {viewMode === 'raw' ? (
                    <BaseEditor value={rawJson} language="json" readOnly />
                  ) : null}
                </Surface>
              </Tabs.Panel>
            </Drawer.Body>
          </Tabs>
          <Drawer.CloseTrigger aria-label={tr('Close')} className="app-nodrag" />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

export default ConnectionDetailModal
