import { tr } from '../../../shared/i18n'

export function getAppRoutingStatusLabel(status?: AppRoutingStatus): string {
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

export function getAppRoutingStatusMessage(
  message?: string,
  protectedApplicationCount = 0
): string | undefined {
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
      'KokoroBox Service authentication is no longer valid. Repair the service below and try again.'
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
