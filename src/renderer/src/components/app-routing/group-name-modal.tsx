import { tr } from '../../../../shared/i18n'
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader
} from '@heroui/react'
import { useState } from 'react'

interface AppRoutingGroupNameModalProps {
  initialName?: string
  onSave: (name: string) => Promise<boolean>
  onClose: () => void
}

export function AppRoutingGroupNameModal({
  initialName = '',
  onSave,
  onClose
}: AppRoutingGroupNameModalProps): React.JSX.Element {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const isRenaming = Boolean(initialName)

  const submit = async (): Promise<void> => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      if (await onSave(name)) onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen placement="center" onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        <ModalHeader>{isRenaming ? tr('重命名规则组') : tr('新建规则组')}</ModalHeader>
        <ModalBody>
          <Input
            autoFocus
            label={tr('规则组名称')}
            placeholder={tr('例如：游戏')}
            value={name}
            maxLength={80}
            isDisabled={saving}
            onValueChange={setName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
          />
          <p className="text-xs text-foreground-500">
            {tr('创建后可从规则组菜单添加应用程序或扫描文件夹。')}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" isDisabled={saving} onPress={onClose}>
            {tr('取消')}
          </Button>
          <Button
            color="primary"
            isLoading={saving}
            isDisabled={!name.trim()}
            onPress={() => void submit()}
          >
            {isRenaming ? tr('保存') : tr('创建')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
