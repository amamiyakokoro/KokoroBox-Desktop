import { tr } from '../../../../shared/i18n'
import type { UwpLoopbackApp, UwpLoopbackAppCategory } from '../../../../shared/types/uwp-loopback'
import { Button, Modal, Switch } from '@heroui/react'
import { KokoSearchField } from '@renderer/components/base/koko-search-field'
import {
  canManageUwpLoopback,
  listUwpLoopbackApps,
  relaunchWindowsElevated,
  setUwpLoopbackExemption
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import React, { useEffect, useMemo, useState } from 'react'
import { LuChevronDown, LuChevronRight } from 'react-icons/lu'

interface Props {
  onClose: () => void
}

interface AppRowProps {
  app: UwpLoopbackApp
  busyId: string | null
  canManage: boolean
  onChange: (app: UwpLoopbackApp, enabled: boolean) => void
}

const AppRow: React.FC<AppRowProps> = ({ app, busyId, canManage, onChange }) => (
  <div className="flex items-center justify-between gap-3 border-b border-separator/60 py-2 last:border-b-0">
    <div className="min-w-0">
      <div className="truncate text-sm font-medium" title={app.description || app.displayName}>
        {app.displayName}
      </div>
      <div className="truncate text-xs text-muted" title={app.packageFullName}>
        {app.packageFamilyName}
      </div>
    </div>
    <Switch
      size="sm"
      isSelected={app.enabled}
      isDisabled={!canManage || busyId !== null}
      onChange={(value) => onChange(app, value)}
      aria-label={app.displayName}
    >
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  </div>
)

interface AppSectionProps {
  apps: UwpLoopbackApp[]
  busyId: string | null
  canManage: boolean
  title: string
  onChange: (app: UwpLoopbackApp, enabled: boolean) => void
}

const AppSection: React.FC<AppSectionProps> = ({ apps, busyId, canManage, title, onChange }) => {
  if (!apps.length) return null
  return (
    <section aria-label={title}>
      <h3 className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      {apps.map((app) => (
        <AppRow key={app.id} app={app} busyId={busyId} canManage={canManage} onChange={onChange} />
      ))}
    </section>
  )
}

const UwpLoopbackModal: React.FC<Props> = ({ onClose }) => {
  const [apps, setApps] = useState<UwpLoopbackApp[]>([])
  const [query, setQuery] = useState('')
  const [systemExpanded, setSystemExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)

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
    canManageUwpLoopback()
      .then((value) => {
        if (active) setCanManage(value)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const filteredApps = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return apps
    return apps.filter((app) =>
      [app.displayName, app.packageFamilyName, app.packageFullName, app.description]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
    )
  }, [apps, query])

  const groupedApps = useMemo(() => {
    const groups: Record<UwpLoopbackAppCategory, UwpLoopbackApp[]> = {
      user: [],
      microsoft: [],
      system: []
    }
    for (const app of filteredApps) groups[app.category].push(app)
    return groups
  }, [filteredApps])

  const setExemption = async (app: UwpLoopbackApp, enabled: boolean): Promise<void> => {
    setBusyId(app.id)
    try {
      await setUwpLoopbackExemption(app.id, enabled)
      setApps((current) =>
        current.map((item) => (item.id === app.id ? { ...item, enabled } : item))
      )
    } catch (cause) {
      notify(cause, { variant: 'danger' })
    } finally {
      setBusyId(null)
    }
  }

  const searching = query.trim().length > 0
  const showSystemApps = systemExpanded || searching

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
            <Modal.Body className="gap-3">
              <p className="text-sm text-muted">
                {tr('Allow selected Windows apps to connect to the local proxy.')}
              </p>
              {!canManage && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
                  <span className="min-w-0 flex-1 basis-56 text-muted">
                    {tr('Administrator access is required to change loopback exemptions.')}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
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
              {!loading && !error && apps.length > 0 && (
                <KokoSearchField
                  aria-label={tr('Search apps')}
                  className="w-full"
                  placeholder={tr('Search apps')}
                  value={query}
                  onChangeValue={setQuery}
                />
              )}
              {loading && <p className="py-4 text-sm text-muted">{tr('Loading...')}</p>}
              {error && <p className="py-4 text-sm text-danger">{error}</p>}
              {!loading && !error && apps.length === 0 && (
                <p className="py-4 text-sm text-muted">{tr('No UWP apps found')}</p>
              )}
              {!loading && !error && apps.length > 0 && filteredApps.length === 0 && (
                <p className="py-4 text-sm text-muted">{tr('No apps match this search.')}</p>
              )}
              {!loading && !error && filteredApps.length > 0 && (
                <div>
                  <AppSection
                    apps={groupedApps.user}
                    busyId={busyId}
                    canManage={canManage}
                    title={tr('Apps')}
                    onChange={(app, enabled) => void setExemption(app, enabled)}
                  />
                  <AppSection
                    apps={groupedApps.microsoft}
                    busyId={busyId}
                    canManage={canManage}
                    title={tr('Microsoft apps')}
                    onChange={(app, enabled) => void setExemption(app, enabled)}
                  />
                  {groupedApps.system.length > 0 && (
                    <section aria-label={tr('System components and runtimes')}>
                      <Button
                        aria-expanded={showSystemApps}
                        className="mt-3 w-full justify-between px-1"
                        isDisabled={searching}
                        size="sm"
                        variant="ghost"
                        onPress={() => setSystemExpanded((value) => !value)}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {showSystemApps ? (
                            <LuChevronDown aria-hidden="true" className="shrink-0" />
                          ) : (
                            <LuChevronRight aria-hidden="true" className="shrink-0" />
                          )}
                          <span className="truncate">{tr('System components and runtimes')}</span>
                        </span>
                        <span className="text-xs text-muted">{groupedApps.system.length}</span>
                      </Button>
                      {showSystemApps &&
                        groupedApps.system.map((app) => (
                          <AppRow
                            key={app.id}
                            app={app}
                            busyId={busyId}
                            canManage={canManage}
                            onChange={(item, enabled) => void setExemption(item, enabled)}
                          />
                        ))}
                    </section>
                  )}
                </div>
              )}
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
