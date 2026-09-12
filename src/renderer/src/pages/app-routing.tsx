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
  if (!status) return tr('正在加载')
  const labels: Record<AppRoutingRuntimeState, string> = {
    unsupported: tr('不受支持'),
    disabled: tr('已停用'),
    starting: tr('正在启动'),
    running: tr('运行中'),
    degraded: tr('安全阻断中'),
    error: tr('错误')
  }
  return labels[status.state]
}

function statusMessage(message?: string, protectedApplicationCount = 0): string | undefined {
  if (message === '添加或启用规则以启动应用分流') {
    return tr('添加或启用规则以启动应用分流')
  }
  if (message === 'Windows 封包拦截组件未安装') {
    return tr('Windows 封包拦截组件未安装')
  }
  if (message === 'Windows 封包拦截组件缺失或已损坏') {
    return tr('Windows 封包拦截组件缺失或已损坏')
  }
  if (
    message?.includes('application-routing firewall') ||
    message?.includes('Windows 应用分流防火墙')
  ) {
    return tr('Windows 应用分流防火墙规则缺失或无法生效，router 未启动')
  }
  if (message === '请先启用本机 Mihomo SOCKS 或 mixed 监听端口') {
    return tr('请先启用本机 Mihomo SOCKS 或 mixed 监听端口')
  }
  if (message === 'Mihomo 不可用；匹配 Proxy 的流量已阻断（不会直连）') {
    return tr('Mihomo 不可用；匹配 Proxy 的流量已阻断（不会直连）')
  }
  if (message === '代理核心不可用，受保护应用的网络连接已封锁') {
    return tr(
      '应用分流代理入口不可用，已安全阻断 {0} 个受保护应用程序的代理连接，避免回退为直连。',
      [protectedApplicationCount]
    )
  }
  if (message === '应用分流 MVP 需要以管理员模式运行 KokoroBox') {
    return tr('应用分流 MVP 需要以管理员模式运行 KokoroBox')
  }
  if (message === '当前 KokoroBox Service 不支持应用分流，请更新或重新安装服务') {
    return tr('当前 KokoroBox Service 不支持应用分流，请更新或重新安装服务')
  }
  if (message === 'KokoroBox Service 认证已失效，请在内核设置中重置认证') {
    return tr('KokoroBox Service 认证已失效，请在内核设置中重置认证')
  }
  if (
    message === 'KokoroBox Service 尚未初始化，请初始化服务后重试' ||
    message?.toLowerCase().includes('service is not initialized')
  ) {
    return tr('KokoroBox Service 尚未初始化，请初始化服务后重试')
  }
  if (message === 'Windows 应用分流需要已安装、初始化并运行 KokoroBox Service') {
    return tr('Windows 应用分流需要已安装、初始化并运行 KokoroBox Service')
  }
  if (message === 'Linux 应用分流需要已安装并运行 KokoroBox Service') {
    return tr('Linux 应用分流需要已安装并运行 KokoroBox Service')
  }
  if (message === '系统不支持可用的 cgroup v2 或 cgroup v1 net_cls 应用分流后端') {
    return tr('系统不支持可用的 cgroup v2 或 cgroup v1 net_cls 应用分流后端')
  }
  if (message === '封包拦截组件启动失败') {
    return tr('封包拦截组件启动失败')
  }
  if (message === '封包拦截组件意外停止，正在重试') {
    return tr('封包拦截组件意外停止，正在重试')
  }
  if (message === '请在系统设置中允许 KokoroBox 网络扩展') {
    return tr('请在系统设置中允许 KokoroBox 网络扩展')
  }
  if (message === 'macOS application-routing bridge is not installed') {
    return tr('macOS 应用分流组件未安装')
  }
  if (message === 'macOS application-routing system extension is not installed') {
    return tr('macOS 系统扩展未安装')
  }
  if (message === 'The network extension rejected the application-routing policy') {
    return tr('网络扩展拒绝了应用分流规则。请检查规则后重试。')
  }
  if (message === 'The network extension did not acknowledge the application-routing policy') {
    return tr('网络扩展未确认规则更新，无法确认当前分流规则已生效。请重试。')
  }
  if (message === 'macOS 应用分流需要 macOS 13 或更新版本') {
    return tr('macOS 应用分流需要 macOS 13 或更新版本')
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
    setCollapsedGroups((current) => {
      const next = new Set([...current].filter((id) => currentIds.has(id)))
      for (const id of currentIds) {
        if (!knownGroupIds.current.has(id)) next.add(id)
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
      notify(tr('应用分流防火墙修复成功'))
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
      title={tr('应用分流')}
      contentClassName="no-scrollbar"
      header={
        <Button
          size="sm"
          isIconOnly
          className="app-nodrag"
          variant="light"
          aria-label={tr('应用分流设置')}
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
          title={tr('删除规则组')}
          description={tr('删除规则组会同时删除组内的所有应用程序规则。')}
          confirmText={tr('删除')}
          onConfirm={() => deleteGroup(deletingGroupId)}
          onChange={(open) => !open && setDeletingGroupId(undefined)}
        />
      )}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{tr('应用分流')}</h2>
              <Chip size="sm" color={statusColor(status)} variant="flat">
                {statusLabel(status)}
              </Chip>
            </div>
            <p className="mt-1 text-sm text-foreground-500">
              {tr('无需系统代理或 TUN，将指定应用程序交给本机 Mihomo 处理。')}
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
                  {tr('重试')}
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
                {tr('初始化服务并重试')}
              </Button>
            )}
            {config?.enabled && (
              <p className="mt-2 text-sm text-foreground-500">
                {tr('上游')}：KokoroBox / 127.0.0.1:{displayedProxyPort} ({displayedProxyProtocol})
                {backendLabel ? ` · ${backendLabel}` : ''}
              </p>
            )}
          </div>
          <Switch
            aria-label={tr('应用分流')}
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
                  {tr('需要批准网络扩展')}
                </h3>
                <p className="mt-1 text-sm text-warning-800 dark:text-warning-300">
                  {tr('macOS 需要你的批准才能开始应用分流。')}
                </p>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-warning-800 dark:text-warning-300">
                <li>{tr('在系统设置中前往“通用 → 登录项与扩展 → 网络扩展”。')}</li>
                <li>{tr('启用 KokoroBox，然后完成 macOS 的确认提示。')}</li>
                <li>{tr('返回 KokoroBox；应用分流会自动继续启动。')}</li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button
                  color="primary"
                  startContent={<MdOpenInNew className="text-base" />}
                  isDisabled={saving}
                  isLoading={openingSettings}
                  onPress={() => void openApprovalSettings()}
                >
                  {tr('打开系统设置并请求批准')}
                </Button>
                <Button
                  variant="flat"
                  startContent={<MdRefresh className="text-base" />}
                  isDisabled={saving}
                  onPress={() => void refresh()}
                >
                  {tr('我已启用，立即检查')}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        <div>
          <h3 className="font-semibold">{tr('应用程序规则')}</h3>
          <p className="text-sm text-foreground-500">
            {isMac
              ? tr('规则按从上到下的顺序匹配；可使用进程名称或应用签名标识。')
              : isLinux
                ? tr('规则按从上到下的顺序匹配；可使用可执行文件路径或进程名称。')
                : tr('规则按从上到下的顺序匹配；支持文件名或含 * 的完整路径。')}
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
                label={tr('匹配方式')}
                disallowEmptySelection
                isDisabled={!supported || !config || saving}
                selectedKeys={new Set([macIdentifierKind])}
                onSelectionChange={(keys) =>
                  setMacIdentifierKind(keys.currentKey as AppRoutingIdentifierKind)
                }
              >
                <SelectItem key="macos-process-name">{tr('进程名称')}</SelectItem>
                <SelectItem key="macos-signing-identifier">{tr('签名标识')}</SelectItem>
              </Select>
            )}
            {isLinux && (
              <Select
                size="sm"
                label={tr('匹配方式')}
                disallowEmptySelection
                isDisabled={!supported || !config || saving}
                selectedKeys={new Set([linuxIdentifierKind])}
                onSelectionChange={(keys) =>
                  setLinuxIdentifierKind(keys.currentKey as AppRoutingIdentifierKind)
                }
              >
                <SelectItem key="linux-executable">{tr('可执行文件路径')}</SelectItem>
                <SelectItem key="linux-process-name">{tr('进程名称')}</SelectItem>
              </Select>
            )}
            <Input
              size="sm"
              label={
                isMac
                  ? macIdentifierKind === 'macos-process-name'
                    ? tr('进程名称')
                    : tr('签名标识')
                  : isLinux
                    ? linuxIdentifierKind === 'linux-process-name'
                      ? tr('进程名称')
                      : tr('可执行文件路径')
                    : tr('程序匹配')
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
                {tr('新增匹配规则')}
              </Button>
              <span className="text-sm text-foreground-500">{tr('或')}</span>
              <Button
                className="min-w-0 flex-1 shrink-0 sm:flex-none"
                variant="flat"
                startContent={<MdAdd className="text-lg" />}
                isDisabled={!supported || !config || saving}
                onPress={() =>
                  void addApplications(undefined, isLinux ? linuxIdentifierKind : undefined)
                }
              >
                {tr('选择应用程序')}
              </Button>
            </div>
          </div>
          <p className="px-1 text-xs text-foreground-500">
            {isMac
              ? macIdentifierKind === 'macos-process-name'
                ? tr('例如：codex 或 Codex Helper*')
                : tr('例如：com.openai.chat 或 com.openai.chat*')
              : isLinux
                ? linuxIdentifierKind === 'linux-process-name'
                  ? tr('例如：codex；所有同名可执行程序都会匹配。')
                  : tr('例如：/usr/bin/firefox 或 /opt/example/example')
                : tr('例如：ChatGPT.exe、ChatGPT*.exe 或 C:\\Program Files\\*\\ChatGPT.exe')}
          </p>
        </div>

        {!supported ? (
          <Card shadow="sm">
            <CardBody className="p-5 text-sm text-foreground-500">
              {tr('应用分流支持 Windows 10/11 x64、macOS 13 或更新版本及 Linux x64/arm64。')}
            </CardBody>
          </Card>
        ) : !isWindows && config?.rules.length === 0 ? (
          <Card shadow="sm">
            <CardBody className="items-center gap-2 p-8 text-center">
              <p className="font-medium">{tr('尚未添加应用程序')}</p>
              <p className="text-sm text-foreground-500">
                {isMac
                  ? tr(
                      '输入进程名称或签名标识，或选择一个或多个 .app，然后设定 Proxy、Direct 或 Block。'
                    )
                  : isLinux
                    ? tr(
                        '输入可执行文件路径或进程名称，或选择一个或多个程序，然后设定 Proxy、Direct 或 Block。'
                      )
                    : tr(
                        '输入绝对可执行文件路径，或选择一个或多个程序，然后设定 Proxy、Direct 或 Block。'
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
                      <h4 className="text-sm font-semibold">{tr('单独规则')}</h4>
                      <Chip size="sm" variant="flat">
                        {ungroupedRules.length}
                      </Chip>
                    </div>
                    <p className="mt-0.5 text-xs text-foreground-500">
                      {tr('不属于规则组的应用程序。')}
                    </p>
                  </div>
                </div>
              )}
              {ungroupedRules.length === 0 && isWindows ? (
                <div className="rounded-xl border border-dashed border-default-200 px-4 py-5 text-center text-sm text-foreground-500">
                  {tr('暂无单独规则')}
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
                        <h4 className="text-sm font-semibold">{tr('规则组')}</h4>
                        <Chip size="sm" variant="flat">
                          {config?.groups?.length ?? 0}
                        </Chip>
                      </div>
                      <p className="mt-0.5 text-xs text-foreground-500">
                        {tr('统一管理一组应用程序，规则组默认折叠显示。')}
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
                        {tr('新建规则组')}
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        startContent={<MdFolderOpen className="text-lg" />}
                        isDisabled={!config || saving}
                        onPress={() => void scanDirectory()}
                      >
                        {tr('扫描文件夹')}
                      </Button>
                    </div>
                  </div>

                  {(config?.groups?.length ?? 0) === 0 ? (
                    <div className="rounded-xl border border-dashed border-default-200 px-4 py-6 text-center">
                      <p className="text-sm font-medium">{tr('暂无规则组')}</p>
                      <p className="mt-1 text-xs text-foreground-500">
                        {tr('手动创建空规则组，或扫描文件夹并自动添加其中的应用程序。')}
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
                                  {group.sourceDirectory ?? tr('手动规则组')}
                                </span>
                              </span>
                              <Chip size="sm" variant="flat" className="shrink-0">
                                {tr('{0} 个应用程序', [rules.length])}
                              </Chip>
                            </button>
                            <Dropdown placement="bottom-end">
                              <DropdownTrigger>
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  aria-label={tr('规则组操作')}
                                  isDisabled={saving}
                                >
                                  <MdMoreHoriz className="text-lg" />
                                </Button>
                              </DropdownTrigger>
                              <DropdownMenu
                                aria-label={tr('规则组操作')}
                                onAction={(key) => {
                                  if (key === 'add') void addApplications(group.id)
                                  if (key === 'scan') void scanDirectory(group.id)
                                  if (key === 'rename')
                                    setGroupEditor({ id: group.id, name: group.name })
                                  if (key === 'delete') setDeletingGroupId(group.id)
                                }}
                              >
                                <DropdownItem key="add" startContent={<MdAdd />}>
                                  {tr('添加应用程序')}
                                </DropdownItem>
                                <DropdownItem key="scan" startContent={<MdRefresh />}>
                                  {group.sourceDirectory ? tr('重新扫描文件夹') : tr('扫描文件夹')}
                                </DropdownItem>
                                <DropdownItem
                                  key="rename"
                                  startContent={<MdDriveFileRenameOutline />}
                                >
                                  {tr('重命名规则组')}
                                </DropdownItem>
                                <DropdownItem
                                  key="delete"
                                  color="danger"
                                  className="text-danger"
                                  startContent={<MdDeleteOutline />}
                                >
                                  {tr('删除规则组')}
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                            <Switch
                              size="sm"
                              aria-label={tr('启用规则组')}
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
                                  <span>{tr('规则组中暂无应用程序')}</span>
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    startContent={<MdAdd />}
                                    isDisabled={saving}
                                    onPress={() => void addApplications(group.id)}
                                  >
                                    {tr('添加应用程序')}
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
          <div className="font-semibold">{tr('代理失效保护')}</div>
          <p className="mt-1">
            {tr(
              '应用分流代理入口不可用时，Proxy 规则的连接会被阻断，避免意外回退为直连；Direct 规则仍保持直连。'
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
