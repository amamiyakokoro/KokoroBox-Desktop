import { tr } from '../../../../shared/i18n'
/* eslint-disable react/prop-types */
import { Button, Switch } from '@heroui/react'
import { KokoSegmentedControl } from '@renderer/components/base/base-controls'
import { KokoTextField } from '@renderer/components/base/koko-form'
import SettingCard from '@renderer/components/base/base-setting-card'
import SettingItem from '@renderer/components/base/base-setting-item'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { mihomoUpgradeGeo } from '@renderer/utils/ipc'
import { useState, useEffect, useMemo } from 'react'
import { IoMdRefresh } from 'react-icons/io'
import { notify } from '@renderer/utils/notification'

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
    <SettingItem contentAlign="end" title={title} divider>
      <div className="flex w-[70%] max-w-[40rem] min-w-0 items-center justify-end gap-2">
        <KokoTextField
          size="sm"
          aria-label={title}
          title={value}
          value={value}
          className="min-w-0 flex-1"
          classNames={{ input: 'truncate font-mono text-xs' }}
          onValueChange={onChange}
        />
        {value !== savedValue && (
          <Button size="sm" variant="primary" className="shrink-0" onPress={onConfirm}>
            {tr('Confirm')}
          </Button>
        )}
      </div>
    </SettingItem>
  )
}

const GeoData: React.FC = () => {
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
    <SettingCard>
      <SettingItem contentAlign="end" title={tr('Geo databases')} divider>
        <Button
          size="sm"
          isIconOnly
          variant="ghost"
          aria-label={tr('Update databases')}
          onPress={updateDatabases}
        >
          <IoMdRefresh className={`text-lg ${updating ? 'animate-spin' : ''}`} />
        </Button>
      </SettingItem>
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
      <SettingItem contentAlign="end" title={tr('GeoIP mode')} divider>
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
      <SettingItem
        contentAlign="end"
        title={tr('Update databases automatically')}
        divider={geoAutoUpdate}
      >
        <Switch
          size="sm"
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
        <SettingItem contentAlign="end" title={tr('Update interval (hours)')}>
          <KokoTextField
            size="sm"
            type="number"
            className="w-25"
            value={geoUpdateInterval.toString()}
            onValueChange={(v) => {
              patchControledMihomoConfig({ 'geo-update-interval': parseInt(v) })
            }}
          />
        </SettingItem>
      )}
    </SettingCard>
  )
}

export default GeoData
