import { tr } from '../../../../shared/i18n'
import { Button, Modal, Surface, Switch, Tooltip } from '@heroui/react'
import { KokoActionMenu } from '../base/koko-collections'
import ModalSettingItem from '../base/base-modal-setting-item'
import { KokoTextField } from '../base/koko-form'
import type { ReactNode } from 'react'
import React, { useState } from 'react'
import { useOverrideConfig } from '@renderer/hooks/use-override-config'
import { ageIdentityToRecipient, generateAgeKeyPair, restartCore } from '@renderer/utils/ipc'
import { MdDeleteForever } from 'react-icons/md'
import { FaPlus } from 'react-icons/fa6'
import { BiCopy, BiHide, BiShow } from 'react-icons/bi'
import { LuArrowRight, LuRefreshCw } from 'react-icons/lu'
import { notify } from '@renderer/utils/notification'

interface Props {
  item: ProfileItem
  isCurrent: boolean
  updateProfileItem: (item: ProfileItem) => Promise<void>
  onClose: () => void
}

const EditInfoModal: React.FC<Props> = (props) => {
  const { item, isCurrent, updateProfileItem, onClose } = props
  const { overrideConfig } = useOverrideConfig()
  const { items: overrideItems = [] } = overrideConfig || {}
  const [values, setValues] = useState({ ...item, autoUpdate: item.autoUpdate ?? true })
  const [ageIdentityVisible, setAgeIdentityVisible] = useState(false)

  const copyValue = async (value: string | undefined, title: string): Promise<void> => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    notify(title, { variant: 'success' })
  }

  const handleGenerateAgeKeyPair = async (): Promise<void> => {
    try {
      const keyPair = await generateAgeKeyPair()
      setValues((current) => ({
        ...current,
        ageIdentity: keyPair.identity,
        ageRecipient: keyPair.recipient
      }))
      notify(tr('age keys generated'), { variant: 'success' })
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }

  const handleDeriveAgeRecipient = async (): Promise<void> => {
    try {
      const recipient = await ageIdentityToRecipient(values.ageIdentity ?? '')
      setValues((current) => ({ ...current, ageRecipient: recipient }))
      notify(tr('age public key generated'), { variant: 'success' })
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }

  const onSave = async (): Promise<void> => {
    try {
      const itemToSave = {
        ...values,
        override: values.override?.filter(
          (i) =>
            overrideItems.find((t) => t.id === i) && !overrideItems.find((t) => t.id === i)?.global
        )
      }

      await updateProfileItem(itemToSave)
      if (item.id && isCurrent) {
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
      help?: ReactNode
    }
  ) => {
    const { align = 'center', divider = true, help } = options || {}

    return (
      <ModalSettingItem
        key={title}
        align={align}
        divider={divider}
        help={help}
        labelWidth="wide"
        title={title}
      >
        {content}
      </ModalSettingItem>
    )
  }

  const globalOverrideRows = overrideItems
    .filter((i) => i.global)
    .map((i) => (
      <Surface
        key={i.id}
        variant="transparent"
        className="flex items-center gap-1.5 px-1.5 py-0.75"
      >
        <Button
          isDisabled
          fullWidth
          variant="secondary"
          size="sm"
          className="h-6.5 min-h-6.5 min-w-0 justify-start rounded-md px-2 text-[13px]"
        >
          <span className="truncate">
            {i.name} {tr(' (Global)')}
          </span>
        </Button>
      </Surface>
    ))

  const localOverrideRows = (values.override || []).flatMap((id) => {
    const overrideItem = overrideItems.find((item) => item.id === id)
    if (!overrideItem || overrideItem.global) return []

    return (
      <Surface key={id} variant="transparent" className="flex items-center gap-1.5 px-1.5 py-0.75">
        <Button
          isDisabled
          fullWidth
          variant="secondary"
          size="sm"
          className="h-6.5 min-h-6.5 min-w-0 justify-start rounded-md px-2 text-[13px]"
        >
          <span className="truncate">{overrideItem.name}</span>
        </Button>
        <Button
          variant="danger-soft"
          size="sm"
          className="h-6.5 min-h-6.5 min-w-6.5 shrink-0 rounded-md px-1.5"
          onPress={() => {
            setValues({
              ...values,
              override: values.override?.filter((item) => item !== id)
            })
          }}
        >
          <MdDeleteForever className="text-lg" />
        </Button>
      </Surface>
    )
  })

  const overrideRows = [...globalOverrideRows, ...localOverrideRows]
  const selectableOverrides = overrideItems.filter(
    (item) => !values.override?.includes(item.id) && !item.global
  )

  const overrideContent = (
    <Surface
      variant="secondary"
      className="w-40 max-w-full flex flex-col overflow-hidden rounded-lg"
    >
      {overrideRows}
      <Surface variant="transparent" className="px-1.5 py-0.75">
        <KokoActionMenu
          ariaLabel={tr('Overrides')}
          buttonClassName="h-6.5 min-h-6.5 rounded-md"
          buttonFullWidth
          buttonVariant="secondary"
          isIconOnly={false}
          items={
            selectableOverrides.length > 0
              ? selectableOverrides.map((item) => ({
                  id: item.id,
                  label: item.name,
                  textValue: item.name
                }))
              : [
                  {
                    id: 'empty',
                    label: tr('No overrides available'),
                    textValue: tr('No overrides available'),
                    isDisabled: true
                  }
                ]
          }
          placement="top"
          popoverClassName="no-scrollbar overflow-y-auto"
          onAction={(id) => {
            if (id === 'empty') return
            setValues({
              ...values,
              override: Array.from(values.override || []).concat(id)
            })
          }}
        >
          <FaPlus className="text-[13px]" />
        </KokoActionMenu>
      </Surface>
    </Surface>
  )

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={true}
        onOpenChange={onClose}
        variant="blur"
        className="top-12 h-[calc(100%-48px)]"
      >
        <Modal.Container scroll="inside">
          <Modal.Dialog className="w-[600px] max-w-[calc(100vw-32px)]">
            <Modal.Header className="app-drag pb-1">
              <Modal.Heading>
                {item.id ? tr('Edit details') : tr('Import remote configuration')}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="no-scrollbar max-h-[70vh] min-w-0 overflow-x-hidden overflow-y-auto pt-1 pb-2">
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
                    tr('Subscription URL'),
                    <KokoTextField
                      aria-label={tr('Subscription URL')}
                      controlWidth="full"
                      value={values.url}
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
                {values.type === 'remote' &&
                  renderField(
                    tr('Validate subscription format'),
                    <Switch
                      aria-label={tr('Validate subscription format')}
                      size="sm"
                      isSelected={values.verify ?? false}
                      onChange={(v) => {
                        setValues({ ...values, verify: v })
                      }}
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  )}
                {values.type === 'remote' &&
                  renderField(
                    tr('Update through proxy'),
                    <Switch
                      aria-label={tr('Update through proxy')}
                      size="sm"
                      isSelected={values.useProxy ?? false}
                      onChange={(v) => {
                        setValues({ ...values, useProxy: v })
                      }}
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  )}
                {values.type === 'remote' &&
                  renderField(
                    tr('Automatic updates'),
                    <Switch
                      aria-label={tr('Automatic updates')}
                      size="sm"
                      isSelected={values.autoUpdate ?? false}
                      onChange={(v) => {
                        setValues({ ...values, autoUpdate: v })
                      }}
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  )}
                {renderField(
                  tr('age public key'),
                  <KokoTextField
                    aria-label={tr('age public key')}
                    controlWidth="full"
                    value={values.ageRecipient ?? ''}
                    placeholder="age1..."
                    onChangeValue={(value) => {
                      setValues({ ...values, ageRecipient: value.trim() || undefined })
                    }}
                    suffix={
                      <>
                        <Tooltip delay={0}>
                          <Tooltip.Trigger>
                            <Button
                              aria-label={tr('Derive a public key from the age private key')}
                              isIconOnly
                              size="sm"
                              variant="ghost"
                              onPress={handleDeriveAgeRecipient}
                            >
                              <LuArrowRight className="text-lg" />
                            </Button>
                          </Tooltip.Trigger>
                          <Tooltip.Content>
                            {tr('Derive public key from private key')}
                          </Tooltip.Content>
                        </Tooltip>
                        <Button
                          aria-label={tr('Copy age public key')}
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          onPress={() => copyValue(values.ageRecipient, tr('age public key copied'))}
                        >
                          <BiCopy className="text-lg" />
                        </Button>
                      </>
                    }
                  />
                )}
                {renderField(
                  tr('age private key'),
                  <KokoTextField
                    aria-label={tr('age private key')}
                    controlWidth="full"
                    type={ageIdentityVisible ? 'text' : 'password'}
                    value={values.ageIdentity ?? ''}
                    placeholder="AGE-SECRET-KEY-1..."
                    onChangeValue={(value) => {
                      setValues({ ...values, ageIdentity: value.trim() || undefined })
                    }}
                    suffix={
                      <>
                        <Button
                          aria-label={tr('Generate age private key')}
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          onPress={handleGenerateAgeKeyPair}
                        >
                          <LuRefreshCw className="text-lg" />
                        </Button>
                        <Button
                          aria-label={tr('Copy age private key')}
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          onPress={() => copyValue(values.ageIdentity, tr('age private key copied'))}
                        >
                          <BiCopy className="text-lg" />
                        </Button>
                        <Button
                          aria-label={
                            ageIdentityVisible
                              ? tr('Hide age private key')
                              : tr('Show age private key')
                          }
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          onPress={() => setAgeIdentityVisible((visible) => !visible)}
                        >
                          {ageIdentityVisible ? (
                            <BiHide className="text-lg" />
                          ) : (
                            <BiShow className="text-lg" />
                          )}
                        </Button>
                      </>
                    }
                  />
                )}
                {values.type === 'remote' &&
                  values.autoUpdate &&
                  renderField(
                    tr('Update interval (minutes)'),
                    <KokoTextField
                      aria-label={tr('Update interval (minutes)')}
                      controlWidth="number"
                      type="number"
                      value={values.interval?.toString() ?? ''}
                      onChangeValue={(value) => {
                        setValues({ ...values, interval: parseInt(value) })
                      }}
                      isDisabled={values.locked}
                    />,
                    {
                      help: values.locked ? tr('The update interval is managed remotely') : undefined
                    }
                  )}
                {renderField(tr('Overrides'), overrideContent, { align: 'start', divider: false })}
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
