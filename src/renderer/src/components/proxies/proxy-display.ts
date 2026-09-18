const proxyTypeLabels: Partial<Record<MihomoProxyType, string>> = {
  Socks5: 'SOCKS',
  Http: 'HTTP'
}

export function formatProxyType(type: MihomoProxyType): string {
  return proxyTypeLabels[type] ?? type
}
