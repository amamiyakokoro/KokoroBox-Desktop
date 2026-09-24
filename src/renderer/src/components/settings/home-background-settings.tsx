import { Button, Label, Slider } from '@heroui/react'
import { useEffect, useState } from 'react'
import { tr } from '../../../../shared/i18n'
import { homeBackgroundChoice, type HomeBackground } from '../../../../shared/home'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { chooseHomeBackground, clearHomeBackground } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { KokoSegmentedControl } from '../base/base-controls'

type BackgroundNumberSetting = 'opacity' | 'blur' | 'overlay'

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

  const patchBackground = (patch: Partial<HomeBackground>): void => {
    if (!background) return
    void patchAppConfig({ homeBackground: { ...background, ...patch } })
  }
  const patchNumber = (setting: BackgroundNumberSetting, value: number): void => {
    patchBackground({ [setting]: value })
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
          <SettingItem title={tr('Position')} divider>
            <KokoSegmentedControl
              ariaLabel={tr('Position')}
              selectedKey={background.position}
              options={[
                { id: 'center', label: tr('Center') },
                { id: 'top', label: tr('Top') },
                { id: 'bottom', label: tr('Bottom') },
                { id: 'left', label: tr('Left') },
                { id: 'right', label: tr('Right') }
              ]}
              onChange={(position) =>
                patchBackground({ position: position as HomeBackground['position'] })
              }
            />
          </SettingItem>
          {(
            [
              ['opacity', tr('Image opacity'), 100],
              ['blur', tr('Blur'), 20],
              ['overlay', tr('Overlay intensity'), 80]
            ] as const
          ).map(([setting, label, maximum]) => (
            <SettingItem key={setting} title={label} divider={setting !== 'overlay'}>
              <BackgroundSlider
                label={label}
                value={background[setting]}
                maximum={maximum}
                onCommit={(value) => patchNumber(setting, value)}
              />
            </SettingItem>
          ))}
        </>
      )}
    </SettingCard>
  )
}
