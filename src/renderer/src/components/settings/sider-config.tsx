import { tr } from '../../../../shared/i18n'
import { appRoutingSupported } from '../../../../shared/app-routing'
import React from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import {
  KokoButton as Button,
  KokoSwitch as Switch,
  KokoTooltip as Tooltip
} from '../base/koko-form'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { LuArrowDown, LuArrowUp } from 'react-icons/lu'
import { normalizeSiderOrder } from '../sider/sider-order'

type SiderCardConfigKey =
  | 'sysproxyCardStatus'
  | 'tunCardStatus'
  | 'appRoutingCardStatus'
  | 'profileCardStatus'
  | 'kokoroCardStatus'
  | 'proxyCardStatus'
  | 'ruleCardStatus'
  | 'resourceCardStatus'
  | 'overrideCardStatus'
  | 'connectionCardStatus'
  | 'mihomoCoreCardStatus'
  | 'dnsCardStatus'
  | 'sniffCardStatus'
  | 'logCardStatus'

interface SiderConfigEntry {
  id: string
  key: SiderCardConfigKey
  title: string
  defaultStatus: Exclude<CardStatus, 'hidden'>
  supported?: boolean
}

const SiderConfig: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const groups: { title: string; entries: SiderConfigEntry[] }[] = [
    {
      title: tr('Quick controls'),
      entries: [
        {
          id: 'sysproxy',
          key: 'sysproxyCardStatus',
          title: tr('System proxy'),
          defaultStatus: 'col-span-1'
        },
        {
          id: 'tun',
          key: 'tunCardStatus',
          title: tr('TUN mode'),
          defaultStatus: 'col-span-1'
        }
      ]
    },
    {
      title: tr('Current status'),
      entries: [
        {
          id: 'profile',
          key: 'profileCardStatus',
          title: tr('Subscriptions'),
          defaultStatus: 'col-span-2'
        },
        {
          id: 'proxy',
          key: 'proxyCardStatus',
          title: tr('Proxy groups'),
          defaultStatus: 'col-span-2'
        },
        {
          id: 'app-routing',
          key: 'appRoutingCardStatus',
          title: tr('Application routing'),
          defaultStatus: 'col-span-2',
          supported: appRoutingSupported(window.api.platform, window.api.arch)
        },
        {
          id: 'connection',
          key: 'connectionCardStatus',
          title: tr('Connections'),
          defaultStatus: 'col-span-2'
        },
        {
          id: 'mihomo',
          key: 'mihomoCoreCardStatus',
          title: tr('Core'),
          defaultStatus: 'col-span-2'
        }
      ]
    },
    {
      title: tr('Navigation'),
      entries: [
        { id: 'dns', key: 'dnsCardStatus', title: 'DNS', defaultStatus: 'col-span-1' },
        {
          id: 'sniff',
          key: 'sniffCardStatus',
          title: tr('Sniffing'),
          defaultStatus: 'col-span-1'
        },
        {
          id: 'kokoro',
          key: 'kokoroCardStatus',
          title: tr('Kokoro account and subscription'),
          defaultStatus: 'col-span-2'
        },
        {
          id: 'rule',
          key: 'ruleCardStatus',
          title: tr('Rules'),
          defaultStatus: 'col-span-1'
        },
        {
          id: 'resource',
          key: 'resourceCardStatus',
          title: tr('External resources'),
          defaultStatus: 'col-span-1'
        },
        {
          id: 'override',
          key: 'overrideCardStatus',
          title: tr('Overrides'),
          defaultStatus: 'col-span-1'
        },
        {
          id: 'log',
          key: 'logCardStatus',
          title: tr('Logs'),
          defaultStatus: 'col-span-1'
        }
      ]
    }
  ]
  const siderOrder = normalizeSiderOrder(appConfig?.siderOrder)

  const moveSiderItem = async (
    entries: SiderConfigEntry[],
    itemId: string,
    direction: -1 | 1
  ): Promise<void> => {
    const index = entries.findIndex((item) => item.id === itemId)
    const adjacent = entries[index + direction]
    if (index < 0 || !adjacent) return

    const nextOrder = [...siderOrder]
    const itemIndex = nextOrder.indexOf(itemId)
    const adjacentIndex = nextOrder.indexOf(adjacent.id)
    if (itemIndex < 0 || adjacentIndex < 0) return

    ;[nextOrder[itemIndex], nextOrder[adjacentIndex]] = [
      nextOrder[adjacentIndex],
      nextOrder[itemIndex]
    ]
    await patchAppConfig({ siderOrder: nextOrder })
  }

  return (
    <section data-setting-label={tr('Sidebar settings')} tabIndex={-1}>
      {groups.map((group) => {
        const entries = group.entries
          .filter((item) => item.supported !== false)
          .sort((left, right) => siderOrder.indexOf(left.id) - siderOrder.indexOf(right.id))
        return (
          <SettingCard key={group.title} header={group.title}>
            {entries.map((item, index) => {
              const status = appConfig?.[item.key] ?? item.defaultStatus
              return (
                <SettingItem
                  compatKey="legacy"
                  title={item.title}
                  key={item.key}
                  divider={index !== entries.length - 1}
                >
                  <div className="flex items-center gap-1">
                    <Tooltip content={`${tr('Move up')}: ${item.title}`}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        aria-label={`${tr('Move up')}: ${item.title}`}
                        isDisabled={index === 0}
                        onPress={() => void moveSiderItem(entries, item.id, -1)}
                      >
                        <LuArrowUp aria-hidden="true" />
                      </Button>
                    </Tooltip>
                    <Tooltip content={`${tr('Move down')}: ${item.title}`}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        aria-label={`${tr('Move down')}: ${item.title}`}
                        isDisabled={index === entries.length - 1}
                        onPress={() => void moveSiderItem(entries, item.id, 1)}
                      >
                        <LuArrowDown aria-hidden="true" />
                      </Button>
                    </Tooltip>
                    <Switch
                      size="sm"
                      aria-label={item.title}
                      isSelected={status !== 'hidden'}
                      onValueChange={(visible) => {
                        void patchAppConfig({
                          [item.key]: visible ? item.defaultStatus : 'hidden'
                        })
                      }}
                    />
                  </div>
                </SettingItem>
              )
            })}
          </SettingCard>
        )
      })}
    </section>
  )
}

export default SiderConfig
