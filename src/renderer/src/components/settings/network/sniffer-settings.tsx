import { tr } from '../../../../../shared/i18n'
import { Switch } from '@heroui/react'
import { KokoTextField } from '@renderer/components/base/koko-form'
import BasePage from '@renderer/components/base/base-page'
import SettingItem from '@renderer/components/base/base-setting-item'
import FeatureSettingsLayout, {
  FeatureSettingsSaveButton,
  FeatureSettingsSection
} from '@renderer/components/base/base-feature-settings'
import EditableList from '@renderer/components/base/base-list-editor'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { restartCore } from '@renderer/utils/ipc'
import React, { useState } from 'react'
import { notify } from '@renderer/utils/notification'
import { useSettingsSave } from '@renderer/hooks/use-settings-save'
import { useUnsavedChangesGuard } from '@renderer/hooks/use-unsaved-changes'

interface Props {
  embedded?: boolean
}

const Sniffer: React.FC<Props> = ({ embedded = false }) => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const { controlSniff = true } = appConfig || {}
  const { controledMihomoConfig, patchControledMihomoConfig, patchControledMihomoConfigOrThrow } =
    useControledMihomoConfig()
  const { sniffer } = controledMihomoConfig || {}
  const {
    'parse-pure-ip': parsePureIP = true,
    'force-dns-mapping': forceDNSMapping = true,
    'override-destination': overrideDestination = false,
    sniff = {
      HTTP: { ports: [80, 443], 'override-destination': false },
      TLS: { ports: [443] },
      QUIC: { ports: [] }
    },
    'skip-domain': skipDomain = ['+.push.apple.com'],
    'force-domain': forceDomain = [],
    'skip-dst-address': skipDstAddress = [
      '91.105.192.0/23',
      '91.108.4.0/22',
      '91.108.8.0/21',
      '91.108.16.0/21',
      '91.108.56.0/22',
      '95.161.64.0/20',
      '149.154.160.0/20',
      '185.76.151.0/24',
      '2001:67c:4e8::/48',
      '2001:b28:f23c::/47',
      '2001:b28:f23f::/48',
      '2a0a:f280:203::/48'
    ],
    'skip-src-address': skipSrcAddress = []
  } = sniffer || {}
  const [changed, setChanged] = useState(false)
  const { isSaving, runSave } = useSettingsSave()
  const [values, originSetValues] = useState({
    parsePureIP,
    forceDNSMapping,
    overrideDestination,
    sniff,
    skipDomain,
    forceDomain,
    skipDstAddress,
    skipSrcAddress
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
      sniffer: {
        'parse-pure-ip': values.parsePureIP,
        'force-dns-mapping': values.forceDNSMapping,
        'override-destination': values.overrideDestination,
        sniff: values.sniff,
        'skip-domain': values.skipDomain,
        'force-domain': values.forceDomain,
        'skip-dst-address': values.skipDstAddress,
        'skip-src-address': values.skipSrcAddress
      }
    })

  useUnsavedChangesGuard({
    id: 'sniffer-settings',
    label: tr('Domain sniffing settings'),
    isDirty: changed,
    isSaving,
    onSave: saveChanges,
    onDiscard: () => {
      originSetValues({
        parsePureIP,
        forceDNSMapping,
        overrideDestination,
        sniff,
        skipDomain,
        forceDomain,
        skipDstAddress,
        skipSrcAddress
      })
      setChanged(false)
    }
  })

  const handleSniffPortChange = (protocol: keyof typeof sniff, value: string): void => {
    setValues({
      ...values,
      sniff: {
        ...values.sniff,
        [protocol]: {
          ...values.sniff[protocol],
          ports: value.split(',').map((port) => port.trim())
        }
      }
    })
  }

  const saveButton = changed ? (
    <FeatureSettingsSaveButton isDirty={changed} isSaving={isSaving} onPress={saveChanges} />
  ) : null

  const content = (
    <>
      <FeatureSettingsLayout>
        <FeatureSettingsSection
          title={tr('Sniffing behavior')}
          action={embedded ? saveButton : undefined}
        >
          <SettingItem title={tr('Override domain sniffing settings')} divider>
            <Switch
              size="sm"
              isSelected={controlSniff}
              onChange={async (value) => {
                try {
                  await patchAppConfig({ controlSniff: value })
                  await patchControledMihomoConfig({})
                  await restartCore()
                } catch (e) {
                  notify(e, { variant: 'danger' })
                }
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
            title={tr('Override connection address')}
            help={tr(
              'Replaces the original destination with the domain discovered by protocol sniffing.'
            )}
            divider
          >
            <Switch
              size="sm"
              isSelected={values.overrideDestination}
              onChange={(v) => {
                setValues({
                  ...values,
                  overrideDestination: v,
                  sniff: {
                    ...values.sniff,
                    HTTP: {
                      ...values.sniff.HTTP,
                      'override-destination': v,
                      ports: values.sniff.HTTP?.ports || [80, 443]
                    }
                  }
                })
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
            title={tr('Sniff real IP mappings')}
            help={tr('Uses existing DNS mappings to recover domains for IP connections.')}
            divider
          >
            <Switch
              size="sm"
              isSelected={values.forceDNSMapping}
              onChange={(v) => {
                setValues({ ...values, forceDNSMapping: v })
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
            title={tr('Sniff unmapped IP addresses')}
            help={tr('Attempts protocol sniffing when an IP connection has no DNS mapping.')}
          >
            <Switch
              size="sm"
              isSelected={values.parsePureIP}
              onChange={(v) => {
                setValues({ ...values, parsePureIP: v })
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

        <FeatureSettingsSection title={tr('Protocol ports')}>
          <SettingItem title={tr('HTTP sniffing ports')} divider>
            <KokoTextField
              controlWidth="full"
              placeholder={tr('Port numbers, separated by commas')}
              value={values.sniff.HTTP?.ports.join(',')}
              onChangeValue={(v) => handleSniffPortChange('HTTP', v)}
            />
          </SettingItem>
          <SettingItem title={tr('TLS sniffing ports')} divider>
            <KokoTextField
              controlWidth="full"
              placeholder={tr('Port numbers, separated by commas')}
              value={values.sniff.TLS?.ports.join(',')}
              onChangeValue={(v) => handleSniffPortChange('TLS', v)}
            />
          </SettingItem>
          <SettingItem title={tr('QUIC sniffing ports')}>
            <KokoTextField
              controlWidth="full"
              placeholder={tr('Port numbers, separated by commas')}
              value={values.sniff.QUIC?.ports.join(',')}
              onChangeValue={(v) => handleSniffPortChange('QUIC', v)}
            />
          </SettingItem>
        </FeatureSettingsSection>

        <FeatureSettingsSection title={tr('Sniffing exceptions')}>
          <EditableList
            title={tr('Skip domain sniffing')}
            items={values.skipDomain}
            onChange={(list) => setValues({ ...values, skipDomain: list as string[] })}
            placeholder={tr('Example: +.push.apple.com')}
          />
          <EditableList
            title={tr('Force domain sniffing')}
            items={values.forceDomain}
            onChange={(list) => setValues({ ...values, forceDomain: list as string[] })}
            placeholder={tr('Example: v2ex.com')}
          />
          <EditableList
            title={tr('Skip destination address sniffing')}
            items={values.skipDstAddress}
            onChange={(list) => setValues({ ...values, skipDstAddress: list as string[] })}
            placeholder={tr('Example: 1.1.1.1/32')}
          />
          <EditableList
            title={tr('Skip source address sniffing')}
            items={values.skipSrcAddress}
            onChange={(list) => setValues({ ...values, skipSrcAddress: list as string[] })}
            placeholder={tr('Example: 192.168.1.1/24')}
            divider={false}
          />
        </FeatureSettingsSection>
      </FeatureSettingsLayout>
    </>
  )

  if (embedded) return content

  return (
    <BasePage
      title={tr('Domain sniffing settings')}
      contentClassName="no-scrollbar"
      header={saveButton}
    >
      {content}
    </BasePage>
  )
}

export default Sniffer
