import { getAppConfig, getControledMihomoConfig } from '../config'
import { PacHttpServer } from './pac-http-server'

const defaultPacScript = `
function FindProxyForURL(url, host) {
  return "PROXY 127.0.0.1:%mixed-port%; SOCKS5 127.0.0.1:%mixed-port%; DIRECT;";
}
`

const pacServer = new PacHttpServer()
let servicePacUrl: string | undefined

export function setActiveServicePacUrl(url: string): void {
  servicePacUrl = url
}

export function getActivePacUrl(): string | undefined {
  return servicePacUrl ?? pacServer.getUrl()
}

export async function getConfiguredPacScript(): Promise<string> {
  const { sysProxy } = await getAppConfig()
  const { 'mixed-port': port = 7890 } = await getControledMihomoConfig()
  return (sysProxy.pacScript || defaultPacScript).replaceAll('%mixed-port%', port.toString())
}

export async function startPacServer(): Promise<number | undefined> {
  servicePacUrl = undefined
  const { sysProxy } = await getAppConfig()
  const { mode = 'manual' } = sysProxy
  if (mode !== 'auto') {
    await pacServer.stop()
    return undefined
  }
  return await pacServer.start(await getConfiguredPacScript())
}

export async function stopPacServer(): Promise<void> {
  servicePacUrl = undefined
  await pacServer.stop()
}
