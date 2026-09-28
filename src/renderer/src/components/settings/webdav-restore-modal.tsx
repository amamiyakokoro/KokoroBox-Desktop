import { tr } from '../../../../shared/i18n'
import { Button, Modal } from '@heroui/react'
import { webdavDelete, webdavRestore } from '@renderer/utils/ipc'
import React, { useState } from 'react'
import { LuArchive, LuArchiveRestore, LuTrash2 } from 'react-icons/lu'
import { notify } from '@renderer/utils/notification'

interface Props {
  filenames: string[]
  onClose: () => void
}

const WebdavRestoreModal: React.FC<Props> = ({ filenames: names, onClose }) => {
  const [filenames, setFilenames] = useState<string[]>([...names].sort().reverse())
  const [operation, setOperation] = useState<{
    type: 'restore' | 'delete'
    filename: string
  } | null>(null)
  const busy = operation !== null
  const close = (): void => {
    if (!busy) onClose()
  }

  return (
    <Modal>
      <Modal.Backdrop
        isOpen
        onOpenChange={(open) => {
          if (!open) close()
        }}
        variant="blur"
        className="top-12 h-[calc(100%-48px)]"
      >
        <Modal.Container scroll="inside">
          <Modal.Dialog className="w-[min(40rem,calc(100vw-2rem))]">
            <Modal.Header className="app-drag">
              <Modal.Heading>{tr('Restore backup')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="pb-2">
              <p className="mb-3 text-sm text-muted">
                {tr('Current settings will be replaced and KokoroBox will restart.')}
              </p>
              {filenames.length === 0 ? (
                <div className="py-8 text-center text-muted">{tr('No backups yet')}</div>
              ) : (
                <ul className="divide-y divide-separator">
                  {filenames.map((filename) => (
                    <li className="flex items-center gap-3 py-3" key={filename}>
                      <LuArchive className="shrink-0 text-lg text-muted" />
                      <span className="min-w-0 flex-1 break-all text-sm">{filename}</span>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={busy}
                          isPending={
                            operation?.type === 'restore' && operation.filename === filename
                          }
                          onPress={async () => {
                            setOperation({ type: 'restore', filename })
                            try {
                              await webdavRestore(filename)
                            } catch (error) {
                              notify(tr('Restore failed: {0}', [error]), { variant: 'danger' })
                            } finally {
                              setOperation(null)
                            }
                          }}
                        >
                          <LuArchiveRestore />
                          {tr('Restore')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          isIconOnly
                          isDisabled={busy}
                          aria-label={tr('Delete backup {0}', [filename])}
                          isPending={
                            operation?.type === 'delete' && operation.filename === filename
                          }
                          onPress={async () => {
                            setOperation({ type: 'delete', filename })
                            try {
                              await webdavDelete(filename)
                              setFilenames((current) => current.filter((name) => name !== filename))
                            } catch (error) {
                              notify(tr('Delete failed: {0}', [error]), { variant: 'danger' })
                            } finally {
                              setOperation(null)
                            }
                          }}
                        >
                          <LuTrash2 className="text-danger" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button size="sm" variant="secondary" isDisabled={busy} onPress={close}>
                {tr('Close')}
              </Button>
            </Modal.Footer>
            <Modal.CloseTrigger className="app-nodrag" isDisabled={busy} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default WebdavRestoreModal
