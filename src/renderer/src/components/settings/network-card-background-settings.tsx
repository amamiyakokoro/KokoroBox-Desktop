import { tr } from '../../../../shared/i18n'
import {
  homeNetworkCardBackgroundChoice,
  type HomeNetworkCardBackground
} from '../../../../shared/home'
import networkCardArtwork from '@renderer/assets/home/network-card-amamiya.png'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { KokoSegmentedControl } from '../base/base-controls'

export default function NetworkCardBackgroundSettings() {
  const { appConfig, patchAppConfig } = useAppConfig()
  const selected = homeNetworkCardBackgroundChoice(appConfig?.homeNetworkCardBackground)

  return (
    <SettingCard header={tr('Network card background')}>
      <SettingItem title={tr('Image')}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-16 w-40 shrink-0 overflow-hidden rounded-lg border border-separator bg-surface">
            <img
              src={networkCardArtwork}
              alt=""
              className="h-full w-full object-cover object-[60%_50%]"
            />
          </div>
          <KokoSegmentedControl
            ariaLabel={tr('Network card background')}
            selectedKey={selected}
            options={[
              { id: 'none', label: tr('None') },
              { id: 'amamiya', label: tr('Network illustration') }
            ]}
            onChange={(key) => {
              void patchAppConfig({ homeNetworkCardBackground: key as HomeNetworkCardBackground })
            }}
          />
        </div>
      </SettingItem>
    </SettingCard>
  )
}
