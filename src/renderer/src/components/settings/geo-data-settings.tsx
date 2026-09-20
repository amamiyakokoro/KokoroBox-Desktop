import { tr } from '../../../../shared/i18n'
import { Button, Switch } from '@heroui/react'
import { KokoSegmentedControl } from '@renderer/components/base/base-controls'
import { KokoTextField } from '@renderer/components/base/koko-form'
import FeatureSettingsLayout, {
  FeatureSettingsSection
} from '@renderer/components/base/base-feature-settings'
import SettingItem from '@renderer/components/base/base-setting-item'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { mihomoUpgradeGeo } from '@renderer/utils/ipc'
import React, { useEffect, useMemo, useState } from 'react'
import { IoMdRefresh } from 'react-icons/io'
import { notify } from '@renderer/utils/notification'
import PendingFieldAction from '@renderer/components/base/base-pending-field-action'

const defaultGeoxUrl = {
  geoip: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat',
  geosite: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
  mmdb: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb',
  asn: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb'
}

interface Props {
  title: string
  value: string
  savedValue: string
  onChange: (value: string) => void
  onConfirm: () => void
}

const GeoUrlSetting: React.FC<Props> = (props) => {
  const { title, value, savedValue, onChange, onConfirm } = props

  return (
    <SettingItem title={title} divider>
      <div className="flex w-full min-w-0 items-center gap-2">
        <KokoTextField
          aria-label={title}
          title={value}
          value={value}
          controlWidth="full"
          className="min-w-0 flex-1"
          data-setting-input="full"
          inputClassName="font-mono text-xs"
          onChangeValue={onChange}
        />
        <PendingFieldAction isVisible={value !== savedValue} onPress={onConfirm} />
      </div>
    </SettingItem>
  )
}

const GeoDataSettings: React.FC = () => {
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const {
    'geox-url': geoxUrlRaw,
    'geodata-mode': geoMode = false,
    'geo-auto-update': geoAutoUpdate = false,
    'geo-update-interval': geoUpdateInterval = 24
  } = controledMihomoConfig || {}

  const geoxUrl = useMemo(() => ({ ...defaultGeoxUrl, ...geoxUrlRaw }), [geoxUrlRaw])

  const [geoipInput, setGeoIpInput] = useState(geoxUrl.geoip)
  const [geositeInput, setGeositeInput] = useState(geoxUrl.geosite)
  const [mmdbInput, setMmdbInput] = useState(geoxUrl.mmdb)
  const [asnInput, setAsnInput] = useState(geoxUrl.asn)
  const [updating, setUpdating] = useState(false)

  const updateDatabases = async (): Promise<void> => {
    setUpdating(true)
    try {
      await mihomoUpgradeGeo()
      notify(tr('Database updated'), { variant: 'success' })
    } catch (e) {
      notify(e, { variant: 'danger' })
    } finally {
      setUpdating(false)
    }
  }

  useEffect(() => {
    setGeoIpInput(geoxUrl.geoip)
    setGeositeInput(geoxUrl.geosite)
    setMmdbInput(geoxUrl.mmdb)
    setAsnInput(geoxUrl.asn)
  }, [geoxUrl])

  return (
    <FeatureSettingsLayout>
      <FeatureSettingsSection title={tr('Database sources')}>
        <GeoUrlSetting
          title={tr('GeoIP-DAT database')}
          value={geoipInput}
          savedValue={geoxUrl.geoip}
          onChange={setGeoIpInput}
          onConfirm={() => {
            patchControledMihomoConfig({ 'geox-url': { ...geoxUrl, geoip: geoipInput } })
          }}
        />
        <GeoUrlSetting
          title={tr('GeoIP-MMDB database')}
          value={mmdbInput}
          savedValue={geoxUrl.mmdb}
          onChange={setMmdbInput}
          onConfirm={() => {
            patchControledMihomoConfig({ 'geox-url': { ...geoxUrl, mmdb: mmdbInput } })
          }}
        />
        <GeoUrlSetting
          title={tr('GeoSite database')}
          value={geositeInput}
          savedValue={geoxUrl.geosite}
          onChange={setGeositeInput}
          onConfirm={() => {
            patchControledMihomoConfig({ 'geox-url': { ...geoxUrl, geosite: geositeInput } })
          }}
        />
        <GeoUrlSetting
          title={tr('IP-ASN database')}
          value={asnInput}
          savedValue={geoxUrl.asn}
          onChange={setAsnInput}
          onConfirm={() => {
            patchControledMihomoConfig({ 'geox-url': { ...geoxUrl, asn: asnInput } })
          }}
        />
      </FeatureSettingsSection>

      <FeatureSettingsSection title={tr('Update behavior')}>
        <SettingItem title={tr('GeoIP mode')} contentAlign="end" divider>
          <KokoSegmentedControl
            ariaLabel={tr('GeoIP mode')}
            selectedKey={geoMode ? 'dat' : 'db'}
            options={[
              { id: 'db', label: 'db' },
              { id: 'dat', label: 'dat' }
            ]}
            onChange={(key) => {
              patchControledMihomoConfig({ 'geodata-mode': key === 'dat' })
            }}
          />
        </SettingItem>
        <SettingItem title={tr('Update databases automatically')} contentAlign="end" divider>
          <Switch
            size="sm"
            aria-label={tr('Update databases automatically')}
            isSelected={geoAutoUpdate}
            onChange={(v) => {
              patchControledMihomoConfig({ 'geo-auto-update': v })
            }}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        {geoAutoUpdate && (
          <SettingItem title={tr('Update interval (hours)')} contentAlign="end" divider>
            <KokoTextField
              type="number"
              aria-label={tr('Update interval (hours)')}
              controlWidth="number"
              value={geoUpdateInterval.toString()}
              onChangeValue={(v) => {
                patchControledMihomoConfig({ 'geo-update-interval': parseInt(v) })
              }}
            />
          </SettingItem>
        )}
        <SettingItem title={tr('Update databases')} contentAlign="end">
          <Button size="sm" variant="secondary" isPending={updating} onPress={updateDatabases}>
            <IoMdRefresh className="text-base" />
            {tr('Update databases')}
          </Button>
        </SettingItem>
      </FeatureSettingsSection>
    </FeatureSettingsLayout>
  )
}

export default GeoDataSettings
