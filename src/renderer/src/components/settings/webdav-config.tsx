import { tr } from '../../../../shared/i18n'
import React, { useState } from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Button, Input } from '@heroui/react'
import { listWebdavBackups, webdavBackup } from '@renderer/utils/ipc'
import WebdavRestoreModal from './webdav-restore-modal'
import debounce from '@renderer/utils/debounce'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { notify } from '@renderer/utils/notification'

const DEFAULT_WEBDAV_DIR = 'KokoroBox'

const WebdavConfig: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    webdavUrl,
    webdavUsername,
    webdavPassword,
    webdavDir = DEFAULT_WEBDAV_DIR
  } = appConfig || {}
  const [backuping, setBackuping] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [filenames, setFilenames] = useState<string[]>([])
  const [restoreOpen, setRestoreOpen] = useState(false)

  const [webdav, setWebdav] = useState({ webdavUrl, webdavUsername, webdavPassword, webdavDir })
  const setWebdavDebounce = debounce(({ webdavUrl, webdavUsername, webdavPassword, webdavDir }) => {
    patchAppConfig({ webdavUrl, webdavUsername, webdavPassword, webdavDir })
  }, 500)
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
        <SettingItem compatKey="legacy" title={tr('WebDAV URL')} divider>
          <Input
            size="sm"
            className="w-[60%]"
            value={webdav.webdavUrl}
            onValueChange={(v) => {
              setWebdav({ ...webdav, webdavUrl: v })
              setWebdavDebounce({ ...webdav, webdavUrl: v })
            }}
          />
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('WebDAV backup directory')} divider>
          <Input
            size="sm"
            className="w-[60%]"
            value={webdav.webdavDir}
            onValueChange={(v) => {
              setWebdav({ ...webdav, webdavDir: v })
              setWebdavDebounce({ ...webdav, webdavDir: v })
            }}
          />
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('WebDAV username')} divider>
          <Input
            size="sm"
            className="w-[60%]"
            value={webdav.webdavUsername}
            onValueChange={(v) => {
              setWebdav({ ...webdav, webdavUsername: v })
              setWebdavDebounce({ ...webdav, webdavUsername: v })
            }}
          />
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('WebDAV password')} divider>
          <Input
            size="sm"
            className="w-[60%]"
            type="password"
            value={webdav.webdavPassword}
            onValueChange={(v) => {
              setWebdav({ ...webdav, webdavPassword: v })
              setWebdavDebounce({ ...webdav, webdavPassword: v })
            }}
          />
        </SettingItem>
        <div className="flex justify0between">
          <Button isLoading={backuping} fullWidth size="sm" className="mr-1" onPress={handleBackup}>
            {tr('Back up')}
          </Button>
          <Button
            isLoading={restoring}
            fullWidth
            size="sm"
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
