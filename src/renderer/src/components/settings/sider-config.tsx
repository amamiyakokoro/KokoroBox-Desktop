import { tr } from '../../../../shared/i18n'
import React from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { RadioGroup, Radio } from '@heroui/react'
import { useAppConfig } from '@renderer/hooks/use-app-config'
const titleMap = {
  sysproxyCardStatus: tr('系统代理'),
  tunCardStatus: tr('虚拟网卡'),
  appRoutingCardStatus: tr('应用分流'),
  profileCardStatus: tr('订阅管理'),
  kokoroCardStatus: tr('Kokoro 设置'),
  proxyCardStatus: tr('代理组'),
  ruleCardStatus: tr('规则'),
  resourceCardStatus: tr('外部资源'),
  overrideCardStatus: tr('覆写'),
  connectionCardStatus: tr('连接'),
  mihomoCoreCardStatus: tr('内核'),
  dnsCardStatus: 'DNS',
  sniffCardStatus: tr('域名嗅探'),
  logCardStatus: tr('日志')
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
    ...(window.api.platform === 'win32' && window.api.arch === 'x64'
      ? { appRoutingCardStatus }
      : {}),
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
    <SettingCard header={tr('侧边栏设置')}>
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
              <Radio value="col-span-2">{tr('大')}</Radio>
              <Radio value="col-span-1">{tr('小')}</Radio>
              <Radio value="hidden">{tr('隐藏')}</Radio>
            </RadioGroup>
          </SettingItem>
        )
      })}
    </SettingCard>
  )
}

export default SiderConfig
