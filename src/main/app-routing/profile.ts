export const appRoutingListenerName = 'kokorobox-app-routing'
export const appRoutingSocksPort = 7891

export function applyAppRoutingListener(profile: MihomoConfig, enabled: boolean): void {
  const existing = (profile.listeners || []).filter(
    (listener) => listener.name !== appRoutingListenerName
  )

  if (enabled) {
    existing.push({
      name: appRoutingListenerName,
      type: 'socks',
      port: appRoutingSocksPort,
      listen: '127.0.0.1',
      udp: true
    })
  }

  if (existing.length > 0) profile.listeners = existing
  else delete profile.listeners
}
