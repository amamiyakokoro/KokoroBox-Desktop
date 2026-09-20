import { tr } from '../../../../shared/i18n'
import { Button } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import {
  cancelUpdate,
  checkUpdate,
  createHeapSnapshot,
  quitApp,
  quitWithoutCore,
  resetAppConfig
} from '@renderer/utils/ipc'
import React, { useEffect, useState } from 'react'
import UpdaterDrawer from '../updater/updater-drawer'
import { version } from '@renderer/utils/init'
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

export type ActionSection = 'application' | 'diagnostics' | 'danger' | 'version'

interface Props {
  sections?: ActionSection[]
}

const Actions: React.FC<Props> = ({
  sections = ['application', 'diagnostics', 'version', 'danger']
}) => {
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
  }>({ downloading: false, progress: 0 })

  useEffect(() => {
    const handleUpdateStatus = (_: Electron.IpcRendererEvent, status: typeof updateStatus): void =>
      setUpdateStatus(status)
    return window.electron.ipcRenderer.on('update-status', handleUpdateStatus)
  }, [])

  const handleCancelUpdate = async (): Promise<void> => {
    try {
      await cancelUpdate()
      setUpdateStatus({ downloading: false, progress: 0 })
    } catch {
      // The updater reports cancellation failures through its own status channel.
    }
  }

  const openUpdateDrawer = (): void => {
    setOpenUpdate(true)
    setUpdateDrawerReopenSignal((signal) => signal + 1)
  }

  const handleCheckUpdate = async (): Promise<void> => {
    try {
      setCheckingUpdate(true)
      const nextVersion = await checkUpdate()
      if (!nextVersion) {
        notify(tr("You're up to date"), { body: tr('No update needed') })
        return
      }
      setNewVersion(nextVersion.version)
      setChangelog(nextVersion.changelog)
      notify(tr('New version available'), {
        actionProps: {
          children: tr('View content'),
          onPress: openUpdateDrawer,
          variant: 'secondary'
        },
        body: tr('Version {0} is ready', [nextVersion.version]),
        forceToast: true,
        timeout: 8000,
        variant: 'accent'
      })
    } catch (e) {
      notify(e, { variant: 'danger' })
    } finally {
      setCheckingUpdate(false)
    }
  }

  return (
    <>
      {sections.includes('application') && openUpdate && (
        <UpdaterDrawer
          onClose={() => setOpenUpdate(false)}
          version={newVersion}
          changelog={changelog}
          updateStatus={updateStatus}
          reopenSignal={updateDrawerReopenSignal}
          onCancel={handleCancelUpdate}
        />
      )}
      {sections.includes('danger') && confirmOpen && (
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

      {sections.includes('application') && (
        <SettingCard header={tr('Application actions')}>
          <SettingItem contentAlign="end" title={tr('Open guided tour')} divider>
            <Button size="sm" variant="secondary" onPress={() => startTour(navigate)}>
              {tr('Open guided tour')}
            </Button>
          </SettingItem>
          <SettingItem contentAlign="end" title={tr('Check for updates')}>
            <Button
              size="sm"
              variant="secondary"
              isPending={checkingUpdate}
              onPress={handleCheckUpdate}
            >
              {tr('Check for updates')}
            </Button>
          </SettingItem>
        </SettingCard>
      )}

      {sections.includes('diagnostics') && (
        <SettingCard header={tr('Diagnostics')}>
          <SettingItem
            contentAlign="end"
            title={tr('Clear cache')}
            help={tr('Clear the app renderer cache')}
            divider
          >
            <Button size="sm" variant="secondary" onPress={() => localStorage.clear()}>
              {tr('Clear cache')}
            </Button>
          </SettingItem>
          <SettingItem
            contentAlign="end"
            title={tr('Create heap snapshot')}
            help={tr('Create a main-process heap snapshot to diagnose memory issues')}
          >
            <Button size="sm" variant="secondary" onPress={handleCreateHeapSnapshot}>
              {tr('Create heap snapshot')}
            </Button>
          </SettingItem>
        </SettingCard>
      )}

      {sections.includes('version') && (
        <SettingCard header={tr('Version information')}>
          <SettingItem contentAlign="end" title={tr('App version')}>
            <div className="text-sm tabular-nums text-foreground-500">v{version}</div>
          </SettingItem>
        </SettingCard>
      )}

      {sections.includes('danger') && (
        <SettingCard header={tr('Danger zone')}>
          <SettingItem
            contentAlign="end"
            title={tr('Reset app')}
            help={tr('Delete all configuration and reset the app')}
            divider
          >
            <Button size="sm" variant="danger-soft" onPress={() => setConfirmOpen(true)}>
              {tr('Reset app')}
            </Button>
          </SettingItem>
          <SettingItem
            contentAlign="end"
            title={tr('Quit and keep core running')}
            help={tr('Quit the app completely, leaving only the core process running')}
            divider
          >
            <Button size="sm" variant="secondary" onPress={quitWithoutCore}>
              {tr('Quit')}
            </Button>
          </SettingItem>
          <SettingItem contentAlign="end" title={tr('Quit app')}>
            <Button size="sm" variant="danger-soft" onPress={quitApp}>
              {tr('Quit app')}
            </Button>
          </SettingItem>
        </SettingCard>
      )}
    </>
  )
}

export default Actions
