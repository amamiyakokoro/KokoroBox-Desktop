import { tr } from '../../../../../shared/i18n'
import { Button, Switch } from '@heroui/react'
import { KokoTextField as Input } from '@renderer/components/base/koko-form'
import { KokoSegmentedControl } from '@renderer/components/base/base-controls'
import BasePage from '@renderer/components/base/base-page'
import SettingItem from '@renderer/components/base/base-setting-item'
import FeatureSettingsLayout, {
  FeatureSettingsSaveButton,
  FeatureSettingsSection
} from '@renderer/components/base/base-feature-settings'
import EditableList from '@renderer/components/base/base-list-editor'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { restartCore, setupFirewall } from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import React, { useState } from 'react'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { notify } from '@renderer/utils/notification'
import { useSettingsSave } from '@renderer/hooks/use-settings-save'
import { useUnsavedChangesGuard } from '@renderer/hooks/use-unsaved-changes'

interface Props {
  embedded?: boolean
}

const Tun: React.FC<Props> = ({ embedded = false }) => {
  const { controledMihomoConfig, patchControledMihomoConfigOrThrow } = useControledMihomoConfig()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { autoSetDNSMode = 'none' } = appConfig || {}
  const { tun } = controledMihomoConfig || {}
  const [loading, setLoading] = useState(false)
  const {
    device = platform === 'darwin' ? undefined : 'mihomo',
    stack = 'mixed',
    'auto-route': autoRoute = true,
    'auto-redirect': autoRedirect = false,
    'auto-detect-interface': autoDetectInterface = true,
    'dns-hijack': dnsHijack = ['any:53'],
    'route-exclude-address': routeExcludeAddress = [],
    'strict-route': strictRoute = false,
    'disable-icmp-forwarding': disableIcmpForwarding = false,
    mtu = 1500
  } = tun || {}
  const [changed, setChanged] = useState(false)
  const { isSaving, runSave } = useSettingsSave()
  const [values, originSetValues] = useState({
    device,
    stack,
    autoRoute,
    autoRedirect,
    autoDetectInterface,
    dnsHijack,
    strictRoute,
    routeExcludeAddress,
    disableIcmpForwarding,
    mtu: Math.min(Math.max(mtu || 1500, 1), 65535)
  })
  const setValues = (v: typeof values): void => {
    originSetValues(v)
    setChanged(true)
  }

  const onSave = async (patch: Partial<MihomoConfig>): Promise<boolean> => {
    const saved = await runSave(async () => {
      await patchControledMihomoConfigOrThrow(patch)
      await restartCore()
    })
    if (saved) setChanged(false)
    return saved
  }

  const saveChanges = (): Promise<boolean> =>
    onSave({
      tun: {
        device: values.device,
        stack: values.stack,
        'auto-route': values.autoRoute,
        'auto-redirect': values.autoRedirect,
        'auto-detect-interface': values.autoDetectInterface,
        'dns-hijack': values.dnsHijack,
        'strict-route': values.strictRoute,
        'route-exclude-address': values.routeExcludeAddress,
        'disable-icmp-forwarding': values.disableIcmpForwarding,
        mtu: values.mtu
      }
    })

  useUnsavedChangesGuard({
    id: 'tun-settings',
    label: tr('TUN settings'),
    isDirty: changed,
    isSaving,
    onSave: saveChanges,
    onDiscard: () => {
      originSetValues({
        device,
        stack,
        autoRoute,
        autoRedirect,
        autoDetectInterface,
        dnsHijack,
        strictRoute,
        routeExcludeAddress,
        disableIcmpForwarding,
        mtu: Math.min(Math.max(mtu || 1500, 1), 65535)
      })
      setChanged(false)
    }
  })

  const saveButton = changed ? (
    <FeatureSettingsSaveButton isDirty={changed} isSaving={isSaving} onPress={saveChanges} />
  ) : null

  const content = (
    <>
      <FeatureSettingsLayout action={embedded ? saveButton : undefined}>
        {(platform === 'win32' || platform === 'darwin') && (
          <FeatureSettingsSection title={tr('Platform integration')}>
            {platform === 'win32' && (
              <SettingItem title={tr('Reset firewall')}>
                <Button
                  size="sm"
                  variant="primary"
                  isPending={loading}
                  onPress={async () => {
                    setLoading(true)
                    try {
                      await setupFirewall()
                      notify(tr('Firewall reset'))
                      await restartCore()
                    } catch (e) {
                      notify(e, { variant: 'danger' })
                    } finally {
                      setLoading(false)
                    }
                  }}
                >
                  {tr('Reset firewall')}
                </Button>
              </SettingItem>
            )}
            {platform === 'darwin' && (
              <SettingItem title={tr('Configure system DNS automatically')}>
                <KokoSegmentedControl
                  ariaLabel={tr('Configure system DNS automatically')}
                  selectedKey={autoSetDNSMode}
                  options={[
                    { id: 'none', label: tr('Do not configure automatically') },
                    { id: 'exec', label: tr('Run command') },
                    { id: 'service', label: tr('Service mode') }
                  ]}
                  onChange={async (key) => {
                    await patchAppConfig({ autoSetDNSMode: key as 'none' | 'exec' | 'service' })
                  }}
                />
              </SettingItem>
            )}
          </FeatureSettingsSection>
        )}

        <FeatureSettingsSection title={tr('TUN routing')}>
          <SettingItem title={tr('TUN network stack')} divider>
            <KokoSegmentedControl
              ariaLabel={tr('TUN network stack')}
              selectedKey={values.stack}
              options={[
                { id: 'gvisor', label: 'gVisor' },
                { id: 'mixed', label: 'Mixed' },
                { id: 'system', label: 'System' },
                { id: 'mips', label: 'MIPS' }
              ]}
              onChange={(key) => setValues({ ...values, stack: key as TunStack })}
            />
          </SettingItem>
          {platform !== 'darwin' && (
            <>
              <SettingItem title={tr('TUN interface name')} divider>
                <Input
                  size="sm"
                  className="w-25"
                  value={values.device}
                  onValueChange={(v) => {
                    setValues({ ...values, device: v })
                  }}
                />
              </SettingItem>
              <SettingItem title={tr('Strict routing')} divider>
                <Switch
                  size="sm"
                  isSelected={values.strictRoute}
                  onChange={(v) => {
                    setValues({ ...values, strictRoute: v })
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
            </>
          )}
          <SettingItem title={tr('Configure routes automatically')} divider>
            <Switch
              size="sm"
              isSelected={values.autoRoute}
              onChange={(v) => {
                setValues({ ...values, autoRoute: v })
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
          {platform === 'linux' && (
            <SettingItem title={tr('Configure TCP redirection automatically')} divider>
              <Switch
                size="sm"
                isSelected={values.autoRedirect}
                onChange={(v) => {
                  setValues({ ...values, autoRedirect: v })
                }}
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
          )}
          <SettingItem title={tr('Select outbound interface automatically')}>
            <Switch
              size="sm"
              isSelected={values.autoDetectInterface}
              onChange={(v) => {
                setValues({ ...values, autoDetectInterface: v })
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
        </FeatureSettingsSection>

        <FeatureSettingsSection title={tr('DNS and packet handling')}>
          <SettingItem title={tr('ICMP forwarding')} divider>
            <Switch
              size="sm"
              isSelected={!values.disableIcmpForwarding}
              onChange={(v) => {
                setValues({ ...values, disableIcmpForwarding: !v })
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
          <SettingItem title="MTU" divider>
            <Input
              size="sm"
              type="number"
              className="w-25"
              value={values.mtu.toString()}
              min={1}
              onValueChange={(v) => {
                setValues({
                  ...values,
                  mtu: Math.min(Math.max(parseInt(v) || 1500, 1), 65535)
                })
              }}
            />
          </SettingItem>
          <SettingItem title={tr('DNS hijacking targets, separated by commas')} divider>
            <Input
              size="sm"
              className="w-[50%]"
              value={values.dnsHijack.join(',')}
              onValueChange={(v) => {
                const arr = v !== '' ? v.split(',') : []
                setValues({ ...values, dnsHijack: arr })
              }}
            />
          </SettingItem>
          <EditableList
            title={tr('Exclude custom IP ranges')}
            items={values.routeExcludeAddress}
            placeholder={tr('Example: 172.20.0.0/16')}
            onChange={(list) => setValues({ ...values, routeExcludeAddress: list as string[] })}
            divider={false}
          />
        </FeatureSettingsSection>
      </FeatureSettingsLayout>
    </>
  )

  if (embedded) return content

  return (
    <BasePage title={tr('TUN settings')} contentClassName="no-scrollbar" header={saveButton}>
      {content}
    </BasePage>
  )
}

export default Tun
