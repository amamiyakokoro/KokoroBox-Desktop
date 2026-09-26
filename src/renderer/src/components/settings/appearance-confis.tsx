import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState, useRef } from 'react'
import { Button, Switch } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import SettingSubgroup from '../base/base-setting-subgroup'
import { KokoSegmentedControl } from '../base/base-controls'
import {
  closeFloatingWindow,
  closeTrayIcon,
  getFilePath,
  relaunchApp,
  readImageFileDataURL,
  setDockVisible,
  showFloatingWindow,
  showTrayIcon,
  startMonitor,
  updateTrayIcon
} from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { platform } from '@renderer/utils/init'
import { useTheme } from 'next-themes'
import TrayIconCropModal from './tray-icon-crop-modal'
import HomeBackgroundSettings from './home-background-settings'
import NetworkCardBackgroundSettings from './network-card-background-settings'
import AccentColorSetting from './accent-color-setting'

const rasterTrayIconPattern = /\.(png|jpe?g|webp)$/i

type AppearanceSection = 'interface' | 'tray'

interface AppearanceConfigProps {
  sections?: AppearanceSection[]
}

const AppearanceConfig: React.FC<AppearanceConfigProps> = ({
  sections = ['interface', 'tray']
}) => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const [trayIconCropDataURL, setTrayIconCropDataURL] = useState('')
  const { setTheme } = useTheme()
  const {
    useDockIcon = true,
    showTraffic = false,
    proxyInTray = true,
    trayProxyDelayLayout = 'auto',
    customTrayIcon = '',
    disableTray = false,
    showFloatingWindow: showFloating = false,
    spinFloatingIcon = true,
    useWindowFrame = false,
    enableWindowDrag = false,
    showUpdateButtonAfterNotification = true,
    appTheme = 'system'
  } = appConfig || {}
  const [localShowFloating, setLocalShowFloating] = useState(showFloating)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const showInterface = sections.includes('interface')
  const showTray = sections.includes('tray')

  useEffect(() => {
    return (): void => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      {showTray && trayIconCropDataURL && (
        <TrayIconCropModal
          imageDataURL={trayIconCropDataURL}
          onCancel={() => setTrayIconCropDataURL('')}
          onConfirm={async (dataURL) => {
            if (!(await patchAppConfig({ customTrayIcon: dataURL }))) return
            setTrayIconCropDataURL('')
            await updateTrayIcon()
          }}
        />
      )}
      {showTray && (
        <SettingCard header={tr('System tray and floating window')}>
          <SettingItem
            contentAlign="end"
            title={tr('Show floating window')}
            help={tr('The floating window may crash the app unless GPU acceleration is disabled')}
            divider={!localShowFloating}
          >
            <Switch
              size="sm"
              isSelected={localShowFloating}
              onChange={async (v) => {
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current)
                  timeoutRef.current = null
                }

                setLocalShowFloating(v)
                if (v) {
                  await showFloatingWindow()
                  timeoutRef.current = setTimeout(async () => {
                    timeoutRef.current = null
                    if (!(await patchAppConfig({ showFloatingWindow: v }))) {
                      setLocalShowFloating(false)
                      await closeFloatingWindow()
                    }
                  }, 1000)
                } else {
                  if (!(await patchAppConfig({ showFloatingWindow: v }))) {
                    setLocalShowFloating(!v)
                    return
                  }
                  await closeFloatingWindow()
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
          {localShowFloating && (
            <SettingSubgroup label={tr('Show floating window')}>
              <SettingItem
                contentAlign="end"
                title={tr('Rotate floating icon based on network speed')}
                divider
              >
                <Switch
                  size="sm"
                  isSelected={spinFloatingIcon}
                  onChange={async (v) => {
                    if (!(await patchAppConfig({ spinFloatingIcon: v }))) return
                    window.electron.ipcRenderer.send('updateFloatingWindow')
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
              <SettingItem contentAlign="end" title={tr('Disable tray icon')}>
                <Switch
                  size="sm"
                  isSelected={disableTray}
                  onChange={async (v) => {
                    if (!(await patchAppConfig({ disableTray: v }))) return
                    if (v) {
                      closeTrayIcon()
                    } else {
                      showTrayIcon()
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
            </SettingSubgroup>
          )}
          {!disableTray && (
            <SettingItem
              contentAlign="end"
              title={tr('Custom tray icon')}
              help={tr(
                'Use this icon in the tray. PNG, JPG and WebP images are cropped before saving.'
              )}
              divider
            >
              <div className="flex min-w-0 max-w-[65%] items-center justify-end gap-2">
                {customTrayIcon && (
                  <span className="truncate text-xs text-muted">
                    {customTrayIcon.startsWith('data:image/')
                      ? tr('Custom icon saved')
                      : customTrayIcon}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={async () => {
                    const files = await getFilePath(
                      ['png', 'jpg', 'jpeg', 'webp', 'ico', 'icns'],
                      tr('Choose tray icon'),
                      tr('Tray icon')
                    )
                    if (!files?.[0]) return
                    if (rasterTrayIconPattern.test(files[0])) {
                      setTrayIconCropDataURL(await readImageFileDataURL(files[0]))
                      return
                    }
                    if (
                      !(await patchAppConfig({
                        customTrayIcon: await readImageFileDataURL(files[0])
                      }))
                    )
                      return
                    await updateTrayIcon()
                  }}
                >
                  {customTrayIcon ? tr('Change icon') : tr('Choose icon')}
                </Button>
                {customTrayIcon && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={async () => {
                      if (!(await patchAppConfig({ customTrayIcon: '' }))) return
                      await updateTrayIcon()
                    }}
                  >
                    {tr('Restore defaults')}
                  </Button>
                )}
              </div>
            </SettingItem>
          )}
          {platform !== 'linux' && (
            <>
              <SettingItem
                contentAlign="end"
                title={tr('Show proxy details in tray menu')}
                divider={!proxyInTray}
              >
                <Switch
                  size="sm"
                  isSelected={proxyInTray}
                  onChange={async (v) => {
                    await patchAppConfig({ proxyInTray: v })
                  }}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </SettingItem>
              {proxyInTray && (
                <SettingSubgroup label={tr('Show proxy details in tray menu')}>
                  <SettingItem contentAlign="end" title={tr('Tray menu latency layout')}>
                    <KokoSegmentedControl
                      ariaLabel={tr('Tray menu latency layout')}
                      selectedKey={trayProxyDelayLayout}
                      options={[
                        { id: 'same-line', label: tr('Same line') },
                        { id: 'new-line', label: tr('New line') }
                      ]}
                      onChange={async (v) => {
                        if (
                          !(await patchAppConfig({
                            trayProxyDelayLayout: v as 'same-line' | 'new-line'
                          }))
                        )
                          return
                        window.electron.ipcRenderer.send('updateTrayMenu')
                      }}
                    />
                  </SettingItem>
                </SettingSubgroup>
              )}
            </>
          )}
          <SettingItem
            contentAlign="end"
            title={tr('Show network speed in the {0}', [
              platform === 'win32'
                ? tr('Taskbar')
                : platform === 'darwin'
                  ? tr('Menu bar')
                  : tr('System tray')
            ])}
          >
            <Switch
              size="sm"
              isSelected={showTraffic}
              onChange={async (v) => {
                if (!(await patchAppConfig({ showTraffic: v }))) return
                await startMonitor()
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
        </SettingCard>
      )}
      {showInterface && (
        <SettingCard header={tr('Interface and windows')}>
          <SettingItem contentAlign="end" title={tr('Background color')} divider>
            <KokoSegmentedControl
              ariaLabel={tr('Background color')}
              selectedKey={appTheme}
              options={[
                { id: 'system', label: tr('Automatic') },
                { id: 'dark', label: tr('Dark') },
                { id: 'light', label: tr('Light') }
              ]}
              onChange={(key) => {
                setTheme(key)
                patchAppConfig({ appTheme: key as AppTheme })
              }}
            />
          </SettingItem>
          <AccentColorSetting />
          {platform === 'darwin' && (
            <>
              <SettingItem contentAlign="end" title={tr('Show Dock icon')} divider>
                <Switch
                  size="sm"
                  isSelected={useDockIcon}
                  onChange={async (v) => {
                    if (!(await patchAppConfig({ useDockIcon: v }))) return
                    setDockVisible(v)
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
          <SettingItem contentAlign="end" title={tr('Use system title bar')} divider>
            <Switch
              size="sm"
              isSelected={useWindowFrame}
              onChange={async (v) => {
                if (!(await patchAppConfig({ useWindowFrame: v }))) return
                await relaunchApp()
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
          {useWindowFrame && (
            <SettingItem
              contentAlign="end"
              title={tr('Enable window drag area')}
              help={tr(
                'Drag the window using empty areas in page headers. Useful when the system does not provide a draggable title bar.'
              )}
              divider
            >
              <Switch
                size="sm"
                isSelected={enableWindowDrag}
                onChange={async (v) => {
                  if (!(await patchAppConfig({ enableWindowDrag: v }))) return
                  await relaunchApp()
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
          <SettingItem contentAlign="end" title={tr('Show update button')}>
            <Switch
              size="sm"
              isSelected={showUpdateButtonAfterNotification}
              onChange={(v) => {
                patchAppConfig({ showUpdateButtonAfterNotification: v })
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
        </SettingCard>
      )}
      {showInterface && <HomeBackgroundSettings />}
      {showInterface && <NetworkCardBackgroundSettings />}
    </>
  )
}

export default AppearanceConfig
