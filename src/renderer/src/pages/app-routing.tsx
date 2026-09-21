import { tr } from '../../../shared/i18n'
import BasePage from '@renderer/components/base/base-page'
import { AppRoutingRuleRow } from '@renderer/components/app-routing/rule-row'
import { AppRoutingGroupNameModal } from '@renderer/components/app-routing/group-name-modal'
import AppRoutingSettingDrawer from '@renderer/components/app-routing/app-routing-setting-drawer'
import ConfirmModal from '@renderer/components/base/base-confirm'
import { useAppRouting } from '@renderer/hooks/use-app-routing'
import {
  initService,
  installService,
  openAppRoutingSystemSettings,
  repairAppRoutingFirewall,
  serviceStatus,
  startService
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import {
  getAppRoutingStatusLabel,
  getAppRoutingStatusMessage
} from '@renderer/utils/app-routing-status'
import { Button, Card, Chip, Separator, Switch } from '@heroui/react'
import { KokoActionMenu } from '@renderer/components/base/koko-collections'
import { KokoSelect, KokoTextField } from '@renderer/components/base/koko-form'
import {
  MdAdd,
  MdCreateNewFolder,
  MdDeleteOutline,
  MdDriveFileRenameOutline,
  MdFolderOpen,
  MdInfoOutline,
  MdKeyboardArrowDown,
  MdMoreHoriz,
  MdOpenInNew,
  MdRefresh,
  MdTune
} from 'react-icons/md'
import { useEffect, useRef, useState } from 'react'

function statusTone(status?: AppRoutingStatus): { dot: string; label: string } {
  if (status?.state === 'running') return { dot: 'bg-success', label: 'text-success' }
  if (status?.state === 'starting') return { dot: 'bg-accent', label: 'text-accent' }
  if (status?.state === 'degraded') return { dot: 'bg-warning', label: 'text-warning' }
  if (status?.state === 'error') return { dot: 'bg-danger', label: 'text-danger' }
  return { dot: 'bg-muted', label: 'text-muted' }
}

const AppRouting: React.FC = () => {
  const isMac = window.api.platform === 'darwin'
  const isLinux = window.api.platform === 'linux'
  const isWindows = window.api.platform === 'win32'
  const {
    config,
    status,
    saving,
    supported,
    icons,
    save,
    refresh,
    addApplications,
    scanDirectory,
    createGroup,
    addPattern,
    updateRule,
    updateGroup,
    renameGroup,
    deleteGroup,
    moveRule,
    deleteRule
  } = useAppRouting()
  const [processPattern, setProcessPattern] = useState('')
  const [macIdentifierKind, setMacIdentifierKind] =
    useState<AppRoutingIdentifierKind>('macos-process-name')
  const [linuxIdentifierKind, setLinuxIdentifierKind] =
    useState<AppRoutingIdentifierKind>('linux-executable')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const knownGroupIds = useRef(new Set<string>())
  const [groupEditor, setGroupEditor] = useState<{ id?: string; name: string }>()
  const [deletingGroupId, setDeletingGroupId] = useState<string>()
  const [openingSettings, setOpeningSettings] = useState(false)
  const [preparingService, setPreparingService] = useState(false)
  const [repairingFirewall, setRepairingFirewall] = useState(false)
  useEffect(() => {
    const currentIds = new Set(config?.groups?.map((group) => group.id) ?? [])
    const previousIds = knownGroupIds.current
    setCollapsedGroups((current) => {
      const next = new Set([...current].filter((id) => currentIds.has(id)))
      for (const id of currentIds) {
        if (!previousIds.has(id)) next.add(id)
      }
      return next
    })
    knownGroupIds.current = currentIds
  }, [config?.groups])
  const openApprovalSettings = async (): Promise<void> => {
    if (openingSettings) return
    setOpeningSettings(true)
    try {
      await openAppRoutingSystemSettings()
      await refresh()
    } catch (error) {
      notify(error, { variant: 'danger' })
    } finally {
      setOpeningSettings(false)
    }
  }
  const [isSettingDrawerOpen, setIsSettingDrawerOpen] = useState(false)
  const [settingDrawerReopenSignal, setSettingDrawerReopenSignal] = useState(0)
  const currentStatusMessage = getAppRoutingStatusMessage(
    status?.message,
    status?.protectedApplicationCount
  )
  const currentStatusTone = statusTone(status)
  const needsMacApproval = isMac && config?.enabled && status?.needsUserApproval === true
  const needsWindowsServiceRepair =
    isWindows &&
    status?.state === 'error' &&
    (status.message === 'KokoroBox Service 认证已失效，请在内核设置中重置认证' ||
      status.message === 'KokoroBox Service 尚未初始化，请初始化服务后重试' ||
      status.message === 'Windows 应用分流需要已安装、初始化并运行 KokoroBox Service' ||
      status.message?.toLowerCase().includes('service is not initialized'))
  const displayedProxyPort = status?.proxyPort ?? (isLinux ? 7894 : 7891)
  const displayedProxyProtocol = isLinux ? 'TPROXY' : 'SOCKS5'
  const backendLabel =
    status?.backend === 'linux-cgroup-v2'
      ? 'cgroup v2'
      : status?.backend === 'linux-cgroup-v1-net-cls'
        ? 'cgroup v1 net_cls'
        : undefined
  const isProxyTrafficBlocked =
    config?.enabled === true &&
    (status?.state === 'degraded' || status?.state === 'error') &&
    status.mihomoAvailable === false &&
    (status.state === 'degraded' || status.firewallReady === true) &&
    (status.protectedApplicationCount ?? 0) > 0
  const failureProtectionTone =
    status?.state === 'error'
      ? 'border-danger/30 bg-danger-soft/60 text-danger-soft-foreground'
      : 'border-warning/30 bg-warning-soft/60 text-warning-soft-foreground'
  const patternLabel = isMac
    ? macIdentifierKind === 'macos-process-name'
      ? tr('Process name')
      : tr('Signing identifier')
    : isLinux
      ? linuxIdentifierKind === 'linux-process-name'
        ? tr('Process name')
        : tr('Executable path')
      : tr('Process pattern')
  const patternPlaceholder = isMac
    ? macIdentifierKind === 'macos-process-name'
      ? 'codex'
      : 'com.example.app'
    : isLinux
      ? linuxIdentifierKind === 'linux-process-name'
        ? 'codex'
        : '/usr/bin/example'
      : 'example.exe'
  const patternExample = isMac
    ? macIdentifierKind === 'macos-process-name'
      ? tr('For example: codex or Codex Helper*')
      : tr('For example: com.openai.chat or com.openai.chat*')
    : isLinux
      ? linuxIdentifierKind === 'linux-process-name'
        ? tr('For example: codex. Every executable with that name will match.')
        : tr('For example: /usr/bin/firefox or /opt/example/example')
      : tr('For example: ChatGPT.exe, ChatGPT*.exe, or C:\\Program Files\\*\\ChatGPT.exe')
  const submitPattern = async (): Promise<void> => {
    const identifierKind = isMac ? macIdentifierKind : isLinux ? linuxIdentifierKind : undefined
    if (await addPattern(processPattern, identifierKind)) {
      setProcessPattern('')
    }
  }
  const prepareWindowsService = async (): Promise<boolean> => {
    if (!isWindows || preparingService) return false
    setPreparingService(true)
    try {
      let nextStatus = await serviceStatus()
      if (nextStatus === 'not-installed') {
        await installService()
        nextStatus = await serviceStatus()
      }
      if (nextStatus === 'stopped' || nextStatus === 'paused') {
        await startService()
        nextStatus = await serviceStatus()
      }
      if (nextStatus !== 'running') await initService()
      await refresh()
      return true
    } catch (error) {
      notify(error, { variant: 'danger' })
      return false
    } finally {
      setPreparingService(false)
    }
  }
  const setRoutingEnabled = async (enabled: boolean): Promise<void> => {
    if (!config) return
    if (enabled && isWindows && !(await prepareWindowsService())) return
    await save({ ...config, enabled })
  }
  const repairWindowsFirewall = async (): Promise<void> => {
    if (!isWindows || repairingFirewall) return
    setRepairingFirewall(true)
    try {
      await repairAppRoutingFirewall()
      await refresh()
      notify(tr('Application routing firewall repaired'))
    } catch (error) {
      notify(error, { variant: 'danger' })
    } finally {
      setRepairingFirewall(false)
    }
  }
  const toggleGroup = (groupId: string): void => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }
  const ungroupedRules = config?.rules.filter((rule) => !rule.groupId) ?? []

  return (
    <BasePage
      title={tr('Application routing')}
      contentClassName="no-scrollbar"
      header={
        <Button
          size="sm"
          isIconOnly
          className="app-nodrag"
          variant="ghost"
          aria-label={tr('Application routing settings')}
          onPress={() => {
            setIsSettingDrawerOpen(true)
            setSettingDrawerReopenSignal((signal) => signal + 1)
          }}
        >
          <MdTune className="text-lg" />
        </Button>
      }
    >
      {isSettingDrawerOpen && config && (
        <AppRoutingSettingDrawer
          reopenSignal={settingDrawerReopenSignal}
          isDisabled={!supported || saving}
          isMac={isMac}
          isWindows={isWindows}
          isOpeningSystemSettings={openingSettings}
          isRepairingFirewall={repairingFirewall}
          isProxyUdpDnsEnabled={config.proxyUdpDns}
          defaultAction={config.defaultAction}
          defaultProtocol={config.defaultProtocol}
          diagnosticLogging={config.diagnosticLogging}
          onProxyUdpDnsChange={(proxyUdpDns) => void save({ ...config, proxyUdpDns })}
          onDefaultActionChange={(defaultAction) => void save({ ...config, defaultAction })}
          onDefaultProtocolChange={(defaultProtocol) => void save({ ...config, defaultProtocol })}
          onDiagnosticLoggingChange={(diagnosticLogging) =>
            void save({ ...config, diagnosticLogging })
          }
          onOpenSystemSettings={() => void openApprovalSettings()}
          onRepairFirewall={() => void repairWindowsFirewall()}
          onClose={() => setIsSettingDrawerOpen(false)}
        />
      )}
      {groupEditor && (
        <AppRoutingGroupNameModal
          initialName={groupEditor.name}
          onSave={(name) =>
            groupEditor.id ? renameGroup(groupEditor.id, name) : createGroup(name)
          }
          onClose={() => setGroupEditor(undefined)}
        />
      )}
      {deletingGroupId && (
        <ConfirmModal
          title={tr('Delete rule group')}
          description={tr('Deleting a rule group also deletes every application rule inside it.')}
          confirmText={tr('Delete')}
          onConfirm={() => deleteGroup(deletingGroupId)}
          onChange={(open) => !open && setDeletingGroupId(undefined)}
        />
      )}
      <div className="flex w-full max-w-6xl flex-col gap-4 p-4">
        <section className="app-routing-status-strip" aria-live="polite">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${currentStatusTone.dot}`}
              />
              <span className={`text-sm font-semibold ${currentStatusTone.label}`}>
                {getAppRoutingStatusLabel(status)}
              </span>
              {config?.enabled && (
                <span className="font-mono text-xs text-muted">
                  {displayedProxyProtocol} · 127.0.0.1:{displayedProxyPort}
                  {backendLabel ? ` · ${backendLabel}` : ''}
                </span>
              )}
            </div>
            <p className="mt-1 pl-4 text-xs text-muted">
              {tr('Route selected applications through local Mihomo without system proxy or TUN.')}
            </p>
            {currentStatusMessage && !needsMacApproval && (
              <p
                className={`mt-1 pl-4 text-xs ${status?.state === 'error' ? 'text-danger' : 'text-warning'}`}
              >
                {currentStatusMessage}
              </p>
            )}
            {isMac &&
              !needsMacApproval &&
              config?.enabled &&
              ['starting', 'error'].includes(status?.state ?? '') && (
                <Button
                  className="mt-2 ms-4"
                  size="sm"
                  variant="secondary"
                  onPress={() => void refresh()}
                >
                  {tr('Retry')}
                </Button>
              )}
            {needsWindowsServiceRepair && (
              <Button
                className="mt-2 ms-4"
                size="sm"
                variant="secondary"
                isPending={preparingService}
                isDisabled={saving}
                onPress={() => void prepareWindowsService()}
              >
                <MdRefresh className="text-base" />
                {tr('Repair service')}
              </Button>
            )}
          </div>
          <Switch
            aria-label={tr('Application routing')}
            isSelected={config?.enabled ?? false}
            isDisabled={!supported || !config || saving || preparingService}
            onChange={(enabled) => void setRoutingEnabled(enabled)}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </section>

        {needsMacApproval && (
          <Card className="border border-warning/40 bg-warning-soft/40">
            <Card.Content className="gap-3">
              <div>
                <h3 className="font-semibold text-warning-soft-foreground">
                  {tr('Network Extension approval required')}
                </h3>
                <p className="mt-1 text-sm text-warning-soft-foreground">
                  {tr('macOS needs your approval before application routing can start.')}
                </p>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-warning-soft-foreground">
                <li>
                  {tr(
                    'In System Settings, go to General → Login Items & Extensions → Network Extensions.'
                  )}
                </li>
                <li>{tr('Enable KokoroBox, then complete the macOS confirmation prompt.')}</li>
                <li>
                  {tr(
                    'Return to KokoroBox; application routing will continue starting automatically.'
                  )}
                </li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  isDisabled={saving}
                  isPending={openingSettings}
                  onPress={() => void openApprovalSettings()}
                >
                  <MdOpenInNew className="text-base" />
                  {tr('Open System Settings and Request Approval')}
                </Button>
                <Button variant="secondary" isDisabled={saving} onPress={() => void refresh()}>
                  <MdRefresh className="text-base" />
                  {tr('I enabled it — check now')}
                </Button>
              </div>
            </Card.Content>
          </Card>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold">{tr('Application rules')}</h3>
            <p className="text-sm text-muted">
              {isMac
                ? tr(
                    'Rules match from top to bottom by process name or application signing identifier.'
                  )
                : isLinux
                  ? tr('Rules match from top to bottom by executable path or process name.')
                  : tr(
                      'Rules match from top to bottom. Use a filename or a full path containing *.'
                    )}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={!supported || !config || saving}
            onPress={() =>
              void addApplications(undefined, isLinux ? linuxIdentifierKind : undefined)
            }
          >
            <MdAdd className="text-base" />
            {tr('Select applications')}
          </Button>
        </div>

        <section className="app-routing-rule-entry app-routing-rule-composer">
          <div
            className={`app-routing-rule-entry-grid ${
              isMac || isLinux
                ? 'app-routing-rule-entry-grid-with-kind'
                : 'app-routing-rule-entry-grid-without-kind'
            }`}
          >
            {(isMac || isLinux) && (
              <KokoSelect
                aria-label={tr('Match by')}
                density="toolbar"
                variant="secondary"
                className="min-w-0"
                disallowEmptySelection
                isDisabled={!supported || !config || saving}
                options={
                  isMac
                    ? [
                        { id: 'macos-process-name', label: tr('Process name') },
                        { id: 'macos-signing-identifier', label: tr('Signing identifier') }
                      ]
                    : [
                        { id: 'linux-executable', label: tr('Executable path') },
                        { id: 'linux-process-name', label: tr('Process name') }
                      ]
                }
                value={isMac ? macIdentifierKind : linuxIdentifierKind}
                onChange={(value) => {
                  if (isMac) setMacIdentifierKind(value as AppRoutingIdentifierKind)
                  else setLinuxIdentifierKind(value as AppRoutingIdentifierKind)
                }}
              />
            )}
            <KokoTextField
              aria-label={patternLabel}
              className="min-w-0"
              controlWidth="full"
              placeholder={patternPlaceholder}
              value={processPattern}
              isDisabled={!supported || !config || saving}
              onChangeValue={setProcessPattern}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && processPattern.trim()) void submitPattern()
              }}
            />
            <div className="app-routing-rule-actions">
              <Button
                size="sm"
                className="app-routing-rule-action"
                variant="primary"
                isDisabled={!supported || !config || saving || !processPattern.trim()}
                onPress={() => void submitPattern()}
              >
                <MdAdd className="text-base" />
                {tr('Add pattern rule')}
              </Button>
            </div>
          </div>
          <p className="app-routing-rule-example">{patternExample}</p>
        </section>

        {!supported ? (
          <Card variant="secondary">
            <Card.Content className="text-sm text-muted">
              {tr(
                'Application routing supports Windows 10/11 x64, macOS 13 or later, and Linux x64/arm64.'
              )}
            </Card.Content>
          </Card>
        ) : !isWindows && config?.rules.length === 0 ? (
          <Card variant="secondary">
            <Card.Content className="items-center gap-2 py-4 text-center">
              <p className="font-medium">{tr('No applications added')}</p>
              <p className="text-sm text-muted">
                {isMac
                  ? tr(
                      'Enter a process name or signing identifier, or select one or more .app bundles, then choose Proxy, Direct, or Block.'
                    )
                  : isLinux
                    ? tr(
                        'Enter an executable path or process name, or select one or more applications, then choose Proxy, Direct, or Block.'
                      )
                    : tr(
                        'Enter an absolute executable path or select one or more applications, then choose Proxy, Direct, or Block.'
                      )}
              </p>
            </Card.Content>
          </Card>
        ) : (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-3">
              {isWindows && (
                <div className="flex items-end justify-between gap-3 px-1">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{tr('Individual rules')}</h4>
                      <Chip size="sm" variant="soft">
                        {ungroupedRules.length}
                      </Chip>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {tr('Applications that do not belong to a rule group.')}
                    </p>
                  </div>
                </div>
              )}
              {ungroupedRules.length === 0 && isWindows ? (
                <div className="rounded-xl border border-dashed border-separator px-4 py-5 text-center text-sm text-muted">
                  {tr('No individual rules')}
                </div>
              ) : (
                <div className="app-routing-rule-list" role="list">
                  {ungroupedRules.map((rule, index) => (
                    <AppRoutingRuleRow
                      key={rule.id}
                      rule={rule}
                      index={index}
                      count={ungroupedRules.length}
                      icon={icons[rule.id]}
                      disabled={saving}
                      onChange={(patch) => updateRule(rule.id, patch)}
                      onMove={(offset) => moveRule(rule.id, offset)}
                      onDelete={() => deleteRule(rule.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {isWindows && (
              <>
                <Separator />
                <section className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end justify-between gap-3 px-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold">{tr('Rule groups')}</h4>
                        <Chip size="sm" variant="soft">
                          {config?.groups?.length ?? 0}
                        </Chip>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {tr('Manage applications together. Rule groups are collapsed by default.')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={!config || saving}
                        onPress={() => setGroupEditor({ name: '' })}
                      >
                        <MdCreateNewFolder className="text-lg" />
                        {tr('New rule group')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={!config || saving}
                        onPress={() => void scanDirectory()}
                      >
                        <MdFolderOpen className="text-lg" />
                        {tr('Scan folder')}
                      </Button>
                    </div>
                  </div>

                  {(config?.groups?.length ?? 0) === 0 ? (
                    <div className="rounded-xl border border-dashed border-separator px-4 py-6 text-center">
                      <p className="text-sm font-medium">{tr('No rule groups')}</p>
                      <p className="mt-1 text-xs text-muted">
                        {tr(
                          'Create an empty rule group or scan a folder to add its applications automatically.'
                        )}
                      </p>
                    </div>
                  ) : (
                    config?.groups?.map((group) => {
                      const rules = config.rules.filter((rule) => rule.groupId === group.id)
                      const isCollapsed = collapsedGroups.has(group.id)
                      return (
                        <section
                          key={group.id}
                          className="app-routing-group"
                          data-enabled={group.enabled}
                        >
                          <div className="app-routing-group-header" data-enabled={group.enabled}>
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
                              aria-expanded={!isCollapsed}
                              onClick={() => toggleGroup(group.id)}
                            >
                              <MdKeyboardArrowDown
                                className={`shrink-0 text-xl text-muted transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`}
                              />
                              <MdFolderOpen className="shrink-0 text-xl text-accent-soft-foreground" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">
                                  {group.name}
                                </span>
                                <span
                                  className="block truncate text-xs text-muted"
                                  title={group.sourceDirectory}
                                >
                                  {group.sourceDirectory ?? tr('Manual rule group')}
                                </span>
                              </span>
                              <Chip size="sm" variant="soft" className="shrink-0">
                                {tr('{0} applications', [rules.length])}
                              </Chip>
                            </button>
                            <KokoActionMenu
                              ariaLabel={tr('Rule group actions')}
                              isDisabled={saving}
                              items={[
                                {
                                  id: 'add',
                                  label: tr('Add applications'),
                                  textValue: tr('Add applications'),
                                  startContent: <MdAdd />
                                },
                                {
                                  id: 'scan',
                                  label: group.sourceDirectory
                                    ? tr('Rescan folder')
                                    : tr('Scan folder'),
                                  textValue: group.sourceDirectory
                                    ? tr('Rescan folder')
                                    : tr('Scan folder'),
                                  startContent: <MdRefresh />
                                },
                                {
                                  id: 'rename',
                                  label: tr('Rename rule group'),
                                  textValue: tr('Rename rule group'),
                                  startContent: <MdDriveFileRenameOutline />
                                },
                                {
                                  id: 'delete',
                                  label: tr('Delete rule group'),
                                  textValue: tr('Delete rule group'),
                                  startContent: <MdDeleteOutline />,
                                  tone: 'danger'
                                }
                              ]}
                              onAction={(id) => {
                                if (id === 'add') void addApplications(group.id)
                                if (id === 'scan') void scanDirectory(group.id)
                                if (id === 'rename')
                                  setGroupEditor({ id: group.id, name: group.name })
                                if (id === 'delete') setDeletingGroupId(group.id)
                              }}
                            >
                              <MdMoreHoriz className="text-lg" />
                            </KokoActionMenu>
                            <Switch
                              size="sm"
                              aria-label={tr('Enable rule group')}
                              isSelected={group.enabled}
                              isDisabled={saving}
                              onChange={(enabled) => updateGroup(group.id, { enabled })}
                            >
                              <Switch.Content>
                                <Switch.Control>
                                  <Switch.Thumb />
                                </Switch.Control>
                              </Switch.Content>
                            </Switch>
                          </div>
                          {!isCollapsed && (
                            <div className="app-routing-group-rules" role="list">
                              {rules.length === 0 ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-muted">
                                  <span>{tr('No applications in this rule group')}</span>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    isDisabled={saving}
                                    onPress={() => void addApplications(group.id)}
                                  >
                                    <MdAdd />
                                    {tr('Add applications')}
                                  </Button>
                                </div>
                              ) : (
                                rules.map((rule, index) => (
                                  <AppRoutingRuleRow
                                    key={rule.id}
                                    rule={rule}
                                    index={index}
                                    count={rules.length}
                                    icon={icons[rule.id]}
                                    disabled={saving}
                                    onChange={(patch) => updateRule(rule.id, patch)}
                                    onMove={(offset) => moveRule(rule.id, offset)}
                                    onDelete={() => deleteRule(rule.id)}
                                  />
                                ))
                              )}
                            </div>
                          )}
                        </section>
                      )
                    })
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {isProxyTrafficBlocked ? (
          <div className={`rounded-xl border p-4 text-sm ${failureProtectionTone}`}>
            <div className="font-semibold">{tr('Proxy failure protection')}</div>
            <p className="mt-1">
              {tr(
                'If the application-routing proxy endpoint is unavailable, Proxy connections are blocked to prevent accidental direct fallback. Direct rules remain direct.'
              )}
            </p>
            <p className="mt-1 font-mono text-xs">
              127.0.0.1:{displayedProxyPort} ({displayedProxyProtocol})
              {backendLabel ? ` · ${backendLabel}` : ''}
            </p>
          </div>
        ) : config?.enabled ? (
          <div className="app-routing-protection-summary">
            <MdInfoOutline aria-hidden="true" className="shrink-0 text-base" />
            <span className="font-medium text-foreground">{tr('Proxy failure protection')}</span>
            <span aria-hidden="true">·</span>
            <span>{tr('Enabled')}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              {displayedProxyProtocol} 127.0.0.1:{displayedProxyPort}
              {backendLabel ? ` · ${backendLabel}` : ''}
            </span>
          </div>
        ) : null}
      </div>
    </BasePage>
  )
}

export default AppRouting
