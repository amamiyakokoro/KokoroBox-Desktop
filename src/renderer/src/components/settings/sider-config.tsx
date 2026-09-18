import { tr } from '../../../../shared/i18n'
import { appRoutingSupported } from '../../../../shared/app-routing'
import React from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Switch } from '@heroui/react'
import { useAppConfig } from '@renderer/hooks/use-app-config'

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
        { key: 'sysproxyCardStatus', title: tr('System proxy'), defaultStatus: 'col-span-1' },
        { key: 'tunCardStatus', title: tr('TUN mode'), defaultStatus: 'col-span-1' }
      ]
    },
    {
      title: tr('Current status'),
      entries: [
        { key: 'profileCardStatus', title: tr('Subscriptions'), defaultStatus: 'col-span-2' },
        { key: 'proxyCardStatus', title: tr('Proxy groups'), defaultStatus: 'col-span-2' },
        {
          key: 'appRoutingCardStatus',
          title: tr('Application routing'),
          defaultStatus: 'col-span-2',
          supported: appRoutingSupported(window.api.platform, window.api.arch)
        },
        {
          key: 'connectionCardStatus',
          title: tr('Connections'),
          defaultStatus: 'col-span-2'
        },
        { key: 'mihomoCoreCardStatus', title: tr('Core'), defaultStatus: 'col-span-2' }
      ]
    },
    {
      title: tr('Navigation'),
      entries: [
        { key: 'dnsCardStatus', title: 'DNS', defaultStatus: 'col-span-1' },
        { key: 'sniffCardStatus', title: tr('Sniffing'), defaultStatus: 'col-span-1' },
        {
          key: 'kokoroCardStatus',
          title: tr('Kokoro account and subscription'),
          defaultStatus: 'col-span-2'
        },
        { key: 'ruleCardStatus', title: tr('Rules'), defaultStatus: 'col-span-1' },
        {
          key: 'resourceCardStatus',
          title: tr('External resources'),
          defaultStatus: 'col-span-1'
        },
        { key: 'overrideCardStatus', title: tr('Overrides'), defaultStatus: 'col-span-1' },
        { key: 'logCardStatus', title: tr('Logs'), defaultStatus: 'col-span-1' }
      ]
    }
  ]

  return (
    <section data-setting-label={tr('Sidebar settings')} tabIndex={-1}>
      {groups.map((group) => {
        const entries = group.entries.filter((item) => item.supported !== false)
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
