import { Button } from '@heroui/react'
import { useEffect, useState } from 'react'
import { tr } from '../../../../shared/i18n'
import {
  homeNetworkCardBackgroundChoice,
  isManagedHomeBackgroundFile
} from '../../../../shared/home'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  chooseNetworkCardBackground,
  clearNetworkCardBackground,
  getNetworkCardBackgroundDataUrl
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { KokoSegmentedControl } from '../base/base-controls'

export default function NetworkCardBackgroundSettings() {
  const { appConfig, patchAppConfig, mutateAppConfig } = useAppConfig()
  const file = appConfig?.homeNetworkCardBackgroundFile
  const hasImage = isManagedHomeBackgroundFile(file)
  const selected =
    hasImage && homeNetworkCardBackgroundChoice(appConfig?.homeNetworkCardBackground) === 'custom'
      ? 'custom'
      : 'none'
  const [preview, setPreview] = useState<{ file: string; url: string }>()
  const previewUrl = preview?.file === file ? preview?.url : undefined

  useEffect(() => {
    if (!isManagedHomeBackgroundFile(file)) {
      setPreview(undefined)
      return
    }
    let active = true
    void getNetworkCardBackgroundDataUrl()
      .then((url) => {
        if (active) setPreview(url ? { file, url } : undefined)
      })
      .catch(() => {
        if (active) setPreview(undefined)
      })
    return () => {
      active = false
    }
  }, [file, hasImage])

  const chooseImage = async (): Promise<void> => {
    try {
      if (await chooseNetworkCardBackground()) mutateAppConfig()
    } catch (error) {
      notify(error, { variant: 'danger' })
    }
  }

  return (
    <SettingCard header={tr('Network card background')}>
      <SettingItem title={tr('Image')}>
        <div className="flex w-full min-w-0 flex-col items-end gap-2">
          <KokoSegmentedControl
            ariaLabel={tr('Network card background')}
            selectedKey={selected}
            options={[
              { id: 'none', label: tr('None') },
              { id: 'custom', label: tr('Custom image') }
            ]}
            onChange={(key) => {
              if (key === 'custom' && !hasImage) {
                void chooseImage()
              } else {
                void patchAppConfig({
                  homeNetworkCardBackground: key === 'custom' ? 'custom' : 'none'
                })
              }
            }}
          />
          {selected === 'custom' && (
            <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
              {previewUrl && (
                <div className="h-14 w-28 shrink-0 overflow-hidden rounded-lg border border-separator bg-surface-secondary/40">
                  <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <Button size="sm" variant="secondary" onPress={() => void chooseImage()}>
                {tr('Replace image')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={async () => {
                  try {
                    await clearNetworkCardBackground()
                    mutateAppConfig()
                  } catch (error) {
                    notify(error, { variant: 'danger' })
                  }
                }}
              >
                {tr('Remove image')}
              </Button>
            </div>
          )}
        </div>
      </SettingItem>
    </SettingCard>
  )
}
