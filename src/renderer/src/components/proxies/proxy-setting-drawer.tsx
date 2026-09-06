import { tr } from '../../../../shared/i18n'
import { Drawer, Input, InputGroup, ListBox, Select, Switch } from '@heroui-v3/react'
import React, { useState, useEffect, useRef } from 'react'
import SettingItem from '../base/base-setting-item'
import { SettingTabs, settingItemProps } from '../base/base-controls'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import debounce from '@renderer/utils/debounce'
import {
  DEFAULT_DELAY_TEST_CONCURRENCY,
  MAX_DELAY_TEST_CONCURRENCY,
  MIN_DELAY_TEST_CONCURRENCY,
  normalizeDelayTestConcurrency
} from '@renderer/utils/delay-test'

interface Props {
  onClose: () => void
  reopenSignal?: number
}

const DRAWER_CLOSE_ANIMATION_MS = 700

const ProxySettingDrawer: React.FC<Props> = (props) => {
  const { onClose, reopenSignal } = props
  const { appConfig, patchAppConfig } = useAppConfig()

  const {
    proxyCols = 'auto',
    proxyDisplayOrder = 'default',
    groupDisplayLayout = 'single',
    proxyDisplayLayout = 'double',
    showGroupSelectedProxy = false,
    showProxyDetailTooltip = false,
    autoCloseConnection = true,
    closeMode = 'all',
    delayTestUrl,
    delayTestUrlScope = 'group',
    delayTestUseGroupApi = false,
    delayTestConcurrency,
    delayTestTimeout,
    rememberProxyGroupOpenState = false
  } = appConfig || {}

  const [url, setUrl] = useState(delayTestUrl ?? '')
  const [isOpen, setIsOpen] = useState(true)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setUrlDebounce = useRef(
    debounce((v: string) => {
      patchAppConfig({ delayTestUrl: v })
    }, 500)
  ).current

  useEffect(() => {
    setUrl(delayTestUrl ?? '')
  }, [delayTestUrl])

  useEffect(() => {
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setIsOpen(true)
  }, [reopenSignal])

  const closeWithAnimation = (): void => {
    if (closeTimer.current) return

    setIsOpen(false)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      onClose()
    }, DRAWER_CLOSE_ANIMATION_MS)
  }

  return (
    <Drawer.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) closeWithAnimation()
      }}
      variant="blur"
      className="top-12 h-[calc(100%-48px)]"
    >
      <Drawer.Content placement="right" className="top-12 h-[calc(100%-48px)] p-3 pl-0">
        <Drawer.Dialog className="flex h-full w-[min(520px,calc(100vw-32px))] max-w-none flex-col overflow-hidden rounded-2xl! border border-separator/70 bg-overlay p-0 shadow-overlay flag-emoji">
          <Drawer.Header className="border-b border-separator/70 px-5 py-4">
            <Drawer.Heading className="text-base font-semibold">{tr('代理组设置')}</Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="no-scrollbar flex-1 overflow-y-auto px-5 py-3">
            <div className="flex flex-col gap-1">
              <SettingItem title={tr('代理节点展示列数')} {...settingItemProps} divider>
                <Select
                  aria-label={tr('代理节点展示列数')}
                  className="w-40!"
                  value={proxyCols}
                  variant="secondary"
                  onChange={async (value) => {
                    if (Array.isArray(value) || value == null) return
                    if (value === proxyCols) return

                    await patchAppConfig({
                      proxyCols: value as 'auto' | '1' | '2' | '3' | '4'
                    })
                  }}
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="auto" textValue={tr('自动')}>
                        {tr('自动')}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="1" textValue={tr('一列')}>
                        {tr('一列')}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="2" textValue={tr('两列')}>
                        {tr('两列')}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="3" textValue={tr('三列')}>
                        {tr('三列')}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="4" textValue={tr('四列')}>
                        {tr('四列')}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              </SettingItem>
              <SettingItem title={tr('节点排序方式')} {...settingItemProps} divider>
                <SettingTabs
                  ariaLabel={tr('节点排序方式')}
                  selectedKey={proxyDisplayOrder}
                  options={[
                    { id: 'default', label: tr('默认') },
                    { id: 'delay', label: tr('延迟') },
                    { id: 'name', label: tr('名称') }
                  ]}
                  onChange={async (v) => {
                    await patchAppConfig({
                      proxyDisplayOrder: v as 'default' | 'delay' | 'name'
                    })
                  }}
                />
              </SettingItem>
              <SettingItem title={tr('代理组额外信息')} {...settingItemProps} divider>
                <SettingTabs
                  ariaLabel={tr('代理组额外信息')}
                  selectedKey={groupDisplayLayout}
                  options={[
                    { id: 'hidden', label: tr('隐藏') },
                    { id: 'single', label: tr('单行') },
                    { id: 'double', label: tr('双行') }
                  ]}
                  onChange={async (v) => {
                    await patchAppConfig({
                      groupDisplayLayout: v as 'hidden' | 'single' | 'double'
                    })
                  }}
                />
              </SettingItem>
              <SettingItem title={tr('代理节点额外信息')} {...settingItemProps} divider>
                <SettingTabs
                  ariaLabel={tr('代理节点额外信息')}
                  selectedKey={proxyDisplayLayout}
                  options={[
                    { id: 'hidden', label: tr('隐藏') },
                    { id: 'single', label: tr('单行') },
                    { id: 'double', label: tr('双行') }
                  ]}
                  onChange={async (v) => {
                    await patchAppConfig({
                      proxyDisplayLayout: v as 'hidden' | 'single' | 'double'
                    })
                  }}
                />
              </SettingItem>
              <SettingItem title={tr('显示二级分组选中节点')} {...settingItemProps} divider>
                <Switch
                  aria-label={tr('显示二级分组选中节点')}
                  isSelected={showGroupSelectedProxy}
                  onChange={(v) => {
                    patchAppConfig({ showGroupSelectedProxy: v })
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
              <SettingItem title={tr('悬停显示节点详情')} {...settingItemProps} divider>
                <Switch
                  aria-label={tr('悬停显示节点详情')}
                  isSelected={showProxyDetailTooltip}
                  onChange={(v) => {
                    patchAppConfig({ showProxyDetailTooltip: v })
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
              <SettingItem title={tr('记住代理组展开状态')} {...settingItemProps} divider>
                <Switch
                  aria-label={tr('记住代理组展开状态')}
                  isSelected={rememberProxyGroupOpenState}
                  onChange={(v) => {
                    patchAppConfig({ rememberProxyGroupOpenState: v })
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
              <SettingItem title={tr('切换节点时断开连接')} {...settingItemProps} divider>
                <Switch
                  aria-label={tr('切换节点时断开连接')}
                  isSelected={autoCloseConnection}
                  onChange={(v) => {
                    patchAppConfig({ autoCloseConnection: v })
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
              {autoCloseConnection && (
                <SettingItem title={tr('打断模式')} {...settingItemProps} divider>
                  <SettingTabs
                    ariaLabel={tr('打断模式')}
                    selectedKey={closeMode}
                    options={[
                      { id: 'all', label: tr('所有连接') },
                      { id: 'group', label: tr('仅当前组') }
                    ]}
                    onChange={async (v) => {
                      await patchAppConfig({
                        closeMode: v as 'all' | 'group'
                      })
                    }}
                  />
                </SettingItem>
              )}
              <SettingItem title={tr('延迟测试地址')} {...settingItemProps} divider>
                <Input
                  aria-label={tr('延迟测试地址')}
                  data-setting-input="url"
                  value={url}
                  placeholder={tr('默认 https://www.gstatic.com/generate_204')}
                  variant="secondary"
                  onChange={(event) => {
                    const v = event.target.value
                    setUrl(v)
                    setUrlDebounce(v)
                  }}
                />
              </SettingItem>
              <SettingItem title={tr('测试地址来源')} {...settingItemProps} divider>
                <SettingTabs
                  ariaLabel={tr('测试地址来源')}
                  selectedKey={delayTestUrlScope}
                  options={[
                    { id: 'group', label: tr('使用组配置') },
                    { id: 'global', label: tr('使用统一地址') }
                  ]}
                  onChange={async (v) => {
                    await patchAppConfig({
                      delayTestUrlScope: v as 'group' | 'global'
                    })
                  }}
                />
              </SettingItem>
              <SettingItem title={tr('使用策略组 API 测速')} {...settingItemProps} divider>
                <Switch
                  aria-label={tr('使用策略组 API 测速')}
                  isSelected={delayTestUseGroupApi}
                  onChange={(v) => {
                    patchAppConfig({ delayTestUseGroupApi: v })
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
              {!delayTestUseGroupApi && (
                <SettingItem title={tr('延迟测试并发数量')} {...settingItemProps} divider>
                  <InputGroup data-setting-input="number" variant="secondary">
                    <InputGroup.Input
                      aria-label={tr('延迟测试并发数量')}
                      type="number"
                      value={delayTestConcurrency?.toString()}
                      min={MIN_DELAY_TEST_CONCURRENCY}
                      max={MAX_DELAY_TEST_CONCURRENCY}
                      placeholder={tr('默认 {0}', [DEFAULT_DELAY_TEST_CONCURRENCY])}
                      onChange={(event) => {
                        const v = event.target.value
                        patchAppConfig({
                          delayTestConcurrency: normalizeDelayTestConcurrency(parseInt(v))
                        })
                      }}
                    />
                  </InputGroup>
                </SettingItem>
              )}
              <SettingItem title={tr('延迟测试超时时间')} {...settingItemProps}>
                <InputGroup data-setting-input="number" variant="secondary">
                  <InputGroup.Input
                    aria-label={tr('延迟测试超时时间')}
                    type="number"
                    value={delayTestTimeout?.toString()}
                    placeholder={tr('默认 5000')}
                    onChange={(event) => {
                      const v = event.target.value
                      patchAppConfig({ delayTestTimeout: parseInt(v) })
                    }}
                  />
                  <InputGroup.Suffix>ms</InputGroup.Suffix>
                </InputGroup>
              </SettingItem>
            </div>
          </Drawer.Body>
          <Drawer.CloseTrigger className="app-nodrag" />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

export default ProxySettingDrawer
