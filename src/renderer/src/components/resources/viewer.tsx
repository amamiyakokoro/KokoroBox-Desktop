import { tr } from '../../../../shared/i18n'
import { Button, Modal, Spinner } from '@heroui/react'
import React, { useEffect, useMemo, useState } from 'react'
import { BaseEditor } from '../base/base-editor-lazy'
import { TextViewer } from '../base/text-viewer'
import {
  getFilePreviewStr,
  getFileStr,
  saveFileStrWithElevation,
  setFileStr
} from '@renderer/utils/ipc'
import { dump, load } from 'js-yaml'
import ConfirmModal from '../base/base-confirm'
import { notify } from '@renderer/utils/notification'
import { systemCoreOnlyBuild } from '../../../../shared/build-flags'
type Language = 'yaml' | 'javascript' | 'css' | 'json' | 'text'
const FILE_PERMISSION_ELEVATION_REQUIRED = 'FILE_PERMISSION_ELEVATION_REQUIRED'
const TEXT_VIEWER_LINE_LIMIT = 20000

interface Props {
  onClose: () => void
  path: string
  type: string
  title: string
  providerType: string
  format?: string
  ageSecretKey?: string
}

function getDefaultLanguage(format?: string): Language {
  return !format || format === 'YamlRule' ? 'yaml' : 'text'
}

function getViewerContent(fileContent: string, providerType: string, title: string): string {
  try {
    const parsedYaml = load(fileContent)
    if (!parsedYaml || typeof parsedYaml !== 'object') {
      return fileContent
    }

    const yamlObj = parsedYaml as Record<string, unknown>
    const payload = yamlObj[providerType]?.[title]?.payload
    if (payload) {
      return dump(providerType === 'proxy-providers' ? { proxies: payload } : { rules: payload })
    }

    const targetObj = yamlObj[providerType]?.[title]
    return targetObj ? dump(targetObj) : fileContent
  } catch {
    return fileContent
  }
}

function hasManyLines(value: string, limit: number): boolean {
  let lines = 1
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10) {
      lines++
      if (lines > limit) {
        return true
      }
    }
  }
  return false
}

const Viewer: React.FC<Props> = (props) => {
  const { type, path, title, format, providerType, onClose, ageSecretKey } = props
  const source = useMemo(
    () => ({ ageSecretKey, format, path, providerType, title, type }),
    [ageSecretKey, format, path, providerType, title, type]
  )
  const [currData, setCurrData] = useState('')
  const [showPermissionConfirm, setShowPermissionConfirm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadedSource, setLoadedSource] = useState<typeof source | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const language = type === 'Inline' ? 'yaml' : getDefaultLanguage(format)
  const editorLanguage = format === 'MrsRule' ? 'text' : language
  const useTextViewer = type !== 'File' && hasManyLines(currData, TEXT_VIEWER_LINE_LIMIT)
  const canSave = type === 'File' && !isLoading && loadedSource === source && !isSaving

  const save = async (elevated = false): Promise<void> => {
    if (!canSave) return
    setIsSaving(true)
    try {
      await (elevated ? saveFileStrWithElevation(path, currData) : setFileStr(path, currData))
      onClose()
    } catch (e) {
      if (!elevated && typeof e === 'string' && e.includes(FILE_PERMISSION_ELEVATION_REQUIRED)) {
        if (systemCoreOnlyBuild) {
          notify(
            tr('This file is not writable. System-core builds do not support elevated saving'),
            { variant: 'danger' }
          )
          return
        }
        setShowPermissionConfirm(true)
        return
      }
      notify(e, { variant: 'danger' })
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    let canceled = false
    const { ageSecretKey, format, path, providerType, title, type } = source
    setLoadedSource(null)
    setIsLoading(true)
    setCurrData('')
    setShowPermissionConfirm(false)

    if (type !== 'Inline' && !path) {
      return () => {
        canceled = true
      }
    }

    const loadContent = async (): Promise<void> => {
      setIsLoading(true)
      try {
        const fileContent = await (format === 'MrsRule'
          ? getFilePreviewStr(path, format)
          : getFileStr(type === 'Inline' ? 'config.yaml' : path, ageSecretKey))

        if (canceled) return
        setCurrData(
          format === 'MrsRule' ? fileContent : getViewerContent(fileContent, providerType, title)
        )
        setLoadedSource(source)
      } catch (e) {
        if (!canceled) {
          notify(e, { variant: 'danger' })
        }
      } finally {
        if (!canceled) {
          setIsLoading(false)
        }
      }
    }

    void loadContent()
    return () => {
      canceled = true
    }
  }, [source, loadAttempt])

  return (
    <Modal>
      {!systemCoreOnlyBuild && showPermissionConfirm && (
        <ConfirmModal
          onChange={setShowPermissionConfirm}
          title={tr('Saving requires elevated permissions')}
          description={tr(
            'You do not have write permission for this file or directory. Cancel saving, or elevate privileges to change permissions and save.'
          )}
          buttons={[
            {
              key: 'cancel',
              text: tr('Cancel'),
              variant: 'light',
              onPress: () => {}
            },
            {
              key: 'elevate',
              text: tr('Elevate and save'),
              color: 'primary',
              onPress: () => save(true)
            }
          ]}
          className="w-120"
        />
      )}
      <Modal.Backdrop
        isOpen={true}
        onOpenChange={onClose}
        variant="blur"
        className="top-12 h-[calc(100%-48px)]"
      >
        <Modal.Container scroll="inside">
          <Modal.Dialog className="mt-4 h-[calc(100%-32px)] max-w-none w-[calc(100%-100px)]">
            <Modal.Header className="app-drag pb-0">
              <Modal.Heading>{title}</Modal.Heading>
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
              ) : useTextViewer ? (
                <TextViewer value={currData} />
              ) : (
                <BaseEditor
                  language={editorLanguage}
                  value={currData}
                  readOnly={type !== 'File'}
                  onChange={(value) => setCurrData(value)}
                />
              )}
            </Modal.Body>
            {type === 'File' && !isLoading && (
              <Modal.Footer className="pt-0 pb-0">
                <Button size="sm" variant="secondary" isDisabled={isSaving} onPress={onClose}>
                  {tr('Cancel')}
                </Button>
                <Button size="sm" isDisabled={!canSave} isPending={isSaving} onPress={() => save()}>
                  {tr('Save')}
                </Button>
              </Modal.Footer>
            )}
            {type !== 'File' && <Modal.CloseTrigger className="app-nodrag" />}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default Viewer
