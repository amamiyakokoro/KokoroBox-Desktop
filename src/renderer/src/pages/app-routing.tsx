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
  Button,
  Card,
  CardBody,
  Chip,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Select,
  SelectItem,
  Switch
} from '@heroui/react'
import {
  MdAdd,
  MdCreateNewFolder,
  MdDeleteOutline,
  MdDriveFileRenameOutline,
  MdFolderOpen,
  MdKeyboardArrowDown,
  MdMoreHoriz,
  MdOpenInNew,
  MdRefresh,
  MdTune
} from 'react-icons/md'
import { useEffect, useRef, useState } from 'react'

function statusColor(
  status?: AppRoutingStatus
): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  if (status?.state === 'running') return 'success'
  if (status?.state === 'starting') return 'primary'
  if (status?.state === 'degraded') return 'warning'
  if (status?.state === 'error') return 'danger'
  return 'default'
}

function statusLabel(status?: AppRoutingStatus): string {
  if (!status) return tr('Loading')
  const labels: Record<AppRoutingRuntimeState, string> = {
    unsupported: tr('Unsupported'),
    disabled: tr('Disabled'),
    starting: tr('Starting'),
    running: tr('Running'),
    degraded: tr('Safely blocked'),
    error: tr('Error')
  }
  return labels[status.state]
}

function statusMessage(message?: string, protectedApplicationCount = 0): string | undefined {
  if (message === '添加或启用规则以启动应用分流') {
    return tr('Add or enable a rule to start application routing')
  }
  if (message === 'Windows 封包拦截组件未安装') {
    return tr('The Windows packet interception sidecar is not installed')
  }
  if (message === 'Windows 封包拦截组件缺失或已损坏') {
    return tr('The Windows packet interception component is missing or corrupted')
  }
  if (
    message?.includes('application-routing firewall') ||
    message?.includes('Windows 应用分流防火墙')
  ) {
    return tr(
      'The Windows application-routing firewall rules are missing or ineffective, so the router was not started'
    )
  }
  if (message === '请先启用本机 Mihomo SOCKS 或 mixed 监听端口') {
    return tr('Enable a local Mihomo SOCKS or mixed listener first')
  }
  if (message === 'Mihomo 不可用；匹配 Proxy 的流量已阻断（不会直连）') {
    return tr('Mihomo is unavailable; matching Proxy traffic is blocked (no direct fallback)')
  }
  if (message === '代理核心不可用，受保护应用的网络连接已封锁') {
    return tr(
      'The application-routing proxy endpoint is unavailable. Proxy connections from {0} protected applications are blocked to prevent direct fallback.',
      [protectedApplicationCount]
    )
  }
  if (message === '应用分流 MVP 需要以管理员模式运行 KokoroBox') {
    return tr('The application routing MVP requires KokoroBox to run as administrator')
  }
  if (message === '当前 KokoroBox Service 不支持应用分流，请更新或重新安装服务') {
    return tr(
      'The installed KokoroBox Service does not support application routing. Update or reinstall the service.'
    )
  }
  if (message === 'KokoroBox Service 认证已失效，请在内核设置中重置认证') {
    return tr(
      'KokoroBox Service authentication is no longer valid. Reset authentication in Core Settings.'
    )
  }
  if (
    message === 'KokoroBox Service 尚未初始化，请初始化服务后重试' ||
    message?.toLowerCase().includes('service is not initialized')
  ) {
    return tr('KokoroBox Service is not initialized. Initialize the service and try again.')
  }
  if (message === 'Windows 应用分流需要已安装、初始化并运行 KokoroBox Service') {
    return tr(
      'Windows application routing requires KokoroBox Service to be installed, initialized, and running.'
    )
  }
  if (message === 'Linux 应用分流需要已安装并运行 KokoroBox Service') {
    return tr('Linux application routing requires KokoroBox Service to be installed and running.')
  }
  if (message === '系统不支持可用的 cgroup v2 或 cgroup v1 net_cls 应用分流后端') {
    return tr(
      'This system has neither a usable cgroup v2 nor cgroup v1 net_cls application-routing backend.'
    )
  }
  if (message === '封包拦截组件启动失败') {
    return tr('The packet interception sidecar failed to start')
  }
  if (message === '封包拦截组件意外停止，正在重试') {
    return tr('The packet interception sidecar stopped unexpectedly; retrying')
  }
  if (message === '请在系统设置中允许 KokoroBox 网络扩展') {
    return tr('Allow the KokoroBox network extension in System Settings.')
  }
  if (message === 'macOS application-routing bridge is not installed') {
    return tr('The macOS application-routing bridge is not installed')
  }
  if (message === 'macOS application-routing system extension is not installed') {
    return tr('The macOS system extension is not installed')
  }
  if (message === 'The network extension rejected the application-routing policy') {
    return tr(
      'The Network Extension rejected the application-routing rules. Check the rules and try again.'
    )
  }
  if (message === 'The network extension did not acknowledge the application-routing policy') {
    return tr(
      'The Network Extension did not acknowledge the update. The current routing rules could not be confirmed. Please retry.'
    )
  }
  if (message === 'macOS 应用分流需要 macOS 13 或更新版本') {
    return tr('macOS application routing requires macOS 13 or later')
  }
  return message
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
  const currentStatusMessage = statusMessage(status?.message, status?.protectedApplicationCount)
  const needsMacApproval = isMac && config?.enabled && status?.needsUserApproval === true
  const needsWindowsServicePreparation =
    isWindows &&
    config?.enabled &&
    status?.state === 'error' &&
    (status.message === 'KokoroBox Service 尚未初始化，请初始化服务后重试' ||
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
          variant="light"
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{tr('Application routing')}</h2>
              <Chip size="sm" color={statusColor(status)} variant="flat">
                {statusLabel(status)}
              </Chip>
            </div>
            <p className="mt-1 text-sm text-foreground-500">
              {tr('Route selected applications through local Mihomo without system proxy or TUN.')}
            </p>
            {currentStatusMessage && !needsMacApproval && (
              <p
                className={`mt-2 text-sm ${status?.state === 'error' ? 'text-danger' : 'text-warning'}`}
              >
                {currentStatusMessage}
              </p>
            )}
            {isMac &&
              !needsMacApproval &&
              config?.enabled &&
              ['starting', 'error'].includes(status?.state ?? '') && (
                <Button className="mt-2" size="sm" variant="flat" onPress={() => void refresh()}>
                  {tr('Retry')}
                </Button>
              )}
            {needsWindowsServicePreparation && (
              <Button
                className="mt-2"
                size="sm"
                color="primary"
                variant="flat"
                startContent={<MdRefresh className="text-base" />}
                isLoading={preparingService}
                isDisabled={saving}
                onPress={() => void prepareWindowsService()}
              >
                {tr('Initialize service and retry')}
              </Button>
            )}
            {config?.enabled && (
              <p className="mt-2 text-sm text-foreground-500">
                {tr('Upstream')}：KokoroBox / 127.0.0.1:{displayedProxyPort} (
                {displayedProxyProtocol}){backendLabel ? ` · ${backendLabel}` : ''}
              </p>
            )}
          </div>
          <Switch
            aria-label={tr('Application routing')}
            isSelected={config?.enabled ?? false}
            isDisabled={!supported || !config || saving || preparingService}
            onValueChange={(enabled) => void setRoutingEnabled(enabled)}
          />
        </div>

        <Divider />

        {needsMacApproval && (
          <Card
            className="border border-warning/40 bg-warning-50 dark:bg-warning-900/20"
            shadow="sm"
          >
            <CardBody className="gap-3 p-5">
              <div>
                <h3 className="font-semibold text-warning-900 dark:text-warning-200">
                  {tr('Network Extension approval required')}
                </h3>
                <p className="mt-1 text-sm text-warning-800 dark:text-warning-300">
                  {tr('macOS needs your approval before application routing can start.')}
                </p>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-warning-800 dark:text-warning-300">
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
                  color="primary"
                  startContent={<MdOpenInNew className="text-base" />}
                  isDisabled={saving}
                  isLoading={openingSettings}
                  onPress={() => void openApprovalSettings()}
                >
                  {tr('Open System Settings and Request Approval')}
                </Button>
                <Button
                  variant="flat"
                  startContent={<MdRefresh className="text-base" />}
                  isDisabled={saving}
                  onPress={() => void refresh()}
                >
                  {tr('I enabled it — check now')}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        <div>
          <h3 className="font-semibold">{tr('Application rules')}</h3>
          <p className="text-sm text-foreground-500">
            {isMac
              ? tr(
                  'Rules match from top to bottom by process name or application signing identifier.'
                )
              : isLinux
                ? tr('Rules match from top to bottom by executable path or process name.')
                : tr('Rules match from top to bottom. Use a filename or a full path containing *.')}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <div
            className={`grid gap-2 md:items-center ${
              isMac
                ? 'md:grid-cols-[10rem_minmax(11rem,1fr)_auto]'
                : isLinux
                  ? 'md:grid-cols-[10rem_minmax(11rem,1fr)_auto]'
                  : 'sm:grid-cols-[minmax(12rem,1fr)_auto]'
            }`}
          >
            {isMac && (
              <Select
                size="sm"
                label={tr('Match by')}
                disallowEmptySelection
                isDisabled={!supported || !config || saving}
                selectedKeys={new Set([macIdentifierKind])}
                onSelectionChange={(keys) =>
                  setMacIdentifierKind(keys.currentKey as AppRoutingIdentifierKind)
                }
              >
                <SelectItem key="macos-process-name">{tr('Process name')}</SelectItem>
                <SelectItem key="macos-signing-identifier">{tr('Signing identifier')}</SelectItem>
              </Select>
            )}
            {isLinux && (
              <Select
                size="sm"
                label={tr('Match by')}
                disallowEmptySelection
                isDisabled={!supported || !config || saving}
                selectedKeys={new Set([linuxIdentifierKind])}
                onSelectionChange={(keys) =>
                  setLinuxIdentifierKind(keys.currentKey as AppRoutingIdentifierKind)
                }
              >
                <SelectItem key="linux-executable">{tr('Executable path')}</SelectItem>
                <SelectItem key="linux-process-name">{tr('Process name')}</SelectItem>
              </Select>
            )}
            <Input
              size="sm"
              label={
                isMac
                  ? macIdentifierKind === 'macos-process-name'
                    ? tr('Process name')
                    : tr('Signing identifier')
                  : isLinux
                    ? linuxIdentifierKind === 'linux-process-name'
                      ? tr('Process name')
                      : tr('Executable path')
                    : tr('Process pattern')
              }
              placeholder={
                isMac
                  ? macIdentifierKind === 'macos-process-name'
                    ? 'codex'
                    : 'com.example.app'
                  : isLinux
                    ? linuxIdentifierKind === 'linux-process-name'
                      ? 'codex'
                      : '/usr/bin/example'
                    : 'example.exe'
              }
              value={processPattern}
              isDisabled={!supported || !config || saving}
              onValueChange={setProcessPattern}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && processPattern.trim()) void submitPattern()
              }}
            />
            <div className="flex w-full min-w-max items-center gap-2 sm:w-auto sm:justify-end">
              <Button
                className="min-w-0 flex-1 shrink-0 sm:flex-none"
                color="primary"
                startContent={<MdAdd className="text-lg" />}
                isDisabled={!supported || !config || saving || !processPattern.trim()}
                onPress={() => void submitPattern()}
              >
                {tr('Add pattern rule')}
              </Button>
              <span className="text-sm text-foreground-500">{tr('or')}</span>
              <Button
                className="min-w-0 flex-1 shrink-0 sm:flex-none"
                variant="flat"
                startContent={<MdAdd className="text-lg" />}
                isDisabled={!supported || !config || saving}
                onPress={() =>
                  void addApplications(undefined, isLinux ? linuxIdentifierKind : undefined)
                }
              >
                {tr('Select applications')}
              </Button>
            </div>
          </div>
          <p className="px-1 text-xs text-foreground-500">
            {isMac
              ? macIdentifierKind === 'macos-process-name'
                ? tr('For example: codex or Codex Helper*')
                : tr('For example: com.openai.chat or com.openai.chat*')
              : isLinux
                ? linuxIdentifierKind === 'linux-process-name'
                  ? tr('For example: codex. Every executable with that name will match.')
                  : tr('For example: /usr/bin/firefox or /opt/example/example')
                : tr(
                    'For example: ChatGPT.exe, ChatGPT*.exe, or C:\\Program Files\\*\\ChatGPT.exe'
                  )}
          </p>
        </div>

        {!supported ? (
          <Card shadow="sm">
            <CardBody className="p-5 text-sm text-foreground-500">
              {tr(
                'Application routing supports Windows 10/11 x64, macOS 13 or later, and Linux x64/arm64.'
              )}
            </CardBody>
          </Card>
        ) : !isWindows && config?.rules.length === 0 ? (
          <Card shadow="sm">
            <CardBody className="items-center gap-2 p-8 text-center">
              <p className="font-medium">{tr('No applications added')}</p>
              <p className="text-sm text-foreground-500">
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
            </CardBody>
          </Card>
        ) : (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-3">
              {isWindows && (
                <div className="flex items-end justify-between gap-3 px-1">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{tr('Individual rules')}</h4>
                      <Chip size="sm" variant="flat">
                        {ungroupedRules.length}
                      </Chip>
                    </div>
                    <p className="mt-0.5 text-xs text-foreground-500">
                      {tr('Applications that do not belong to a rule group.')}
                    </p>
                  </div>
                </div>
              )}
              {ungroupedRules.length === 0 && isWindows ? (
                <div className="rounded-xl border border-dashed border-default-200 px-4 py-5 text-center text-sm text-foreground-500">
                  {tr('No individual rules')}
                </div>
              ) : (
                ungroupedRules.map((rule, index) => (
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
                ))
              )}
            </section>

            {isWindows && (
              <>
                <Divider />
                <section className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end justify-between gap-3 px-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold">{tr('Rule groups')}</h4>
                        <Chip size="sm" variant="flat">
                          {config?.groups?.length ?? 0}
                        </Chip>
                      </div>
                      <p className="mt-0.5 text-xs text-foreground-500">
                        {tr('Manage applications together. Rule groups are collapsed by default.')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="flat"
                        startContent={<MdCreateNewFolder className="text-lg" />}
                        isDisabled={!config || saving}
                        onPress={() => setGroupEditor({ name: '' })}
                      >
                        {tr('New rule group')}
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        startContent={<MdFolderOpen className="text-lg" />}
                        isDisabled={!config || saving}
                        onPress={() => void scanDirectory()}
                      >
                        {tr('Scan folder')}
                      </Button>
                    </div>
                  </div>

                  {(config?.groups?.length ?? 0) === 0 ? (
                    <div className="rounded-xl border border-dashed border-default-200 px-4 py-6 text-center">
                      <p className="text-sm font-medium">{tr('No rule groups')}</p>
                      <p className="mt-1 text-xs text-foreground-500">
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
                        <section key={group.id} className="flex flex-col gap-2">
                          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-default-200 bg-default-50 px-3 py-2.5 dark:bg-default-100/40">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              aria-expanded={!isCollapsed}
                              onClick={() => toggleGroup(group.id)}
                            >
                              <MdKeyboardArrowDown
                                className={`shrink-0 text-xl text-foreground-500 transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`}
                              />
                              <MdFolderOpen className="shrink-0 text-xl text-primary" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">
                                  {group.name}
                                </span>
                                <span
                                  className="block truncate text-xs text-foreground-500"
                                  title={group.sourceDirectory}
                                >
                                  {group.sourceDirectory ?? tr('Manual rule group')}
                                </span>
                              </span>
                              <Chip size="sm" variant="flat" className="shrink-0">
                                {tr('{0} applications', [rules.length])}
                              </Chip>
                            </button>
                            <Dropdown placement="bottom-end">
                              <DropdownTrigger>
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  aria-label={tr('Rule group actions')}
                                  isDisabled={saving}
                                >
                                  <MdMoreHoriz className="text-lg" />
                                </Button>
                              </DropdownTrigger>
                              <DropdownMenu
                                aria-label={tr('Rule group actions')}
                                onAction={(key) => {
                                  if (key === 'add') void addApplications(group.id)
                                  if (key === 'scan') void scanDirectory(group.id)
                                  if (key === 'rename')
                                    setGroupEditor({ id: group.id, name: group.name })
                                  if (key === 'delete') setDeletingGroupId(group.id)
                                }}
                              >
                                <DropdownItem key="add" startContent={<MdAdd />}>
                                  {tr('Add applications')}
                                </DropdownItem>
                                <DropdownItem key="scan" startContent={<MdRefresh />}>
                                  {group.sourceDirectory ? tr('Rescan folder') : tr('Scan folder')}
                                </DropdownItem>
                                <DropdownItem
                                  key="rename"
                                  startContent={<MdDriveFileRenameOutline />}
                                >
                                  {tr('Rename rule group')}
                                </DropdownItem>
                                <DropdownItem
                                  key="delete"
                                  color="danger"
                                  className="text-danger"
                                  startContent={<MdDeleteOutline />}
                                >
                                  {tr('Delete rule group')}
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                            <Switch
                              size="sm"
                              aria-label={tr('Enable rule group')}
                              isSelected={group.enabled}
                              isDisabled={saving}
                              onValueChange={(enabled) => updateGroup(group.id, { enabled })}
                            />
                          </div>
                          {!isCollapsed && (
                            <div
                              className={`ml-4 flex flex-col gap-3 border-l-2 pl-3 transition-opacity duration-150 ${group.enabled ? 'border-primary-200' : 'border-default-200 opacity-70'}`}
                            >
                              {rules.length === 0 ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-default-200 px-4 py-3 text-sm text-foreground-500">
                                  <span>{tr('No applications in this rule group')}</span>
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    startContent={<MdAdd />}
                                    isDisabled={saving}
                                    onPress={() => void addApplications(group.id)}
                                  >
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

        <div className="rounded-xl bg-warning-50 p-4 text-sm text-warning-800 dark:bg-warning-900/20 dark:text-warning-300">
          <div className="font-semibold">{tr('Proxy failure protection')}</div>
          <p className="mt-1">
            {tr(
              'If the application-routing proxy endpoint is unavailable, Proxy connections are blocked to prevent accidental direct fallback. Direct rules remain direct.'
            )}
          </p>
          {status?.proxyPort && (
            <p className="mt-1 font-mono text-xs">
              127.0.0.1:{status.proxyPort} ({displayedProxyProtocol})
              {backendLabel ? ` · ${backendLabel}` : ''}
            </p>
          )}
        </div>
      </div>
    </BasePage>
  )
}

export default AppRouting
