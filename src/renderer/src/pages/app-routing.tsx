import { tr } from '../../../shared/i18n'
import BasePage from '@renderer/components/base/base-page'
import { AppRoutingRuleRow } from '@renderer/components/app-routing/rule-row'
import { useAppRouting } from '@renderer/hooks/use-app-routing'
import { Button, Card, CardBody, Chip, Divider, Input, Switch } from '@heroui/react'
import { MdAdd } from 'react-icons/md'
import { useState } from 'react'

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
  if (message === '请先启用本机 Mihomo SOCKS 或 mixed 监听端口') {
    return tr('请先启用本机 Mihomo SOCKS 或 mixed 监听端口')
  }
  if (message === 'Mihomo 不可用；匹配 Proxy 的流量已阻断（不会直连）') {
    return tr('Mihomo 不可用；匹配 Proxy 的流量已阻断（不会直连）')
  }
  if (message === '代理核心不可用，受保护应用的网络连接已封锁') {
    return tr('代理核心不可用，已封锁 {0} 个受保护应用的网络连接。', [protectedApplicationCount])
  }
  if (message === '应用分流 MVP 需要以管理员模式运行 KokoroBox') {
    return tr('应用分流 MVP 需要以管理员模式运行 KokoroBox')
  }
  if (message === '当前 KokoroBox Service 不支持应用分流，请更新或重新安装服务') {
    return tr('当前 KokoroBox Service 不支持应用分流，请更新或重新安装服务')
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
  const {
    config,
    status,
    saving,
    supported,
    icons,
    save,
    addApplications,
    addPattern,
    updateRule,
    moveRule,
    deleteRule
  } = useAppRouting()
  const [processPattern, setProcessPattern] = useState('')
  const currentStatusMessage = statusMessage(status?.message, status?.protectedApplicationCount)
  const submitPattern = async (): Promise<void> => {
    if (await addPattern(processPattern)) setProcessPattern('')
  }

  return (
    <BasePage title={tr('应用分流')} contentClassName="no-scrollbar">
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
            {currentStatusMessage && (
              <p
                className={`mt-2 text-sm ${status?.state === 'error' ? 'text-danger' : 'text-warning'}`}
              >
                {currentStatusMessage}
              </p>
            )}
            {config?.enabled && (
              <p className="mt-2 text-sm text-foreground-500">
                {tr('上游')}：KokoroBox / 127.0.0.1:7891
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
              {tr('规则按从上到下的顺序匹配；支持文件名或含 * 的完整路径。')}
            </p>
          </div>
          <Button
            variant="flat"
            startContent={<MdAdd className="text-lg" />}
            isDisabled={!supported || !config || saving}
            onPress={() => void addApplications()}
          >
            {tr('选择应用程序')}
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input
            className="flex-1"
            label={tr('程序匹配')}
            description={tr('例如：ChatGPT.exe、ChatGPT*.exe 或 C:\\Program Files\\*\\ChatGPT.exe')}
            placeholder="example.exe"
            value={processPattern}
            isDisabled={!supported || !config || saving}
            onValueChange={setProcessPattern}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && processPattern.trim()) void submitPattern()
            }}
          />
          <Button
            color="primary"
            startContent={<MdAdd className="text-lg" />}
            isDisabled={!supported || !config || saving || !processPattern.trim()}
            onPress={() => void submitPattern()}
          >
            {tr('新增匹配规则')}
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
                {tr('输入程序匹配，或选择一个或多个 .exe，然后设定 Proxy、Direct 或 Block。')}
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="hidden grid-cols-[1fr_9rem_9rem_9rem] gap-3 px-3 text-xs font-medium text-foreground-500 md:grid">
              <span>{tr('程序匹配')}</span>
              <span>{tr('协议')}</span>
              <span>{tr('动作')}</span>
              <span className="text-right">{tr('操作')}</span>
            </div>
            {config?.rules.map((rule, index) => (
              <AppRoutingRuleRow
                key={rule.id}
                rule={rule}
                index={index}
                count={config.rules.length}
                icon={icons[rule.id]}
                disabled={saving}
                onChange={(patch) => updateRule(index, patch)}
                onMove={(offset) => moveRule(index, offset)}
                onDelete={() => deleteRule(rule.id)}
              />
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
