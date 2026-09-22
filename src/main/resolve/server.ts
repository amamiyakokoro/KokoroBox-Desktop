import { getAppConfig, getControledMihomoConfig } from '../config'
import { PacHttpServer } from './pac-http-server'

const defaultPacScript = `
function FindProxyForURL(url, host) {
  return "PROXY 127.0.0.1:%mixed-port%; SOCKS5 127.0.0.1:%mixed-port%; DIRECT;";
}
`

const pacServer = new PacHttpServer()

export async function startPacServer(): Promise<number | undefined> {
  const { sysProxy } = await getAppConfig()
  const { mode = 'manual', pacScript } = sysProxy
  if (mode !== 'auto') {
    await pacServer.stop()
    return undefined
  }
  let script = pacScript || defaultPacScript
  const { 'mixed-port': port = 7890 } = await getControledMihomoConfig()
  script = script.replaceAll('%mixed-port%', port.toString())
  return await pacServer.start(script)
}

export async function stopPacServer(): Promise<void> {
  await pacServer.stop()
}
