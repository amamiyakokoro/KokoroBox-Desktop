import { tr } from '../../../../shared/i18n'
import { Button, Label, Modal } from '@heroui/react'
import { KokoTextField as Input } from '../base/koko-form'
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
    <Modal>
      <Modal.Backdrop
        isOpen
        variant="blur"
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="w-[min(420px,calc(100%-24px))] max-w-none">
            <Modal.Header>
              <Modal.Heading>
                {isRenaming ? tr('Rename rule group') : tr('New rule group')}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium">{tr('Rule group name')}</Label>
                <Input
                  autoFocus
                  aria-label={tr('Rule group name')}
                  placeholder={tr('For example: Games')}
                  value={name}
                  maxLength={80}
                  isDisabled={saving}
                  onValueChange={setName}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submit()
                  }}
                />
              </div>
              <p className="text-xs text-foreground-500">
                {tr('After creating the group, use its menu to add applications or scan a folder.')}
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" isDisabled={saving} onPress={onClose}>
                {tr('Cancel')}
              </Button>
              <Button
                variant="primary"
                isPending={saving}
                isDisabled={!name.trim()}
                onPress={() => void submit()}
              >
                {isRenaming ? tr('Save') : tr('Create')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
