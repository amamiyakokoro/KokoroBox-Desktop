import { tr } from '../../../../shared/i18n'
import { Modal } from '@heroui/react'
import React, { useEffect, useState } from 'react'
import { getInterfaces } from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { KokoButton as Button } from '../base/koko-form'
import { LuCopy } from 'react-icons/lu'

interface Props {
  onClose: () => void
}

const InterfaceModal: React.FC<Props> = (props) => {
  const { onClose } = props
  useAppConfig()
  const [info, setInfo] = useState<Record<string, NetworkInterfaceInfo[]>>({})
  const getInfo = async (): Promise<void> => {
    setInfo(await getInterfaces())
  }

  useEffect(() => {
    getInfo()
  }, [])

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={true}
        onOpenChange={onClose}
        variant="blur"
        className="top-12 h-[calc(100%-48px)]"
      >
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <Modal.Header className="app-drag">
              <Modal.Heading>{tr('Network information')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="no-scrollbar max-h-[70vh] overflow-y-auto">
              {Object.entries(info).map(([key, value]) => {
                return (
                  <div key={key}>
                    <h4 className="font-bold">{key}</h4>
                    {value.map((v) => {
                      return (
                        <div key={v.address}>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <span className="text-sm text-foreground-500">{v.family}</span>
                            <div className="flex min-w-0 items-center gap-1 rounded-lg bg-default-100 px-2 py-1">
                              <code className="truncate text-xs" title={v.address}>
                                {v.address}
                              </code>
                              <Button
                                aria-label={`${tr('Copy')}: ${v.address}`}
                                className="h-6 w-6 min-w-6"
                                isIconOnly
                                size="sm"
                                variant="light"
                                onPress={() => void navigator.clipboard.writeText(v.address)}
                              >
                                <LuCopy />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </Modal.Body>
            <Modal.CloseTrigger className="app-nodrag" />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default InterfaceModal
