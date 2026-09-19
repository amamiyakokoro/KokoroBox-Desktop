import { tr } from '../../../../shared/i18n'
import {
  parseDnsServerEndpoint,
  serializeDnsServerEndpoint,
  type DnsServerEndpoint
} from '../../../../shared/dns-server'
import { isValidDnsServer, type ValidationResult } from '@renderer/utils/validate'
import { Button, Tooltip } from '@heroui/react'
import { KokoSelect, KokoTextField as Input } from '../base/koko-form'
import React from 'react'
import { MdDeleteForever } from 'react-icons/md'

interface DnsServerListProps {
  title: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
  divider?: boolean
  ipOnly?: boolean
  followRoutingRules?: boolean
  onErrorChange?: (error: string | null) => void
}

const connectionChoices = [
  { key: 'direct', label: tr('Direct') },
  { key: 'rules', label: tr('Follow rules') }
] as const

const DnsServerList: React.FC<DnsServerListProps> = ({
  title,
  items,
  onChange,
  placeholder,
  divider = true,
  ipOnly = false,
  followRoutingRules = false,
  onErrorChange
}) => {
  const endpoints = items.map(parseDnsServerEndpoint)
  const update = (index: number, next: DnsServerEndpoint): void => {
    const updated = [...endpoints]
    if (!next.address.trim()) {
      if (index < updated.length) updated.splice(index, 1)
      else return
    } else if (index < updated.length) {
      updated[index] = next
    } else {
      updated.push(next)
    }
    const serialized = updated.map(serializeDnsServerEndpoint)
    const invalid = serialized.find((server) => !isValidDnsServer(server, ipOnly).ok)
    onErrorChange?.(
      invalid ? (isValidDnsServer(invalid, ipOnly).error ?? tr('Invalid format')) : null
    )
    onChange(serialized)
  }

  const displayed = [...endpoints, { address: '', connection: 'direct' as const, parameters: [] }]

  return (
    <div className={divider ? 'border-b border-divider pb-4' : ''}>
      <h4 className="mb-2 text-base font-medium">{title}</h4>
      <p className="mb-3 text-xs text-foreground-500">
        {followRoutingRules
          ? tr('DNS connections follow the global routing rules.')
          : tr(
              'Choose how this DNS server connects. Configure Proxy DNS servers as well when using a proxy.'
            )}
      </p>
      <div className="space-y-2">
        {displayed.map((endpoint, index) => {
          const isExtra = index === endpoints.length
          const validation: ValidationResult =
            isExtra || !endpoint.address.trim()
              ? { ok: true }
              : isValidDnsServer(serializeDnsServerEndpoint(endpoint), ipOnly)
          return (
            <div
              key={`${index}-${items[index] ?? 'new'}`}
              className="flex flex-wrap items-center gap-2"
            >
              <Tooltip delay={0} isOpen={!validation.ok}>
                <Tooltip.Trigger className="inline-flex min-w-0 flex-1">
                  <Input
                    aria-label={tr('DNS server')}
                    size="sm"
                    className="min-w-52 flex-1"
                    classNames={{
                      inputWrapper: validation.ok ? '' : 'border-danger ring-1 ring-danger'
                    }}
                    placeholder={placeholder}
                    value={endpoint.address}
                    onValueChange={(address) => update(index, { ...endpoint, address })}
                  />
                </Tooltip.Trigger>
                <Tooltip.Content
                  className="bg-danger text-danger-foreground"
                  placement="left"
                  showArrow
                >
                  {validation.error ?? tr('Invalid format')}
                </Tooltip.Content>
              </Tooltip>
              {!ipOnly && !followRoutingRules && (
                <>
                  <KokoSelect
                    aria-label={tr('Connection')}
                    variant="secondary"
                    className="w-30"
                    value={endpoint.connection === 'proxy' ? 'direct' : endpoint.connection}
                    options={connectionChoices.map(({ key, label }) => ({ id: key, label }))}
                    disallowEmptySelection
                    onChange={(connection) =>
                      update(index, {
                        ...endpoint,
                        connection: connection as 'direct' | 'rules',
                        proxyName: undefined
                      })
                    }
                  />
                </>
              )}
              {!isExtra && (
                <Button
                  isIconOnly
                  size="sm"
                  className="text-warning-700 dark:text-warning-400"
                  variant="secondary"
                  aria-label={tr('Delete')}
                  onPress={() => update(index, { ...endpoint, address: '' })}
                >
                  <MdDeleteForever className="text-lg" />
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DnsServerList
