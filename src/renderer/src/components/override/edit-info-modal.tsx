import { tr } from '../../../../shared/i18n'
import { Button, Modal, Surface, Switch } from '@heroui/react'
import type { ReactNode } from 'react'
import React, { useState } from 'react'
import ModalSettingItem from '../base/base-modal-setting-item'
import { KokoSelect, KokoTextField } from '../base/koko-form'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { restartCore } from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import { isOverrideUsedByCurrentProfile } from '@renderer/utils/override'

interface Props {
  item: OverrideItem
  updateOverrideItem: (item: OverrideItem) => Promise<void>
  onClose: () => void
}

const EditInfoModal: React.FC<Props> = (props) => {
  const { item, updateOverrideItem, onClose } = props
  useAppConfig()
  const { profileConfig } = useProfileConfig()
  const [values, setValues] = useState(item)

  const onSave = async (): Promise<void> => {
    try {
      const itemToSave = {
        ...values
      }

      await updateOverrideItem(itemToSave)
      const usedByCurrent = isOverrideUsedByCurrentProfile(
        profileConfig,
        item.id,
        item.global || itemToSave.global
      )
      if (item.id && usedByCurrent) {
        await restartCore()
      }
      onClose()
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }

  const renderField = (
    title: string,
    content: ReactNode,
    options?: {
      align?: 'start' | 'center'
      divider?: boolean
    }
  ) => {
    const { align = 'center', divider = true } = options || {}

    return (
      <ModalSettingItem
        key={title}
        align={align}
        divider={divider}
        labelWidth="narrow"
        title={title}
      >
        {content}
      </ModalSettingItem>
    )
  }

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={true}
        onOpenChange={onClose}
        variant="blur"
        className="top-12 h-[calc(100%-48px)]"
      >
        <Modal.Container scroll="inside">
          <Modal.Dialog className="w-[min(500px,calc(100%-24px))] max-w-none">
            <Modal.Header className="app-drag pb-1">
              <Modal.Heading>
                {item.id ? tr('Edit override details') : tr('Import remote override')}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="no-scrollbar max-h-[70vh] overflow-y-auto pt-1 pb-2">
              <Surface variant="transparent" className="flex flex-col">
                {renderField(
                  tr('Name'),
                  <KokoTextField
                    aria-label={tr('Name')}
                    controlWidth="full"
                    value={values.name}
                    onChangeValue={(value) => {
                      setValues({ ...values, name: value })
                    }}
                  />
                )}
                {values.type === 'remote' &&
                  renderField(
                    tr('Override URL'),
                    <KokoTextField
                      aria-label={tr('Override URL')}
                      controlWidth="full"
                      value={values.url || ''}
                      onChangeValue={(value) => {
                        setValues({ ...values, url: value })
                      }}
                    />,
                    { align: 'start' }
                  )}
                {values.type === 'remote' &&
                  renderField(
                    tr('Certificate fingerprint'),
                    <KokoTextField
                      aria-label={tr('Certificate fingerprint')}
                      controlWidth="full"
                      value={values.fingerprint ?? ''}
                      onChangeValue={(value) => {
                        setValues({ ...values, fingerprint: value.trim() || undefined })
                      }}
                    />
                  )}
                {values.type === 'remote' &&
                  renderField(
                    tr('Custom user agent'),
                    <KokoTextField
                      aria-label={tr('Custom user agent')}
                      controlWidth="full"
                      value={values.ua ?? ''}
                      onChangeValue={(value) => {
                        setValues({ ...values, ua: value.trim() || undefined })
                      }}
                    />
                  )}
                {renderField(
                  tr('File type'),
                  <KokoSelect
                    aria-label={tr('File type')}
                    controlWidth="select"
                    density="compact"
                    disallowEmptySelection
                    options={[
                      { id: 'yaml', label: 'YAML' },
                      { id: 'js', label: 'JavaScript' }
                    ]}
                    value={values.ext}
                    variant="secondary"
                    onChange={(value) => {
                      setValues({ ...values, ext: value as 'js' | 'yaml' })
                    }}
                  />
                )}
                {renderField(
                  tr('Global overrides'),
                  <Switch
                    aria-label={tr('Global overrides')}
                    size="sm"
                    isSelected={values.global ?? false}
                    onChange={(v) => {
                      setValues({ ...values, global: v })
                    }}
                  >
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>,
                  { divider: false }
                )}
              </Surface>
            </Modal.Body>
            <Modal.Footer className="justify-end pt-2">
              <Button size="sm" variant="secondary" onPress={onClose}>
                {tr('Cancel')}
              </Button>
              <Button size="sm" variant="primary" onPress={onSave}>
                {item.id ? tr('Save') : tr('Import')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default EditInfoModal
