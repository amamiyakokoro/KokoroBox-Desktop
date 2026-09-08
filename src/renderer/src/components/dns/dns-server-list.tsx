import { tr } from '../../../../shared/i18n'
import {
  parseDnsServerEndpoint,
  serializeDnsServerEndpoint,
  type DnsServerEndpoint
} from '../../../../shared/dns-server'
import { isValidDnsServer, type ValidationResult } from '@renderer/utils/validate'
import { Button, Input, Select, SelectItem, Tooltip } from '@heroui/react'
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
  { key: 'direct', label: tr('直连') },
  { key: 'rules', label: tr('遵守规则') }
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
    onErrorChange?.(invalid ? (isValidDnsServer(invalid, ipOnly).error ?? tr('格式错误')) : null)
    onChange(serialized)
  }

  const displayed = [...endpoints, { address: '', connection: 'direct' as const, parameters: [] }]

  return (
    <div className={divider ? 'border-b border-divider pb-4' : ''}>
      <h4 className="mb-2 text-base font-medium">{title}</h4>
      <p className="mb-3 text-xs text-foreground-500">
        {followRoutingRules
          ? tr('DNS 连接将遵守全局路由规则。')
          : tr('选择 DNS 的连接方式；代理解析请同时设置代理节点解析服务器。')}
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
              <Tooltip
                content={validation.error ?? tr('格式错误')}
                placement="left"
                isOpen={!validation.ok}
                showArrow
                color="danger"
              >
                <Input
                  aria-label={tr('DNS 服务器')}
                  size="sm"
                  className="min-w-52 flex-1"
                  classNames={{
                    inputWrapper: validation.ok ? '' : 'border-danger ring-1 ring-danger'
                  }}
                  placeholder={placeholder}
                  value={endpoint.address}
                  onValueChange={(address) => update(index, { ...endpoint, address })}
                />
              </Tooltip>
              {!ipOnly && !followRoutingRules && (
                <>
                  <Select
                    aria-label={tr('连接方式')}
                    size="sm"
                    className="w-30"
                    selectedKeys={
                      new Set([endpoint.connection === 'proxy' ? 'direct' : endpoint.connection])
                    }
                    disallowEmptySelection
                    onSelectionChange={(keys) =>
                      update(index, {
                        ...endpoint,
                        connection: keys.currentKey as 'direct' | 'rules',
                        proxyName: undefined
                      })
                    }
                  >
                    {connectionChoices.map(({ key, label }) => (
                      <SelectItem key={key}>{label}</SelectItem>
                    ))}
                  </Select>
                </>
              )}
              {!isExtra && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="flat"
                  color="warning"
                  aria-label={tr('删除')}
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
