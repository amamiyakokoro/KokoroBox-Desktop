import { tr } from '../../../../shared/i18n'
import { Button, Label, Modal, Spinner, Switch } from '@heroui/react'
import React, { useEffect, useMemo, useState } from 'react'
import { BaseEditor } from '../base/base-editor-lazy'
import { getOverride, restartCore, setOverride } from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useOverrideConfig } from '@renderer/hooks/use-override-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import ConfirmModal from '../base/base-confirm'
import { notify } from '@renderer/utils/notification'
import { isOverrideUsedByCurrentProfile } from '@renderer/utils/override'

interface Props {
  id: string
  language: 'javascript' | 'yaml'
  onClose: () => void
}

const EditFileModal: React.FC<Props> = (props) => {
  const { id, language, onClose } = props
  const source = useMemo(() => ({ id, language }), [id, language])
  useAppConfig()
  const { overrideConfig } = useOverrideConfig()
  const { profileConfig } = useProfileConfig()
  const [currData, setCurrData] = useState('')
  const [originalData, setOriginalData] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadedSource, setLoadedSource] = useState<typeof source | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isDiff, setIsDiff] = useState(false)
  const [sideBySide, setSideBySide] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const isModified = currData !== originalData
  const canSave = !isLoading && loadedSource === source && !isSaving

  const handleClose = (): void => {
    if (isModified) {
      setIsConfirmOpen(true)
    } else {
      onClose()
    }
  }

  const save = async (): Promise<void> => {
    if (!canSave) return
    setIsSaving(true)
    try {
      await setOverride(id, language === 'javascript' ? 'js' : 'yaml', currData)
      const overrideItem = overrideConfig?.items?.find((i) => i.id === id)
      if (isOverrideUsedByCurrentProfile(profileConfig, id, overrideItem?.global)) {
        await restartCore()
      }
      onClose()
    } catch (error) {
      notify(error, { variant: 'danger' })
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    let canceled = false
    const { id, language } = source
    setIsLoading(true)
    setLoadedSource(null)
    setCurrData('')
    setOriginalData('')
    const getContent = async (): Promise<void> => {
      try {
        const data = await getOverride(id, language === 'javascript' ? 'js' : 'yaml')
        if (canceled) return
        setCurrData(data)
        setOriginalData(data)
        setLoadedSource(source)
      } catch (error) {
        if (!canceled) notify(error, { variant: 'danger' })
      } finally {
        if (!canceled) setIsLoading(false)
      }
    }
    void getContent()
    return () => {
      canceled = true
    }
  }, [source, loadAttempt])

  return (
    <Modal>
      {isConfirmOpen && (
        <ConfirmModal
          title={tr('Confirm cancellation')}
          description={tr('You have unsaved changes. Discard them?')}
          confirmText={tr('Discard changes')}
          cancelText={tr('Keep editing')}
          onChange={setIsConfirmOpen}
          onConfirm={onClose}
        />
      )}
      <Modal.Backdrop
        isOpen={true}
        onOpenChange={handleClose}
        variant="blur"
        className="top-12 h-[calc(100%-48px)]"
      >
        <Modal.Container scroll="inside">
          <Modal.Dialog className="mt-4 h-[calc(100%-32px)] max-w-none w-[calc(100%-100px)]">
            <Modal.Header className="app-drag pb-0">
              <Modal.Heading>
                {tr('Edit override')}
                {language === 'javascript' ? tr('Script') : tr('Configuration')}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="h-full">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner size="lg" />
                </div>
              ) : loadedSource !== source ? (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <p>{tr('Failed to read the file. Editing and saving are unavailable.')}</p>
                  <Button onPress={() => setLoadAttempt((attempt) => attempt + 1)}>
                    {tr('Retry')}
                  </Button>
                </div>
              ) : (
                <BaseEditor
                  language={language}
                  value={currData}
                  originalValue={isDiff ? originalData : undefined}
                  onChange={(value) => setCurrData(value)}
                  diffRenderSideBySide={sideBySide}
                />
              )}
            </Modal.Body>
            <Modal.Footer className="flex justify-between pt-0 pb-0">
              <div className="flex items-center space-x-2">
                <Switch size="sm" isSelected={isDiff} onChange={setIsDiff}>
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Label>{tr('Show changes')}</Label>
                  </Switch.Content>
                </Switch>
                <Switch size="sm" isSelected={sideBySide} onChange={setSideBySide}>
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Label>{tr('Side panel')}</Label>
                  </Switch.Content>
                </Switch>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onPress={handleClose}>
                  {tr('Cancel')}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={!canSave}
                  isPending={isSaving}
                  onPress={() => save()}
                >
                  {tr('Save')}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default EditFileModal
