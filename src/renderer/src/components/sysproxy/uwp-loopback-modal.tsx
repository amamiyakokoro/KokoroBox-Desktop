import { tr } from '../../../../shared/i18n'
import { Button, Modal, Switch } from '@heroui/react'
import {
  checkElevateTask,
  listUwpLoopbackApps,
  relaunchWindowsElevated,
  setUwpLoopbackExemption
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import type { UwpLoopbackApp } from 'kokorobox-native'
import React, { useEffect, useState } from 'react'

interface Props {
  onClose: () => void
}

const UwpLoopbackModal: React.FC<Props> = ({ onClose }) => {
  const [apps, setApps] = useState<UwpLoopbackApp[]>([])
  const [loading, setLoading] = useState(true)
  const [busySid, setBusySid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(true)

  useEffect(() => {
    let active = true
    listUwpLoopbackApps()
      .then((result) => {
        if (active) setApps(result)
      })
      .catch((cause) => {
        if (active) setError(String(cause))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    checkElevateTask()
      .then((value) => {
        if (active) setIsAdmin(value)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const setExemption = async (app: UwpLoopbackApp, enabled: boolean): Promise<void> => {
    setBusySid(app.sid)
    try {
      await setUwpLoopbackExemption(app.sid, enabled)
      setApps((current) =>
        current.map((item) => (item.sid === app.sid ? { ...item, enabled } : item))
      )
    } catch (cause) {
      notify(cause, { variant: 'danger' })
    } finally {
      setBusySid(null)
    }
  }

  return (
    <Modal>
      <Modal.Backdrop
        isOpen
        onOpenChange={onClose}
        variant="blur"
        className="top-12 h-[calc(100%-48px)]"
      >
        <Modal.Container scroll="inside">
          <Modal.Dialog className="mt-4 max-h-[calc(100%-32px)] w-[min(620px,calc(100%-32px))]">
            <Modal.Header className="app-drag">
              <Modal.Heading>{tr('UWP loopback')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-muted">
                {tr('Allow selected Windows apps to connect to the local proxy.')}
              </p>
              {!isAdmin && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary p-3 text-sm">
                  <span>
                    {tr('Administrator access is required to change loopback exemptions.')}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      void relaunchWindowsElevated().catch((cause) =>
                        notify(cause, { variant: 'danger' })
                      )
                    }
                  >
                    {tr('Restart as administrator')}
                  </Button>
                </div>
              )}
              {loading && <p className="py-4 text-sm text-muted">{tr('Loading...')}</p>}
              {error && <p className="py-4 text-sm text-danger">{error}</p>}
              {!loading && !error && apps.length === 0 && (
                <p className="py-4 text-sm text-muted">{tr('No UWP apps found')}</p>
              )}
              {!loading &&
                !error &&
                apps.map((app) => (
                  <div
                    key={app.sid}
                    className="flex items-center justify-between gap-3 border-b border-separator/60 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium" title={app.displayName}>
                        {app.displayName}
                      </div>
                      <div className="truncate text-xs text-muted" title={app.packageName}>
                        {app.packageName}
                      </div>
                    </div>
                    <Switch
                      size="sm"
                      isSelected={app.enabled}
                      isDisabled={!isAdmin || busySid !== null}
                      onChange={(value) => void setExemption(app, value)}
                      aria-label={app.displayName}
                    >
                      <Switch.Content>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                  </div>
                ))}
            </Modal.Body>
            <Modal.Footer>
              <Button size="sm" variant="secondary" onPress={onClose}>
                {tr('Close')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export default UwpLoopbackModal
