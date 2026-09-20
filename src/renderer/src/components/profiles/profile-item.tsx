import { tr } from '../../../../shared/i18n'
import { Button, Card, Chip, Meter, Tooltip } from '@heroui/react'
import { KokoActionMenu, type KokoActionMenuItem } from '../base/koko-collections'
import { calcTraffic } from '@renderer/utils/calc'
import { IoMdMore, IoMdRefresh } from 'react-icons/io'
import {
  MdDeleteOutline,
  MdEdit,
  MdEditDocument,
  MdHome,
  MdOpenInNew,
  MdQrCode2
} from 'react-icons/md'
import dayjs from 'dayjs'
import React, { useEffect, useMemo, useState } from 'react'
import EditFileModal from './edit-file-modal'
import EditInfoModal from './edit-info-modal'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { openFile } from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import ConfirmModal from '../base/base-confirm'
import QRCodeModal from '../base/base-qrcode-modal'
import { CollectionCard } from '../base/management/collection-surface'

interface Props {
  info: ProfileItem
  isCurrent: boolean
  addProfileItem: (item: Partial<ProfileItem>) => Promise<void>
  updateProfileItem: (item: ProfileItem) => Promise<void>
  removeProfileItem: (id: string) => Promise<void>
  mutateProfileConfig: () => void
  onClick: () => Promise<void>
  switching: boolean
}

const ProfileItem: React.FC<Props> = (props) => {
  const {
    info,
    addProfileItem,
    removeProfileItem,
    mutateProfileConfig,
    updateProfileItem,
    onClick,
    isCurrent,
    switching
  } = props
  const extra = info?.extra
  const isKokoroProfile = info.type === 'remote' && Boolean(info.kokoro)
  const usage = (extra?.upload ?? 0) + (extra?.download ?? 0)
  const total = extra?.total ?? 0
  const { appConfig, patchAppConfig } = useAppConfig()
  const { profileDisplayDate = 'expire' } = appConfig || {}
  const [updating, setUpdating] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [openInfoEditor, setOpenInfoEditor] = useState(false)
  const [openFileEditor, setOpenFileEditor] = useState(false)
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
  const [disableSelect, setDisableSelect] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showQrCode, setShowQrCode] = useState(false)

  const menuItems = useMemo<KokoActionMenuItem[]>(() => {
    const items: KokoActionMenuItem[] = [
      {
        id: 'edit-info',
        label: tr('Edit details'),
        textValue: tr('Edit details'),
        startContent: <MdEdit />
      },
      {
        id: 'edit-file',
        label: tr('Edit file'),
        textValue: tr('Edit file'),
        startContent: <MdEditDocument />
      },
      {
        id: 'open-file',
        label: tr('Open file'),
        textValue: tr('Open file'),
        startContent: <MdOpenInNew />
      },
      ...(info.type === 'remote' && info.url
        ? [
            {
              id: 'qrcode',
              label: tr('QR code'),
              textValue: tr('QR code'),
              startContent: <MdQrCode2 />
            }
          ]
        : [])
    ]

    if (info.home) {
      const lastItem = items.at(-1)
      if (lastItem) lastItem.dividerAfter = true
      items.push({
        id: 'home',
        label: tr('Home'),
        textValue: tr('Home'),
        startContent: <MdHome />
      })
    }

    items.push({
      id: 'delete',
      label: tr('Delete'),
      textValue: tr('Delete'),
      startContent: <MdDeleteOutline />,
      tone: 'danger'
    })

    return items
  }, [info])

  const onMenuAction = async (id: string): Promise<void> => {
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
        openFile('profile', info.id)
        break
      }
      case 'qrcode': {
        setShowQrCode(true)
        break
      }
      case 'delete': {
        setConfirmOpen(true)
        break
      }

      case 'home': {
        open(info.home)
        break
      }
    }
  }

  useEffect(() => {
    if (isDragging) {
      setDisableSelect(true)
      return
    }

    const timer = window.setTimeout(() => {
      setDisableSelect(false)
    }, 160)

    return (): void => window.clearTimeout(timer)
  }, [isDragging])

  return (
    <div
      ref={setNodeRef}
      className="col-span-1 grid min-w-0 touch-sortable-card"
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
          isRemote={info.type === 'remote'}
          onClose={() => setOpenFileEditor(false)}
        />
      )}
      {openInfoEditor && (
        <EditInfoModal
          item={info}
          isCurrent={isCurrent}
          onClose={() => setOpenInfoEditor(false)}
          updateProfileItem={updateProfileItem}
        />
      )}
      {showQrCode && info.url && (
        <QRCodeModal title={info.name} url={info.url} onClose={() => setShowQrCode(false)} />
      )}
      {confirmOpen && (
        <ConfirmModal
          onChange={setConfirmOpen}
          title={tr('Delete this configuration?')}
          confirmText={tr('Confirm deletion')}
          cancelText={tr('Cancel')}
          onConfirm={() => {
            removeProfileItem(info.id)
            mutateProfileConfig()
          }}
        />
      )}
      <CollectionCard isBusy={selecting} isCurrent={isCurrent}>
        <div className="h-full w-full min-w-0 overflow-hidden">
          <button
            {...attributes}
            {...listeners}
            type="button"
            data-card-primary-action
            aria-label={info.name}
            aria-disabled={disableSelect || switching || undefined}
            className="absolute inset-0 z-0 cursor-pointer outline-none"
            onClick={() => {
              if (disableSelect || switching) return
              setSelecting(true)
              onClick().finally(() => {
                setSelecting(false)
              })
            }}
          />
          <Card.Content className="pointer-events-none relative z-1 w-full min-w-0 gap-0 px-3 pb-2 pt-3">
            <div className="flex min-h-8 items-start justify-between gap-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <h3
                  title={info?.name}
                  className="truncate text-sm font-semibold leading-6 text-foreground"
                >
                  {info?.name}
                </h3>
                {isCurrent ? (
                  <Chip className="shrink-0" color="accent" size="sm" variant="soft">
                    {tr('Current')}
                  </Chip>
                ) : null}
              </div>
              <div className="pointer-events-auto flex shrink-0" data-no-dnd>
                {info.type === 'remote' && (
                  <Tooltip delay={0}>
                    <Tooltip.Trigger>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={tr('Refresh')}
                        isDisabled={updating}
                        onPress={async () => {
                          setUpdating(true)
                          await addProfileItem(info)
                          setUpdating(false)
                        }}
                      >
                        <IoMdRefresh
                          color="default"
                          className={`text-[20px] text-foreground ${updating ? 'animate-spin' : ''}`}
                        />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content placement="left">
                      {dayjs(info.updated).fromNow()}
                    </Tooltip.Content>
                  </Tooltip>
                )}

                <KokoActionMenu
                  ariaLabel={tr('Edit details')}
                  buttonClassName="h-8 w-8 min-w-8"
                  items={menuItems}
                  onAction={onMenuAction}
                >
                  <IoMdMore color="default" className="text-[20px] text-foreground" />
                </KokoActionMenu>
              </div>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
              {isKokoroProfile ? (
                <Chip color="accent" size="sm" title={tr('Kokoro subscription')} variant="soft">
                  Kokoro
                </Chip>
              ) : (
                <span>{info.type === 'remote' ? tr('Remote') : tr('Local')}</span>
              )}
              {info.type === 'remote' ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate" title={dayjs(info.updated).format('YYYY-MM-DD HH:mm')}>
                    {dayjs(info.updated).fromNow()}
                  </span>
                </>
              ) : null}
            </div>
            {info.type === 'remote' && extra && (
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-foreground">
                <span className="tabular-nums">{`${calcTraffic(usage)} / ${calcTraffic(total)}`}</span>
                {profileDisplayDate === 'expire' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="pointer-events-auto m-0 h-6 min-w-0 px-1.5 text-xs text-muted"
                    onPress={async () => {
                      await patchAppConfig({ profileDisplayDate: 'update' })
                    }}
                  >
                    {extra.expire
                      ? dayjs.unix(extra.expire).format('YYYY-MM-DD')
                      : tr('No expiration')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="pointer-events-auto m-0 h-6 min-w-0 px-1.5 text-xs text-muted"
                    onPress={async () => {
                      await patchAppConfig({ profileDisplayDate: 'expire' })
                    }}
                  >
                    {dayjs(info.updated).fromNow()}
                  </Button>
                )}
              </div>
            )}
          </Card.Content>
          {extra ? (
            <Card.Footer className="pointer-events-none relative z-1 w-full min-w-0 overflow-hidden px-3 pb-3 pt-0">
              <Meter aria-label={tr('Traffic usage')} maxValue={total} value={usage}>
                <Meter.Track>
                  <Meter.Fill />
                </Meter.Track>
              </Meter>
            </Card.Footer>
          ) : null}
        </div>
      </CollectionCard>
    </div>
  )
}

export default ProfileItem
