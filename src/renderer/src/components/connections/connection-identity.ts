export const appRoutingInboundName = 'kokorobox-app-routing'
export const appRoutingInboundPort = '7891'
export const appRoutingGroupKey = `inbound:${appRoutingInboundName}`

interface ConnectionIdentityMetadata {
  process?: string
  processPath?: string
  sourceIP?: string
  inboundName?: string
  inboundPort?: string
  type?: string
}

interface ConnectionIdentitySource {
  metadata: ConnectionIdentityMetadata
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1'
}

export function isAppRoutingConnection(connection: ConnectionIdentitySource): boolean {
  const { metadata } = connection
  if (metadata.inboundName === appRoutingInboundName) return true

  return (
    metadata.inboundPort === appRoutingInboundPort &&
    isLoopback(metadata.sourceIP) &&
    metadata.type?.toLowerCase().startsWith('socks') === true
  )
}

export function connectionIdentityKey(connection: ConnectionIdentitySource): string {
  if (isAppRoutingConnection(connection)) {
    return appRoutingProcessName(connection) || appRoutingGroupKey
  }
  if (connection.metadata.process) return connection.metadata.process
  return connection.metadata.sourceIP || ''
}

export function connectionIdentityLabel(
  connection: ConnectionIdentitySource,
  appRoutingLabel: string
): string {
  if (isAppRoutingConnection(connection)) {
    return appRoutingProcessName(connection) || appRoutingLabel
  }
  if (connection.metadata.process) return connection.metadata.process
  return connection.metadata.sourceIP || ''
}

function appRoutingProcessName(connection: ConnectionIdentitySource): string {
  const { metadata } = connection
  // Linux TProxy preserves the original socket's owner. SOCKS connections may
  // instead identify the forwarding router, which is not the originating app.
  if (!metadata.type?.toLowerCase().startsWith('tproxy')) return ''
  return metadata.process?.trim() || metadata.processPath?.split(/[\\/]/).pop()?.trim() || ''
}
