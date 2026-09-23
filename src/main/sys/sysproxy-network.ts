export interface ProxyNetworkContext {
  online: boolean
  defaultInterface?: string | null
  defaultService?: string | null
  ssid?: string | null
}

/** Proxy settings may need to be applied again when the active network changes. */
export function shouldReapplyProxyForNetworkChange(
  previous: ProxyNetworkContext,
  current: ProxyNetworkContext
): boolean {
  return (
    current.online &&
    (!previous.online ||
      previous.defaultInterface !== current.defaultInterface ||
      previous.defaultService !== current.defaultService ||
      previous.ssid !== current.ssid)
  )
}
