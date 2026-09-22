import { tr } from '../../../../shared/i18n'
import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@heroui/react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { KokoTextField } from '../base/koko-form'
import {
  getWebdavPasswordConfigured,
  listWebdavBackups,
  setWebdavPassword,
  webdavBackup
} from '@renderer/utils/ipc'
import WebdavRestoreModal from './webdav-restore-modal'
import debounce from '@renderer/utils/debounce'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { notify } from '@renderer/utils/notification'

const DEFAULT_WEBDAV_DIR = 'KokoroBox'

const WebdavConfig: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const { webdavUrl, webdavUsername, webdavDir = DEFAULT_WEBDAV_DIR } = appConfig || {}
  const [backuping, setBackuping] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [filenames, setFilenames] = useState<string[]>([])
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState('')
  const [passwordConfigured, setPasswordConfigured] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

  const [webdav, setWebdav] = useState({ webdavUrl, webdavUsername, webdavDir })
  const setWebdavDebounce = useRef(
    debounce(({ webdavUrl, webdavUsername, webdavDir }: typeof webdav) => {
      void patchAppConfig({ webdavUrl, webdavUsername, webdavDir })
    }, 500)
  ).current

  useEffect(() => {
    void getWebdavPasswordConfigured()
      .then(setPasswordConfigured)
      .catch((error) => {
        notify(error, { variant: 'danger' })
      })
  }, [])

  const savePassword = async (password: string): Promise<void> => {
    setPasswordSaving(true)
    try {
      await setWebdavPassword(password)
      setPasswordConfigured(Boolean(password))
      setPasswordDraft('')
    } catch (error) {
      notify(error, { variant: 'danger' })
    } finally {
      setPasswordSaving(false)
    }
  }
  const handleBackup = async (): Promise<void> => {
    setBackuping(true)
    try {
      await webdavBackup()
      notify(tr('Backup completed'), { body: tr('Backup uploaded to WebDAV'), variant: 'success' })
    } catch (e) {
      notify(e, { variant: 'danger' })
    } finally {
      setBackuping(false)
    }
  }

  const handleRestore = async (): Promise<void> => {
    try {
      setRestoring(true)
      const filenames = await listWebdavBackups()
      setFilenames(filenames)
      setRestoreOpen(true)
    } catch (e) {
      notify(tr('Failed to retrieve backup list: {0}', [e]), { variant: 'danger' })
    } finally {
      setRestoring(false)
    }
  }
  return (
    <>
      {restoreOpen && (
        <WebdavRestoreModal filenames={filenames} onClose={() => setRestoreOpen(false)} />
      )}
      <SettingCard header={tr('WebDAV backup')}>
        <SettingItem contentAlign="end" title={tr('WebDAV URL')} divider>
          <KokoTextField
            controlWidth="full"
            value={webdav.webdavUrl}
            onChangeValue={(v) => {
              setWebdav({ ...webdav, webdavUrl: v })
              setWebdavDebounce({ ...webdav, webdavUrl: v })
            }}
          />
        </SettingItem>
        <SettingItem contentAlign="end" title={tr('WebDAV backup directory')} divider>
          <KokoTextField
            controlWidth="full"
            value={webdav.webdavDir}
            onChangeValue={(v) => {
              setWebdav({ ...webdav, webdavDir: v })
              setWebdavDebounce({ ...webdav, webdavDir: v })
            }}
          />
        </SettingItem>
        <SettingItem contentAlign="end" title={tr('WebDAV username')} divider>
          <KokoTextField
            controlWidth="full"
            value={webdav.webdavUsername}
            onChangeValue={(v) => {
              setWebdav({ ...webdav, webdavUsername: v })
              setWebdavDebounce({ ...webdav, webdavUsername: v })
            }}
          />
        </SettingItem>
        <SettingItem contentAlign="end" title={tr('WebDAV password')} divider>
          <div className="flex w-full items-center gap-2">
            {passwordConfigured && !passwordDraft && (
              <span className="shrink-0 text-xs text-muted">{tr('Configured')}</span>
            )}
            <KokoTextField
              className="min-w-0 flex-1"
              type="password"
              value={passwordDraft}
              onChangeValue={setPasswordDraft}
            />
            <Button
              size="sm"
              isDisabled={!passwordDraft || passwordSaving}
              onPress={() => void savePassword(passwordDraft)}
            >
              {tr('Save')}
            </Button>
            {passwordConfigured && (
              <Button
                size="sm"
                variant="ghost"
                isDisabled={passwordSaving}
                onPress={() => void savePassword('')}
              >
                {tr('Clear field')}
              </Button>
            )}
          </div>
        </SettingItem>
        <div className="flex justify0between">
          <Button
            isPending={backuping}
            fullWidth
            size="sm"
            variant="secondary"
            className="mr-1"
            onPress={handleBackup}
          >
            {tr('Back up')}
          </Button>
          <Button
            isPending={restoring}
            fullWidth
            size="sm"
            variant="secondary"
            className="ml-1"
            onPress={handleRestore}
          >
            {tr('Restore')}
          </Button>
        </div>
      </SettingCard>
    </>
  )
}

export default WebdavConfig
