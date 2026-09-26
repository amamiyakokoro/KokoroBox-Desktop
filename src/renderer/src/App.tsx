import { startOverviewTrafficCollection } from '@renderer/hooks/use-overview-traffic'
import { tr } from '../../shared/i18n'
import { useTheme } from 'next-themes'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import OutboundModeSwitcher from '@renderer/components/sider/outbound-mode-switcher'
import { Button, Separator, Tooltip } from '@heroui/react'
import { IoSettings } from 'react-icons/io5'
import { useDeferredRoutePreload } from '@renderer/routes'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  checkUpdate,
  confirmCloseMainWindow,
  serviceStatus,
  setRendererHasUnsavedChanges,
  setNativeTheme,
  setTitleBarOverlay,
  testServiceConnection
} from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import { TitleBarOverlayOptions } from 'electron'
import KokoroBrandLink from './components/base/kokoro-brand-link'
import useSWR from 'swr'
import { useUnsavedChanges } from '@renderer/hooks/use-unsaved-changes'
import { SiderIconButton } from '@renderer/components/sider/sider-surfaces'
import { isSettingsFocusRoute } from '@renderer/components/sider/sider-presentation'
import { loadSettingsSidebar } from '@renderer/components/settings/settings-sidebar-loader'
import SettingsSidebarSkeleton from '@renderer/components/settings/settings-sidebar-skeleton'

const ConfirmModal = lazy(() => import('@renderer/components/base/base-confirm'))
const siderCardsPromise = import('@renderer/components/sider/sider-cards')
const SiderCards = lazy(() => siderCardsPromise)
const SettingsSidebar = lazy(loadSettingsSidebar)
const UpdaterButton = lazy(() => import('@renderer/components/updater/updater-button'))
const MacOSServiceSetup = lazy(() => import('@renderer/components/mihomo/macos-service-setup'))

const App: React.FC = () => {
  useEffect(startOverviewTrafficCollection, [])
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    appTheme = 'system',
    useWindowFrame = false,
    siderWidth = 250,
    autoCheckUpdate,
    updateChannel = 'stable',
    showUpdateButtonAfterNotification = true,
    disableAnimation = false
  } = appConfig || {}
  const narrowWidth = platform === 'darwin' ? 70 : 60
  const [siderWidthValue, setSiderWidthValue] = useState(siderWidth)
  const siderWidthValueRef = useRef(siderWidthValue)
  const [resizing, setResizing] = useState(false)
  const resizingRef = useRef(resizing)
  const resizePointerIdRef = useRef<number | null>(null)
  const { resolvedTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const lastNonSettingsRouteRef = useRef('/')
  const settingsFocusMode = isSettingsFocusRoute(location.pathname)
  const { hasUnsavedChanges, confirmUnsavedChanges } = useUnsavedChanges()
  useDeferredRoutePreload()

  useEffect(() => {
    if (!isSettingsFocusRoute(location.pathname)) {
      lastNonSettingsRouteRef.current = `${location.pathname}${location.search}`
    }
  }, [location.pathname, location.search])

  const leaveSettings = useCallback((): void => {
    navigate(lastNonSettingsRouteRef.current)
  }, [navigate])

  const page = <Outlet />

  const setTitlebar = (): void => {
    if (!useWindowFrame && platform !== 'darwin') {
      const options: TitleBarOverlayOptions = {
        height: 48,
        symbolColor: resolvedTheme === 'dark' ? '#fdfdfd' : '#363638'
      }
      try {
        options.color = window.getComputedStyle(document.documentElement).backgroundColor
        void setTitleBarOverlay(options)
      } catch {
        // ignore
      }
    }
  }
  const useInAppUpdateChecks = platform !== 'darwin' && autoCheckUpdate
  const { data: latest } = useSWR(
    useInAppUpdateChecks ? ['checkUpdate', updateChannel] : undefined,
    useInAppUpdateChecks ? checkUpdate : (): undefined => {},
    {
      refreshInterval: 1000 * 60 * 10
    }
  )

  useEffect(() => {
    setSiderWidthValue(siderWidth)
    siderWidthValueRef.current = siderWidth
  }, [siderWidth])

  useEffect(() => {
    siderWidthValueRef.current = siderWidthValue
    resizingRef.current = resizing
  }, [siderWidthValue, resizing])

  useEffect(() => {
    const tourShown = window.localStorage.getItem('tourShown')
    if (!tourShown) {
      window.localStorage.setItem('tourShown', 'true')
      import('@renderer/utils/driver').then(({ startTour }) => {
        startTour(navigate)
      })
    }
  }, [])

  useEffect(() => {
    void setNativeTheme(appTheme)
    setTitlebar()
  }, [appTheme, resolvedTheme, useWindowFrame])

  useEffect(() => {
    window.addEventListener('pointermove', onResizeMove)
    window.addEventListener('pointerup', onResizeEnd)
    window.addEventListener('pointercancel', onResizeEnd)
    return (): void => {
      window.removeEventListener('pointermove', onResizeMove)
      window.removeEventListener('pointerup', onResizeEnd)
      window.removeEventListener('pointercancel', onResizeEnd)
    }
  }, [])

  const updateSiderWidthFromClientX = (clientX: number): void => {
    let nextWidth: number
    if (clientX <= 150) {
      nextWidth = narrowWidth
    } else if (clientX <= 250) {
      nextWidth = 250
    } else if (clientX >= 400) {
      nextWidth = 400
    } else {
      nextWidth = clientX
    }

    siderWidthValueRef.current = nextWidth
    setSiderWidthValue(nextWidth)
  }

  const onResizeMove = (event: PointerEvent): void => {
    if (!resizingRef.current) return
    if (resizePointerIdRef.current !== null && event.pointerId !== resizePointerIdRef.current) {
      return
    }

    event.preventDefault()
    updateSiderWidthFromClientX(event.clientX)
  }

  const onResizeEnd = (event?: PointerEvent): void => {
    if (
      event &&
      resizePointerIdRef.current !== null &&
      event.pointerId !== resizePointerIdRef.current
    ) {
      return
    }

    if (resizingRef.current) {
      setResizing(false)
      patchAppConfig({ siderWidth: siderWidthValueRef.current })
    }
    resizePointerIdRef.current = null
  }

  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const [showMacOSServiceSetup, setShowMacOSServiceSetup] = useState(false)
  const [showProfileInstallConfirm, setShowProfileInstallConfirm] = useState(false)
  const [showOverrideInstallConfirm, setShowOverrideInstallConfirm] = useState(false)
  const [profileInstallData, setProfileInstallData] = useState<{
    url: string
    name?: string | null
  }>()
  const [overrideInstallData, setOverrideInstallData] = useState<{
    url: string
    name?: string | null
  }>()

  useEffect(() => {
    void setRendererHasUnsavedChanges(hasUnsavedChanges)
    return () => {
      void setRendererHasUnsavedChanges(false)
    }
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (platform !== 'darwin' || appConfig?.corePermissionMode !== 'service') return
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        const status = await serviceStatus().catch(() => 'unknown' as const)
        const ready = status === 'running' && (await testServiceConnection().catch(() => false))
        if (!cancelled && !ready) setShowMacOSServiceSetup(true)
      })()
    }, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [appConfig?.corePermissionMode])

  useEffect(() => {
    const handleShowQuitConfirm = (): void => {
      void confirmUnsavedChanges().then((canQuit) => {
        if (canQuit) setShowQuitConfirm(true)
        else window.electron.ipcRenderer.send('quit-confirm-result', false)
      })
    }
    const handleShowUnsavedCloseConfirm = (): void => {
      void confirmUnsavedChanges().then((canClose) => {
        if (canClose) void confirmCloseMainWindow()
      })
    }
    const handleShowProfileInstallConfirm = (
      _event: unknown,
      data: { url: string; name?: string | null }
    ): void => {
      setProfileInstallData(data)
      setShowProfileInstallConfirm(true)
    }
    const handleShowOverrideInstallConfirm = (
      _event: unknown,
      data: { url: string; name?: string | null }
    ): void => {
      setOverrideInstallData(data)
      setShowOverrideInstallConfirm(true)
    }

    window.electron.ipcRenderer.on('show-quit-confirm', handleShowQuitConfirm)
    window.electron.ipcRenderer.on('show-unsaved-close-confirm', handleShowUnsavedCloseConfirm)
    window.electron.ipcRenderer.on('show-profile-install-confirm', handleShowProfileInstallConfirm)
    window.electron.ipcRenderer.on(
      'show-override-install-confirm',
      handleShowOverrideInstallConfirm
    )

    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('show-quit-confirm')
      window.electron.ipcRenderer.removeAllListeners('show-unsaved-close-confirm')
      window.electron.ipcRenderer.removeAllListeners('show-profile-install-confirm')
      window.electron.ipcRenderer.removeAllListeners('show-override-install-confirm')
    }
  }, [confirmUnsavedChanges])

  const handleQuitConfirm = (confirmed: boolean): void => {
    setShowQuitConfirm(false)
    window.electron.ipcRenderer.send('quit-confirm-result', confirmed)
  }

  const handleProfileInstallConfirm = (confirmed: boolean): void => {
    setShowProfileInstallConfirm(false)
    window.electron.ipcRenderer.send('profile-install-confirm-result', confirmed)
  }

  const handleOverrideInstallConfirm = (confirmed: boolean): void => {
    setShowOverrideInstallConfirm(false)
    window.electron.ipcRenderer.send('override-install-confirm-result', confirmed)
  }

  return (
    <div className={`w-full h-screen flex ${resizing ? 'cursor-ew-resize' : ''}`}>
      <Suspense fallback={null}>
        {showMacOSServiceSetup && <MacOSServiceSetup onChange={setShowMacOSServiceSetup} />}
        {showQuitConfirm && (
          <ConfirmModal
            title={tr('Quit KokoroBox?')}
            description={
              <div>
                <p></p>
                <p className="text-sm text-gray-500 mt-2">
                  {tr('Proxy functionality will stop when you quit')}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {tr('Double-press or hold ')}
                  {platform === 'darwin' ? '⌘Q' : 'Ctrl+Q'} {tr(' to quit immediately')}
                </p>
              </div>
            }
            confirmText={tr('Quit')}
            cancelText={tr('Cancel')}
            onChange={(open) => {
              if (!open) {
                handleQuitConfirm(false)
              }
            }}
            onConfirm={() => handleQuitConfirm(true)}
          />
        )}
        {showProfileInstallConfirm && profileInstallData && (
          <ConfirmModal
            title={tr('Import this subscription profile?')}
            description={
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  {tr('Name:')}
                  {profileInstallData.name || tr('Untitled')}
                </p>
                <p className="text-sm text-gray-600 mb-2">
                  {tr('URL:')}
                  {profileInstallData.url}
                </p>
                <p className="text-sm text-orange-500 mt-2">
                  {tr(
                    'Only import profiles from trusted sources. Malicious configurations may compromise your network security'
                  )}
                </p>
              </div>
            }
            confirmText={tr('Import')}
            cancelText={tr('Cancel')}
            onChange={(open) => {
              if (!open) {
                handleProfileInstallConfirm(false)
              }
            }}
            onConfirm={() => handleProfileInstallConfirm(true)}
            className="w-125"
          />
        )}
        {showOverrideInstallConfirm && overrideInstallData && (
          <ConfirmModal
            title={tr('Import this override file?')}
            description={
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  {tr('Name:')}
                  {overrideInstallData.name || tr('Untitled')}
                </p>
                <p className="text-sm text-gray-600 mb-2">
                  {tr('URL:')}
                  {overrideInstallData.url}
                </p>
                <p className="text-sm text-orange-500 mt-2">
                  {tr(
                    'Only import overrides from trusted sources. Malicious overrides may compromise your network security'
                  )}
                </p>
              </div>
            }
            confirmText={tr('Import')}
            cancelText={tr('Cancel')}
            onChange={(open) => {
              if (!open) {
                handleOverrideInstallConfirm(false)
              }
            }}
            onConfirm={() => handleOverrideInstallConfirm(true)}
          />
        )}
      </Suspense>
      {siderWidthValue === narrowWidth ? (
        <div style={{ width: `${narrowWidth}px` }} className="side h-full flex flex-col">
          {settingsFocusMode ? (
            <Suspense
              fallback={<SettingsSidebarSkeleton iconOnly useWindowFrame={useWindowFrame} />}
            >
              <SettingsSidebar iconOnly leaveSettings={leaveSettings} />
            </Suspense>
          ) : (
            <>
              <div
                className={`app-drag flex shrink-0 justify-center items-center z-40 bg-transparent ${platform === 'darwin' && !useWindowFrame ? 'h-24 pt-12' : 'h-12.25'}`}
              >
                <KokoroBrandLink compact />
              </div>
              <Suspense fallback={<div className="min-h-0 flex-1" />}>
                <SiderCards iconOnly />
              </Suspense>
              <div className="flex shrink-0 flex-col items-center gap-2 border-t border-separator/60 px-2 pb-4 pt-2.5">
                {latest && latest.version && (
                  <Suspense fallback={null}>
                    <UpdaterButton
                      iconOnly={true}
                      latest={latest}
                      showButtonAfterNotification={showUpdateButtonAfterNotification}
                    />
                  </Suspense>
                )}
                <OutboundModeSwitcher iconOnly />
                <SiderIconButton
                  label={tr('Application settings')}
                  placement="right"
                  onFocus={() => void loadSettingsSidebar()}
                  onPointerEnter={() => void loadSettingsSidebar()}
                  onPress={() => navigate('/settings')}
                >
                  <IoSettings aria-hidden="true" className="text-[20px]" />
                </SiderIconButton>
              </div>
            </>
          )}
        </div>
      ) : (
        <div
          style={{ width: `${siderWidthValue}px` }}
          className="side h-full overflow-y-auto no-scrollbar"
        >
          {settingsFocusMode ? (
            <Suspense fallback={<SettingsSidebarSkeleton useWindowFrame={useWindowFrame} />}>
              <SettingsSidebar leaveSettings={leaveSettings} />
            </Suspense>
          ) : (
            <>
              <div
                className={`app-drag sticky top-0 z-40 ${disableAnimation ? 'bg-background/95 backdrop-blur-sm' : 'bg-transparent backdrop-blur'} h-12.25`}
              >
                <div
                  className={`flex justify-between p-2 ${!useWindowFrame && platform === 'darwin' ? 'ml-16.5' : ''}`}
                >
                  <KokoroBrandLink />
                  {latest && latest.version && (
                    <Suspense fallback={null}>
                      <UpdaterButton
                        latest={latest}
                        showButtonAfterNotification={showUpdateButtonAfterNotification}
                      />
                    </Suspense>
                  )}
                  <Tooltip delay={0}>
                    <Tooltip.Trigger>
                      <Button
                        aria-label={tr('Application settings')}
                        size="sm"
                        className="app-nodrag"
                        isIconOnly
                        variant="ghost"
                        onFocus={() => void loadSettingsSidebar()}
                        onPointerEnter={() => void loadSettingsSidebar()}
                        onPress={() => navigate('/settings')}
                      >
                        <IoSettings aria-hidden="true" className="text-[20px]" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{tr('Application settings')}</Tooltip.Content>
                  </Tooltip>
                </div>
              </div>
              <div className="mt-2 mx-2">
                <OutboundModeSwitcher />
              </div>
              <Suspense fallback={null}>
                <SiderCards />
              </Suspense>
            </>
          )}
        </div>
      )}

      <div
        onPointerDown={(event) => {
          resizePointerIdRef.current = event.pointerId
          event.currentTarget.setPointerCapture(event.pointerId)
          updateSiderWidthFromClientX(event.clientX)
          setResizing(true)
        }}
        style={{
          position: 'fixed',
          zIndex: 50,
          left: `${siderWidthValue - 6}px`,
          width: '12px',
          height: '100vh',
          cursor: 'ew-resize',
          touchAction: 'none'
        }}
        className="group flex justify-center"
      >
        <div
          className={`h-full w-0.5 transition-colors ${
            resizing ? 'bg-accent' : 'bg-transparent group-hover:bg-accent/60'
          }`}
        />
      </div>
      <Separator orientation="vertical" />
      <div
        style={{ width: `calc(100% - ${siderWidthValue + 1}px)` }}
        className="main grow h-full overflow-y-auto"
      >
        <Suspense fallback={null}>{page}</Suspense>
      </div>
    </div>
  )
}

export default App
