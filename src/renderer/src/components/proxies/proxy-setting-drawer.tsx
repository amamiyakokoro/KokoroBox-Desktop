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
            <Drawer.Heading className="text-base font-semibold">
              {tr('Proxy group settings')}
            </Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="no-scrollbar flex-1 overflow-y-auto px-5 py-3">
            <div className="flex flex-col gap-1">
              <SettingItem title={tr('Proxy columns')} {...settingItemProps} divider>
                <Select
                  aria-label={tr('Proxy columns')}
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
                      <ListBox.Item id="auto" textValue={tr('Automatic')}>
                        {tr('Automatic')}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="1" textValue={tr('1 column')}>
                        {tr('1 column')}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="2" textValue={tr('2 columns')}>
                        {tr('2 columns')}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="3" textValue={tr('3 columns')}>
                        {tr('3 columns')}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="4" textValue={tr('4 columns')}>
                        {tr('4 columns')}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              </SettingItem>
              <SettingItem title={tr('Proxy sort order')} {...settingItemProps} divider>
                <SettingTabs
                  ariaLabel={tr('Proxy sort order')}
                  selectedKey={proxyDisplayOrder}
                  options={[
                    { id: 'default', label: tr('Default') },
                    { id: 'delay', label: tr('Latency') },
                    { id: 'name', label: tr('Name') }
                  ]}
                  onChange={async (v) => {
                    await patchAppConfig({
                      proxyDisplayOrder: v as 'default' | 'delay' | 'name'
                    })
                  }}
                />
              </SettingItem>
              <SettingItem
                title={tr('Extra proxy group information')}
                {...settingItemProps}
                divider
              >
                <SettingTabs
                  ariaLabel={tr('Extra proxy group information')}
                  selectedKey={groupDisplayLayout}
                  options={[
                    { id: 'hidden', label: tr('Hide') },
                    { id: 'single', label: tr('Single line') },
                    { id: 'double', label: tr('Two lines') }
                  ]}
                  onChange={async (v) => {
                    await patchAppConfig({
                      groupDisplayLayout: v as 'hidden' | 'single' | 'double'
                    })
                  }}
                />
              </SettingItem>
              <SettingItem title={tr('Extra proxy information')} {...settingItemProps} divider>
                <SettingTabs
                  ariaLabel={tr('Extra proxy information')}
                  selectedKey={proxyDisplayLayout}
                  options={[
                    { id: 'hidden', label: tr('Hide') },
                    { id: 'single', label: tr('Single line') },
                    { id: 'double', label: tr('Two lines') }
                  ]}
                  onChange={async (v) => {
                    await patchAppConfig({
                      proxyDisplayLayout: v as 'hidden' | 'single' | 'double'
                    })
                  }}
                />
              </SettingItem>
              <SettingItem
                title={tr('Show selected proxies in nested groups')}
                {...settingItemProps}
                divider
              >
                <Switch
                  aria-label={tr('Show selected proxies in nested groups')}
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
              <SettingItem title={tr('Show proxy details on hover')} {...settingItemProps} divider>
                <Switch
                  aria-label={tr('Show proxy details on hover')}
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
              <SettingItem
                title={tr('Remember expanded proxy groups')}
                {...settingItemProps}
                divider
              >
                <Switch
                  aria-label={tr('Remember expanded proxy groups')}
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
              <SettingItem
                title={tr('Disconnect when switching proxies')}
                {...settingItemProps}
                divider
              >
                <Switch
                  aria-label={tr('Disconnect when switching proxies')}
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
                <SettingItem title={tr('Interrupt mode')} {...settingItemProps} divider>
                  <SettingTabs
                    ariaLabel={tr('Interrupt mode')}
                    selectedKey={closeMode}
                    options={[
                      { id: 'all', label: tr('All connections') },
                      { id: 'group', label: tr('Current group only') }
                    ]}
                    onChange={async (v) => {
                      await patchAppConfig({
                        closeMode: v as 'all' | 'group'
                      })
                    }}
                  />
                </SettingItem>
              )}
              <SettingItem title={tr('Latency test URL')} {...settingItemProps} divider>
                <Input
                  aria-label={tr('Latency test URL')}
                  data-setting-input="url"
                  value={url}
                  placeholder={tr('Default: https://www.gstatic.com/generate_204')}
                  variant="secondary"
                  onChange={(event) => {
                    const v = event.target.value
                    setUrl(v)
                    setUrlDebounce(v)
                  }}
                />
              </SettingItem>
              <SettingItem title={tr('Test URL source')} {...settingItemProps} divider>
                <SettingTabs
                  ariaLabel={tr('Test URL source')}
                  selectedKey={delayTestUrlScope}
                  options={[
                    { id: 'group', label: tr('Use group configuration') },
                    { id: 'global', label: tr('Use a shared URL') }
                  ]}
                  onChange={async (v) => {
                    await patchAppConfig({
                      delayTestUrlScope: v as 'group' | 'global'
                    })
                  }}
                />
              </SettingItem>
              <SettingItem
                title={tr('Test latency with the proxy group API')}
                {...settingItemProps}
                divider
              >
                <Switch
                  aria-label={tr('Test latency with the proxy group API')}
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
                <SettingItem title={tr('Concurrent latency tests')} {...settingItemProps} divider>
                  <InputGroup data-setting-input="number" variant="secondary">
                    <InputGroup.Input
                      aria-label={tr('Concurrent latency tests')}
                      type="number"
                      value={delayTestConcurrency?.toString()}
                      min={MIN_DELAY_TEST_CONCURRENCY}
                      max={MAX_DELAY_TEST_CONCURRENCY}
                      placeholder={tr('Default: {0}', [DEFAULT_DELAY_TEST_CONCURRENCY])}
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
              <SettingItem title={tr('Latency test timeout')} {...settingItemProps}>
                <InputGroup data-setting-input="number" variant="secondary">
                  <InputGroup.Input
                    aria-label={tr('Latency test timeout')}
                    type="number"
                    value={delayTestTimeout?.toString()}
                    placeholder={tr('Default: 5000')}
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
