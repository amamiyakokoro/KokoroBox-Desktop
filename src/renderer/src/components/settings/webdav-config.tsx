import { tr } from '../../../../shared/i18n'
import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@heroui/react'
import { LuArchiveRestore, LuCloud, LuDownload, LuHardDrive, LuUpload } from 'react-icons/lu'
import SettingsSection from '../base/base-settings-section'
import { KokoTextField } from '../base/koko-form'
import {
  getWebdavPasswordConfigured,
  listWebdavBackups,
  localBackup,
  localRestore,
  setWebdavPassword,
  webdavBackup
} from '@renderer/utils/ipc'
import WebdavRestoreModal from './webdav-restore-modal'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { notify } from '@renderer/utils/notification'

const DEFAULT_WEBDAV_DIR = 'KokoroBox'
type Operation = 'local-backup' | 'local-restore' | 'webdav-backup' | 'webdav-restore' | 'password'

const WebdavConfig: React.FC = () => {
  const { appConfig, patchAppConfigOrThrow } = useAppConfig()
  const [operation, setOperation] = useState<Operation | null>(null)
  const [filenames, setFilenames] = useState<string[]>([])
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState('')
  const [passwordConfigured, setPasswordConfigured] = useState(false)
  const [webdav, setWebdav] = useState({
    webdavUrl: appConfig?.webdavUrl ?? '',
    webdavUsername: appConfig?.webdavUsername ?? '',
    webdavDir: appConfig?.webdavDir ?? DEFAULT_WEBDAV_DIR
  })
  const initialized = useRef(Boolean(appConfig))
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingWebdav = useRef<typeof webdav | null>(null)
  const busy = operation !== null || restoreOpen
  const connected = Boolean(webdav.webdavUrl.trim() && webdav.webdavDir.trim())

  useEffect(() => {
    if (appConfig && !initialized.current) {
      initialized.current = true
      setWebdav({
        webdavUrl: appConfig.webdavUrl ?? '',
        webdavUsername: appConfig.webdavUsername ?? '',
        webdavDir: appConfig.webdavDir ?? DEFAULT_WEBDAV_DIR
      })
    }
  }, [appConfig])

  useEffect(() => {
    void getWebdavPasswordConfigured()
      .then(setPasswordConfigured)
      .catch((error) => notify(error, { variant: 'danger' }))
    return (): void => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (pendingWebdav.current) {
        void patchAppConfigOrThrow(pendingWebdav.current).catch((error) =>
          notify(error, { variant: 'danger' })
        )
      }
    }
  }, [])

  const changeWebdav = (key: keyof typeof webdav, value: string): void => {
    const next = { ...webdav, [key]: value }
    setWebdav(next)
    pendingWebdav.current = next
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      pendingWebdav.current = null
      void patchAppConfigOrThrow(next).catch((error) => notify(error, { variant: 'danger' }))
    }, 500)
  }

  const savePassword = async (password: string): Promise<void> => {
    await setWebdavPassword(password)
    setPasswordConfigured(Boolean(password))
    setPasswordDraft('')
  }

  const persistWebdav = async (): Promise<void> => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    pendingWebdav.current = null
    await patchAppConfigOrThrow(webdav)
    if (passwordDraft) await savePassword(passwordDraft)
  }

  const run = async (next: Operation, action: () => Promise<void>): Promise<void> => {
    if (busy) return
    setOperation(next)
    try {
      await action()
    } catch (error) {
      notify(error, { variant: 'danger' })
    } finally {
      setOperation(null)
    }
  }

  return (
    <>
      {restoreOpen && (
        <WebdavRestoreModal filenames={filenames} onClose={() => setRestoreOpen(false)} />
      )}
      <SettingsSection
        settingLabel={tr('Local backup')}
        title={
          <span className="flex items-center gap-2">
            <LuHardDrive className="text-muted" />
            {tr('Local backup')}
          </span>
        }
        description={tr('Export a ZIP file or restore a backup from this device.')}
        contentClassName="py-3"
        className="@container"
      >
        <div className="grid grid-cols-1 items-center gap-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_auto]">
          <p className="min-w-0 flex-1 text-xs leading-5 text-muted">
            {tr('Includes settings, subscriptions, overrides, application rules and backgrounds.')}
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              size="sm"
              isDisabled={busy}
              isPending={operation === 'local-backup'}
              onPress={() =>
                run('local-backup', async () => {
                  await persistWebdav()
                  if (await localBackup()) notify(tr('Backup completed'), { variant: 'success' })
                })
              }
            >
              <LuDownload />
              {tr('Export backup')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={busy}
              isPending={operation === 'local-restore'}
              onPress={() =>
                run('local-restore', async () => {
                  await localRestore()
                })
              }
            >
              <LuArchiveRestore />
              {tr('Restore from file')}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">
          {tr('Account credentials and service authorization stay on this device.')}
        </p>
      </SettingsSection>
      <SettingsSection
        settingLabel={tr('WebDAV backup')}
        title={
          <span className="flex items-center gap-2">
            <LuCloud className="text-muted" />
            {tr('WebDAV backup')}
          </span>
        }
        description={tr('Save and restore the same ZIP backups on your WebDAV server.')}
        contentClassName="py-3"
      >
        <div className="@container">
          <p className="mb-3 text-xs leading-5 text-muted">
            {tr(
              'URL, directory and username are saved automatically. Save a changed password explicitly, or use a backup action to save it and continue.'
            )}
          </p>
          <div className="grid grid-cols-1 gap-3 @min-[32rem]:grid-cols-2">
            <div
              className="@min-[32rem]:col-span-2"
              data-setting-label={tr('WebDAV URL')}
              tabIndex={-1}
            >
              <label htmlFor="backup-webdav-url" className="mb-1.5 block text-sm">
                {tr('WebDAV URL')}
              </label>
              <KokoTextField
                id="backup-webdav-url"
                controlWidth="full"
                placeholder="https://example.com/dav"
                isDisabled={busy}
                value={webdav.webdavUrl}
                onChangeValue={(value) => changeWebdav('webdavUrl', value)}
              />
            </div>
            <div data-setting-label={tr('WebDAV backup directory')} tabIndex={-1}>
              <label htmlFor="backup-webdav-directory" className="mb-1.5 block text-sm">
                {tr('WebDAV backup directory')}
              </label>
              <KokoTextField
                id="backup-webdav-directory"
                controlWidth="full"
                isDisabled={busy}
                value={webdav.webdavDir}
                onChangeValue={(value) => changeWebdav('webdavDir', value)}
              />
            </div>
            <div data-setting-label={tr('WebDAV username')} tabIndex={-1}>
              <label htmlFor="backup-webdav-username" className="mb-1.5 block text-sm">
                {tr('WebDAV username')}
              </label>
              <KokoTextField
                id="backup-webdav-username"
                controlWidth="full"
                isDisabled={busy}
                value={webdav.webdavUsername}
                onChangeValue={(value) => changeWebdav('webdavUsername', value)}
              />
            </div>
            <div
              className="@min-[32rem]:col-span-2"
              data-setting-label={tr('WebDAV password')}
              tabIndex={-1}
            >
              <label
                htmlFor="backup-webdav-password"
                className="mb-1.5 flex items-center gap-2 text-sm"
              >
                {tr('WebDAV password')}
                {passwordConfigured && (
                  <span className="text-xs text-muted">{tr('Configured')}</span>
                )}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <KokoTextField
                  id="backup-webdav-password"
                  className="min-w-40 flex-1"
                  type="password"
                  isDisabled={busy}
                  value={passwordDraft}
                  onChangeValue={setPasswordDraft}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={!passwordDraft || busy}
                  isPending={operation === 'password'}
                  onPress={() => run('password', () => savePassword(passwordDraft))}
                >
                  {tr('Save')}
                </Button>
                {passwordConfigured && (
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={busy}
                    onPress={() => run('password', () => savePassword(''))}
                  >
                    {tr('Clear field')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-separator pt-3">
          <Button
            size="sm"
            isDisabled={!connected || busy}
            isPending={operation === 'webdav-backup'}
            onPress={() =>
              run('webdav-backup', async () => {
                await persistWebdav()
                await webdavBackup()
                notify(tr('Backup completed'), {
                  body: tr('Backup uploaded to WebDAV'),
                  variant: 'success'
                })
              })
            }
          >
            <LuUpload />
            {tr('Back up')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={!connected || busy}
            isPending={operation === 'webdav-restore'}
            onPress={() =>
              run('webdav-restore', async () => {
                await persistWebdav()
                setFilenames(await listWebdavBackups())
                setRestoreOpen(true)
              })
            }
          >
            <LuArchiveRestore />
            {tr('Restore')}
          </Button>
        </div>
      </SettingsSection>
    </>
  )
}

export default WebdavConfig
