import { tr } from '../../../shared/i18n'
import { Input, Switch } from '@heroui/react'
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

const Sniffer: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const { controlSniff = true } = appConfig || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
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

  const onSave = async (patch: Partial<MihomoConfig>): Promise<void> => {
    const saved = await runSave(async () => {
      await patchControledMihomoConfig(patch)
      await restartCore()
    })
    if (saved) setChanged(false)
  }

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

  return (
    <BasePage
      title={tr('Domain sniffing settings')}
      contentClassName="no-scrollbar"
      header={
        <FeatureSettingsSaveButton
          isDirty={changed}
          isSaving={isSaving}
          onPress={() =>
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
          }
        />
      }
    >
      <FeatureSettingsLayout>
        <FeatureSettingsSection title={tr('Sniffing behavior')}>
          <SettingItem title={tr('Override domain sniffing settings')} divider>
            <Switch
              size="sm"
              isSelected={controlSniff}
              onValueChange={async (value) => {
                try {
                  await patchAppConfig({ controlSniff: value })
                  await patchControledMihomoConfig({})
                  await restartCore()
                } catch (e) {
                  notify(e, { variant: 'danger' })
                }
              }}
            />
          </SettingItem>
          <SettingItem title={tr('Override connection address')} divider>
            <Switch
              size="sm"
              isSelected={values.overrideDestination}
              onValueChange={(v) => {
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
            />
          </SettingItem>
          <SettingItem title={tr('Sniff real IP mappings')} divider>
            <Switch
              size="sm"
              isSelected={values.forceDNSMapping}
              onValueChange={(v) => {
                setValues({ ...values, forceDNSMapping: v })
              }}
            />
          </SettingItem>
          <SettingItem title={tr('Sniff unmapped IP addresses')}>
            <Switch
              size="sm"
              isSelected={values.parsePureIP}
              onValueChange={(v) => {
                setValues({ ...values, parsePureIP: v })
              }}
            />
          </SettingItem>
        </FeatureSettingsSection>

        <FeatureSettingsSection title={tr('Protocol ports')}>
          <SettingItem title={tr('HTTP sniffing ports')} divider>
            <Input
              size="sm"
              className="w-[50%]"
              placeholder={tr('Port numbers, separated by commas')}
              value={values.sniff.HTTP?.ports.join(',')}
              onValueChange={(v) => handleSniffPortChange('HTTP', v)}
            />
          </SettingItem>
          <SettingItem title={tr('TLS sniffing ports')} divider>
            <Input
              size="sm"
              className="w-[50%]"
              placeholder={tr('Port numbers, separated by commas')}
              value={values.sniff.TLS?.ports.join(',')}
              onValueChange={(v) => handleSniffPortChange('TLS', v)}
            />
          </SettingItem>
          <SettingItem title={tr('QUIC sniffing ports')}>
            <Input
              size="sm"
              className="w-[50%]"
              placeholder={tr('Port numbers, separated by commas')}
              value={values.sniff.QUIC?.ports.join(',')}
              onValueChange={(v) => handleSniffPortChange('QUIC', v)}
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
    </BasePage>
  )
}

export default Sniffer
