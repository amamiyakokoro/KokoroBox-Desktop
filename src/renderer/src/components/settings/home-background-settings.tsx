import { Button, Label, Slider, Tooltip } from '@heroui/react'
import { useEffect, useState } from 'react'
import { LuImages } from 'react-icons/lu'
import { tr } from '../../../../shared/i18n'
import {
  homeBackgroundChoice,
  homeDefaultBackgroundIds,
  resolveHomeBackground,
  type HomeBackground,
  type HomeBackgroundAlignment,
  type HomeBackgroundAppearance
} from '../../../../shared/home'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useHomeDefaultBackgroundSwitch } from '@renderer/hooks/use-home-default-background'
import { homeBuiltInImages } from '@renderer/utils/home-background-assets'
import { chooseHomeBackground, clearHomeBackground } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { KokoSegmentedControl } from '../base/base-controls'

type BackgroundNumberSetting = 'opacity' | 'blur' | 'overlay' | 'cardOpacity'

function BackgroundSlider({
  label,
  value,
  maximum,
  onCommit
}: {
  label: string
  value: number
  maximum: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Slider
      aria-label={label}
      minValue={0}
      maxValue={maximum}
      step={1}
      value={draft}
      onChange={(next) => setDraft(Number(next))}
      onChangeEnd={(next) => onCommit(Number(next))}
      className="w-full max-w-56"
    >
      <div className="mb-1 flex justify-between gap-2">
        <Label className="text-xs text-muted">{label}</Label>
        <Slider.Output className="text-xs text-muted">{`${draft}${label === tr('Blur') ? ' px' : '%'}`}</Slider.Output>
      </div>
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  )
}

export default function HomeBackgroundSettings() {
  const { appConfig, patchAppConfig, mutateAppConfig } = useAppConfig()
  const background = appConfig?.homeBackground
  const choice = homeBackgroundChoice(appConfig)
  const { selectedId, pending, switchSelectedBackground } = useHomeDefaultBackgroundSwitch()
  const resolved = resolveHomeBackground(
    appConfig ? { ...appConfig, homeDefaultBackgroundId: selectedId } : undefined,
    undefined,
    homeBuiltInImages
  )

  const patchBackground = (patch: Partial<HomeBackground>): void => {
    if (!background) return
    void patchAppConfig({ homeBackground: { ...background, ...patch } })
  }
  const patchBuiltInAppearance = (patch: Partial<HomeBackgroundAppearance>): void => {
    void patchAppConfig({
      homeDefaultBackgroundAppearance: { ...appConfig?.homeDefaultBackgroundAppearance, ...patch }
    })
  }
  const patchNumber = (setting: BackgroundNumberSetting, value: number): void => {
    if (setting === 'cardOpacity') {
      void patchAppConfig({ homeCardBackgroundOpacity: value })
    } else if (choice === 'custom') {
      patchBackground({ [setting]: value })
    } else if (choice === 'default') {
      patchBuiltInAppearance({ [setting]: value })
    }
  }

  return (
    <SettingCard header={tr('Home background')}>
      <SettingItem title={tr('Image')} divider={choice === 'custom'}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">
            {choice === 'custom'
              ? tr('Custom image')
              : choice === 'none'
                ? tr('None')
                : tr('Default image')}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onPress={async () => {
              try {
                if (await chooseHomeBackground()) mutateAppConfig()
              } catch (error) {
                notify(error, { variant: 'danger' })
              }
            }}
          >
            {choice === 'custom' ? tr('Replace image') : tr('Choose image')}
          </Button>
          {choice !== 'default' && (
            <Button
              size="sm"
              variant="ghost"
              onPress={async () => {
                try {
                  await clearHomeBackground(false)
                  mutateAppConfig()
                } catch (error) {
                  notify(error, { variant: 'danger' })
                }
              }}
            >
              {tr('Use default')}
            </Button>
          )}
          {choice !== 'none' && (
            <Button
              size="sm"
              variant="ghost"
              onPress={async () => {
                try {
                  await clearHomeBackground(true)
                  mutateAppConfig()
                } catch (error) {
                  notify(error, { variant: 'danger' })
                }
              }}
            >
              {tr('None')}
            </Button>
          )}
        </div>
      </SettingItem>
      {choice === 'default' && (
        <SettingItem title={tr('Built-in image')} divider>
          <div className="flex items-center gap-3">
            <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-secondary/40">
              <img
                src={homeBuiltInImages[selectedId]}
                alt=""
                className="h-full w-full object-contain"
              />
            </div>
            <span className="text-xs tabular-nums text-muted">
              {`${homeDefaultBackgroundIds.indexOf(selectedId) + 1} / ${homeDefaultBackgroundIds.length}`}
            </span>
            <Tooltip delay={0}>
              <Tooltip.Trigger>
                <Button
                  size="sm"
                  isIconOnly
                  variant="secondary"
                  className="app-nodrag"
                  aria-label={tr('Switch default background')}
                  isDisabled={pending}
                  onPress={() => void switchSelectedBackground()}
                >
                  <LuImages aria-hidden="true" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>{tr('Switch default background')}</Tooltip.Content>
            </Tooltip>
          </div>
        </SettingItem>
      )}
      {choice !== 'none' && (
        <>
          <SettingItem title={tr('Horizontal alignment')} divider>
            <KokoSegmentedControl
              ariaLabel={tr('Horizontal alignment')}
              selectedKey={resolved.position.split(' ')[0]}
              options={[
                { id: 'left', label: tr('Left') },
                { id: 'center', label: tr('Center') },
                { id: 'right', label: tr('Right') }
              ]}
              onChange={(alignment) => {
                const value = alignment as HomeBackgroundAlignment
                if (choice === 'custom') patchBackground({ alignment: value })
                else patchBuiltInAppearance({ alignment: value })
              }}
            />
          </SettingItem>
          <SettingItem title={tr('Scale image')} divider>
            <KokoSegmentedControl
              ariaLabel={tr('Scale image')}
              selectedKey={resolved.scale ? 'scaled' : 'original'}
              options={[
                { id: 'scaled', label: tr('Scaled') },
                { id: 'original', label: tr('Original size') }
              ]}
              onChange={(size) => {
                const scale = size === 'scaled'
                if (choice === 'custom') patchBackground({ scale })
                else patchBuiltInAppearance({ scale })
              }}
            />
          </SettingItem>
        </>
      )}
      {choice === 'custom' && background && (
        <>
          <SettingItem title={tr('Fit')} divider>
            <KokoSegmentedControl
              ariaLabel={tr('Fit')}
              selectedKey={background.fit}
              options={[
                { id: 'cover', label: tr('Cover') },
                { id: 'contain', label: tr('Contain') }
              ]}
              onChange={(fit) => patchBackground({ fit: fit as HomeBackground['fit'] })}
            />
          </SettingItem>
          <SettingItem title={tr('Vertical position')} divider>
            <KokoSegmentedControl
              ariaLabel={tr('Vertical position')}
              selectedKey={resolved.position.split(' ')[1]}
              options={[
                { id: 'top', label: tr('Top') },
                { id: 'center', label: tr('Center') },
                { id: 'bottom', label: tr('Bottom') }
              ]}
              onChange={(position) =>
                patchBackground({ position: position as HomeBackground['position'] })
              }
            />
          </SettingItem>
        </>
      )}
      {choice !== 'none' &&
        (
          [
            ['opacity', tr('Image opacity'), 100],
            ['blur', tr('Blur'), 20],
            ['overlay', tr('Overlay intensity'), 80],
            ['cardOpacity', tr('Card background opacity'), 100]
          ] as const
        ).map(([setting, label, maximum]) => (
          <SettingItem key={setting} title={label} divider={setting !== 'cardOpacity'}>
            <BackgroundSlider
              label={label}
              value={setting === 'cardOpacity' ? resolved.cardOpacity : resolved[setting]}
              maximum={maximum}
              onCommit={(value) => patchNumber(setting, value)}
            />
          </SettingItem>
        ))}
    </SettingCard>
  )
}
