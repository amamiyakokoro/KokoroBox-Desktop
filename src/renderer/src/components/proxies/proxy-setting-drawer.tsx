import { tr } from '../../../../shared/i18n'
import { InputGroup, Switch } from '@heroui/react'
import React, { useState, useEffect, useRef } from 'react'
import SettingItem from '../base/base-setting-item'
import { KokoSegmentedControl, settingItemProps } from '../base/base-controls'
import PageSettingsDrawer, { PageSettingsSection } from '../base/base-settings-drawer'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import debounce from '@renderer/utils/debounce'
import {
  DEFAULT_DELAY_TEST_CONCURRENCY,
  MAX_DELAY_TEST_CONCURRENCY,
  MIN_DELAY_TEST_CONCURRENCY,
  normalizeDelayTestConcurrency
} from '@renderer/utils/delay-test'
import { KokoSelect, KokoTextField } from '../base/koko-form'

interface Props {
  onClose: () => void
  reopenSignal?: number
}

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

  const setUrlDebounce = useRef(
    debounce((v: string) => {
      patchAppConfig({ delayTestUrl: v })
    }, 500)
  ).current

  useEffect(() => {
    setUrl(delayTestUrl ?? '')
  }, [delayTestUrl])

  return (
    <PageSettingsDrawer
      title={tr('Proxy group settings')}
      onClose={onClose}
      reopenSignal={reopenSignal}
      width="wide"
    >
      <PageSettingsSection title={tr('Display')}>
        <SettingItem title={tr('Proxy columns')} {...settingItemProps} divider>
          <KokoSelect
            aria-label={tr('Proxy columns')}
            controlWidth="select"
            options={[
              { id: 'auto', label: tr('Automatic') },
              { id: '1', label: tr('1 column') },
              { id: '2', label: tr('2 columns') },
              { id: '3', label: tr('3 columns') },
              { id: '4', label: tr('4 columns') }
            ]}
            value={proxyCols}
            variant="secondary"
            onChange={async (value) => {
              if (value === proxyCols) return
              await patchAppConfig({
                proxyCols: value as 'auto' | '1' | '2' | '3' | '4'
              })
            }}
          />
        </SettingItem>
        <SettingItem title={tr('Proxy sort order')} {...settingItemProps} divider>
          <KokoSegmentedControl
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
        <SettingItem title={tr('Extra proxy group information')} {...settingItemProps} divider>
          <KokoSelect
            aria-label={tr('Extra proxy group information')}
            controlWidth="select"
            options={[
              { id: 'hidden', label: tr('Hide') },
              { id: 'single', label: tr('Single line') },
              { id: 'double', label: tr('Two lines') }
            ]}
            value={groupDisplayLayout}
            variant="secondary"
            onChange={async (v) => {
              await patchAppConfig({
                groupDisplayLayout: v as 'hidden' | 'single' | 'double'
              })
            }}
          />
        </SettingItem>
        <SettingItem title={tr('Extra proxy information')} {...settingItemProps} divider>
          <KokoSelect
            aria-label={tr('Extra proxy information')}
            controlWidth="select"
            options={[
              { id: 'hidden', label: tr('Hide') },
              { id: 'single', label: tr('Single line') },
              { id: 'double', label: tr('Two lines') }
            ]}
            value={proxyDisplayLayout}
            variant="secondary"
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
        <SettingItem title={tr('Remember expanded proxy groups')} {...settingItemProps}>
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
      </PageSettingsSection>

      <PageSettingsSection title={tr('Selection behavior')}>
        <SettingItem
          title={tr('Disconnect when switching proxies')}
          {...settingItemProps}
          divider={autoCloseConnection}
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
          <SettingItem title={tr('Interrupt mode')} {...settingItemProps}>
            <KokoSelect
              aria-label={tr('Interrupt mode')}
              controlWidth="select"
              options={[
                { id: 'all', label: tr('All connections') },
                { id: 'group', label: tr('Current group only') }
              ]}
              value={closeMode}
              variant="secondary"
              onChange={async (v) => {
                await patchAppConfig({
                  closeMode: v as 'all' | 'group'
                })
              }}
            />
          </SettingItem>
        )}
      </PageSettingsSection>

      <PageSettingsSection title={tr('Latency testing')}>
        <SettingItem title={tr('Test URL source')} {...settingItemProps} divider>
          <KokoSelect
            aria-label={tr('Test URL source')}
            controlWidth="select"
            options={[
              { id: 'group', label: tr('Use group configuration') },
              { id: 'global', label: tr('Use a shared URL') }
            ]}
            value={delayTestUrlScope}
            variant="secondary"
            onChange={async (v) => {
              await patchAppConfig({
                delayTestUrlScope: v as 'group' | 'global'
              })
            }}
          />
        </SettingItem>
        {delayTestUrlScope === 'global' ? (
          <SettingItem title={tr('Latency test URL')} {...settingItemProps} divider>
            <KokoTextField
              aria-label={tr('Latency test URL')}
              controlWidth="url"
              data-setting-input="url"
              value={url}
              placeholder={tr('Default: https://www.gstatic.com/generate_204')}
              onValueChange={(v) => {
                setUrl(v)
                setUrlDebounce(v)
              }}
            />
          </SettingItem>
        ) : null}
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
      </PageSettingsSection>
    </PageSettingsDrawer>
  )
}

export default ProxySettingDrawer
