import { tr } from '../../../../shared/i18n'
import { Button, Tooltip } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import {
  checkUpdate,
  createHeapSnapshot,
  quitApp,
  quitWithoutCore,
  resetAppConfig,
  cancelUpdate
} from '@renderer/utils/ipc'
import { useState, useEffect } from 'react'
import UpdaterDrawer from '../updater/updater-drawer'
import { version } from '@renderer/utils/init'
import { IoIosHelpCircle } from 'react-icons/io'
import { startTour } from '@renderer/utils/driver'
import { useNavigate } from 'react-router-dom'
import ConfirmModal from '../base/base-confirm'
import { notify } from '@renderer/utils/notification'

async function handleCreateHeapSnapshot(): Promise<void> {
  try {
    const snapshotPath = await createHeapSnapshot()
    notify(tr('Heap snapshot created\n{0}', [snapshotPath]), { variant: 'success' })
  } catch (e) {
    notify(tr('Failed to create heap snapshot\n{0}', [e]), { variant: 'danger' })
  }
}

const Actions: React.FC = () => {
  const navigate = useNavigate()
  const [newVersion, setNewVersion] = useState('')
  const [changelog, setChangelog] = useState('')
  const [openUpdate, setOpenUpdate] = useState(false)
  const [updateDrawerReopenSignal, setUpdateDrawerReopenSignal] = useState(0)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<{
    downloading: boolean
    progress: number
    error?: string
  }>({
    downloading: false,
    progress: 0
  })

  useEffect(() => {
    const handleUpdateStatus = (
      _: Electron.IpcRendererEvent,
      status: typeof updateStatus
    ): void => {
      setUpdateStatus(status)
    }

    const unsubscribe = window.electron.ipcRenderer.on('update-status', handleUpdateStatus)

    return (): void => {
      unsubscribe()
    }
  }, [])

  const handleCancelUpdate = async (): Promise<void> => {
    try {
      await cancelUpdate()
      setUpdateStatus({ downloading: false, progress: 0 })
    } catch (e) {
      // ignore
    }
  }

  const openUpdateDrawer = (): void => {
    setOpenUpdate(true)
    setUpdateDrawerReopenSignal((signal) => signal + 1)
  }

  return (
    <>
      {openUpdate && (
        <UpdaterDrawer
          onClose={() => setOpenUpdate(false)}
          version={newVersion}
          changelog={changelog}
          updateStatus={updateStatus}
          reopenSignal={updateDrawerReopenSignal}
          onCancel={handleCancelUpdate}
        />
      )}
      {confirmOpen && (
        <ConfirmModal
          onChange={setConfirmOpen}
          title={tr('Delete this configuration?')}
          description={
            <>
              {tr('⚠️ Delete all configuration;')}
              <span className="text-red-500">{tr('This action cannot be undone')}</span>
            </>
          }
          confirmText={tr('Confirm deletion')}
          cancelText={tr('Cancel')}
          onConfirm={resetAppConfig}
        />
      )}
      <SettingCard>
        <SettingItem compatKey="legacy" title={tr('Open guided tour')} divider>
          <Button size="sm" onPress={() => startTour(navigate)}>
            {tr('Open guided tour')}
          </Button>
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('Check for updates')} divider>
          <Button
            size="sm"
            isLoading={checkingUpdate}
            onPress={async () => {
              try {
                setCheckingUpdate(true)
                const version = await checkUpdate()
                if (version) {
                  setNewVersion(version.version)
                  setChangelog(version.changelog)
                  notify(tr('New version available'), {
                    actionProps: {
                      children: tr('View content'),
                      onPress: openUpdateDrawer,
                      variant: 'secondary'
                    },
                    body: tr('Version {0} is ready', [version.version]),
                    forceToast: true,
                    timeout: 8000,
                    variant: 'accent'
                  })
                } else {
                  notify(tr("You're up to date"), { body: tr('No update needed') })
                }
              } catch (e) {
                notify(e, { variant: 'danger' })
              } finally {
                setCheckingUpdate(false)
              }
            }}
          >
            {tr('Check for updates')}
          </Button>
        </SettingItem>
        <SettingItem
          compatKey="legacy"
          title={tr('Reset app')}
          actions={
            <Tooltip content={tr('Delete all configuration and reset the app')}>
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onPress={() => setConfirmOpen(true)}>
            {tr('Reset app')}
          </Button>
        </SettingItem>
        <SettingItem
          compatKey="legacy"
          title={tr('Clear cache')}
          actions={
            <Tooltip content={tr('Clear the app renderer cache')}>
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onPress={() => localStorage.clear()}>
            {tr('Clear cache')}
          </Button>
        </SettingItem>
        <SettingItem
          compatKey="legacy"
          title={tr('Create heap snapshot')}
          actions={
            <Tooltip content={tr('Create a main-process heap snapshot to diagnose memory issues')}>
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onPress={handleCreateHeapSnapshot}>
            {tr('Create heap snapshot')}
          </Button>
        </SettingItem>
        <SettingItem
          compatKey="legacy"
          title={tr('Quit and keep core running')}
          actions={
            <Tooltip content={tr('Quit the app completely, leaving only the core process running')}>
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onPress={quitWithoutCore}>
            {tr('Quit')}
          </Button>
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('Quit app')} divider>
          <Button size="sm" onPress={quitApp}>
            {tr('Quit app')}
          </Button>
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('App version')}>
          <div>v{version}</div>
        </SettingItem>
      </SettingCard>
    </>
  )
}

export default Actions
