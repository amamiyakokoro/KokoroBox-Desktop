import { tr } from '../../../../shared/i18n'
import { appRoutingSupported } from '../../../../shared/app-routing'
import React from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { RadioGroup, Radio } from '@heroui/react'
import { useAppConfig } from '@renderer/hooks/use-app-config'
const titleMap = {
  sysproxyCardStatus: tr('System proxy'),
  tunCardStatus: tr('TUN mode'),
  appRoutingCardStatus: tr('Application routing'),
  profileCardStatus: tr('Subscriptions'),
  kokoroCardStatus: tr('Kokoro settings'),
  proxyCardStatus: tr('Proxy groups'),
  ruleCardStatus: tr('Rules'),
  resourceCardStatus: tr('External resources'),
  overrideCardStatus: tr('Overrides'),
  connectionCardStatus: tr('Connections'),
  mihomoCoreCardStatus: tr('Core'),
  dnsCardStatus: 'DNS',
  sniffCardStatus: tr('Sniffing'),
  logCardStatus: tr('Logs')
}
const SiderConfig: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    sysproxyCardStatus = 'col-span-1',
    tunCardStatus = 'col-span-1',
    appRoutingCardStatus = 'col-span-2',
    profileCardStatus = 'col-span-2',
    kokoroCardStatus = 'col-span-2',
    proxyCardStatus = 'col-span-2',
    ruleCardStatus = 'col-span-1',
    resourceCardStatus = 'col-span-1',
    overrideCardStatus = 'col-span-1',
    connectionCardStatus = 'col-span-2',
    mihomoCoreCardStatus = 'col-span-2',
    dnsCardStatus = 'col-span-1',
    sniffCardStatus = 'col-span-1',
    logCardStatus = 'col-span-1'
  } = appConfig || {}

  const cardStatus = {
    sysproxyCardStatus,
    tunCardStatus,
    ...(appRoutingSupported(window.api.platform, window.api.arch) ? { appRoutingCardStatus } : {}),
    profileCardStatus,
    kokoroCardStatus,
    proxyCardStatus,
    ruleCardStatus,
    resourceCardStatus,
    overrideCardStatus,
    connectionCardStatus,
    mihomoCoreCardStatus,
    dnsCardStatus,
    sniffCardStatus,
    logCardStatus
  }

  return (
    <SettingCard header={tr('Sidebar settings')}>
      {Object.keys(cardStatus).map((key, index, array) => {
        return (
          <SettingItem
            compatKey="legacy"
            title={titleMap[key]}
            key={key}
            divider={index !== array.length - 1}
          >
            <RadioGroup
              orientation="horizontal"
              value={cardStatus[key]}
              onValueChange={(v) => {
                patchAppConfig({ [key]: v as CardStatus })
              }}
            >
              <Radio value="col-span-2">{tr('Large')}</Radio>
              <Radio value="col-span-1">{tr('Small')}</Radio>
              <Radio value="hidden">{tr('Hide')}</Radio>
            </RadioGroup>
          </SettingItem>
        )
      })}
    </SettingCard>
  )
}

export default SiderConfig
