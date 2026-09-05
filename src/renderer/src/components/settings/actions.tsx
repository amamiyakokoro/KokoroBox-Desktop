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
    notify(tr('堆快照已创建\n{0}', [snapshotPath]), { variant: 'success' })
  } catch (e) {
    notify(tr('创建堆快照失败\n{0}', [e]), { variant: 'danger' })
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
          title={tr('确认删除配置？')}
          description={
            <>
              {tr('⚠️ 删除配置，')}
              <span className="text-red-500">{tr('操作不可撤销')}</span>
            </>
          }
          confirmText={tr('确认删除')}
          cancelText={tr('取消')}
          onConfirm={resetAppConfig}
        />
      )}
      <SettingCard>
        <SettingItem compatKey="legacy" title={tr('打开引导页面')} divider>
          <Button size="sm" onPress={() => startTour(navigate)}>
            {tr('打开引导页面')}
          </Button>
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('检查更新')} divider>
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
                  notify(tr('发现新版本'), {
                    actionProps: {
                      children: tr('查看内容'),
                      onPress: openUpdateDrawer,
                      variant: 'secondary'
                    },
                    body: tr('{0} 版本就绪', [version.version]),
                    forceToast: true,
                    timeout: 8000,
                    variant: 'accent'
                  })
                } else {
                  notify(tr('当前已是最新版本'), { body: tr('无需更新') })
                }
              } catch (e) {
                notify(e, { variant: 'danger' })
              } finally {
                setCheckingUpdate(false)
              }
            }}
          >
            {tr('检查更新')}
          </Button>
        </SettingItem>
        <SettingItem
          compatKey="legacy"
          title={tr('重置软件')}
          actions={
            <Tooltip content={tr('删除所有配置，将软件恢复初始状态')}>
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onPress={() => setConfirmOpen(true)}>
            {tr('重置软件')}
          </Button>
        </SettingItem>
        <SettingItem
          compatKey="legacy"
          title={tr('清除缓存')}
          actions={
            <Tooltip content={tr('清除软件渲染进程缓存')}>
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onPress={() => localStorage.clear()}>
            {tr('清除缓存')}
          </Button>
        </SettingItem>
        <SettingItem
          compatKey="legacy"
          title={tr('创建堆快照')}
          actions={
            <Tooltip content={tr('创建主进程堆快照，用于排查内存问题')}>
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onPress={handleCreateHeapSnapshot}>
            {tr('创建堆快照')}
          </Button>
        </SettingItem>
        <SettingItem
          compatKey="legacy"
          title={tr('保留内核退出')}
          actions={
            <Tooltip content={tr('完全退出软件，只保留内核进程')}>
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onPress={quitWithoutCore}>
            {tr('退出')}
          </Button>
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('退出应用')} divider>
          <Button size="sm" onPress={quitApp}>
            {tr('退出应用')}
          </Button>
        </SettingItem>
        <SettingItem compatKey="legacy" title={tr('应用版本')}>
          <div>v{version}</div>
        </SettingItem>
      </SettingCard>
    </>
  )
}

export default Actions
