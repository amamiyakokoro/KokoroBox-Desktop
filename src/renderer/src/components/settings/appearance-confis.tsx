import { tr } from '../../../../shared/i18n'
import React, { useEffect, useState, useRef } from 'react'
import { Button, Switch } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { KokoSelect } from '../base/koko-form'
import { KokoSegmentedControl } from '../base/base-controls'
import { BiSolidFileImport } from 'react-icons/bi'
import {
  applyTheme,
  closeFloatingWindow,
  closeTrayIcon,
  fetchThemes,
  getFilePath,
  importThemes,
  relaunchApp,
  readImageFileDataURL,
  resolveThemes,
  setDockVisible,
  showFloatingWindow,
  showTrayIcon,
  startMonitor,
  updateTrayIcon,
  writeTheme
} from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { platform } from '@renderer/utils/init'
import { useTheme } from 'next-themes'
import { IoMdCloudDownload } from 'react-icons/io'
import { MdEditDocument } from 'react-icons/md'
import CSSEditorModal from './css-editor-modal'
import TrayIconCropModal from './tray-icon-crop-modal'
import { notify } from '@renderer/utils/notification'

const rasterTrayIconPattern = /\.(png|jpe?g|webp)$/i

const AppearanceConfig: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const [customThemes, setCustomThemes] = useState<{ key: string; label: string }[]>()
  const [openCSSEditor, setOpenCSSEditor] = useState(false)
  const [trayIconCropDataURL, setTrayIconCropDataURL] = useState('')
  const [fetching, setFetching] = useState(false)
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
    customTheme = 'default.css',
    appTheme = 'system'
  } = appConfig || {}
  const [localShowFloating, setLocalShowFloating] = useState(showFloating)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    resolveThemes().then((themes) => {
      setCustomThemes(themes)
    })
  }, [])

  useEffect(() => {
    return (): void => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      {openCSSEditor && (
        <CSSEditorModal
          theme={customTheme}
          onCancel={() => setOpenCSSEditor(false)}
          onConfirm={async (css: string) => {
            await writeTheme(customTheme, css)
            await applyTheme(customTheme)
            setOpenCSSEditor(false)
          }}
        />
      )}
      {trayIconCropDataURL && (
        <TrayIconCropModal
          imageDataURL={trayIconCropDataURL}
          onCancel={() => setTrayIconCropDataURL('')}
          onConfirm={async (dataURL) => {
            await patchAppConfig({ customTrayIcon: dataURL })
            setTrayIconCropDataURL('')
            await updateTrayIcon()
          }}
        />
      )}
      <SettingCard header={tr('Appearance')}>
        <SettingItem
          contentAlign="end"
          title={tr('Show floating window')}
          help={tr('The floating window may crash the app unless GPU acceleration is disabled')}
          divider
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
                  await patchAppConfig({ showFloatingWindow: v })
                  timeoutRef.current = null
                }, 1000)
              } else {
                patchAppConfig({ showFloatingWindow: v })
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
          <>
            <SettingItem
              contentAlign="end"
              title={tr('Rotate floating icon based on network speed')}
              divider
            >
              <Switch
                size="sm"
                isSelected={spinFloatingIcon}
                onChange={async (v) => {
                  await patchAppConfig({ spinFloatingIcon: v })
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
            <SettingItem contentAlign="end" title={tr('Disable tray icon')} divider>
              <Switch
                size="sm"
                isSelected={disableTray}
                onChange={async (v) => {
                  await patchAppConfig({ disableTray: v })
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
          </>
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
                <span className="truncate text-xs text-default-500">
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
                  await patchAppConfig({ customTrayIcon: await readImageFileDataURL(files[0]) })
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
                    await patchAppConfig({ customTrayIcon: '' })
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
            <SettingItem contentAlign="end" title={tr('Show proxy details in tray menu')} divider>
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
              <SettingItem contentAlign="end" title={tr('Tray menu latency layout')} divider>
                <KokoSegmentedControl
                  ariaLabel={tr('Tray menu latency layout')}
                  selectedKey={trayProxyDelayLayout}
                  options={[
                    { id: 'same-line', label: tr('Same line') },
                    { id: 'new-line', label: tr('New line') }
                  ]}
                  onChange={async (v) => {
                    await patchAppConfig({
                      trayProxyDelayLayout: v as 'same-line' | 'new-line'
                    })
                    window.electron.ipcRenderer.send('updateTrayMenu')
                  }}
                />
              </SettingItem>
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
          divider
        >
          <Switch
            size="sm"
            isSelected={showTraffic}
            onChange={async (v) => {
              await patchAppConfig({ showTraffic: v })
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
        {platform === 'darwin' && (
          <>
            <SettingItem contentAlign="end" title={tr('Show Dock icon')} divider>
              <Switch
                size="sm"
                isSelected={useDockIcon}
                onChange={async (v) => {
                  await patchAppConfig({ useDockIcon: v })
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
              await patchAppConfig({ useWindowFrame: v })
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
                await patchAppConfig({ enableWindowDrag: v })
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
        <SettingItem contentAlign="end" title={tr('Show update button')} divider>
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
        <SettingItem
          contentAlign="end"
          title={tr('Theme')}
          actions={
            <>
              <Button
                size="sm"
                isPending={fetching}
                isIconOnly
                variant="ghost"
                onPress={async () => {
                  setFetching(true)
                  try {
                    await fetchThemes()
                    setCustomThemes(await resolveThemes())
                  } catch (e) {
                    notify(e, { variant: 'danger' })
                  } finally {
                    setFetching(false)
                  }
                }}
              >
                <IoMdCloudDownload className="text-lg" />
              </Button>
              <Button
                size="sm"
                isIconOnly
                variant="ghost"
                onPress={async () => {
                  const files = await getFilePath(['css'])
                  if (!files) return
                  try {
                    await importThemes(files)
                    setCustomThemes(await resolveThemes())
                  } catch (e) {
                    notify(e, { variant: 'danger' })
                  }
                }}
              >
                <BiSolidFileImport className="text-lg" />
              </Button>
              <Button
                size="sm"
                isIconOnly
                variant="ghost"
                onPress={async () => {
                  setOpenCSSEditor(true)
                }}
              >
                <MdEditDocument className="text-lg" />
              </Button>
            </>
          }
        >
          {customThemes && (
            <KokoSelect
              aria-label={tr('Custom theme')}
              variant="secondary"
              controlWidth="full"
              value={customTheme}
              options={customThemes.map((theme) => ({ id: theme.key, label: theme.label }))}
              disallowEmptySelection={true}
              onChange={async (value) => {
                try {
                  await patchAppConfig({ customTheme: value })
                } catch (e) {
                  notify(e, { variant: 'danger' })
                }
              }}
            />
          )}
        </SettingItem>
      </SettingCard>
    </>
  )
}

export default AppearanceConfig
