import { tr } from '../../../../shared/i18n'
import { Button, Card, Chip } from '@heroui-v3/react'
import { KokoActionMenu } from '../base/koko-collections'
import { IoMdMore, IoMdRefresh } from 'react-icons/io'
import dayjs from 'dayjs'
import React, { useEffect, useMemo, useState } from 'react'
import EditFileModal from './edit-file-modal'
import EditInfoModal from './edit-info-modal'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ExecLogModal from './exec-log-modal'
import { openFile, restartCore } from '@renderer/utils/ipc'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import ConfirmModal from '../base/base-confirm'
import QRCodeModal from '../base/base-qrcode-modal'
import { notify } from '@renderer/utils/notification'
import { isOverrideUsedByCurrentProfile } from '@renderer/utils/override'

interface Props {
  info: OverrideItem
  addOverrideItem: (item: Partial<OverrideItem>) => Promise<void>
  updateOverrideItem: (item: OverrideItem) => Promise<void>
  removeOverrideItem: (id: string) => Promise<void>
  mutateOverrideConfig: () => void
}

interface MenuItem {
  key: string
  label: string
  showDivider: boolean
  color: 'default' | 'danger'
  className: string
}

const OverrideItem: React.FC<Props> = (props) => {
  const { info, addOverrideItem, removeOverrideItem, mutateOverrideConfig, updateOverrideItem } =
    props
  const { profileConfig } = useProfileConfig()
  const [updating, setUpdating] = useState(false)
  const [openInfoEditor, setOpenInfoEditor] = useState(false)
  const [openFileEditor, setOpenFileEditor] = useState(false)
  const [openLog, setOpenLog] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: info.id
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const [disableOpen, setDisableOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showQrCode, setShowQrCode] = useState(false)
  const menuItems: MenuItem[] = useMemo(() => {
    const list = [
      {
        key: 'edit-info',
        label: tr('Edit details'),
        showDivider: false,
        color: 'default',
        className: ''
      } as MenuItem,
      {
        key: 'edit-file',
        label: tr('Edit file'),
        showDivider: false,
        color: 'default',
        className: ''
      } as MenuItem,
      {
        key: 'open-file',
        label: tr('Open file'),
        showDivider: false,
        color: 'default',
        className: ''
      } as MenuItem,
      ...(info.type === 'remote' && info.url
        ? [
            {
              key: 'qrcode',
              label: tr('QR code'),
              showDivider: false,
              color: 'default',
              className: ''
            } as MenuItem
          ]
        : []),
      {
        key: 'exec-log',
        label: tr('Execution log'),
        showDivider: true,
        color: 'default',
        className: ''
      } as MenuItem,
      {
        key: 'delete',
        label: tr('Delete'),
        showDivider: false,
        color: 'danger',
        className: 'text-danger'
      } as MenuItem
    ]
    if (info.ext === 'yaml') {
      const execLogIndex = list.findIndex((item) => item.key === 'exec-log')
      if (execLogIndex !== -1) list.splice(execLogIndex, 1)
    }
    // 确保 delete 前的最后一项有分隔线
    const deleteIndex = list.findIndex((item) => item.key === 'delete')
    if (deleteIndex > 0) {
      list[deleteIndex - 1].showDivider = true
    }
    return list
  }, [info])
  const onMenuAction = (id: string): void => {
    switch (id) {
      case 'edit-info': {
        setOpenInfoEditor(true)
        break
      }
      case 'edit-file': {
        setOpenFileEditor(true)
        break
      }
      case 'open-file': {
        openFile('override', info.id, info.ext)
        break
      }
      case 'qrcode': {
        setShowQrCode(true)
        break
      }
      case 'exec-log': {
        setOpenLog(true)
        break
      }
      case 'delete': {
        setConfirmOpen(true)
        break
      }
    }
  }

  useEffect(() => {
    if (isDragging) {
      setDisableOpen(true)
      return
    }

    const timer = window.setTimeout(() => {
      setDisableOpen(false)
    }, 160)

    return (): void => window.clearTimeout(timer)
  }, [isDragging])

  return (
    <div
      ref={setNodeRef}
      className="grid col-span-1 touch-sortable-card"
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined
      }}
    >
      {openFileEditor && (
        <EditFileModal
          id={info.id}
          language={info.ext === 'yaml' ? 'yaml' : 'javascript'}
          onClose={() => setOpenFileEditor(false)}
        />
      )}
      {openInfoEditor && (
        <EditInfoModal
          item={info}
          onClose={() => setOpenInfoEditor(false)}
          updateOverrideItem={updateOverrideItem}
        />
      )}
      {showQrCode && info.url && (
        <QRCodeModal title={info.name} url={info.url} onClose={() => setShowQrCode(false)} />
      )}
      {confirmOpen && (
        <ConfirmModal
          onChange={setConfirmOpen}
          title={tr('Delete this override?')}
          confirmText={tr('Confirm deletion')}
          cancelText={tr('Cancel')}
          onConfirm={() => {
            removeOverrideItem(info.id)
            mutateOverrideConfig()
          }}
        />
      )}
      {openLog && <ExecLogModal id={info.id} onClose={() => setOpenLog(false)} />}
      <Card className="h-full w-full min-w-0 overflow-hidden">
        <div {...attributes} {...listeners} className="h-full w-full min-w-0">
          <Card.Content className="min-w-0">
            <div className="flex min-w-0 items-start gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
                disabled={disableOpen}
                onClick={() => setOpenFileEditor(true)}
              >
                <h3 title={info.name} className="truncate text-sm font-semibold text-foreground">
                  {info.name}
                </h3>
                <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {info.global && (
                      <Chip size="sm" variant="soft" color="accent">
                        {tr('Global')}
                      </Chip>
                    )}
                    <span className="truncate text-xs text-muted">
                      {info.ext === 'yaml' ? 'YAML' : 'JavaScript'}
                    </span>
                  </div>
                  {info.type === 'remote' && (
                    <small className="shrink-0 text-muted">{dayjs(info.updated).fromNow()}</small>
                  )}
                </div>
              </button>
              <div className="flex shrink-0" data-no-dnd>
                {info.type === 'remote' && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={tr('Refresh')}
                    isDisabled={updating}
                    onPress={async () => {
                      setUpdating(true)
                      try {
                        await addOverrideItem(info)
                        if (isOverrideUsedByCurrentProfile(profileConfig, info.id, info.global)) {
                          await restartCore()
                        }
                      } catch (e) {
                        notify(e, { variant: 'danger' })
                      } finally {
                        setUpdating(false)
                      }
                    }}
                  >
                    <IoMdRefresh className={`text-[20px] ${updating ? 'animate-spin' : ''}`} />
                  </Button>
                )}

                <KokoActionMenu
                  ariaLabel={tr('Edit details')}
                  items={menuItems.map((item) => ({
                    id: item.key,
                    label: item.label,
                    textValue: item.label,
                    dividerAfter: item.showDivider,
                    tone: item.color === 'danger' ? 'danger' : 'default'
                  }))}
                  onAction={onMenuAction}
                >
                  <IoMdMore className="text-[20px]" />
                </KokoActionMenu>
              </div>
            </div>
          </Card.Content>
        </div>
      </Card>
    </div>
  )
}

export default OverrideItem
