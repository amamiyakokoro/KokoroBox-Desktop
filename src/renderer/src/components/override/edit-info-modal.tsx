import { tr } from '../../../../shared/i18n'
import {
  Button,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  Separator,
  Surface,
  Switch
} from '@heroui-v3/react'
import type { ReactNode } from 'react'
import React, { useState } from 'react'
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
      actions?: ReactNode
      align?: 'start' | 'center'
      divider?: boolean
    }
  ) => {
    const { actions, align = 'center', divider = true } = options || {}

    return (
      <Surface key={title} variant="transparent" className="flex flex-col">
        <div
          className={`setting-item px-0 setting-item--content-end ${
            align === 'start' ? 'setting-item--start' : 'setting-item--center'
          }`}
          style={{ gridTemplateColumns: '88px minmax(0, 1fr)' }}
        >
          <div className="setting-item__title-wrap">
            <Label className="setting-item__title">{title}</Label>
            {actions}
          </div>
          <div className="setting-item__content">{content}</div>
        </div>
        {divider ? <Separator variant="tertiary" className="bg-default-100/70" /> : null}
      </Surface>
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
              <Modal.Heading>{item.id ? tr('编辑覆写信息') : tr('导入远程覆写')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="no-scrollbar max-h-[70vh] overflow-y-auto pt-1 pb-2">
              <Surface variant="transparent" className="flex flex-col">
                {renderField(
                  tr('名称'),
                  <Input
                    aria-label={tr('名称')}
                    data-setting-input="edit-modal-name"
                    value={values.name}
                    variant="secondary"
                    onChange={(event) => {
                      setValues({ ...values, name: event.target.value })
                    }}
                  />
                )}
                {values.type === 'remote' &&
                  renderField(
                    tr('覆写地址'),
                    <Input
                      aria-label={tr('覆写地址')}
                      data-setting-input="edit-modal"
                      value={values.url || ''}
                      variant="secondary"
                      onChange={(event) => {
                        setValues({ ...values, url: event.target.value })
                      }}
                    />,
                    { align: 'start' }
                  )}
                {values.type === 'remote' &&
                  renderField(
                    tr('证书指纹'),
                    <Input
                      aria-label={tr('证书指纹')}
                      data-setting-input="edit-modal"
                      value={values.fingerprint ?? ''}
                      variant="secondary"
                      onChange={(event) => {
                        const v = event.target.value
                        setValues({ ...values, fingerprint: v.trim() || undefined })
                      }}
                    />
                  )}
                {values.type === 'remote' &&
                  renderField(
                    tr('指定 UA'),
                    <Input
                      aria-label={tr('指定 UA')}
                      data-setting-input="edit-modal"
                      value={values.ua ?? ''}
                      variant="secondary"
                      onChange={(event) => {
                        const v = event.target.value
                        setValues({ ...values, ua: v.trim() || undefined })
                      }}
                    />
                  )}
                {renderField(
                  tr('文件类型'),
                  <Select
                    aria-label={tr('文件类型')}
                    value={values.ext}
                    variant="secondary"
                    onChange={(value) => {
                      if (Array.isArray(value) || value == null) return
                      setValues({ ...values, ext: value as 'js' | 'yaml' })
                    }}
                  >
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="yaml" textValue="YAML">
                          YAML
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="js" textValue="JavaScript">
                          JavaScript
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      </ListBox>
                    </Select.Popover>
                  </Select>
                )}
                {renderField(
                  tr('全局覆写'),
                  <Switch
                    aria-label={tr('全局覆写')}
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
                {tr('取消')}
              </Button>
              <Button size="sm" variant="primary" onPress={onSave}>
                {item.id ? tr('保存') : tr('导入')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default EditInfoModal
