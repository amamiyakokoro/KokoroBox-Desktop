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
        <ModalHeader>{isRenaming ? tr('Rename rule group') : tr('New rule group')}</ModalHeader>
        <ModalBody>
          <Input
            autoFocus
            label={tr('Rule group name')}
            placeholder={tr('For example: Games')}
            value={name}
            maxLength={80}
            isDisabled={saving}
            onValueChange={setName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
          />
          <p className="text-xs text-foreground-500">
            {tr('After creating the group, use its menu to add applications or scan a folder.')}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" isDisabled={saving} onPress={onClose}>
            {tr('Cancel')}
          </Button>
          <Button
            color="primary"
            isLoading={saving}
            isDisabled={!name.trim()}
            onPress={() => void submit()}
          >
            {isRenaming ? tr('Save') : tr('Create')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
