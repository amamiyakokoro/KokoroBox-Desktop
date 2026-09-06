import { tr } from '../../../shared/i18n'
import BasePage from '@renderer/components/base/base-page'
import {
  getApplicationPaths,
  getAppRoutingConfig,
  getAppRoutingStatus,
  replaceAppRoutingConfig
} from '@renderer/utils/ipc'
import { notify } from '@renderer/utils/notification'
import { Button, Card, CardBody, Chip, Divider, Select, SelectItem, Switch } from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { MdAdd, MdArrowDownward, MdArrowUpward, MdDeleteOutline } from 'react-icons/md'
import { nanoid } from 'nanoid'

const actionLabels: Record<AppRoutingAction, string> = {
  proxy: 'Proxy',
  direct: 'Direct',
  block: 'Block'
}

const protocolLabels: Record<AppRoutingProtocol, string> = {
  tcp: 'TCP',
  udp: 'UDP',
  both: 'TCP + UDP'
}

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
    degraded: tr('阻断保护'),
    error: tr('错误')
  }
  return labels[status.state]
}

function statusMessage(message?: string): string | undefined {
  if (message === '添加或启用规则以启动应用分流') {
    return tr('添加或启用规则以启动应用分流')
  }
  if (message === 'Windows 封包拦截组件未安装') {
    return tr('Windows 封包拦截组件未安装')
  }
  if (message === '请先启用本机 Mihomo SOCKS 或 mixed 监听端口') {
    return tr('请先启用本机 Mihomo SOCKS 或 mixed 监听端口')
  }
  if (message === 'Mihomo 不可用；匹配 Proxy 的流量已阻断（不会直连）') {
    return tr('Mihomo 不可用；匹配 Proxy 的流量已阻断（不会直连）')
  }
  if (message === '应用分流 MVP 需要以管理员模式运行 KokoroBox') {
    return tr('应用分流 MVP 需要以管理员模式运行 KokoroBox')
  }
  if (message === '封包拦截组件启动失败') {
    return tr('封包拦截组件启动失败')
  }
  if (message === '封包拦截组件意外停止，正在重试') {
    return tr('封包拦截组件意外停止，正在重试')
  }
  return message
}

const AppRouting: React.FC = () => {
  const [config, setConfig] = useState<AppRoutingConfig>()
  const [status, setStatus] = useState<AppRoutingStatus>()
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const [nextConfig, nextStatus] = await Promise.all([
        getAppRoutingConfig(),
        getAppRoutingStatus()
      ])
      setConfig(nextConfig)
      setStatus(nextStatus)
    } catch (error) {
      notify(error, { variant: 'danger' })
    }
  }, [])

  useEffect(() => {
    void load()
    const unsubscribe = window.electron.ipcRenderer.on(
      'app-routing-status-changed',
      (_event, nextStatus: AppRoutingStatus) => setStatus(nextStatus)
    )
    return unsubscribe
  }, [load])

  const save = async (next: AppRoutingConfig): Promise<void> => {
    setSaving(true)
    setConfig(next)
    try {
      setConfig(await replaceAppRoutingConfig(next))
      setStatus(await getAppRoutingStatus())
    } catch (error) {
      notify(error, { variant: 'danger' })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const addApplications = async (): Promise<void> => {
    if (!config) return
    const paths = await getApplicationPaths()
    if (!paths?.length) return
    const existingNames = new Set(config.rules.map((rule) => rule.processName.toLowerCase()))
    const additions: AppRoutingRule[] = []
    for (const executablePath of paths) {
      const processName = executablePath.replaceAll('/', '\\').split('\\').pop() || ''
      if (!processName || existingNames.has(processName.toLowerCase())) continue
      existingNames.add(processName.toLowerCase())
      additions.push({
        id: nanoid(),
        executablePath,
        processName,
        action: 'proxy',
        protocol: 'both',
        enabled: true
      })
    }
    if (additions.length === 0) {
      notify(tr('所选应用程序已存在'), { variant: 'warning' })
      return
    }
    await save({ ...config, rules: [...config.rules, ...additions] })
  }

  const updateRule = (index: number, patch: Partial<AppRoutingRule>): void => {
    if (!config) return
    const rules = config.rules.map((rule, ruleIndex) =>
      ruleIndex === index ? { ...rule, ...patch } : rule
    )
    void save({ ...config, rules })
  }

  const moveRule = (index: number, offset: number): void => {
    if (!config) return
    const target = index + offset
    if (target < 0 || target >= config.rules.length) return
    const rules = [...config.rules]
    const [rule] = rules.splice(index, 1)
    rules.splice(target, 0, rule)
    void save({ ...config, rules })
  }

  const supported =
    status?.supported ?? (window.api.platform === 'win32' && window.api.arch === 'x64')
  const currentStatusMessage = statusMessage(status?.message)

  return (
    <BasePage title={tr('应用分流')} contentClassName="no-scrollbar">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{tr('Windows 应用程序分流')}</h2>
              <Chip size="sm" color={statusColor(status)} variant="flat">
                {statusLabel(status)}
              </Chip>
            </div>
            <p className="mt-1 text-sm text-foreground-500">
              {tr('无需系统代理或 TUN，将指定应用程序交给本机 Mihomo 处理。')}
            </p>
            {currentStatusMessage && (
              <p
                className={`mt-2 text-sm ${status?.state === 'error' ? 'text-danger' : 'text-warning'}`}
              >
                {currentStatusMessage}
              </p>
            )}
          </div>
          <Switch
            isSelected={config?.enabled ?? false}
            isDisabled={!supported || !config || saving}
            onValueChange={(enabled) => config && void save({ ...config, enabled })}
          />
        </div>

        <Divider />

        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">{tr('应用程序规则')}</h3>
            <p className="text-sm text-foreground-500">
              {tr('规则按从上到下的顺序匹配；同名 exe 只能添加一次。')}
            </p>
          </div>
          <Button
            color="primary"
            startContent={<MdAdd className="text-lg" />}
            isDisabled={!supported || !config || saving}
            onPress={() => void addApplications()}
          >
            {tr('添加应用程序')}
          </Button>
        </div>

        {!supported ? (
          <Card shadow="sm">
            <CardBody className="p-5 text-sm text-foreground-500">
              {tr('此 MVP 仅支持 Windows 10/11 x64。')}
            </CardBody>
          </Card>
        ) : config?.rules.length === 0 ? (
          <Card shadow="sm">
            <CardBody className="items-center gap-2 p-8 text-center">
              <p className="font-medium">{tr('尚未添加应用程序')}</p>
              <p className="text-sm text-foreground-500">
                {tr('选择一个或多个 .exe，然后设定 Proxy、Direct 或 Block。')}
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {config?.rules.map((rule, index) => (
              <Card key={rule.id} shadow="sm">
                <CardBody className="gap-3 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium" title={rule.processName}>
                        {rule.processName}
                      </div>
                      <div
                        className="truncate text-xs text-foreground-500"
                        title={rule.executablePath}
                      >
                        {rule.executablePath}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Switch
                        size="sm"
                        aria-label={tr('启用规则')}
                        isSelected={rule.enabled}
                        isDisabled={saving}
                        onValueChange={(enabled) => updateRule(index, { enabled })}
                      />
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        aria-label={tr('上移')}
                        isDisabled={index === 0 || saving}
                        onPress={() => moveRule(index, -1)}
                      >
                        <MdArrowUpward />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        aria-label={tr('下移')}
                        isDisabled={index === config.rules.length - 1 || saving}
                        onPress={() => moveRule(index, 1)}
                      >
                        <MdArrowDownward />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        color="danger"
                        variant="light"
                        aria-label={tr('删除')}
                        isDisabled={saving}
                        onPress={() =>
                          void save({
                            ...config,
                            rules: config.rules.filter((item) => item.id !== rule.id)
                          })
                        }
                      >
                        <MdDeleteOutline className="text-lg" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label={tr('动作')}
                      size="sm"
                      isDisabled={saving}
                      selectedKeys={new Set([rule.action])}
                      onSelectionChange={(keys) =>
                        updateRule(index, { action: keys.currentKey as AppRoutingAction })
                      }
                    >
                      {Object.entries(actionLabels).map(([key, label]) => (
                        <SelectItem key={key}>{label}</SelectItem>
                      ))}
                    </Select>
                    <Select
                      label={tr('协议')}
                      size="sm"
                      isDisabled={saving}
                      selectedKeys={new Set([rule.protocol])}
                      onSelectionChange={(keys) =>
                        updateRule(index, { protocol: keys.currentKey as AppRoutingProtocol })
                      }
                    >
                      {Object.entries(protocolLabels).map(([key, label]) => (
                        <SelectItem key={key}>{label}</SelectItem>
                      ))}
                    </Select>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        <div className="rounded-xl bg-warning-50 p-4 text-sm text-warning-800 dark:bg-warning-900/20 dark:text-warning-300">
          <div className="font-semibold">{tr('Fail-closed 保护')}</div>
          <p className="mt-1">
            {tr(
              'Mihomo 不可用时，Proxy 规则的连接会被阻断，不会自动改为直连。Direct 规则仍保持直连。'
            )}
          </p>
          {status?.proxyPort && (
            <p className="mt-1 font-mono text-xs">127.0.0.1:{status.proxyPort} (SOCKS5)</p>
          )}
        </div>
      </div>
    </BasePage>
  )
}

export default AppRouting
